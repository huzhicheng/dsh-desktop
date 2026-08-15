/**
 * 皮肤设置面板。
 *
 * 用纯 DOM 实现而不绑定某个 UI 框架：dsh 的设置扩展点要什么形态都能挂进去，
 * 也方便脱离 dsh 单独调试。改动即时预览，用户看到的就是最终效果。
 */

import { DEFAULT_CONFIG, PRESETS, type SkinConfig } from './config'
import { imageToDataUri } from './runtime'

export interface PanelOptions {
  /** 当前配置。 */
  initial: SkinConfig
  /** 每次改动都会回调，用于实时预览。 */
  onPreview: (config: SkinConfig) => void
  /** 用户点「保存」时回调，用于持久化。 */
  onSave: (config: SkinConfig) => Promise<void> | void
}

const CSS = `
.ss-panel { font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-primary, inherit); }
.ss-panel h3 { font-size: 12px; font-weight: 650; margin: 0 0 10px; color: var(--dsw-alias-label-tertiary, inherit); }
.ss-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.ss-row > label { flex: 0 0 84px; color: var(--dsw-alias-label-secondary, inherit); }
.ss-row > .ss-ctl { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
.ss-val { flex: 0 0 42px; text-align: right; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, inherit); font-size: 12px; }
.ss-panel input[type=range] { flex: 1; accent-color: var(--skin-accent, #d3aa61); min-width: 0; }
.ss-panel input[type=color] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #8883);
  border-radius: 6px; background: none; cursor: pointer; }
.ss-btn { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
.ss-btn:hover { border-color: var(--skin-accent, #d3aa61); color: var(--skin-accent, #d3aa61); }
.ss-btn.primary { background: var(--skin-accent, #d3aa61); border-color: transparent; color: #201a10; font-weight: 600; }
.ss-btn.primary:hover { opacity: 0.88; color: #201a10; }
.ss-presets { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
.ss-preset { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); border-radius: 999px; font-size: 12px; background: transparent; color: inherit; }
.ss-preset:hover { border-color: var(--skin-accent, #d3aa61); }
.ss-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.ss-thumb { width: 100%; height: 84px; border-radius: 9px; background-size: cover; background-position: center;
  border: 1px solid var(--dsw-alias-border-l2, #8883); margin-bottom: 10px; }
.ss-actions { display: flex; gap: 8px; align-items: center; margin-top: 16px; }
.ss-hint { color: var(--dsw-alias-label-caption, inherit); font-size: 11.5px; margin-left: auto; }
.ss-switch { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
`

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  node.append(...children)
  return node
}

/**
 * 构建面板。
 * @returns 面板根元素，调用方自行插入文档。
 */
export function createSkinPanel(options: PanelOptions): HTMLElement {
  let config: SkinConfig = { ...options.initial }

  const root = el('div', { class: 'ss-panel' })
  root.appendChild(el('style', {}, CSS))

  const preview = (): void => { options.onPreview(config) }
  const set = <K extends keyof SkinConfig>(key: K, value: SkinConfig[K]): void => {
    config = { ...config, [key]: value }
    preview()
  }

  // 总开关
  const enabled = el('input', { type: 'checkbox', id: 'ss-enabled' }) as HTMLInputElement
  enabled.checked = config.enabled
  enabled.addEventListener('change', () => { set('enabled', enabled.checked) })
  root.appendChild(el('div', { class: 'ss-switch' }, enabled,
    el('label', { for: 'ss-enabled' }, '启用皮肤（关闭后恢复 Harness 原生外观）')))

  // 预设
  root.appendChild(el('h3', {}, '配色预设'))
  const presets = el('div', { class: 'ss-presets' })
  for (const preset of PRESETS) {
    const dot = el('span', { class: 'ss-dot' })
    dot.style.background = preset.patch.accent ?? DEFAULT_CONFIG.accent
    const button = el('button', { class: 'ss-preset', type: 'button' }, dot, preset.name)
    button.addEventListener('click', () => {
      config = { ...config, ...preset.patch }
      syncInputs()
      preview()
    })
    presets.appendChild(button)
  }
  root.appendChild(presets)

  // 颜色
  root.appendChild(el('h3', {}, '颜色'))
  const accent = el('input', { type: 'color' }) as HTMLInputElement
  const bgDark = el('input', { type: 'color' }) as HTMLInputElement
  const bgLight = el('input', { type: 'color' }) as HTMLInputElement
  accent.addEventListener('input', () => { set('accent', accent.value) })
  bgDark.addEventListener('input', () => { set('bgDark', bgDark.value) })
  bgLight.addEventListener('input', () => { set('bgLight', bgLight.value) })
  root.appendChild(el('div', { class: 'ss-row' }, el('label', {}, '强调色'),
    el('div', { class: 'ss-ctl' }, accent, el('span', { class: 'ss-hint' }, '按钮、链接与选中态'))))
  root.appendChild(el('div', { class: 'ss-row' }, el('label', {}, '底色'),
    el('div', { class: 'ss-ctl' }, bgDark, el('span', {}, '暗色'), bgLight, el('span', {}, '浅色'))))

  // 背景图
  root.appendChild(el('h3', {}, '背景'))
  const thumb = el('div', { class: 'ss-thumb' })
  root.appendChild(thumb)

  const file = el('input', { type: 'file', accept: 'image/*', hidden: 'hidden' }) as HTMLInputElement
  const pick = el('button', { class: 'ss-btn', type: 'button' }, '选择图片…')
  const clear = el('button', { class: 'ss-btn', type: 'button' }, '清除')
  const status = el('span', { class: 'ss-hint' }, '')
  pick.addEventListener('click', () => { file.click() })
  file.addEventListener('change', () => {
    const chosen = file.files?.[0]
    if (chosen === undefined) return
    status.textContent = '处理中…'
    void imageToDataUri(chosen).then((uri) => {
      set('image', uri)
      syncInputs()
      // 原图常有几 MB，超长的值会被 CSS 整条丢弃，所以统一缩放压缩后再存
      status.textContent = `已压缩至 ${Math.round(uri.length / 1024)} KB`
    }).catch((error: unknown) => {
      status.textContent = `读取失败：${error instanceof Error ? error.message : String(error)}`
    })
  })
  clear.addEventListener('click', () => {
    set('image', '')
    syncInputs()
    status.textContent = ''
  })
  root.appendChild(el('div', { class: 'ss-row' },
    el('div', { class: 'ss-ctl' }, pick, clear, status, file)))

  const slider = (
    label: string, key: 'imageOpacity' | 'imageBlur' | 'transparency' | 'wash',
    min: number, max: number, step: number, format: (value: number) => string,
  ): HTMLInputElement => {
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step),
    }) as HTMLInputElement
    const value = el('span', { class: 'ss-val' })
    const update = (): void => { value.textContent = format(Number(input.value)) }
    input.addEventListener('input', () => {
      set(key, Number(input.value))
      update()
    })
    root.appendChild(el('div', { class: 'ss-row' }, el('label', {}, label),
      el('div', { class: 'ss-ctl' }, input, value)))
    ;(input as HTMLInputElement & { sync?: () => void }).sync = update
    return input
  }

  const percent = (value: number): string => `${String(Math.round(value * 100))}%`
  const imageOpacity = slider('图片浓度', 'imageOpacity', 0, 1, 0.01, percent)
  const imageBlur = slider('图片模糊', 'imageBlur', 0, 40, 1, v => `${String(Math.round(v))}px`)
  const wash = slider('蒙版强度', 'wash', 0, 1, 0.01, percent)
  const transparency = slider('界面透明', 'transparency', 0, 1, 0.01, percent)

  // 操作
  const save = el('button', { class: 'ss-btn primary', type: 'button' }, '保存')
  const reset = el('button', { class: 'ss-btn', type: 'button' }, '恢复默认')
  const saveHint = el('span', { class: 'ss-hint' }, '改动即时预览，保存后对所有窗口生效')
  save.addEventListener('click', () => {
    save.textContent = '保存中…'
    void Promise.resolve(options.onSave(config)).then(() => {
      save.textContent = '已保存'
      setTimeout(() => { save.textContent = '保存' }, 1600)
    }).catch(() => { save.textContent = '保存失败' })
  })
  reset.addEventListener('click', () => {
    config = { ...DEFAULT_CONFIG }
    syncInputs()
    preview()
  })
  root.appendChild(el('div', { class: 'ss-actions' }, save, reset, saveHint))

  /** 把当前配置回填到各控件（预设、清除、恢复默认之后要用）。 */
  function syncInputs(): void {
    enabled.checked = config.enabled
    accent.value = config.accent
    bgDark.value = config.bgDark
    bgLight.value = config.bgLight
    thumb.style.backgroundImage = config.image === '' ? 'none' : `url("${config.image}")`
    thumb.style.background = config.image === '' ? 'var(--skin-bg, #171817)' : thumb.style.background
    if (config.image !== '') thumb.style.backgroundImage = `url("${config.image}")`
    for (const [input, value] of [
      [imageOpacity, config.imageOpacity], [imageBlur, config.imageBlur],
      [wash, config.wash], [transparency, config.transparency],
    ] as const) {
      input.value = String(value)
      ;(input as HTMLInputElement & { sync?: () => void }).sync?.()
    }
  }

  syncInputs()
  return root
}
