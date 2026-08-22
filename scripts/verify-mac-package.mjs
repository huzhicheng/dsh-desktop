/**
 * macOS 打包后的关键资源完整性检查。
 *
 * 和 Windows 那份同样的理由：构建绿灯不代表包是完整的。菜单栏图标就漏过一次——
 * 改用彩色 Logo 时只改了读取路径，没同步 extraResources，结果构建、签名、安装
 * 全部成功，直到启动后日志里才出现「菜单栏图标缺失」，而那时图标已经是空的了。
 */

import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const app = join(ROOT, 'release', 'mac-arm64', 'DSH Desktop.app', 'Contents', 'Resources')
const required = [
  'app.asar',
  // 桥接脚本必须在 asar 外：它由内置 Node 以独立进程执行，普通 Node 读不了 asar
  'app.asar.unpacked/dist/bridge/index.js',
  'node/bin/node',
  'seed/runtime.tar.gz',
  'seed/seed.json',
  'pnpm/bin/pnpm.cjs',
  // 菜单栏图标：两个平台都用彩色 Logo
  'trayIcon.png',
  'trayIcon@2x.png',
  'plugins/dsh-plugin-artifact-viewer/lib/client.js',
  'plugins/dsh-plugin-computer-use/lib/proxy.js',
  'plugins/dsh-plugin-manager/lib/client.js',
  'plugins/dsh-plugin-remote-control/lib/client.js',
  'plugins/dsh-plugin-skin-studio/lib/client.js',
]

const missing = required.filter((relative) => {
  const file = join(app, relative)
  return !existsSync(file) || statSync(file).size === 0
})

if (missing.length > 0) {
  console.error(`macOS 包缺少关键资源：\n${missing.join('\n')}`)
  process.exit(1)
}

console.log(`macOS 包关键资源检查通过（${String(required.length)} 项）。`)
