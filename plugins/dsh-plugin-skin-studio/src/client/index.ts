/**
 * 浏览器半侧：加载时立刻上皮肤，并在「设置 → 插件」里注册一个配置页。
 *
 * 配置存在浏览器本地（localStorage），不走 dsh 的 settings 体系——后者对
 * 树外插件是封死的：`packages/host/apiproxy/src/api-proxy.ts` 里有一份硬编码的
 * `WEB_SETTINGS_NAMESPACES` 白名单，不在其中的 namespace 一律返回
 * `settings-not-exposed`（该文件的注释也写明这是待改的临时设计）。
 * 皮肤本就是纯展示偏好，存本地既合适也不受这条限制。
 */

import { createElement } from 'react'
import { DEFAULT_CONFIG, normalizeConfig, type SkinConfig } from '../config'
import { createSkinPanel } from '../panel'
import { openPluginManager } from '../manager'
import { createSkinRuntime } from '../runtime'
// 构建时由 esbuild 以文本形式内联，浏览器端不再发一次请求
import skinCss from '../skin.css'

const STORAGE_KEY = 'dsh-skin-studio.config'

/** 侧栏入口用的两个图标路径。 */
const ICON_PUZZLE = 'M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.6 2.6 0 0 1 0 5.2H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.6 2.6 0 0 1 5.2 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z'
const ICON_REMOTE = 'M4 5.5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM7 18.5h4M9 14.5v4M17.5 9.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 16 20v-9a1.5 1.5 0 0 1 1.5-1.5zM19 18.8h.01'
const ICON_PALETTE = 'M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 10.9C22 6 17.5 2 12 2zm-5.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5 2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z'

function load(): SkinConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? { ...DEFAULT_CONFIG } : normalizeConfig(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function save(config: SkinConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (error) {
    // 存不下（隐私模式或超出配额）不该让界面崩掉，皮肤本身已经生效了
    console.warn('skin-studio: 配置保存失败', error)
  }
}

interface SlotsApi {
  inject: (name: string, register: () => unknown) => void
  register: (options: Record<string, unknown>, component: unknown) => unknown
}

/**
 * 以对话框形式打开皮肤设置。
 *
 * 除了「设置 → 插件 → 皮肤」那个页签，插件管理里的卡片和侧栏入口也用它，
 * 三处共用同一个面板实例逻辑，改动即时预览、保存后持久化。
 */
function openSkinPanel(runtime: ReturnType<typeof createSkinRuntime>): void {
  if (document.querySelector('.skin-dialog-mask') !== null) return
  const mask = document.createElement('div')
  mask.className = 'skin-dialog-mask'
  Object.assign(mask.style, {
    position: 'fixed', inset: '0', zIndex: '9999', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)',
  })
  const dialog = document.createElement('div')
  Object.assign(dialog.style, {
    width: 'min(620px, calc(100vw - 64px))', maxHeight: 'min(80vh, 780px)',
    display: 'flex', flexDirection: 'column', borderRadius: '14px', overflow: 'hidden',
    background: 'var(--dsw-alias-bg-layer-1, #fff)',
    color: 'var(--dsw-alias-label-primary, #111)',
    border: '1px solid var(--dsw-alias-border-l2, #8883)',
    boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
  })
  const close = (): void => {
    mask.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  mask.addEventListener('click', (event) => { if (event.target === mask) close() })

  const head = document.createElement('div')
  Object.assign(head.style, {
    display: 'flex', alignItems: 'center', padding: '15px 18px',
    borderBottom: '1px solid var(--dsw-alias-border-l1, #8882)',
  })
  const title = document.createElement('div')
  title.textContent = '皮肤管理'
  Object.assign(title.style, { fontSize: '15px', fontWeight: '650' })
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.textContent = '关闭'
  Object.assign(closeBtn.style, {
    marginLeft: 'auto', font: 'inherit', fontSize: '12px', padding: '5px 12px',
    borderRadius: '7px', cursor: 'pointer', background: 'transparent', color: 'inherit',
    border: '1px solid var(--dsw-alias-border-l2, #8883)',
  })
  closeBtn.addEventListener('click', close)
  head.append(title, closeBtn)

  const scroll = document.createElement('div')
  Object.assign(scroll.style, { padding: '16px 18px 20px', overflowY: 'auto' })
  scroll.appendChild(createSkinPanel({
    initial: load(),
    onPreview: (config) => { runtime.apply(config) },
    onSave: (config) => { save(config) },
  }))

  dialog.append(head, scroll)
  mask.appendChild(dialog)
  document.body.appendChild(mask)
}

/**
 * 侧栏底部的入口行，外观逐项对齐 dsh 自己的「设置」。
 *
 * 规格抄自 packages/client/ui-settings-general/src/client/SettingsRoot.module.css
 * 的 `.trigger`：高 34px、圆角 12px、gap 8px、padding 6px 2px 6px 10px、
 * 字号 14px/行高 22px、宽度 calc(100% + 8px) 配 margin 4px -4px，
 * hover 用 --dsw-alias-interactive-bg-hover；收窄成 rail 时是 36×36 的圆。
 * 这些数字不是我定的，改 dsh 版本时对着那份 CSS 核一遍即可。
 */
function entryRow(
  label: string, iconPath: string, wide: boolean, onClick: () => void,
): unknown {
  const base: Record<string, string> = {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    overflow: 'hidden',
    color: 'var(--dsw-alias-label-primary)',
    fontFamily: 'inherit',
    fontSize: '14px',
    lineHeight: '22px',
  }
  const shape: Record<string, string> = wide
    ? {
        gap: '8px', width: 'calc(100% + 8px)', height: '34px',
        margin: '4px -4px 4px', padding: '6px 2px 6px 10px', borderRadius: '12px',
      }
    : {
        gap: '0', width: '36px', height: '36px', justifyContent: 'center',
        margin: '8px 0 10px', padding: '0', borderRadius: '50%',
      }

  return createElement('button', {
    type: 'button',
    title: label,
    'aria-label': label,
    onClick,
    style: { ...base, ...shape },
    // hover 底色与「设置」同一个 token；内联样式没有 :hover，只能这样接
    onMouseEnter: (event: { currentTarget: HTMLElement }) => {
      event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
    },
    onMouseLeave: (event: { currentTarget: HTMLElement }) => {
      event.currentTarget.style.background = 'transparent'
    },
  }, createElement('svg', {
    width: wide ? 16 : 18, height: wide ? 16 : 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flex: 'none' },
  }, createElement('path', { d: iconPath })),
    wide ? createElement('span', { style: { overflow: 'hidden', whiteSpace: 'nowrap' } }, label) : null)
}

/** 桌面壳通过 preload 注入的通道；纯浏览器访问时为 undefined。 */
interface DesktopBridge { isDesktop?: boolean; openRemoteControl?: () => void }
function desktopBridge(): DesktopBridge | undefined {
  return (globalThis as { dshDesktop?: DesktopBridge }).dshDesktop
}

/**
 * 两个入口做成一次 slot 注册、内部纵向排列。
 *
 * dsh 的 `.footerActions` 是 `display: flex` 的行容器且不换行，注册成两项会被
 * 并排摆开；注册成一项、内部自己竖排，才能和下面的「设置」连成一列。
 */
function createFooterEntries(runtime: ReturnType<typeof createSkinRuntime>): () => unknown {
  return function FooterEntries(props: { wide?: boolean }): unknown {
    const wide = props.wide !== false
    const desktop = desktopBridge()
    return createElement('div', {
      style: {
        display: 'flex', flexDirection: 'column',
        width: wide ? '100%' : 'auto', minWidth: '0',
        alignItems: wide ? 'stretch' : 'center',
      },
    },
      entryRow('插件', ICON_PUZZLE, wide, () => {
        openPluginManager({ 'dsh-plugin-skin-studio': () => { openSkinPanel(runtime) } })
      }),
      entryRow('皮肤', ICON_PALETTE, wide, () => { openSkinPanel(runtime) }),
      // 远程控制是桌面壳的能力（要跑进程、存加密凭据），浏览器里做不了；
      // 拿不到壳注入的通道时这一项不出现，插件在纯浏览器下照样可用。
      desktop?.openRemoteControl === undefined
        ? null
        : entryRow('远程控制', ICON_REMOTE, wide, () => { desktop.openRemoteControl?.() }))
  }
}

/**
 * 插件入口。
 * @param ctx - dsh 的浏览器端上下文。
 */
export function apply(ctx: {
  inject?: (services: string[], setup: (scoped: { slots: SlotsApi }) => void) => void
  effect?: (setup: () => (() => void) | void, label?: string) => void
}): void {
  const runtime = createSkinRuntime(skinCss)

  // 皮肤立即生效，不声明顶层 inject：cordis 会等 inject 里的服务就绪才挂载插件，
  // 一旦等不到（比如某个 UI 包没装），整个插件连同皮肤都不会运行。
  runtime.apply(load())
  // 注意 cordis 的约定：传进 effect 的函数是「setup」，会被立即执行，
  // 它的返回值才是卸载时的清理函数。直接把 dispose 传进去会导致
  // 皮肤刚应用就被立刻卸掉。
  ctx.effect?.(() => () => { runtime.dispose() }, 'skin-studio: 皮肤')

  // 设置页要用 slots 服务，等它就绪再注册；注册不上也只是少一个配置入口。
  ctx.inject?.(['slots'], (scoped) => {
    // 插件管理入口：侧栏底部、「设置」上方。
    // dsh 侧栏只开放三个 slot——workspaces 与 settings 都是 single 且已被占用，
    // footer.action 是唯一能给第三方插件放入口的位置。
    // 插件与皮肤两个入口：一次注册、内部竖排，与下方「设置」连成一列
    scoped.slots.inject('sidebar.footer.action', () => scoped.slots.register({
      name: 'sidebar.footer.action',
      id: 'skin-studio-entries',
      order: 100,
      label: () => '插件与皮肤',
    }, createFooterEntries(runtime)))
  })
}
