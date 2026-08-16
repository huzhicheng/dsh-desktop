/**
 * 由 assets/ 里的源文件生成全部图标产物。
 *
 * 输入：
 *   assets/logo.png   应用图标原图（正方形、四角透明）
 *   assets/tray.svg   菜单栏单色图（纯黑 + 透明，macOS 模板图要求）
 *
 * 产出（都会提交进仓库，CI 不重新生成）：
 *   build/icon.png                        1024px，electron-builder 据此
 *                                         自动派生 macOS 的 .icns 与 Windows 的 .ico
 *   resources/trayTemplate.png / @2x.png  菜单栏图标
 *
 * 位图缩放走 Electron 自带的 nativeImage，不引入 sharp/PIL：应用本来就带
 * Electron，不必为出图多一个原生依赖，而且 resize 给的是精确像素，
 * 不受这台机器的屏幕缩放影响（用窗口截图会在 Retina 上得到двойной尺寸）。
 *
 * SVG 只能靠浏览器栅格化，所以走一次离屏窗口；注意 SVG 必须内联，
 * `data:` URL 文档里的 <img src="file://…"> 会被安全策略挡掉、渲染成全透明。
 *
 * 用法：npm run icons
 */
import { app, BrowserWindow, nativeImage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** 把内联 SVG 栅格化成指定边长的 PNG 缓冲。 */
async function rasterizeSvg(svg, size) {
  const window = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
  })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((done) => { setTimeout(done, 200) })
  const image = await window.webContents.capturePage()
  window.destroy()
  return image
}

async function main() {
  await mkdir(join(ROOT, 'build'), { recursive: true })
  await mkdir(join(ROOT, 'resources'), { recursive: true })

  // 应用图标：1024 是 electron-builder 推荐的输入尺寸，派生各档不会糊
  const logo = nativeImage.createFromPath(join(ROOT, 'assets/logo.png'))
  if (logo.isEmpty()) throw new Error('读不到 assets/logo.png')
  const { width, height } = logo.getSize()
  if (width !== height) throw new Error(`应用图标必须是正方形，当前 ${String(width)}×${String(height)}`)
  await writeFile(
    join(ROOT, 'build/icon.png'),
    logo.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG(),
  )

  // 菜单栏图标：先按较大尺寸栅格化，再缩到 16/32，边缘比直接小尺寸渲染干净
  const svg = await readFile(join(ROOT, 'assets/tray.svg'), 'utf8')
  const trayLarge = await rasterizeSvg(svg, 256)
  for (const [size, name] of [[16, 'trayTemplate.png'], [32, 'trayTemplate@2x.png']]) {
    await writeFile(
      join(ROOT, 'resources', name),
      trayLarge.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    )
  }

  process.stdout.write('图标已生成：build/icon.png、resources/trayTemplate.png(@2x)\n')
}

// 离屏窗口销毁后不要让 Electron 走默认的自动退出：那会在剩余写入
// 与日志刷出之前就开始拆进程（表现为最后一个文件被截成 0 字节）。
app.on('window-all-closed', () => { /* 由 main 决定何时退出 */ })

app.whenReady()
  .then(main)
  // 先让 stdout 刷出去再退出：app.exit() 是立即终止，日志会丢
  .then(() => new Promise((done) => { setTimeout(done, 50) }))
  .then(() => { app.exit(0) })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    setTimeout(() => { app.exit(1) }, 50)
  })
