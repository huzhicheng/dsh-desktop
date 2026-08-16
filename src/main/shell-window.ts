/**
 * 主窗口：一个只承载 Harness Web UI 的窗口。
 *
 * 壳刻意不再画任何界面元素。插件管理与皮肤设置都由 dsh 插件
 * dsh-plugin-skin-studio 提供，出现在 Harness 自己的侧栏与设置里——
 * 这样命令行启动与桌面端启动看到的是同一套界面，而不是壳再套一层导航。
 */

import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { APP_DISPLAY_NAME } from './config'

/**
 * macOS 交通灯浮在页面左上角，会压住 dsh 侧栏顶部的 logo。
 * 壳给页面写入这条控件条的高度，皮肤插件据此让侧栏向下留白；
 * 按钮本身再在这条里上下居中（按钮直径 12px）。
 */
const WINDOW_CONTROLS_HEIGHT = 30
const TRAFFIC_LIGHT_SIZE = 12

let window: BrowserWindow | undefined
let harnessOrigin: string | undefined

function isWebUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function sameOrigin(raw: string, origin: string): boolean {
  try {
    return new URL(raw).origin === origin
  } catch {
    return false
  }
}

/** 创建主窗口；已存在则前置显示。 */
export async function showShellWindow(origin: string): Promise<void> {
  harnessOrigin = origin

  if (window !== undefined && !window.isDestroyed()) {
    if (!sameOrigin(window.webContents.getURL(), origin)) {
      await window.loadURL(origin)
    }
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    return
  }

  const created = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: APP_DISPLAY_NAME,
    // 交通灯浮在 dsh 自己的头部上；位置对齐它那行 logo 的高度
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: {
            x: 16,
            y: Math.round((WINDOW_CONTROLS_HEIGHT - TRAFFIC_LIGHT_SIZE) / 2),
          },
        }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#00000000', symbolColor: '#8b8b8b', height: 40 } }),
    webPreferences: {
      // 只为侧栏「远程控制」入口开一条通道：远程控制是壳的能力（要跑进程、
      // 存加密凭据），而入口由浏览器里的插件提供，够不到壳。preload 只暴露
      // 一个打开方法，比往页面里注入 DOM 稳得多，也不影响 dsh 自身升级。
      preload: join(__dirname, '../preload/desktop.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  window = created

  created.webContents.on('will-navigate', (event, url) => {
    if (harnessOrigin !== undefined && sameOrigin(url, harnessOrigin)) return
    event.preventDefault()
    if (isWebUrl(url)) void shell.openExternal(url)
  })
  created.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  created.on('closed', () => {
    if (window === created) window = undefined
  })

  // 每次导航后都要重新写：页面换了文档，行内变量不会留下来
  const declareWindowControls = (): void => {
    if (process.platform !== 'darwin') return
    created.webContents.executeJavaScript(
      `document.documentElement.style.setProperty('--skin-window-controls', '${String(WINDOW_CONTROLS_HEIGHT)}px')`,
    ).catch(() => { /* 页面还没就绪，下次导航会再写一次 */ })
  }
  created.webContents.on('dom-ready', declareWindowControls)
  created.webContents.on('did-finish-load', declareWindowControls)

  await created.loadURL(origin)
  created.show()
}

/** 服务换端口重启后，把窗口带到新地址。 */
export async function reloadHarness(origin: string): Promise<void> {
  harnessOrigin = origin
  if (window !== undefined && !window.isDestroyed()) {
    await window.loadURL(origin)
  }
}

export function hasWindow(): boolean {
  return window !== undefined && !window.isDestroyed()
}

export function focusWindow(): void {
  if (window === undefined || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}
