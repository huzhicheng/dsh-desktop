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
/**
 * 顶部通栏拖拽区的高度。
 *
 * 实测 dsh 顶部最靠上的可交互元素（侧栏折叠按钮）上边界在 y=22，
 * 所以 22px 以内不会盖住任何可点的东西。dsh 改版后若有元素上移，
 * 这个数要跟着重新量。
 */
const TOP_DRAG_STRIP = 22

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
    declareDragRegion()
  }

  /*
   * 声明窗口拖拽区。
   *
   * macOS 上用的是 hiddenInset（隐藏标题栏、交通灯浮在页面上），这种模式下
   * 「哪里能拖动窗口」必须由页面用 -webkit-app-region 声明。dsh 的页面没有声明
   * （实测整页 drag 区元素数为 0），结果就是窗口完全拖不动——没有标题栏可抓，
   * 页面也不提供拖拽区。
   *
   * 这是本文件唯一一处往页面注入内容的地方，理由是它属于窗口管理而不是外观：
   * 交给皮肤插件做的话，用户一卸插件窗口就拖不动了，那是更糟的耦合。
   *
   * **必须用行内样式的真实元素，不能用 insertCSS。** insertCSS 注入的是「用户
   * 样式表」，Chromium 收集拖拽区时不认它——实测过：注入之后
   * getComputedStyle 明明返回 webkitAppRegion: 'drag'，窗口照样拖不动；
   * 换成行内样式的真实 div 立刻就能拖。计算样式为 drag 只能说明 CSS 解析了，
   * 不代表拖拽区真的建立了，这两件事要分开验。
   *
   * 高度取 22px：实测 dsh 顶部最靠上的可交互元素（侧栏折叠按钮）上边界在 y=22，
   * 22px 以内是安全空白，这条不会盖住任何可点的东西。dsh 改版后若有元素上移，
   * 这个数要重新量。
   *
   * 挂在 documentElement 而不是 body 上：dsh 是 SPA，重渲染会换掉 body 里的内容。
   */
  const declareDragRegion = (): void => {
    if (process.platform !== 'darwin') return
    created.webContents.executeJavaScript(`
      (() => {
        let bar = document.getElementById('__dsh_drag_region__')
        if (bar === null) {
          bar = document.createElement('div')
          bar.id = '__dsh_drag_region__'
          document.documentElement.appendChild(bar)
        }
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;'
          + 'height:${String(TOP_DRAG_STRIP)}px;z-index:2147483000'
        bar.style.setProperty('-webkit-app-region', 'drag')
        return true
      })()
    `).catch(() => { /* 页面还没就绪，下次导航会再来一次 */ })
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
