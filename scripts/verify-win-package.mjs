/** Windows 打包后的关键资源完整性检查。 */

import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const unpacked = join(ROOT, 'release', 'win-unpacked')
const required = [
  'DSH Desktop.exe',
  'resources/app.asar',
  'resources/node/node.exe',
  'resources/node/node_modules/npm/bin/npm-cli.js',
  'resources/node/node_modules/corepack/dist/corepack.js',
  'resources/seed/runtime.tar.gz',
  'resources/seed/seed.json',
  'resources/trayIcon.png',
  'resources/trayIcon@2x.png',
  // 随包分发的 pnpm：没有它，用户机器上装插件要联网走 corepack 下载
  'resources/pnpm/bin/pnpm.cjs',
  'resources/pnpm/package.json',
  'resources/plugins/dsh-plugin-manager/package.json',
  'resources/plugins/dsh-plugin-manager/lib/client.js',
  'resources/plugins/dsh-plugin-remote-control/package.json',
  'resources/plugins/dsh-plugin-remote-control/lib/client.js',
  'resources/plugins/dsh-plugin-skin-studio/package.json',
  'resources/plugins/dsh-plugin-skin-studio/lib/client.js',
  // 桥接脚本必须在 asar 外面：它由内置 Node 以独立进程执行，而普通 Node
  // 读不了 asar 归档。留在里面的话打包能过、装完远程控制一次都起不来。
  'resources/app.asar.unpacked/dist/bridge/index.js',
]

const missing = required.filter((relative) => {
  const file = join(unpacked, relative)
  return !existsSync(file) || statSync(file).size === 0
})

if (missing.length > 0) {
  console.error(`Windows 包缺少关键资源：\n${missing.join('\n')}`)
  process.exit(1)
}

console.log('Windows 包关键资源检查通过（Node、npm、corepack、种子运行时、pnpm、三个内置插件、托盘 Logo 均完整）。')
