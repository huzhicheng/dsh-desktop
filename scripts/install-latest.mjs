/**
 * 把 Releases 上最新的 macOS 版装进 /Applications。
 *
 * 开发机上很容易同时躺着三份：正式安装的、本地 --dir 构建的、以及开发态
 * `npm run dev` 跑的。三份版本号往往不一样，测出来的现象归给谁全靠猜。
 *
 * 这个脚本只干一件事：取 CI 发布的产物装上。CI 的产物才是用户真正拿到的
 * 东西——同一份构建、同一次签名。本地构建再像也只是"应该一样"。
 *
 * 顺带做掉两件手工活：清隔离标记（没有它，Apple Silicon 上会报「已损坏」），
 * 以及装完核对版本号，避免装了个旧的还以为是新的。
 *
 * 用法：npm run install:latest
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = 'huzhicheng/dsh-desktop'
const TARGET = '/Applications/DSH Desktop.app'

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
}

async function main() {
  process.stdout.write('正在查询最新发布…\n')
  const meta = await (await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)).json()
  const tag = meta?.tag_name
  const asset = (meta?.assets ?? []).find(a => a.name.endsWith('-arm64.dmg'))
  if (asset === undefined) throw new Error(`最新发布 ${tag ?? '?'} 里没有 arm64 的 dmg`)
  process.stdout.write(`  ${tag} · ${asset.name}（${(asset.size / 1048576).toFixed(1)} MB）\n`)

  const work = await mkdtemp(join(tmpdir(), 'dsh-install-'))
  const dmg = join(work, asset.name)
  try {
    process.stdout.write('正在下载…\n')
    const response = await fetch(asset.browser_download_url)
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
    await writeFile(dmg, Buffer.from(await response.arrayBuffer()))

    process.stdout.write('正在挂载…\n')
    const mounted = sh('hdiutil', ['attach', dmg, '-nobrowse', '-readonly'])
    const point = mounted.split('\n').map(l => l.match(/(\/Volumes\/.*)$/)?.[1]).filter(Boolean).pop()
    if (point === undefined) throw new Error('挂载后找不到卷')

    try {
      // 装之前先把正在跑的关掉，否则替换 .app 会留下半新半旧的目录
      try { sh('pkill', ['-f', 'DSH Desktop.app/Contents/MacOS']) } catch { /* 没在跑 */ }
      if (existsSync(TARGET)) {
        process.stdout.write('正在移除旧版本…\n')
        sh('rm', ['-rf', TARGET])
      }
      process.stdout.write('正在安装…\n')
      sh('cp', ['-R', join(point, 'DSH Desktop.app'), TARGET])
    } finally {
      sh('hdiutil', ['detach', point, '-quiet'])
    }

    // 清隔离标记：不清的话 Apple Silicon 上会因为没有 Developer ID 报「已损坏」
    sh('xattr', ['-cr', TARGET])

    const installed = sh('defaults', ['read', `${TARGET}/Contents/Info.plist`, 'CFBundleShortVersionString'])
    const expected = String(tag ?? '').replace(/^v/, '')
    if (expected !== '' && installed !== expected) {
      throw new Error(`版本对不上：装上的是 ${installed}，期望 ${expected}`)
    }
    process.stdout.write(`\n已安装 ${installed} 到 ${TARGET}\n`)
    process.stdout.write('直接双击「应用程序」里的 DSH Desktop 即可；托盘菜单第一行会显示版本号。\n')
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
