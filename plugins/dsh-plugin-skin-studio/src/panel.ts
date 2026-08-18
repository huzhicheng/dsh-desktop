/**
 * 皮肤设置面板。
 *
 * 用纯 DOM 实现而不绑定某个 UI 框架：dsh 的设置扩展点要什么形态都能挂进去，
 * 也方便脱离 dsh 单独调试。改动即时预览，用户看到的就是最终效果。
 */

import {
  BACKGROUND_LEVELS, DEFAULT_CONFIG, FIT_LABELS, FITS, FONTS, matchesPatch, PRESETS, type SkinConfig,
} from './config'
import { imageToDataUri } from './runtime'
import { deleteEntry, type LibraryEntry, listEntries, putEntry, trimLibrary } from './library'

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
  /**
   * 把「保存 / 恢复默认」这排按钮挂到别处。
   *
   * 对话框要把它们固定在右下角，不能跟着内容一起滚走——长面板滚到一半时
   * 保存按钮在屏幕外，用户会以为没这个按钮。嵌在设置页里时不传，就留在面板末尾。
   */
  actionsHost?: HTMLElement
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
/* 选中态：只描边不填色，填色会盖掉色板圆点，反而看不出选的是哪套 */
.ss-preset[data-on="1"] { border-color: var(--skin-accent, #d3aa61); color: var(--skin-accent, #d3aa61);
  box-shadow: inset 0 0 0 1px var(--skin-accent, #d3aa61); font-weight: 640; }
.ss-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.ss-lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 8px; margin-bottom: 12px; }
.ss-lib-item { position: relative; aspect-ratio: 16 / 10; border-radius: 9px; overflow: hidden;
  cursor: pointer; padding: 0; background-color: var(--dsw-alias-bg-layer-2, #8881);
  background-size: cover; background-position: center;
  border: 1px solid var(--dsw-alias-border-l2, #8883); }
.ss-lib-item:hover { border-color: var(--skin-accent, #d3aa61); }
.ss-lib-item[data-on="1"] { border-color: var(--skin-accent, #d3aa61);
  box-shadow: inset 0 0 0 2px var(--skin-accent, #d3aa61); }
.ss-lib-del { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; line-height: 16px;
  padding: 0; border-radius: 50%; font-size: 13px; cursor: pointer; opacity: 0; transition: opacity .15s;
  border: none; background: rgba(0,0,0,0.55); color: #fff; }
.ss-lib-item:hover .ss-lib-del { opacity: 1; }
.ss-lib-tag { position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 6px; font-size: 10.5px;
  color: #fff; background: linear-gradient(transparent, rgba(0,0,0,0.62));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
.ss-lib-empty { grid-column: 1 / -1; padding: 14px; text-align: center; font-size: 12px; border-radius: 9px;
  border: 1px dashed var(--dsw-alias-border-l3, #8884); color: var(--dsw-alias-label-tertiary, #888); }
/* 保存永远在最右：这排既可能留在面板末尾，也可能被挂进对话框底栏 */
.ss-actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; width: 100%; }
/* 只有留在面板里才需要跟上文拉开距离；挂进底栏时那段间距由底栏的 padding 给 */
.ss-panel > .ss-actions { margin-top: 16px; }
.ss-actions .ss-hint { margin-right: auto; margin-left: 0; text-align: left; }
.ss-btn:disabled { opacity: 0.45; cursor: default; }
.ss-btn.primary:disabled:hover { opacity: 0.45; }
.ss-hint { color: var(--dsw-alias-label-caption, inherit); font-size: 11.5px; margin-left: auto; }
.ss-switch { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.ss-level-label { flex: 0 0 84px; color: var(--dsw-alias-label-secondary, inherit); }
`

/**
 * 判断某个字体在本机是否真的装了。
 *
 * 不能用 document.fonts.check()——没装的字体它同样返回 true（只要有回退字体
 * 能渲染就算通过），实测 15 个候选全部返回 true，等于没过滤。
 *
 * 可靠做法是量宽度：先用通用字体量一遍基准，再把目标字体放在它前面量一遍。
 * 字体没装就会落到同一个回退字体上、宽度分毫不差；装了则几乎必然不同。
 * 三种基准都试，避开目标字体恰好与某个通用字体等宽的巧合。
 */
function fontInstalled(stack: string): boolean {
  const context = document.createElement('canvas').getContext('2d')
  if (context === null) return true
  // 汉字与西文各取一些，笔画宽度差异越大越不容易撞车
  const probe = '中文字体AaBbGg018'

  const single = (name: string): boolean =>
    ['monospace', 'serif', 'sans-serif'].some((fallback) => {
      context.font = `72px ${fallback}`
      const base = context.measureText(probe).width
      context.font = `72px ${name}, ${fallback}`
      return context.measureText(probe).width !== base
    })

  // 只测栈里带引号的具体字体名。不能把整个栈丢进去测——栈尾都带
  // sans-serif / serif 这类通用族，它们永远可用，会让每个栈都被判成已安装
  // （实测：这台机器没装微软雅黑，连栈一起测却判成有）。
  const names = stack.match(/"[^"]+"/g) ?? []
  return names.some(single)
}

/** 把一张 data URI 缩成网格用的小图。 */
async function uriToThumb(uri: string): Promise<string> {
  const image = new Image()
  image.src = uri
  await image.decode()
  const scale = Math.min(1, 240 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (context === null) return ''
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.6)
}

/**
 * 抓视频首帧当缩略图。
 *
 * 图库网格里若视频只显示一个占位块，几段视频排在一起就分不出谁是谁。抓不到帧
 * （编码浏览器不认、文件损坏）就返回空串，网格显示灰底加文件名，不影响使用。
 */
async function videoThumb(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.src = url
    await new Promise<void>((resolve, reject) => {
      // 首帧未必在 0 秒就有画面，跳一点再抓；同时兜一个超时，免得卡死在这
      const timer = setTimeout(() => { reject(new Error('取首帧超时')) }, 5000)
      const done = (): void => { clearTimeout(timer); resolve() }
      video.addEventListener('seeked', done, { once: true })
      video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('视频读取失败')) }, { once: true })
      video.addEventListener('loadeddata', () => { video.currentTime = 0.1 }, { once: true })
    })
    if (video.videoWidth === 0) return ''
    const scale = Math.min(1, 240 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (context === null) return ''
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.6)
  } catch {
    return ''
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
    syncActive()
    preview()
  }

  // 总开关
  const enabled = el('input', { type: 'checkbox', id: 'ss-enabled' }) as HTMLInputElement
  enabled.checked = config.enabled
  enabled.addEventListener('change', () => { set('enabled', enabled.checked) })
  root.appendChild(el('div', { class: 'ss-switch' }, enabled,
    el('label', { for: 'ss-enabled' }, '启用皮肤（关闭后恢复 Harness 原生外观）')))

  // 文字
  root.appendChild(el('h3', {}, '文字'))
  const font = el('select', {}) as HTMLSelectElement
  const picked = el('optgroup', { label: '推荐' })
  // 没装的字体不列出来：选了没反应只会让人以为功能坏了
  for (const option of FONTS) {
    if (option.stack !== '' && !fontInstalled(option.stack)) continue
    const node = el('option', { value: option.stack }, option.name)
    node.style.fontFamily = option.stack === '' ? 'inherit' : option.stack
    picked.append(node)
  }
  font.append(picked)
  font.addEventListener('change', () => { set('fontFamily', font.value) })
  const fontHint = el('span', { class: 'ss-hint' }, '')
  root.appendChild(el('div', { class: 'ss-row' }, el('label', {}, '字体'),
    el('div', { class: 'ss-ctl' }, font, fontHint)))

  /*
   * 再把本机装的字体全列出来。
   *
   * queryLocalFonts() 属于 local-fonts 权限，只在安全上下文可用；桌面壳里
   * 已为 Harness 的来源放行，纯浏览器下拿不到就只留上面那份推荐清单——
   * 所以这里失败不报错，降级即可。
   */
  const loadLocalFonts = async (): Promise<void> => {
    const query = (globalThis as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
    if (query === undefined) return
    const families = [...new Set((await query()).map(item => item.family))]
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    if (families.length === 0) return
    const all = el('optgroup', { label: `本机字体（${String(families.length)}）` })
    for (const family of families) {
      // 字体名里可能有空格，必须带引号；末尾补一个通用族做兜底
      const stack = `"${family}", sans-serif`
      const node = el('option', { value: stack }, family)
      node.style.fontFamily = stack   // 每一项用它自己的字体显示，选之前就能看到样子
      all.append(node)
    }
    font.append(all)
    fontHint.textContent = `共 ${String(families.length)} 种`
    // 之前存的值可能就在这批里，补完再回填一次才选得中
    font.value = config.fontFamily
  }
  void loadLocalFonts().catch(() => {
    fontHint.textContent = '读不到本机字体，仅显示推荐项'
  })
  const textRows = el('div', {})
  root.appendChild(textRows)

  // 预设
  root.appendChild(el('h3', {}, '配色预设'))
  const presets = el('div', { class: 'ss-presets' })
  /** 预设按钮与它对应的补丁，syncInputs 据此高亮当前落在哪一套。 */
  const presetButtons: [HTMLButtonElement, Partial<SkinConfig>][] = []
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
    presetButtons.push([button, preset.patch])
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

  // 背景
  root.appendChild(el('h3', {}, '背景'))

  const file = el('input', {
    type: 'file', accept: 'image/*,video/mp4,video/webm', hidden: 'hidden',
  }) as HTMLInputElement
  const pick = el('button', { class: 'ss-btn', type: 'button' }, '添加图片或视频…')
  const clear = el('button', { class: 'ss-btn', type: 'button' }, '不用背景')
  const status = el('span', { class: 'ss-hint' }, '')
  pick.addEventListener('click', () => { file.click() })

  const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`

  /*
   * 背景图库。
   *
   * 加过的背景都留着，随时挑回来。关键在于「加入图库」和「保存皮肤」是两件事：
   * 选完文件立刻入库落盘，保存只决定当前用哪一张。这样试了半天没点保存，
   * 图也不会白加——之前正是因为图只活在未保存的配置里，关掉面板就找不回来了。
   */
  const lib = el('div', { class: 'ss-lib' })
  root.appendChild(lib)
  let entries: LibraryEntry[] = []

  /** 当前选中的是图库里的哪一条；没选中背景时为空串。 */
  const selectedId = (): string => {
    if (config.videoId !== '') return config.videoId
    if (config.image === '') return ''
    return entries.find(entry => entry.uri === config.image)?.id ?? ''
  }

  const selectEntry = (entry: LibraryEntry): void => {
    // 图与视频共用同一个背景位，二选一，留着另一个只会让人猜哪个生效
    config = entry.kind === 'video'
      ? { ...config, videoId: entry.id, videoName: entry.name, image: '' }
      : { ...config, image: entry.uri ?? '', videoId: '', videoName: '' }
    syncInputs()
    preview()
  }

  const renderLibrary = (): void => {
    lib.replaceChildren()
    if (entries.length === 0) {
      lib.appendChild(el('div', { class: 'ss-lib-empty' }, '还没添加过背景，点下面的按钮选一张'))
      return
    }
    const current = selectedId()
    for (const entry of entries) {
      const item = el('button', { class: 'ss-lib-item', type: 'button', title: entry.name })
      if (entry.id === current) item.dataset.on = '1'
      if (entry.thumb !== '') item.style.backgroundImage = `url("${entry.thumb}")`
      item.appendChild(el('span', { class: 'ss-lib-tag' },
        entry.kind === 'video' ? `视频 ${entry.name}` : entry.name))
      const del = el('button', { class: 'ss-lib-del', type: 'button', title: '从图库删除' }, '×')
      del.addEventListener('click', (event) => {
        // 不冒泡到卡片上，否则「删掉」会先把它选中
        event.stopPropagation()
        void deleteEntry(entry.id).then(() => {
          // 删的正是在用的那张，就顺手清掉背景，免得配置指向一条不存在的记录
          if (entry.id === selectedId()) {
            config = { ...config, image: '', videoId: '', videoName: '' }
            preview()
          }
          return refreshLibrary()
        }).catch((error: unknown) => {
          status.textContent = `删除失败：${error instanceof Error ? error.message : String(error)}`
        })
      })
      item.appendChild(del)
      item.addEventListener('click', () => { selectEntry(entry) })
      lib.appendChild(item)
    }
  }

  const refreshLibrary = async (): Promise<void> => {
    entries = await listEntries()
    renderLibrary()
  }

  /*
   * 把正在用、却不在图库里的背景收编进来。
   *
   * 图库是后加的，之前设的背景只存在配置里。不收编的话，明明界面上背景好好的，
   * 图库却空空如也，看着像「我之前那张被吞了」。只在缺失时写一条，之后就是普通条目。
   */
  void (async () => {
    entries = await listEntries()
    if (config.image !== '' && !entries.some(entry => entry.uri === config.image)) {
      await putEntry({
        id: `bg-${String(Date.now())}`, kind: 'image', name: '当前背景',
        addedAt: Date.now(), thumb: await uriToThumb(config.image), uri: config.image,
      })
    }
    await refreshLibrary()
  })().catch(() => {
    status.textContent = '图库读取失败'
  })

  /** 收下一段视频：本体存进 IndexedDB，配置里只记 id 与文件名。 */
  const takeVideo = async (chosen: File): Promise<void> => {
    if (chosen.size > MAX_VIDEO_BYTES) {
      status.textContent = `视频 ${megabytes(chosen.size)}，超过上限 ${megabytes(MAX_VIDEO_BYTES)}`
      return
    }
    status.textContent = '入库中…'
    // id 每次都换，运行时据此判断要不要重新加载，也顺带绕开缓存
    const id = `bg-${String(Date.now())}`
    await putEntry({
      id, kind: 'video', name: chosen.name, addedAt: Date.now(),
      thumb: await videoThumb(chosen), blob: chosen,
    })
    await refreshLibrary()
    selectEntry(entries.find(entry => entry.id === id) ?? {
      id, kind: 'video', name: chosen.name, addedAt: Date.now(), thumb: '',
    })
    status.textContent = `已入库 ${megabytes(chosen.size)}`
    await trimLibrary(id)
    await refreshLibrary()
  }

  /** 收下一张图片：压缩后连同缩略图一起入库。 */
  const takeImage = async (chosen: File): Promise<void> => {
    status.textContent = '处理中…'
    // 原图常有几 MB，超长的值会被 CSS 整条丢弃（实测 4MB 的图直接变 none），先压
    const uri = await imageToDataUri(chosen)
    const id = `bg-${String(Date.now())}`
    await putEntry({
      id, kind: 'image', name: chosen.name, addedAt: Date.now(),
      thumb: await imageToDataUri(chosen, 240, 0.6), uri,
    })
    await refreshLibrary()
    selectEntry(entries.find(entry => entry.id === id) ?? {
      id, kind: 'image', name: chosen.name, addedAt: Date.now(), thumb: '', uri,
    })
    status.textContent = `已入库，压缩至 ${Math.round(uri.length / 1024)} KB`
    await trimLibrary(id)
    await refreshLibrary()
  }

  file.addEventListener('change', () => {
    const chosen = file.files?.[0]
    if (chosen === undefined) return
    // 同一个文件连选两次不会触发 change，清掉值才能重选
    file.value = ''
    // 压缩和抓首帧都要几秒，这期间不能让人点保存——那会把还没写进 config 的
    // 背景漏掉，存下一份「什么都没设」的配置，正是背景丢失的原因之一
    setBusy(true)
    const work = chosen.type.startsWith('video/') ? takeVideo(chosen) : takeImage(chosen)
    void work.catch((error: unknown) => {
      status.textContent = `读取失败：${error instanceof Error ? error.message : String(error)}`
    }).finally(() => { setBusy(false) })
  })
  clear.addEventListener('click', () => {
    // 只是不用它，图库里那张留着，随时能挑回来
    config = { ...config, image: '', videoId: '', videoName: '' }
    syncInputs()
    preview()
    status.textContent = ''
  })
  root.appendChild(el('div', { class: 'ss-row' },
    el('div', { class: 'ss-ctl' }, pick, clear, status, file)))

  const slider = (
    label: string,
    key: 'imageOpacity' | 'imageBlur' | 'transparency' | 'wash' | 'textContrast' | 'textStroke',
    min: number, max: number, step: number, format: (value: number) => string,
    host: HTMLElement = root,
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
    host.appendChild(el('div', { class: 'ss-row' }, el('label', {}, label),
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
  const levelButtons: [HTMLButtonElement, Partial<SkinConfig>][] = []
  for (const level of BACKGROUND_LEVELS) {
    const button = el('button', { class: 'ss-preset', type: 'button' }, level.name)
    button.addEventListener('click', () => {
      config = { ...config, ...level.patch }
      syncInputs()
      preview()
    })
    levels.appendChild(button)
    levelButtons.push([button, level.patch])
  }
  root.appendChild(levels)

  const percent = (value: number): string => `${String(Math.round(value * 100))}%`
  const textContrast = slider('文字浓度', 'textContrast', 0, 1, 0.01, percent, textRows)
  const textStroke = slider('文字描边', 'textStroke', 0, 1, 0.01,
    (v) => (v === 0 ? '关' : percent(v)), textRows)
  const imageOpacity = slider('背景浓度', 'imageOpacity', 0, 1, 0.01, percent)
  const imageBlur = slider('背景模糊', 'imageBlur', 0, 40, 1, v => `${String(Math.round(v))}px`)
  const wash = slider('蒙版强度', 'wash', 0, 1, 0.01, percent)
  const transparency = slider('界面透明', 'transparency', 0, 1, 0.01, percent)

  // 操作
  const save = el('button', { class: 'ss-btn primary', type: 'button' }, '保存')
  const reset = el('button', { class: 'ss-btn', type: 'button' }, '恢复默认')
  const saveHint = el('span', { class: 'ss-hint' }, '')
  /*
   * 已存下的那份配置，用来判断有没有未保存的改动。
   *
   * 面板是即时预览的，改完不保存就关掉，效果会一直留到下次重启才消失——正是
   * 「我明明设过背景，下次打开就没了」的由来。这里把状态明写出来，关掉之前就看得见。
   */
  let savedSnapshot = JSON.stringify(options.initial)
  save.addEventListener('click', () => {
    save.textContent = '保存中…'
    void Promise.resolve(options.onSave(config)).then(() => {
      savedSnapshot = JSON.stringify(config)
      syncDirty()
      // 保存成功就收工——效果早在预览时就看到了，留在原地还得再点一次关闭。
      // 失败则留着面板，让用户看得到原因、也不至于丢掉刚调好的参数。
      options.onDone?.()
      save.textContent = '已保存'
      setTimeout(() => { save.textContent = '保存' }, 1600)
    }).catch(() => { save.textContent = '保存失败' })
  })
  reset.addEventListener('click', () => {
    // 背景不跟着恢复默认：图库里那些是用户自己加的素材，不该被一个「恢复默认」抹掉
    config = { ...DEFAULT_CONFIG, image: config.image, videoId: config.videoId, videoName: config.videoName }
    syncInputs()
    preview()
  })
  // 提示在左、恢复默认居中、保存在最右——右下角是确认键的惯例位置
  ;(options.actionsHost ?? root).appendChild(el('div', { class: 'ss-actions' }, saveHint, reset, save))

  /**
   * 背景素材还在处理时锁住保存。
   *
   * 压缩一张大图或抓视频首帧要几秒，这期间 config 里还没有新背景。此时点保存
   * 会存下一份「没有背景」的配置，而界面上文件已经选好了，看起来完全正常。
   */
  function setBusy(value: boolean): void {
    save.disabled = value
    pick.disabled = value
  }

  /**
   * 高亮当前落在哪套配色、哪一档强度。
   *
   * 单独拆出来是因为拖滑块时不能跑整个 syncInputs——那会把用户正拖着的
   * input 重新赋值。这里只改按钮的标记，一拖离档位就立刻掉高亮。
   */
  function syncActive(): void {
    for (const [button, patch] of [...presetButtons, ...levelButtons]) {
      if (matchesPatch(config, patch)) button.dataset.on = '1'
      else button.removeAttribute('data-on')
    }
    syncDirty()
  }

  /** 有没有改了还没存的东西，写在保存按钮旁边。 */
  function syncDirty(): void {
    saveHint.textContent = JSON.stringify(config) === savedSnapshot
      ? '改动即时预览，保存后对所有窗口生效'
      : '有改动尚未保存，直接关闭会还原'
  }

  /** 把当前配置回填到各控件（预设、清除、恢复默认之后要用）。 */
  function syncInputs(): void {
    enabled.checked = config.enabled
    accent.value = config.accent
    bgDark.value = config.bgDark
    bgLight.value = config.bgLight
    fit.value = config.imageFit
    font.value = config.fontFamily
    renderLibrary()
    syncActive()
    for (const [input, value] of [
      [imageOpacity, config.imageOpacity], [imageBlur, config.imageBlur],
      [wash, config.wash], [transparency, config.transparency],
      [textContrast, config.textContrast], [textStroke, config.textStroke],
    ] as const) {
      input.value = String(value)
      ;(input as HTMLInputElement & { sync?: () => void }).sync?.()
    }
  }

  syncInputs()
  return root
}
