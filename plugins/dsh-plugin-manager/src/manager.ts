/**
 * 插件管理面板（浏览器侧）。
 *
 * 用纯 DOM 实现，不绑定 dsh 的组件库：dsh 的 UI 随版本演进，绑得越少越不容易碎。
 * 安装/卸载走本插件 Host 半侧开的接口（浏览器里跑不了进程）。
 */

const API = '/_dsh-skin-studio/api'

interface PluginEntry {
  name: string
  spec: string
  version?: string
  description?: string
  isBundle: boolean
  isLocal: boolean
  active: boolean
}

/** Loader 里一条运行中的插件条目。 */
interface RuntimeEntry {
  id: string
  module: string
  enabled: boolean
  phase: string | null
}

interface Snapshot {
  profileDir: string
  builtin: string[]
  installed: PluginEntry[]
  runtime: RuntimeEntry[]
  /** 宿主能不能开原生目录选择器；不能就只显示手填输入框。 */
  canPickDirectory?: boolean
}

/** 已安装插件里，哪些能打开自己的设置面板。 */
export interface PluginSettingsProvider {
  /** 包名 → 打开它的设置。 */
  [packageName: string]: () => void
}

const CSS = `
.pm-mask { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,0.32); backdrop-filter: blur(2px); }
.pm-dialog { width: min(760px, calc(100vw - 64px)); max-height: min(78vh, 760px);
  display: flex; flex-direction: column; border-radius: 14px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111);
  border: 1px solid var(--dsw-alias-border-l2, #8883); box-shadow: 0 24px 70px rgba(0,0,0,0.3);
  font-size: 13px; }
.pm-head { display: flex; align-items: center; gap: 10px; padding: 15px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #8882); }
.pm-title { font-size: 15px; font-weight: 650; }
.pm-sub { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; }
.pm-body { padding: 16px 18px 20px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
/* 底栏固定不滚，关闭键落在右下角——和皮肤设置、远程控制那两个窗口保持一致 */
.pm-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex: none;
  padding: 12px 18px; border-top: 1px solid var(--dsw-alias-border-l1, #8882); }
.pm-h { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-tertiary, #888); margin: 0 0 9px; }
.pm-h:not(:first-child) { margin-top: 22px; }
.pm-card { display: flex; gap: 12px; align-items: flex-start; padding: 11px 13px; margin-bottom: 7px;
  border: 1px solid var(--dsw-alias-border-l2, #8883); border-radius: 11px;
  background: var(--dsw-alias-bg-layer-2, transparent); }
.pm-card .pm-main { flex: 1; min-width: 0; }
.pm-name { font-weight: 640; word-break: break-all; }
.pm-meta { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; margin-top: 3px; word-break: break-all; }
.pm-badge { display: inline-block; font-size: 10.5px; font-weight: 600; padding: 1px 7px; margin-left: 6px;
  border-radius: 999px; border: 1px solid currentColor; opacity: 0.85; vertical-align: 1px; }
.pm-badge.ok { color: var(--dsw-alias-brand-primary, #c99); }
.pm-badge.warn { color: var(--dsw-alias-state-warn-primary, #b80); }
.pm-badge.local { color: var(--dsw-alias-state-success-primary, #6a4); }
.pm-btn { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
.pm-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary, #c99); color: var(--dsw-alias-brand-primary, #c99); }
.pm-btn:disabled { opacity: 0.45; cursor: default; }
.pm-btn.primary { background: var(--dsw-alias-brand-primary, #c99); border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 600; }
.pm-row { display: flex; gap: 8px; align-items: center; }
.pm-input { flex: 1; font: inherit; font-size: 13px; padding: 8px 11px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l3, #8884); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
.pm-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary, #c99); }
.pm-note { font-size: 12px; line-height: 1.6; padding: 9px 12px; border-radius: 8px; margin-bottom: 12px;
  border: 1px solid var(--dsw-alias-state-warn-primary, #b80); color: inherit; opacity: 0.92; }
.pm-empty { text-align: center; padding: 16px; font-size: 12px; border-radius: 11px;
  border: 1px dashed var(--dsw-alias-border-l3, #8884); color: var(--dsw-alias-label-tertiary, #888); }
.pm-out { margin-top: 11px; padding: 10px 12px; border-radius: 9px; font-size: 11.5px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-all; max-height: 190px; overflow: auto;
  background: var(--dsw-alias-markdown-code-block, #0002); font-family: ui-monospace, Menlo, monospace; }
.pm-hint { font-size: 11.5px; color: var(--dsw-alias-label-caption, #999); line-height: 1.75; margin-top: 12px; }
.pm-tabs { display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid var(--dsw-alias-border-l1, #8882); }
.pm-tab { font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 12px; cursor: pointer;
  border: none; background: transparent; color: var(--dsw-alias-label-tertiary, #888);
  border-bottom: 2px solid transparent; margin-bottom: -1px; }
.pm-tab[data-on="1"] { color: var(--dsw-alias-brand-primary, #c99); border-bottom-color: var(--dsw-alias-brand-primary, #c99); }
.pm-search { width: 100%; font: inherit; font-size: 12.5px; padding: 7px 11px; margin-bottom: 10px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #8883);
  background: var(--dsw-alias-bg-layer-2, transparent); color: inherit; }
.pm-search:focus { outline: none; border-color: var(--dsw-alias-brand-primary, #c99); }
.pm-rt { display: flex; align-items: center; gap: 9px; padding: 6px 10px; border-radius: 7px;
  font-size: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #8881); }
.pm-rt:hover { background: var(--dsw-alias-interactive-bg-hover, #8881); }
.pm-rt .pm-mod { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }
.pm-rt .pm-id { color: var(--dsw-alias-label-caption, #999); font-size: 11px;
  max-width: 33%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.pm-count { color: var(--dsw-alias-label-caption, #999); font-size: 11.5px; margin-bottom: 9px; }
.pm-banner { display: flex; align-items: center; gap: 12px; padding: 10px 13px; border-radius: 9px;
  margin-bottom: 14px; font-size: 12.5px;
  border: 1px solid var(--dsw-alias-brand-primary, #c99); }
`

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  node.append(...children)
  return node
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API + path, body === undefined
    ? {}
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return await response.json() as T
}

/**
 * 打开插件管理对话框；重复调用只会有一个。
 * @param settings - 包名 → 打开该插件自己的设置面板；有登记的插件会多一个「设置」按钮。
 */
export function openPluginManager(settings: PluginSettingsProvider = {}): void {
  if (document.querySelector('.pm-mask') !== null) return

  const mask = el('div', { class: 'pm-mask' })
  const dialog = el('div', { class: 'pm-dialog' })
  mask.appendChild(el('style', {}, CSS))
  mask.appendChild(dialog)

  const close = (): void => {
    mask.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  mask.addEventListener('click', (event) => { if (event.target === mask) close() })

  dialog.appendChild(el('div', { class: 'pm-head' },
    el('div', {},
      el('div', { class: 'pm-title' }, '插件管理'),
      el('div', { class: 'pm-sub' }, '管理当前 web profile 的插件组装'))))

  type Tab = 'installed' | 'runtime' | 'install'
  let tab: Tab = 'installed'
  let snapshot: Snapshot | undefined
  let filter = ''
  let busy = false

  const tabs = el('div', { class: 'pm-tabs' })
  dialog.appendChild(tabs)
  const body = el('div', { class: 'pm-body' })
  dialog.appendChild(body)

  const closeBtn = el('button', { class: 'pm-btn primary', type: 'button' }, '关闭')
  closeBtn.addEventListener('click', close)
  dialog.appendChild(el('div', { class: 'pm-foot' }, closeBtn))

  const banner = el('div', { class: 'pm-banner' })
  banner.style.display = 'none'
  const output = el('div', { class: 'pm-out' })
  output.style.display = 'none'

  const setOutput = (text: string): void => {
    output.style.display = 'block'
    output.textContent = text
    output.scrollTop = output.scrollHeight
  }
  const showBanner = (): void => {
    banner.textContent = '插件改动已写入。重启应用（或重新运行 dsh web）后生效。'
    banner.style.display = 'flex'
  }

  const renderTabs = (): void => {
    const data = snapshot
    const items: [Tab, string][] = [
      ['installed', `已安装（${String(data === undefined ? 0 : data.installed.length + data.builtin.length)}）`],
      ['runtime', `运行中（${String(data?.runtime.length ?? 0)}）`],
      ['install', '安装新插件'],
    ]
    tabs.replaceChildren()
    for (const [id, label] of items) {
      const button = el('button', { class: 'pm-tab', type: 'button', 'data-on': id === tab ? '1' : '0' }, label)
      button.addEventListener('click', () => { tab = id; filter = ''; render() })
      tabs.appendChild(button)
    }
  }

  /** 已安装：dsh 自带的组合包 + 用户装的外部插件。 */
  const renderInstalled = (data: Snapshot): void => {
    body.appendChild(banner)
    body.appendChild(el('div', { class: 'pm-h' }, `默认组合包（${String(data.builtin.length)}）`))
    for (const name of data.builtin) {
      body.appendChild(el('div', { class: 'pm-card' }, el('div', { class: 'pm-main' },
        el('div', { class: 'pm-name' }, name, el('span', { class: 'pm-badge ok' }, '内置')),
        el('div', { class: 'pm-meta' }, '随 Harness 一同分发，跟随版本升级，不可卸载'))))
    }

    body.appendChild(el('div', { class: 'pm-h' }, `外部插件（${String(data.installed.length)}）`))
    if (data.installed.length === 0) {
      body.appendChild(el('div', { class: 'pm-empty' }, '还没有安装外部插件'))
    }
    for (const plugin of data.installed) {
      const name = el('div', { class: 'pm-name' }, plugin.name)
      if (plugin.isLocal) name.appendChild(el('span', { class: 'pm-badge local' }, '本地'))
      name.appendChild(plugin.active
        ? el('span', { class: 'pm-badge ok' }, '已生效')
        : el('span', { class: 'pm-badge warn' }, plugin.isBundle ? '待重启' : '非组合包'))

      const actions: HTMLElement[] = []
      // 插件自带配置面板时（比如皮肤），在这里直接给一个入口
      const openSettings = settings[plugin.name]
      if (openSettings !== undefined) {
        const button = el('button', { class: 'pm-btn primary', type: 'button' }, '设置')
        button.addEventListener('click', () => { close(); openSettings() })
        actions.push(button)
      }
      const remove = el('button', { class: 'pm-btn', type: 'button' }, '卸载')
      remove.addEventListener('click', () => {
        void run('/plugins/remove', { name: plugin.name }, `正在卸载 ${plugin.name} …`)
      })
      actions.push(remove)

      body.appendChild(el('div', { class: 'pm-card' },
        el('div', { class: 'pm-main' }, name,
          el('div', { class: 'pm-meta' }, plugin.isBundle
            ? (plugin.description ?? '（该包未提供描述）')
            : '该包未声明 dsh.bundle，不会贡献配置层，只作为普通依赖存在'),
          el('div', { class: 'pm-meta' }, `来源 ${plugin.spec}${plugin.version === undefined ? '' : ` · 版本 ${plugin.version}`}`)),
        el('div', { class: 'pm-row' }, ...actions)))
    }
    body.appendChild(output)
  }

  /** 运行中：Loader 当前挂载的全部条目，只读。 */
  const renderRuntime = (data: Snapshot): void => {
    const search = el('input', { class: 'pm-search', type: 'text', spellcheck: 'false',
      placeholder: '搜索包名或条目 id' }) as HTMLInputElement
    search.value = filter
    const list = el('div', {})
    const count = el('div', { class: 'pm-count' })

    const paint = (): void => {
      const keyword = filter.trim().toLowerCase()
      const rows = data.runtime.filter(entry => keyword === ''
        || entry.module.toLowerCase().includes(keyword) || entry.id.toLowerCase().includes(keyword))
      const active = data.runtime.filter(entry => entry.phase === 'active').length
      count.textContent = `共 ${String(data.runtime.length)} 个条目，${String(active)} 个运行中`
        + (keyword === '' ? '' : `；匹配 ${String(rows.length)} 个`)
      list.replaceChildren()
      if (rows.length === 0) {
        list.appendChild(el('div', { class: 'pm-empty' }, '没有匹配的条目'))
        return
      }
      for (const entry of rows) {
        const dot = el('span', { class: 'pm-dot' })
        dot.style.background = entry.phase === 'active'
          ? 'var(--dsw-alias-state-success-primary, #6a4)'
          : entry.phase === 'failed'
            ? 'var(--dsw-alias-state-error-primary, #d55)'
            : 'var(--dsw-alias-label-caption, #999)'
        dot.title = entry.phase ?? '未挂载'
        list.appendChild(el('div', { class: 'pm-rt' }, dot,
          el('span', { class: 'pm-mod' }, entry.module),
          el('span', { class: 'pm-id' }, entry.id),
          el('span', { class: 'pm-badge ' + (entry.enabled ? 'ok' : 'warn') },
            entry.enabled ? (entry.phase ?? '未挂载') : '已停用')))
      }
    }
    search.addEventListener('input', () => { filter = search.value; paint() })

    body.appendChild(el('div', { class: 'pm-h' }, 'Harness 当前挂载的全部插件条目'))
    body.appendChild(search)
    body.appendChild(count)
    body.appendChild(list)
    body.appendChild(el('div', { class: 'pm-hint' },
      '这份清单直接读自 Loader，是当下的运行状态；它由配置组装决定，不能在这里增删。'))
    paint()
    setTimeout(() => { search.focus() }, 0)
  }

  const renderInstall = (data: Snapshot): void => {
    body.appendChild(banner)
    body.appendChild(el('div', { class: 'pm-note' },
      '插件是第三方代码，安装后与 Harness 同权限运行，并可能执行安装脚本。请只安装你信任来源的插件。'))
    const input = el('input', { class: 'pm-input', type: 'text', spellcheck: 'false',
      placeholder: '包名、GitHub 地址、本地路径，或整条安装命令' }) as HTMLInputElement
    const install = el('button', { class: 'pm-btn primary', type: 'button' }, '安装')
    const doInstall = (): void => {
      const spec = input.value.trim()
      if (spec !== '') void run('/plugins/install', { spec }, `正在安装 ${spec} …`)
    }
    install.addEventListener('click', doInstall)
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') doInstall() })

    // 本地插件目录靠手打绝对路径太别扭，能开原生选择器就给一个入口。
    // 选完只填进输入框、不直接装，让人还能核对一眼再点安装。
    const row = el('div', { class: 'pm-row' }, input)
    if (data.canPickDirectory === true) {
      const browse = el('button', { class: 'pm-btn', type: 'button' }, '选择目录…')
      browse.addEventListener('click', () => {
        if (busy) return
        browse.disabled = true
        void (async () => {
          try {
            const result = await api<{ ok: boolean; path?: string; output?: string }>('/plugins/pick-directory', {})
            // 取消时 ok 为 true 但没有 path，什么都不做
            if (result.ok && result.path !== undefined) {
              input.value = result.path
              input.focus()
            } else if (!result.ok) {
              setOutput(result.output ?? '目录选择失败')
            }
          } catch (error) {
            setOutput(`目录选择失败：${error instanceof Error ? error.message : String(error)}`)
          } finally {
            browse.disabled = false
          }
        })()
      })
      row.appendChild(browse)
    }
    row.appendChild(install)
    body.appendChild(row)
    body.appendChild(output)
    body.appendChild(el('div', { class: 'pm-hint' },
      `插件安装在 ${data.profileDir}，与 Harness 自身的版本升级互不影响。`,
      el('br', {}), '找插件：GitHub 上按 dsh-plugin 话题搜索。'))
    setTimeout(() => { input.focus() }, 0)
  }

  const render = (): void => {
    renderTabs()
    body.replaceChildren()
    const data = snapshot
    if (data === undefined) {
      body.appendChild(el('div', { class: 'pm-empty' }, '正在读取…'))
      return
    }
    if (tab === 'installed') renderInstalled(data)
    else if (tab === 'runtime') renderRuntime(data)
    else renderInstall(data)
  }

  const refresh = async (): Promise<void> => {
    try {
      snapshot = await api<Snapshot>('/plugins')
    } catch (error) {
      body.replaceChildren(el('div', { class: 'pm-empty' },
        `读取插件列表失败：${error instanceof Error ? error.message : String(error)}`))
      return
    }
    render()
  }

  const run = async (path: string, payload: unknown, title: string): Promise<void> => {
    if (busy) return
    busy = true
    setOutput(title)
    try {
      const result = await api<{ ok: boolean; output: string }>(path, payload)
      setOutput(title + '\n' + result.output + '\n' + (result.ok ? '完成。' : '失败。'))
      if (result.ok) showBanner()
    } catch (error) {
      setOutput(title + '\n请求失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      busy = false
      await refresh()
    }
  }

  document.body.appendChild(mask)
  render()
  void refresh()
}
