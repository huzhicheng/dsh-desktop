/**
 * 远程控制入口。
 *
 * 远程控制本身是桌面壳的能力——要跑进程、要把凭据加密存在本机，浏览器里
 * 都做不到。这个插件只负责在侧栏放一个入口，点击后经 preload 通道让壳打开
 * 设置窗口。
 *
 * 因此它在纯浏览器访问 dsh 时不显示任何东西：拿不到壳注入的通道，就说明
 * 这台机器上没有能执行远程控制的宿主，放一个点了没反应的入口只会误导人。
 */

import { entryRow, ensureVerticalFooter } from '../../../shared/entry-row'

const ICON_REMOTE = 'M4 5.5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM7 18.5h4M9 14.5v4M17.5 9.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 16 20v-9a1.5 1.5 0 0 1 1.5-1.5zM19 18.8h.01'

/** 桌面壳通过 preload 注入的通道；纯浏览器访问时为 undefined。 */
interface DesktopBridge { isDesktop?: boolean; openRemoteControl?: () => void }

function desktopBridge(): DesktopBridge | undefined {
  return (globalThis as { dshDesktop?: DesktopBridge }).dshDesktop
}

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
      id: 'remote-control-entry',
      order: 120,
      label: () => '远程控制',
    }, function RemoteEntry(props: { wide?: boolean }): unknown {
      const desktop = desktopBridge()
      if (desktop?.openRemoteControl === undefined) return null
      return entryRow('远程控制', ICON_REMOTE, props.wide !== false, () => {
        desktop.openRemoteControl?.()
      })
    }))
  })
}
