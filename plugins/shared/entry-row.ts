/**
 * 侧栏底部入口行 —— 三个插件共用。
 *
 * 构建时由 esbuild 内联进各自的产物，发布出去的包里没有这个依赖，
 * 所以三个插件仍然可以各自独立安装、独立卸载。改这里三个插件都要重新构建。
 *
 * 外观逐项对齐 dsh 自己的「设置」：规格抄自
 * packages/client/ui-settings-general/src/client/SettingsRoot.module.css 的
 * `.trigger`——高 34px、圆角 12px、gap 8px、padding 6px 2px 6px 10px、
 * 字号 14px/行高 22px、宽度 calc(100% + 8px) 配 margin 4px -4px，
 * hover 用 --dsw-alias-interactive-bg-hover；收窄成 rail 时是 36×36 的圆。
 * 这些数字不是我定的，改 dsh 版本时对着那份 CSS 核一遍即可。
 */

import { createElement } from 'react'

const STACK_STYLE_ID = 'dsh-sidebar-entry-stack'

/**
 * 让侧栏底部的入口竖着排。
 *
 * dsh 的 `.footerActions` 是 `display: flex` 的行容器且默认不换行，三个插件
 * 各注册各的会被并排摆成一行。这里补一条 flex-direction: column，让它们和
 * 下方的「设置」连成一列。
 *
 * 三个插件都会调用，重复注入由 id 去重。选择器匹配不上（dsh 改了类名）时
 * 只是退回横排，入口仍然可点，不会坏。
 */
export function ensureVerticalFooter(): void {
  if (document.getElementById(STACK_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STACK_STYLE_ID
  style.textContent = '[class*="footerActions"]{flex-direction:column;}'
  document.head.appendChild(style)
}

/**
 * 造一个侧栏入口按钮。
 * @param label - 显示的文字，收窄成 rail 时只留图标并用作 tooltip。
 * @param iconPath - 24×24 viewBox 下的单条 path。
 * @param wide - 侧栏是否处于展开态。
 * @param onClick - 点击回调。
 */
export function entryRow(
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

/**
 * 别的插件想把自己的设置入口挂进插件管理器时用的登记处。
 *
 * 用全局对象而不是包依赖：插件管理器不该 import 皮肤插件，皮肤插件也不该
 * import 管理器，否则又绕回「装一个必须装另一个」的耦合。谁在就登记谁，
 * 管理器读到什么显示什么。
 */
export interface PluginSettingsRegistry { [packageName: string]: () => void }

export function registerPluginSettings(packageName: string, open: () => void): void {
  const host = globalThis as { __dshPluginSettings__?: PluginSettingsRegistry }
  host.__dshPluginSettings__ ??= {}
  host.__dshPluginSettings__[packageName] = open
}

export function pluginSettingsRegistry(): PluginSettingsRegistry {
  return (globalThis as { __dshPluginSettings__?: PluginSettingsRegistry }).__dshPluginSettings__ ?? {}
}
