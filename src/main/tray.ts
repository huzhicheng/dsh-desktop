/** 系统托盘：常驻入口，展示版本、触发升级检查、退出。图标为运行时绘制的模板图。 */

import { Menu, Tray, nativeImage } from 'electron'
import { APP_DISPLAY_NAME } from './config'
import type { UpdatePhase } from './updater'

export interface TrayDeps {
  openMainWindow: () => void
  checkUpdate: () => void
  restartService: () => void
  openLogs: () => void
  openBridgeSettings: () => void
  quit: () => void
  getVersion: () => string | undefined
  getPhase: () => UpdatePhase
  getBridgeState: () => 'stopped' | 'starting' | 'connected' | 'error'
}

let tray: Tray | undefined

/**
 * 画一个 18x18 的图标（免去图片资源）：圆角方框内一个实心圆点。
 * macOS 用黑色模板图（系统自动适配深浅色菜单栏）；
 * Windows 没有模板图机制，用品牌蓝，在深浅色任务栏上都可见。
 */
function drawTrayIcon(): Electron.NativeImage {
  const size = 18
  // nativeImage.createFromBitmap 使用 BGRA 字节序
  const [blue, green, red] = process.platform === 'darwin' ? [0, 0, 0] : [254, 107, 77]
  const buffer = Buffer.alloc(size * size * 4, 0)
  const put = (x: number, y: number, alpha: number): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const index = (y * size + x) * 4
    buffer[index] = blue
    buffer[index + 1] = green
    buffer[index + 2] = red
    buffer[index + 3] = Math.max(buffer[index + 3] ?? 0, Math.round(alpha * 255))
  }
  // 圆角矩形边框
  const min = 2
  const max = size - 3
  for (let i = min + 2; i <= max - 2; i++) {
    put(i, min, 1)
    put(i, max, 1)
    put(min, i, 1)
    put(max, i, 1)
  }
  for (const [cx, cy] of [[min + 1, min + 1], [max - 1, min + 1], [min + 1, max - 1], [max - 1, max - 1]] as const) {
    put(cx, cy, 0.9)
  }
  // 中心圆点
  const center = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center)
      if (distance <= 2.4) put(x, y, 1)
      else if (distance <= 3.1) put(x, y, 3.1 - distance)
    }
  }
  const image = nativeImage.createFromBitmap(buffer, { width: size, height: size })
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

export function createTray(deps: TrayDeps): void {
  tray = new Tray(drawTrayIcon())
  tray.setToolTip(APP_DISPLAY_NAME)
  refreshTray(deps)
  tray.on('click', () => { deps.openMainWindow() })
  tray.on('double-click', () => { deps.openMainWindow() })
}

export function refreshTray(deps: TrayDeps): void {
  if (tray === undefined) return
  const version = deps.getVersion()
  const phase = deps.getPhase()
  const phaseLabel = phase.phase === 'checking'
    ? '正在检查更新…'
    : phase.phase === 'downloading'
      ? `正在升级到 ${phase.version} …`
      : phase.phase === 'restarting'
        ? `正在重启服务（${phase.version}）…`
        : undefined
  const bridgeLabel = {
    connected: '飞书桥接：已连接',
    starting: '飞书桥接：连接中…',
    error: '飞书桥接：异常',
    stopped: '飞书桥接：未启用',
  }[deps.getBridgeState()]
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: version === undefined ? 'Harness 未安装' : `Harness ${version}`, enabled: false },
    ...(phaseLabel === undefined ? [] : [{ label: phaseLabel, enabled: false }]),
    { label: bridgeLabel, enabled: false },
    { type: 'separator' },
    { label: '打开主窗口', click: () => { deps.openMainWindow() } },
    { label: '飞书桥接设置…', click: () => { deps.openBridgeSettings() } },
    { label: '检查 Harness 更新', enabled: phase.phase === 'idle', click: () => { deps.checkUpdate() } },
    { label: '重启 Harness 服务', enabled: phase.phase === 'idle', click: () => { deps.restartService() } },
    { label: '打开日志目录', click: () => { deps.openLogs() } },
    { type: 'separator' },
    { label: `退出 ${APP_DISPLAY_NAME}`, click: () => { deps.quit() } },
  ]))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = undefined
}
