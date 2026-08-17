/**
 * 把 pnpm 下载到 vendor/pnpm，随安装包一起分发。
 *
 * 为什么不直接用 corepack：corepack 只是个转发器，第一次执行 `corepack pnpm`
 * 时会去 registry 下载真正的 pnpm。开发机上早就下过、缓存在 COREPACK_HOME 里，
 * 所以一直没暴露；到了全新的用户机器上这一步要联网，装插件因此失败——
 * 而 dsh 的插件安装命令本质就是 pnpm 转发器，没有 pnpm 就什么都装不了。
 * 应用承诺的是「下载即用」，不能在首启时依赖一次网络请求。
 *
 * 只保留运行必需的部分：artifacts/ 是独立可执行版才用的各平台原生二进制
 * （18MB），我们用 node 跑 bin/pnpm.cjs，不需要它。精简后约 20MB。
 *
 * 用法：node scripts/fetch-pnpm.mjs
 */
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TARGET = join(ROOT, 'vendor/pnpm')
/** 跑起来用不到、只占体积的部分。 */
const DROP = ['artifacts', 'CHANGELOG.md', 'README.md']

async function main() {
  if (existsSync(join(TARGET, 'bin/pnpm.cjs'))) {
    const manifest = JSON.parse(await readFile(join(TARGET, 'package.json'), 'utf8'))
    process.stdout.write(`vendor/pnpm 已存在（${manifest.version}），跳过\n`)
    return
  }

  const staging = join(ROOT, 'vendor/.pnpm-staging')
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  // 用 npm pack 取 tarball 再解，比 npm install 干净：不产生 node_modules、
  // 不跑生命周期脚本，拿到的就是发布产物本身
  process.stdout.write('正在下载 pnpm …\n')
  // Windows 上 npm 是 npm.cmd，execFileSync 不走 shell 会直接 ENOENT，
  // 所以显式带上扩展名（CI 上实测踩过）
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const packed = execFileSync(npm, ['pack', 'pnpm@latest', '--pack-destination', staging], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  }).trim().split('\n').pop()
  execFileSync('tar', ['-xzf', join(staging, packed), '-C', staging], { stdio: 'inherit' })

  await rm(TARGET, { recursive: true, force: true })
  await mkdir(join(ROOT, 'vendor'), { recursive: true })
  await cp(join(staging, 'package'), TARGET, { recursive: true })
  for (const name of DROP) await rm(join(TARGET, name), { recursive: true, force: true })
  await rm(staging, { recursive: true, force: true })

  const manifest = JSON.parse(await readFile(join(TARGET, 'package.json'), 'utf8'))
  if (!existsSync(join(TARGET, 'bin/pnpm.cjs'))) {
    throw new Error('pnpm 产物缺少 bin/pnpm.cjs，包结构可能变了')
  }
  process.stdout.write(`pnpm ${manifest.version} 已放入 vendor/pnpm\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
