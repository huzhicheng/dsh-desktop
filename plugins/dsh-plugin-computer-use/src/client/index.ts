/**
 * 电脑操作的侧栏入口与状态面板。
 *
 * 浏览器这半边碰不到本机，所有实际动作都发到宿主半边的 HTTP 接口去做。
 * 面板要回答的就三个问题：装没装、权限齐没齐、连上没有。
 */

import { entryRow, ensureVerticalFooter, registerPluginSettings } from '../../../shared/entry-row'

const API = '/_dsh-computer-use/api'

const ICON_DESKTOP = 'M3 5.5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM8 20.5h8M12 16.5v4'

interface Status {
  binPath: string
  version: string
  platform: string
  permissions: { accessibility: boolean, screenRecording: boolean, ok: boolean, detail: string }
  connected: boolean
  permissionMode: string
  blockImageResults: boolean
  installing: boolean
  installLog: string
  error: string
  toolPrefix: string
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API + path, body === undefined
    ? {}
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return await response.json() as T
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  node.append(...children)
  return node
}

const CSS = `
.cu-mask { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,0.32); backdrop-filter: blur(2px); }
.cu-dialog { width: min(620px, calc(100vw - 64px)); max-height: min(80vh, 780px);
  display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; font-size: 13px;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111);
  border: 1px solid var(--dsw-alias-border-l2, #8883); box-shadow: 0 24px 70px rgba(0,0,0,0.3); }
.cu-head { display: flex; align-items: center; padding: 15px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #8882); }
.cu-title { font-size: 15px; font-weight: 650; }
.cu-body { padding: 16px 18px 20px; overflow-y: auto; flex: 1 1 auto; min-height: 0; line-height: 1.65; }
.cu-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex: none;
  padding: 12px 18px; border-top: 1px solid var(--dsw-alias-border-l1, #8882); }
.cu-btn { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
.cu-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary, #c99); color: var(--dsw-alias-brand-primary, #c99); }
.cu-btn:disabled { opacity: 0.45; cursor: default; }
.cu-btn.primary { background: var(--dsw-alias-brand-primary, #c99); border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 600; }
.cu-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #8883); border-radius: 10px; }
.cu-row .cu-main { flex: 1; min-width: 0; }
.cu-name { font-weight: 640; }
.cu-meta { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; margin-top: 2px; word-break: break-all; }
.cu-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.cu-dot.on { background: var(--dsw-alias-state-success-primary, #6a4); }
.cu-dot.off { background: var(--dsw-alias-label-caption, #999); }
.cu-dot.warn { background: var(--dsw-alias-state-warn-primary, #b80); }
.cu-note { font-size: 12px; line-height: 1.7; padding: 10px 12px; border-radius: 9px; margin-bottom: 14px;
  border: 1px solid var(--dsw-alias-state-warn-primary, #b80); }
.cu-log { margin-top: 10px; padding: 10px 12px; border-radius: 9px; font-size: 11.5px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow: auto;
  background: var(--dsw-alias-markdown-code-block, #0002); font-family: ui-monospace, Menlo, monospace; }
.cu-h { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-tertiary, #888); margin: 18px 0 9px; }
.cu-h:first-child { margin-top: 0; }
.cu-select { font: inherit; font-size: 12px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
`

function openPanel(): void {
  if (document.querySelector('.cu-mask') !== null) return

  const mask = el('div', { class: 'cu-mask' })
  const dialog = el('div', { class: 'cu-dialog' })
  mask.append(el('style', {}, CSS), dialog)

  let timer: ReturnType<typeof setInterval> | undefined
  const close = (): void => {
    if (timer !== undefined) clearInterval(timer)
    mask.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  mask.addEventListener('click', (event) => { if (event.target === mask) close() })

  const body = el('div', { class: 'cu-body' })
  const closeBtn = el('button', { class: 'cu-btn primary', type: 'button' }, '关闭')
  closeBtn.addEventListener('click', close)

  dialog.append(
    el('div', { class: 'cu-head' }, el('div', { class: 'cu-title' }, '电脑操作')),
    body,
    el('div', { class: 'cu-foot' }, closeBtn),
  )
  mask.appendChild(dialog)
  document.body.appendChild(mask)

  const render = (status: Status): void => {
    body.replaceChildren()

    body.appendChild(el('div', { class: 'cu-note' },
      '开启后，agent 可以直接控制这台电脑的键盘、鼠标和界面元素。'
      + '它不受工作目录约束，也不走审批卡片。只在你清楚它要做什么时开启。'))

    const installed = status.binPath !== ''
    const line = (name: string, meta: string, state: 'on' | 'off' | 'warn', ...actions: Node[]): HTMLElement =>
      el('div', { class: 'cu-row' },
        el('span', { class: `cu-dot ${state}` }),
        el('div', { class: 'cu-main' }, el('div', { class: 'cu-name' }, name), el('div', { class: 'cu-meta' }, meta)),
        ...actions)

    // 一、驱动
    body.appendChild(el('div', { class: 'cu-h' }, '驱动'))
    if (installed) {
      body.appendChild(line('Cua Driver 已安装', `${status.version || '版本未知'}　${status.binPath}`, 'on'))
    } else {
      const installBtn = el('button', { class: 'cu-btn primary', type: 'button' },
        status.installing ? '安装中…' : '安装')
      installBtn.disabled = status.installing
      installBtn.addEventListener('click', () => {
        installBtn.disabled = true
        installBtn.textContent = '安装中…'
        void api('/install', {})
      })
      const where = status.platform === 'darwin'
        ? '装到「应用程序」。不随本应用分发是因为 macOS 的授权绑定签名身份，换个副本要重新授权'
        : status.platform === 'win32'
          ? '装到 %LOCALAPPDATA%\\Programs\\Cua\\cua-driver，并把它加进用户 PATH'
          : '装到 ~/.local/bin'
      body.appendChild(line('尚未安装 Cua Driver',
        `会从 cua.ai 下载官方安装包（约 65 MB），${where}。`,
        'off', installBtn))
    }

    // 二、权限
    if (status.platform === 'darwin' && installed) {
      const perm = status.permissions
      body.appendChild(el('div', { class: 'cu-h' }, '系统权限'))
      const grant = el('button', { class: 'cu-btn primary', type: 'button' }, '去授权')
      grant.addEventListener('click', () => {
        grant.disabled = true
        grant.textContent = '等你确认…'
        // 由 cua-driver 自己拉起 CuaDriver 弹窗，授权才会落到它的身份上
        void api('/permissions/grant', {}).then(refresh).catch(() => refresh())
      })
      const recheck = el('button', { class: 'cu-btn', type: 'button' }, '重新检查')
      recheck.addEventListener('click', () => {
        recheck.disabled = true
        recheck.textContent = '检查中…'
        void api('/permissions/check', {}).then(refresh).catch(() => refresh())
      })
      const mark = (ok: boolean): string => (ok ? '已授权' : '未授权')
      body.appendChild(line(
        perm.ok ? '权限已就绪' : '需要授权',
        `辅助功能 ${mark(perm.accessibility)}　屏幕录制 ${mark(perm.screenRecording)}`
        + (perm.ok ? '' : '　（弹窗只能你自己点，程序代劳不了）'),
        perm.ok ? 'on' : 'warn', ...(perm.ok ? [recheck] : [grant, recheck])))
    }

    // 三、连接
    if (installed) {
      body.appendChild(el('div', { class: 'cu-h' }, '连接'))
      const toggle = el('button', { class: 'cu-btn', type: 'button' }, status.connected ? '断开' : '连接')
      toggle.addEventListener('click', () => {
        toggle.disabled = true
        void api(status.connected ? '/disconnect' : '/connect', {}).then(refresh)
      })
      body.appendChild(line(
        status.connected ? '已连接' : '未连接',
        status.connected
          ? `工具已注册为 ${status.toolPrefix}*，可以直接让 agent 操作电脑了`
          : (status.error || '连接后 Cua Driver 的工具会注册给 agent'),
        status.connected ? 'on' : 'off', toggle))

      const mode = el('select', { class: 'cu-select' }) as HTMLSelectElement
      for (const [value, label] of [
        ['standard', 'standard　不弹确认（官方默认）'],
        ['bounded', 'bounded　仅限清单内（需自备 capability manifest）'],
        ['unrestricted', 'unrestricted　完全放行'],
      ] as const) {
        mode.append(el('option', { value }, label))
      }
      mode.value = status.permissionMode
      mode.addEventListener('change', () => { void api('/mode', { mode: mode.value }).then(refresh) })
      body.appendChild(line('权限模式', '以 CUA_DRIVER_PERMISSION_MODE 传给 cua-driver', 'on', mode))

      const block = el('input', { type: 'checkbox' }) as HTMLInputElement
      block.checked = status.blockImageResults
      block.addEventListener('change', () => {
        void api('/block-images', { enabled: block.checked }).then(refresh)
      })
      body.appendChild(line('不让截图进入对话',
        status.blockImageResults
          ? '当前按「模型只收文本」处理：截图不会回到对话，get_desktop_state 也不暴露。'
            + '换成能看图的模型（如 deepseek-v4-flash-vision-exp）后关掉这项。'
          : '当前按「模型能看图」处理：截图会回到对话。若模型其实不收图，'
            + '一次调用就会让整段会话报错并且救不回来。',
        status.blockImageResults ? 'on' : 'warn', block))
    }

    if (status.installLog !== '') {
      body.appendChild(el('div', { class: 'cu-log' }, status.installLog))
    }
  }

  const refresh = (): void => {
    void api<Status>('/status').then(render).catch(() => {
      body.replaceChildren(el('div', { class: 'cu-note' }, '读不到插件状态，可能是宿主侧没有加载成功。'))
    })
  }
  refresh()
  // 权限自检要拉起守护进程再等它就绪，是个慢查询，所以不放进轮询，
  // 打开面板时主动跑一次，之后由「重新检查」按钮触发
  void api('/permissions/check', {}).then(refresh).catch(() => undefined)
  // 安装要几分钟，轮询让进度自己刷新出来
  timer = setInterval(refresh, 2500)
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
}): void {
  ensureVerticalFooter()
  registerPluginSettings('dsh-plugin-computer-use', openPanel)

  ctx.inject?.(['slots'], (scoped) => {
    scoped.slots.inject('sidebar.footer.action', () => scoped.slots.register({
      name: 'sidebar.footer.action',
      id: 'computer-use-entry',
      order: 130,
      label: () => '电脑操作',
    }, function ComputerUseEntry(props: { wide?: boolean }): unknown {
      return entryRow('电脑操作', ICON_DESKTOP, props.wide !== false, openPanel)
    }))
  })
}
