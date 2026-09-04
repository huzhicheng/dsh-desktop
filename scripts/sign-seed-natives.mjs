/**
 * 给种子运行时里的原生二进制补签名（macOS）。
 *
 * 公证服务会把应用里的归档也解开，逐个检查里面的可执行文件。种子是一个
 * runtime.tar.gz，里面带着上游依赖自带的预编译产物（koffi、node-pty、ripgrep、
 * sharp 等），它们要么完全没签名、要么签名不含安全时间戳。只要有一个不合格，
 * 整个包的公证就会被拒——实测报的就是
 * `koffi.node: The signature does not include a secure timestamp`。
 *
 * 这些文件在 asar 之外、又被压在 tar 里，electron-builder 的签名流程碰不到，
 * 所以只能在打包前自己来：解开 → 逐个签 → 重新打包。
 *
 * 签名用与应用相同的 Developer ID，并强制带时间戳（不能用 --timestamp=none）。
 * 这不是「替上游背书」，而是分发者必须做的事：进入我们分发的包，就得由我们签。
 *
 * 用法：node scripts/sign-seed-natives.mjs [--identity "<证书名>"]
 * 无证书或非 macOS 时直接跳过，不影响 ad-hoc 那条路。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SEED = join(ROOT, 'vendor/seed/darwin-arm64/runtime.tar.gz')

function flag(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** 本机可用的 Developer ID Application 证书名；没有则返回空串。 */
function findIdentity() {
  const explicit = flag('--identity') ?? process.env.CSC_NAME
  if (explicit !== undefined && explicit !== '') return explicit
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
    return /"(Developer ID Application: [^"]+)"/.exec(out)?.[1] ?? ''
  } catch {
    return ''
  }
}

/** 递归找出目录下所有 Mach-O 文件。 */
function machOFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) { machOFiles(path, found); continue }
    if (!entry.isFile()) continue
    /*
     * 先粗筛再用 file(1) 确认，避免对成千上万个 .js 调外部命令。
     *
     * 可执行位不能当唯一依据：实测 node-pty 的 darwin-x64/spawn-helper 权限是
     * 644（arm64 那个才是 755），但它照样是 Mach-O，公证服务照样会检查它。
     * 所以「无扩展名的文件」也要送去确认——原生辅助程序通常就长这样。
     */
    const executable = (statSync(path).mode & 0o111) !== 0
    const noExtension = !entry.name.includes('.')
    if (!executable && !noExtension && !/\.(node|dylib|so)$/.test(entry.name)) continue
    try {
      if (execFileSync('file', ['-b', path], { encoding: 'utf8' }).includes('Mach-O')) found.push(path)
    } catch { /* 读不了就跳过 */ }
  }
  return found
}

async function main() {
  if (process.platform !== 'darwin') {
    process.stdout.write('非 macOS，跳过种子原生二进制签名\n')
    return
  }
  if (!existsSync(SEED)) {
    process.stdout.write(`没有种子包，跳过：${SEED}\n`)
    return
  }
  const identity = findIdentity()
  if (identity === '') {
    process.stdout.write('没有找到 Developer ID 证书，跳过种子签名（ad-hoc 分发不需要）\n')
    return
  }

  const work = await mkdtemp(join(tmpdir(), 'dsh-seed-sign-'))
  try {
    execFileSync('tar', ['xzf', SEED, '-C', work], { stdio: 'inherit' })
    const targets = machOFiles(work)
    if (targets.length === 0) {
      process.stdout.write('种子里没有原生二进制，无需签名\n')
      return
    }
    for (const target of targets) {
      // --force 覆盖上游原有签名；--timestamp 是公证的硬要求
      execFileSync('codesign', [
        '--force', '--sign', identity, '--timestamp', '--options', 'runtime', target,
      ], { stdio: ['ignore', 'ignore', 'inherit'] })
    }
    // 重新打包。用 COPYFILE_DISABLE 避免 macOS 往包里塞 ._ 资源分叉文件
    execFileSync('tar', ['czf', SEED, '-C', work, '.'], {
      stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' },
    })
    process.stdout.write(`已为种子里 ${String(targets.length)} 个原生二进制补签名并重新打包\n`)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
