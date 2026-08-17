/** 构建：esbuild 打包主进程与 preload（CommonJS，Electron 直接加载），拷贝本地页面。 */

import { build } from 'esbuild'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')

await rm(DIST, { recursive: true, force: true })

await build({
  entryPoints: [join(ROOT, 'src/main/index.ts')],
  outfile: join(DIST, 'main/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'electron-updater'],
  sourcemap: 'inline',
})

// 飞书桥接：独立进程，由内置 Node（不是 Electron）执行，依赖全部内联。
// 飞书 SDK 体积大，inline sourcemap 会让产物从 6.5MB 涨到 22MB，改用外部 map。
await build({
  entryPoints: [join(ROOT, 'src/bridge/index.ts')],
  outfile: join(DIST, 'bridge/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: 'linked',
})

for (const name of ['status', 'settings', 'desktop']) {
  await build({
    entryPoints: [join(ROOT, `src/preload/${name}.ts`)],
    outfile: join(DIST, `preload/${name}.js`),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  })
}

await mkdir(join(DIST, 'status'), { recursive: true })
await cp(join(ROOT, 'src/status/status.html'), join(DIST, 'status/status.html'))
// 启动窗口要显示的 logo，跟着 html 一起进 dist
await cp(join(ROOT, 'assets/logo.png'), join(DIST, 'status/logo.png'))
await mkdir(join(DIST, 'settings'), { recursive: true })
await cp(join(ROOT, 'src/settings/settings.html'), join(DIST, 'settings/settings.html'))

// 三个随包分发的插件也一起构建：打包时只取它们的 lib/，
// 这里不构建就会把上一次的旧产物打进安装包
const plugins = (await readdir(join(ROOT, 'plugins'), { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name.startsWith('dsh-plugin-'))
  .map(entry => entry.name)
for (const name of plugins) {
  const dir = join(ROOT, 'plugins', name)
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(dir, 'scripts/build.mjs')], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`插件 ${name} 构建失败（退出码 ${code}）`))
    })
  })
  console.log(`  插件 ${name} 已构建`)
}

console.log(`构建完成：dist/ 与 ${plugins.length} 个内置插件`)
