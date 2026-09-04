/**
 * 把本机构建好的 macOS 产物传到对应的 Release 草稿。
 *
 * 为什么不让 electron-builder 自己 --publish：它是「打完包立刻上传」，而 DMG
 * 的签名、公证、贴票是在那之后才做的（见 notarize-dmg.mjs）。走它的 publish
 * 传上去的会是没贴票的旧文件，latest-mac.yml 里的校验和也是旧的。
 *
 * 所以顺序拆开：先把包做全（dist:mac:notarize），再由这里上传。
 *
 * latest-mac.yml 必须一起传。壳自身的在线升级（electron-updater）就是读它来
 * 发现新版本的，只传 dmg / zip 的话自动更新永远发现不了新版。
 *
 * blockmap 也一起传：electron-updater 靠它做差量下载，缺了会退化成全量。
 *
 * 用法：node scripts/publish-mac.mjs
 * 前提：gh 已登录，且 v<version> 这个 Release 已存在（CI 推标签时会建草稿）。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const RELEASE = join(ROOT, 'release')

function main() {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  const tag = `v${version}`

  const assets = [
    `DSH Desktop-${version}-arm64.dmg`,
    `DSH Desktop-${version}-arm64-mac.zip`,
    // 差量升级靠它。macOS 走 zip 这条路，所以这一份必须在
    `DSH Desktop-${version}-arm64-mac.zip.blockmap`,
    'latest-mac.yml',
  ].map((name) => join(RELEASE, name))

  const missing = assets.filter((path) => !existsSync(path))
  if (missing.length > 0) {
    process.stderr.write(`缺少产物，先跑 npm run dist:mac:notarize：\n${missing.map((p) => `  ${p}`).join('\n')}\n`)
    process.exit(1)
  }

  // 贴票的是 DMG 自己，app 的票据在里面；这里再确认一次，避免传上去才发现没公证
  try {
    execFileSync('xcrun', ['stapler', 'validate', assets[0]], { stdio: 'ignore' })
  } catch {
    process.stderr.write(`DMG 没有公证票据，拒绝上传：${assets[0]}\n`)
    process.exit(1)
  }

  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' })
  } catch {
    process.stderr.write(`Release ${tag} 不存在。先推标签让 CI 建好草稿，再跑这一步。\n`)
    process.exit(1)
  }

  process.stdout.write(`上传 ${String(assets.length)} 个产物到 ${tag} …\n`)
  // --clobber：允许覆盖同名附件，便于重传
  execFileSync('gh', ['release', 'upload', tag, ...assets, '--clobber'], { stdio: 'inherit' })
  process.stdout.write(`macOS 产物已传到 ${tag}\n`)
}

main()
