/** 构建：esbuild 打包主进程与 preload（CommonJS，Electron 直接加载），拷贝本地页面。 */

import { build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
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
await mkdir(join(DIST, 'settings'), { recursive: true })
await cp(join(ROOT, 'src/settings/settings.html'), join(DIST, 'settings/settings.html'))

console.log('构建完成：dist/')
