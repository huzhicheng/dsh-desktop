/**
 * 浏览器半侧：加载时立刻上皮肤，并在「设置 → 插件」里注册一个配置页。
 *
 * 配置存在浏览器本地（localStorage），不走 dsh 的 settings 体系——后者对
 * 树外插件是封死的：`packages/host/apiproxy/src/api-proxy.ts` 里有一份硬编码的
 * `WEB_SETTINGS_NAMESPACES` 白名单，不在其中的 namespace 一律返回
 * `settings-not-exposed`（该文件的注释也写明这是待改的临时设计）。
 * 皮肤本就是纯展示偏好，存本地既合适也不受这条限制。
 */

import { DEFAULT_CONFIG, normalizeConfig, type SkinConfig } from '../config'
import { createSkinPanel } from '../panel'
import { createSkinRuntime } from '../runtime'
import {
  entryRow, ensureVerticalFooter, registerPluginSettings,
} from '../../../shared/entry-row'
// 构建时由 esbuild 以文本形式内联，浏览器端不再发一次请求
import skinCss from '../skin.css'

const STORAGE_KEY = 'dsh-skin-studio.config'

/** 侧栏入口的图标。 */
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
    onDone: close,
  }))

  dialog.append(head, scroll)
  mask.appendChild(dialog)
  document.body.appendChild(mask)
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

  ensureVerticalFooter()
  // 让插件管理器能列出「皮肤」的设置入口；管理器没装也不影响，只是没人来读
  registerPluginSettings('dsh-plugin-skin-studio', () => { openSkinPanel(runtime) })

  // 侧栏入口要用 slots 服务，等它就绪再注册；注册不上也只是少一个入口，
  // 皮肤本身已经生效了。
  ctx.inject?.(['slots'], (scoped) => {
    scoped.slots.inject('sidebar.footer.action', () => scoped.slots.register({
      name: 'sidebar.footer.action',
      id: 'skin-studio-entry',
      order: 110,
      label: () => '皮肤',
    }, function SkinEntry(props: { wide?: boolean }): unknown {
      return entryRow('皮肤', ICON_PALETTE, props.wide !== false, () => { openSkinPanel(runtime) })
    }))
  })
}
