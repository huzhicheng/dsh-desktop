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

/**
 * 两个地址是否同源。
 *
 * 两边都要解析后再比 origin。传进来的「origin」其实是 dsh 就绪行给的完整 URL，
 * 带着鉴权 token（`http://127.0.0.1:37080/?token=...`）——直接拿它跟 url.origin
 * 比字符串永远不相等，站内跳转会被判成外链丢给浏览器。
 */
function sameOrigin(raw: string, reference: string): boolean {
  try {
    return new URL(raw).origin === new URL(reference).origin
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
  // 页面换了文档，注入的徽标也没了，重新推一次当前状态
  created.webContents.on('did-finish-load', () => { paintSidebarChrome({}) })

  await created.loadURL(origin)
  created.show()
}

/**
 * 侧栏上由壳附加的两处信息：顶部的 Harness 运行时版本，底部「设置」右端的新版本提示。
 *
 * 由壳注入而不是做成插件：这两样都是壳自己知道的事（运行时版本、应用版本、
 * 开外部浏览器），而且用户把三个插件都卸了也该照样看得到。同拖拽区一样，
 * 属于窗口层面的附着物，不是 Harness 的功能扩展。
 *
 * 两处合成一段脚本、共用一个观察者：dsh 是 SPA，对话流每来一个 token 都在改
 * DOM，装两个 MutationObserver 等于把这份开销付两遍。
 *
 * 选择器匹配不上（dsh 改了类名）时静默退场，不影响别的东西——版本号在托盘菜单里
 * 也有，更新也仍然能从托盘检查。
 */
const CHROME_SCRIPT = (payload: string): string => `
  (() => {
    const BADGE_ID = '__dsh_update_badge__'
    const VERSION_ID = '__dsh_harness_version__'
    /*
     * 状态放全局，不放闭包。
     *
     * 每次推送都是一段新脚本、一个新闭包，而 MutationObserver 只装一次、绑的是
     * 第一段脚本里的 paint。状态若留在闭包里，观察者就永远拿着首次那份——首次
     * 必然是「无更新」（检查还没回来），于是每次 DOM 变动都把刚画好的徽标抹掉。
     */
    globalThis.__dshChrome__ = ${payload}

    /** 顶部 logo 行右侧的 Harness 版本号。 */
    const paintVersion = () => {
      const state = globalThis.__dshChrome__ ?? {}
      const row = document.querySelector('[class*="logoRow"]')
      if (row === null) return
      const existing = document.getElementById(VERSION_ID)
      /*
       * 侧栏收窄成 rail 时 logoRow 里只剩折叠按钮（实测宽 35px），brand 整个被
       * 移除，塞不下也没有意义。
       */
      const room = row.getBoundingClientRect().width > 120
      if (state.harnessVersion === undefined || state.harnessVersion === '' || !room) {
        existing?.remove()
        return
      }
      const label = existing ?? document.createElement('span')
      if (existing === null) {
        label.id = VERSION_ID
        // 插在 brand 与折叠按钮之间：brand 是 flex:1 1 0%，会让出这块宽度，
        // 而它内部的 logo 是左对齐的，所以让出来的正是 logo 右侧那段空白
        const toggle = row.querySelector('[class*="toggle"]')
        if (toggle !== null) row.insertBefore(label, toggle)
        else row.appendChild(label)
      }
      label.textContent = state.harnessVersion
      label.title = 'DeepSeek Harness 运行时 ' + state.harnessVersion + '（由应用自动升级）'
      label.style.cssText = 'flex:none;align-self:center;padding:1px 6px;border-radius:6px;'
        + 'font-size:10.5px;line-height:15px;font-weight:500;white-space:nowrap;'
        + 'font-variant-numeric:tabular-nums;letter-spacing:.2px;'
        // 用 currentColor 跟着 logo 行的前景色走，深浅色主题都不用单独适配。
        // 透明度别压太低：这行底下常是用户自己设的背景图，.55 时在浅色图上糊成一片
        + 'color:currentColor;opacity:.78;background:color-mix(in srgb, currentColor 16%, transparent);'
        + 'cursor:default;pointer-events:auto;user-select:text'
    }

    /** 底部「设置」那一行右端的新版本提示。 */
    const paintBadge = () => {
      const state = globalThis.__dshChrome__ ?? {}
      const trigger = document.querySelector('[class*="settingsArea"] button')
      if (trigger === null) return
      const existing = document.getElementById(BADGE_ID)
      if (state.hasUpdate !== true) { existing?.remove(); return }

      const badge = existing ?? document.createElement('span')
      if (existing === null) {
        badge.id = BADGE_ID
        badge.addEventListener('click', (event) => {
          // 不要连带触发「设置」本身
          event.preventDefault()
          event.stopPropagation()
          globalThis.dshDesktop?.openReleasePage?.()
        })
        trigger.appendChild(badge)
      }
      // 侧栏收窄成 rail 时按钮只有 36px 宽，放不下版本号，退成一个圆点
      const narrow = trigger.getBoundingClientRect().width < 90
      badge.title = '有新版本 ' + state.latest + '，点击打开下载页'
      badge.textContent = narrow ? '' : state.latest
      badge.style.cssText = narrow
        ? 'position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;'
          + 'background:#e5533d;cursor:pointer;pointer-events:auto'
        : 'margin-left:auto;flex:none;padding:1px 7px;border-radius:999px;'
          + 'font-size:11px;line-height:16px;font-weight:600;white-space:nowrap;'
          + 'background:#e5533d;color:#fff;cursor:pointer;pointer-events:auto'
      if (narrow && getComputedStyle(trigger).position === 'static') {
        trigger.style.position = 'relative'
      }
      globalThis.__dshBadgeNarrow__ = narrow
    }

    const paint = () => {
      paintVersion()
      paintBadge()

      /*
       * 盯着侧栏宽度变化。
       *
       * 展开与收起是 CSS 过渡，DOM 只在点击那一刻变一次；等 MutationObserver 的
       * 回调跑到时宽度还停在旧值，量出来的形态是错的，之后又没有新的 DOM 变动来
       * 纠正，于是窄栏里挂着装不下的文字。ResizeObserver 会在过渡结束的实际尺寸
       * 上再回调一次。
       *
       * 只在宽窄真的翻转时才重画，避免 ResizeObserver 自激。
       */
      const trigger = document.querySelector('[class*="settingsArea"] button')
      if (trigger === null) return
      const resize = globalThis.__dshChromeResize__ ??= new ResizeObserver(() => {
        const el = document.querySelector('[class*="settingsArea"] button')
        if (el === null) return
        if ((el.getBoundingClientRect().width < 90) === globalThis.__dshBadgeNarrow__) return
        globalThis.__dshRepaintChrome__?.()
      })
      if (globalThis.__dshChromeResizeTarget__ !== trigger) {
        resize.disconnect()
        resize.observe(trigger)
        globalThis.__dshChromeResizeTarget__ = trigger
      }
    }
    globalThis.__dshRepaintChrome__ = paint
    paint()

    /*
     * dsh 是 SPA，重渲染会把注入的节点一起换掉，所以要补挂。
     *
     * 对话流每来一个 token 都在改 DOM，观察者回调极其频繁，直接 paint 会在每次
     * 变动上做一次查询加布局测量，所以合并一下再画。
     *
     * 这里不能用 requestAnimationFrame：窗口一到后台 visibilityState 就是
     * hidden，rAF 被完全冻结（实测一秒内一次都不回调），节点被重渲染抹掉后
     * 就再也补不回来。setTimeout 在后台只是被限流到约一秒一次，仍然会执行。
     */
    if (globalThis.__dshChromeObserver__ === undefined) {
      let pending = false
      const observer = new MutationObserver(() => {
        if (pending) return
        pending = true
        setTimeout(() => {
          pending = false
          globalThis.__dshRepaintChrome__?.()
        }, 120)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      globalThis.__dshChromeObserver__ = observer
    }
    return true
  })()
`

/** 侧栏上壳附加的信息。 */
export interface SidebarChrome {
  /** 应用本体有没有新版本。 */
  hasUpdate: boolean
  /** 已发布的最新应用版本。 */
  latest: string
  /** 当前使用的 Harness 运行时版本。 */
  harnessVersion: string
}

/** 最近一次推给页面的状态，导航后要重放。 */
let lastChrome: SidebarChrome = { hasUpdate: false, latest: '', harnessVersion: '' }

/**
 * 更新侧栏上的附加信息；只传要改的那部分。
 * 没有窗口时只记下来，等窗口起来再画。
 */
export function paintSidebarChrome(patch: Partial<SidebarChrome>): void {
  lastChrome = { ...lastChrome, ...patch }
  if (window === undefined || window.isDestroyed()) return
  window.webContents
    .executeJavaScript(CHROME_SCRIPT(JSON.stringify(lastChrome)))
    .catch(() => { /* 页面还没就绪，下次导航会再推一次 */ })
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
