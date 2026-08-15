/**
 * 由 assets/*.svg 生成全部图标产物。
 *
 * 产出：
 *   build/icon.png        1024px 应用图标（electron-builder 的 mac/win 默认输入）
 *   build/icon.icns       macOS 图标集（用系统自带 iconutil 生成）
 *   resources/trayTemplate.png / @2x.png   菜单栏模板图（黑+透明）
 *
 * 用 Electron 渲染 SVG 而不是引入 sharp/resvg：应用本来就带 Electron，
 * 不必为出图再多一个原生依赖；透明窗口截图能保住 alpha 通道。
 *
 * 用法：npm run icons
 */
import { app, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** 一次渲染任务：把某个 SVG 铺满 size×size 并截成 PNG。 */
async function render(svg, size, outFile) {
  const window = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: false },
  })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  // 等一帧，确保矢量已经栅格化完成
  await new Promise(resolveWait => { setTimeout(resolveWait, 120) })
  const image = await window.webContents.capturePage()
  await writeFile(outFile, image.toPNG())
  window.destroy()
}

async function main() {
  const logo = await readFile(join(ROOT, 'assets/logo.svg'), 'utf8')
  const mono = await readFile(join(ROOT, 'assets/logo-mono.svg'), 'utf8')
  await mkdir(join(ROOT, 'build'), { recursive: true })
  await mkdir(join(ROOT, 'resources'), { recursive: true })

  // 应用图标：electron-builder 要求至少 512，给足 1024
  await render(logo, 1024, join(ROOT, 'build/icon.png'))

  // 菜单栏模板图：16pt，Retina 下取 @2x
  await render(mono, 16, join(ROOT, 'resources/trayTemplate.png'))
  await render(mono, 32, join(ROOT, 'resources/trayTemplate@2x.png'))

  // macOS 图标集：iconutil 是系统自带的，不必额外装东西
  if (process.platform === 'darwin') {
    const iconset = join(ROOT, 'build/icon.iconset')
    await rm(iconset, { recursive: true, force: true })
    await mkdir(iconset, { recursive: true })
    // Apple 要求的完整尺寸表；缺任何一档 iconutil 都会拒绝
    const sizes = [16, 32, 64, 128, 256, 512, 1024]
    for (const size of sizes) {
      await render(logo, size, join(iconset, `icon_${String(size)}x${String(size)}.png`))
      if (size >= 32) {
        await render(logo, size, join(iconset, `icon_${String(size / 2)}x${String(size / 2)}@2x.png`))
      }
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(ROOT, 'build/icon.icns')])
    await rm(iconset, { recursive: true, force: true })
  }

  console.log('图标已生成：build/icon.png、build/icon.icns、resources/trayTemplate*.png')
}

app.whenReady().then(main).then(() => { app.exit(0) }).catch((error) => {
  console.error(error)
  app.exit(1)
})
