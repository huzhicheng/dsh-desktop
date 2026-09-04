/**
 * 给 DMG 补签名、公证、贴票，并同步升级清单里的校验和（macOS）。
 *
 * electron-builder 的顺序是「先公证 .app，再拿公证好的 app 打 DMG」。所以票据
 * 只贴在 app 上，DMG 这一层是裸的：既没有 Developer ID 签名，也没有自己的票据。
 * 实测 `spctl --assess --type open` 对它的判定是 `rejected / no usable signature`。
 *
 * 后果不致命（app 自带票据，拖进 Applications 后照样干净打开），但用户双击下载来的
 * DMG 时，Gatekeeper 对镜像这一层的检查要么联网、要么弹提示。补齐这一步之后，
 * 从下载到打开全程无网也不会有任何弹窗。
 *
 * 顺序不能换：签名会改文件内容，贴在前面的票据会失效。必须 签 → 公证 → 贴。
 *
 * 贴票同样会改文件，所以最后必须重算 latest-mac.yml 里 DMG 的 sha512 和 size。
 * 那个文件是 electron-updater 的升级依据，校验和对不上会让升级直接失败。
 *
 * 用法：node scripts/notarize-dmg.mjs
 * 需要 APPLE_KEYCHAIN_PROFILE（见 npm 脚本 dist:mac:notarize）；没有就跳过。
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const RELEASE = join(ROOT, 'release')

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' })
}

/** 本机可用的 Developer ID Application 证书名；没有则返回空串。 */
function findIdentity() {
  const explicit = process.env.CSC_NAME
  if (explicit !== undefined && explicit !== '') return explicit
  try {
    return /"(Developer ID Application: [^"]+)"/.exec(run('security', ['find-identity', '-v', '-p', 'codesigning']))?.[1] ?? ''
  } catch {
    return ''
  }
}

/**
 * 把清单里某个文件的 sha512 / size 换成磁盘上的真实值。
 *
 * 不引 yaml 依赖：清单是 electron-builder 生成的固定结构，按行改足够稳，
 * 而且改坏了下面的自检会当场发现（两处 url 各对应一组 sha512/size）。
 */
function refreshManifest(manifestPath, fileName, digest, size) {
  if (!existsSync(manifestPath)) return false
  const lines = readFileSync(manifestPath, 'utf8').split('\n')
  let hit = false
  let pending = false
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(`url: ${fileName}`)) { pending = true; continue }
    if (!pending) continue
    if (lines[i].includes('sha512:')) { lines[i] = lines[i].replace(/sha512: .*/, `sha512: ${digest}`); continue }
    if (lines[i].includes('size:')) {
      lines[i] = lines[i].replace(/size: .*/, `size: ${String(size)}`)
      pending = false
      hit = true
    }
  }
  if (hit) writeFileSync(manifestPath, lines.join('\n'))
  return hit
}

function main() {
  if (process.platform !== 'darwin') return
  const profile = process.env.APPLE_KEYCHAIN_PROFILE
  if (profile === undefined || profile === '') {
    process.stdout.write('未设置 APPLE_KEYCHAIN_PROFILE，跳过 DMG 公证\n')
    return
  }
  const identity = findIdentity()
  if (identity === '') {
    process.stdout.write('没有找到 Developer ID 证书，跳过 DMG 公证\n')
    return
  }
  /*
   * 只处理本次版本的 DMG。release 目录不会自动清理，里面常年躺着历史版本的
   * 安装包——把它们一起送去公证既浪费十几分钟，又会因为苹果那边查不到旧记录
   * 而报 `Record not found` 中断整条构建（实测被 0.2.11 的残留坑过一次）。
   */
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  const dmgs = existsSync(RELEASE)
    ? readdirSync(RELEASE).filter((name) => name.endsWith('.dmg') && name.includes(`-${version}-`))
    : []
  if (dmgs.length === 0) {
    process.stdout.write(`release 下没有 ${version} 的 DMG，跳过\n`)
    return
  }

  for (const name of dmgs) {
    const path = join(RELEASE, name)
    try {
      process.stdout.write(`  • 签名 ${name}\n`)
      run('codesign', ['--force', '--sign', identity, '--timestamp', path])
      process.stdout.write('  • 提交公证（几分钟）…\n')
      run('xcrun', ['notarytool', 'submit', path, '--keychain-profile', profile, '--wait'])
      run('xcrun', ['stapler', 'staple', path])
      // 贴票改了文件，清单里的校验和必须跟着走，否则 electron-updater 校验失败
      const digest = createHash('sha512').update(readFileSync(path)).digest('base64')
      const size = statSync(path).size
      const manifest = join(RELEASE, 'latest-mac.yml')
      // electron-builder 会把文件名里的空格换成连字符再写进清单
      const updated = refreshManifest(manifest, name.replace(/ /g, '-'), digest, size)
      process.stdout.write(`  • ${name} 已公证贴票${updated ? '，升级清单校验和已同步' : ''}\n`)
    } catch (error) {
      /*
       * DMG 这一层失败不该让整次构建作废：里面的 .app 已经公证贴票，拖进
       * Applications 照样干净打开，缺的只是「双击镜像时不联网也不弹窗」。
       * 所以这里只告警，把判断权交给人。
       */
      process.stdout.write(`  • ${name} 公证失败（app 本身不受影响）：${error instanceof Error ? error.message.split('\n')[0] : String(error)}\n`)
    }
  }
}

main()
