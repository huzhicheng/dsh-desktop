/**
 * 皮肤设置面板。
 *
 * 用纯 DOM 实现而不绑定某个 UI 框架：dsh 的设置扩展点要什么形态都能挂进去，
 * 也方便脱离 dsh 单独调试。改动即时预览，用户看到的就是最终效果。
 */

import {
  BACKGROUND_LEVELS, DEFAULT_CONFIG, FIT_LABELS, FITS, PRESETS, type SkinConfig,
} from './config'
import { imageToDataUri } from './runtime'
import { getVideo, putVideo, pruneVideos } from './video-store'

/**
 * 视频体积上限。
 *
 * IndexedDB 存得下更大的，但背景视频再大也只是铺在界面后面，超过这个量级
 * 换来的是解码开销和磁盘占用，不是观感。挡在这里比事后让用户纳闷卡顿好。
 */
const MAX_VIDEO_BYTES = 200 * 1024 * 1024

export interface PanelOptions {
  /** 当前配置。 */
  initial: SkinConfig
  /** 每次改动都会回调，用于实时预览。 */
  onPreview: (config: SkinConfig) => void
  /** 用户点「保存」时回调，用于持久化。 */
  onSave: (config: SkinConfig) => Promise<void> | void
  /** 保存成功后回调；对话框据此关掉自己。面板嵌在设置页里时可以不传。 */
  onDone?: () => void
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
.ss-panel select { flex: 1; font: inherit; font-size: 12px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
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
.ss-thumb { position: relative; overflow: hidden; width: 100%; height: 84px; border-radius: 9px;
  background-size: cover; background-position: center;
  border: 1px solid var(--dsw-alias-border-l2, #8883); margin-bottom: 10px; }
.ss-thumb-video { display: none; width: 100%; height: 100%; object-fit: cover; }
.ss-thumb.has-video .ss-thumb-video { display: block; }
.ss-thumb-name { display: none; position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 8px;
  font-size: 11px; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,0.55));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ss-thumb.has-video .ss-thumb-name { display: block; }
.ss-actions { display: flex; gap: 8px; align-items: center; margin-top: 16px; }
.ss-hint { color: var(--dsw-alias-label-caption, inherit); font-size: 11.5px; margin-left: auto; }
.ss-switch { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.ss-level-label { flex: 0 0 84px; color: var(--dsw-alias-label-secondary, inherit); }
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
  // 缩略图里的视频跟着背景一起动，用户不必把对话框挪开才能确认选对了没有
  const thumbVideo = el('video', {}) as HTMLVideoElement
  thumbVideo.className = 'ss-thumb-video'
  thumbVideo.muted = true
  thumbVideo.defaultMuted = true
  thumbVideo.loop = true
  thumbVideo.autoplay = true
  thumbVideo.playsInline = true
  const thumbName = el('div', { class: 'ss-thumb-name' })
  thumb.append(thumbVideo, thumbName)
  root.appendChild(thumb)

  /** 缩略图当前装的视频 id 与它的 blob URL，换片时要回收。 */
  let thumbVideoId = ''
  let thumbUrl: string | undefined

  const syncThumb = (): void => {
    const hasVideo = config.videoId !== ''
    thumb.classList.toggle('has-video', hasVideo)
    thumb.style.backgroundImage = hasVideo || config.image === '' ? 'none' : `url("${config.image}")`
    thumbName.textContent = config.videoName === '' ? '背景视频' : config.videoName

    if (!hasVideo) {
      thumbVideoId = ''
      thumbVideo.removeAttribute('src')
      thumbVideo.load()
      if (thumbUrl !== undefined) { URL.revokeObjectURL(thumbUrl); thumbUrl = undefined }
      return
    }
    if (thumbVideoId === config.videoId) return
    thumbVideoId = config.videoId
    void getVideo(config.videoId).then((blob) => {
      if (blob === undefined || thumbVideoId !== config.videoId) return
      if (thumbUrl !== undefined) URL.revokeObjectURL(thumbUrl)
      thumbUrl = URL.createObjectURL(blob)
      thumbVideo.src = thumbUrl
      void thumbVideo.play().catch(() => { /* 放不了就停在首帧 */ })
    }).catch(() => {
      status.textContent = '预览加载失败'
    })
  }

  const file = el('input', {
    type: 'file', accept: 'image/*,video/mp4,video/webm', hidden: 'hidden',
  }) as HTMLInputElement
  const pick = el('button', { class: 'ss-btn', type: 'button' }, '选择图片或视频…')
  const clear = el('button', { class: 'ss-btn', type: 'button' }, '清除')
  const status = el('span', { class: 'ss-hint' }, '')
  pick.addEventListener('click', () => { file.click() })

  const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`

  /** 收下一段视频：存进 IndexedDB，配置里只记 id 与文件名。 */
  const takeVideo = (chosen: File): void => {
    if (chosen.size > MAX_VIDEO_BYTES) {
      status.textContent = `视频 ${megabytes(chosen.size)}，超过上限 ${megabytes(MAX_VIDEO_BYTES)}`
      return
    }
    status.textContent = '保存中…'
    // id 每次都换，运行时据此判断要不要重新加载，也顺带绕开缓存
    const id = `bg-${String(Date.now())}`
    void putVideo(id, chosen).then(() => {
      // 视频与图片是同一个背景位，二选一，留着另一个只会让人猜哪个生效
      config = { ...config, videoId: id, videoName: chosen.name, image: '' }
      syncInputs()
      preview()
      status.textContent = `已保存 ${megabytes(chosen.size)}`
      // 旧的那段这时才删：新的已经落库，中途失败也不会两头落空
      void pruneVideos(id)
    }).catch((error: unknown) => {
      status.textContent = `保存失败：${error instanceof Error ? error.message : String(error)}`
    })
  }

  file.addEventListener('change', () => {
    const chosen = file.files?.[0]
    if (chosen === undefined) return
    // 同一个文件连选两次不会触发 change，清掉值才能重选
    file.value = ''
    if (chosen.type.startsWith('video/')) { takeVideo(chosen); return }
    status.textContent = '处理中…'
    void imageToDataUri(chosen).then((uri) => {
      config = { ...config, image: uri, videoId: '', videoName: '' }
      syncInputs()
      preview()
      void pruneVideos('')
      // 原图常有几 MB，超长的值会被 CSS 整条丢弃，所以统一缩放压缩后再存
      status.textContent = `已压缩至 ${Math.round(uri.length / 1024)} KB`
    }).catch((error: unknown) => {
      status.textContent = `读取失败：${error instanceof Error ? error.message : String(error)}`
    })
  })
  clear.addEventListener('click', () => {
    config = { ...config, image: '', videoId: '', videoName: '' }
    syncInputs()
    preview()
    void pruneVideos('')
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

  const fit = el('select', {}) as HTMLSelectElement
  for (const value of FITS) fit.append(el('option', { value }, FIT_LABELS[value]))
  fit.addEventListener('change', () => { set('imageFit', fit.value as SkinConfig['imageFit']) })
  root.appendChild(el('div', { class: 'ss-row' }, el('label', {}, '适配'),
    el('div', { class: 'ss-ctl' }, fit)))

  // 三个滑块合起来才决定「背景看得清不清楚」，先给一键档位，再让人微调
  const levels = el('div', { class: 'ss-presets' })
  levels.appendChild(el('span', { class: 'ss-level-label' }, '强度'))
  for (const level of BACKGROUND_LEVELS) {
    const button = el('button', { class: 'ss-preset', type: 'button' }, level.name)
    button.addEventListener('click', () => {
      config = { ...config, ...level.patch }
      syncInputs()
      preview()
    })
    levels.appendChild(button)
  }
  root.appendChild(levels)

  const percent = (value: number): string => `${String(Math.round(value * 100))}%`
  const imageOpacity = slider('背景浓度', 'imageOpacity', 0, 1, 0.01, percent)
  const imageBlur = slider('背景模糊', 'imageBlur', 0, 40, 1, v => `${String(Math.round(v))}px`)
  const wash = slider('蒙版强度', 'wash', 0, 1, 0.01, percent)
  const transparency = slider('界面透明', 'transparency', 0, 1, 0.01, percent)

  // 操作
  const save = el('button', { class: 'ss-btn primary', type: 'button' }, '保存')
  const reset = el('button', { class: 'ss-btn', type: 'button' }, '恢复默认')
  const saveHint = el('span', { class: 'ss-hint' }, '改动即时预览，保存后对所有窗口生效')
  save.addEventListener('click', () => {
    save.textContent = '保存中…'
    void Promise.resolve(options.onSave(config)).then(() => {
      // 保存成功就收工——效果早在预览时就看到了，留在原地还得再点一次关闭。
      // 失败则留着面板，让用户看得到原因、也不至于丢掉刚调好的参数。
      options.onDone?.()
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
    fit.value = config.imageFit
    syncThumb()
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
