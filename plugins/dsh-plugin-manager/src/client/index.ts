/**
 * 插件管理 —— 浏览器半侧。
 *
 * 只做一件事：在侧栏底部放一个「插件」入口，点开是管理对话框。
 * 装卸插件要在主机上跑进程，浏览器做不了，所以真正的动作由本包的 host
 * 半侧（src/index.ts）开出的 HTTP 接口执行。
 */

import { openPluginManager } from '../manager'
import { entryRow, ensureVerticalFooter, pluginSettingsRegistry } from '../../../shared/entry-row'

const ICON_PUZZLE = 'M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.6 2.6 0 0 1 0 5.2H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.6 2.6 0 0 1 5.2 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z'

interface SlotsApi {
  inject: (name: string, register: () => unknown) => void
  register: (options: Record<string, unknown>, component: unknown) => unknown
}

/**
 * 插件入口。
 * @param ctx - dsh 的浏览器端上下文。
 */
export function apply(ctx: {
  inject?: (services: string[], setup: (scoped: { slots: SlotsApi }) => void) => void
  effect?: (setup: () => (() => void) | void, label?: string) => void
}): void {
  ensureVerticalFooter()

  ctx.inject?.(['slots'], (scoped) => {
    scoped.slots.inject('sidebar.footer.action', () => scoped.slots.register({
      name: 'sidebar.footer.action',
      id: 'plugin-manager-entry',
      order: 100,
      label: () => '插件',
    }, function PluginEntry(props: { wide?: boolean }): unknown {
      return entryRow('插件', ICON_PUZZLE, props.wide !== false, () => {
        // 别的插件登记过设置入口的，管理器里就能直接点开它的设置；
        // 没人登记就只是列表，不会因此报错
        openPluginManager(pluginSettingsRegistry())
      })
    }))
  })
}
