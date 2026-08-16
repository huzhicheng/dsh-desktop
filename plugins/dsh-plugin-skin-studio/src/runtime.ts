/**
 * 皮肤运行时：把一份配置落到页面上。
 *
 * 只做三件事——挂画布层、把配置写成 CSS 变量、跟随 dsh 的明暗切换。
 * 不依赖 dsh 的任何 API，因此可以单独测试，也不会随 dsh 版本变化而失效。
 */

import type { SkinConfig } from './config'
import { getVideo } from './video-store'

const STYLE_ID = 'skin-studio-css'
const ART_ID = 'skin-studio-art'
const VIDEO_ID = 'skin-studio-video'

/** dsh 用 body 上的这个属性表示暗色主题。 */
const DARK_ATTR = 'data-ds-dark-theme'

export interface SkinRuntime {
  /** 应用一份配置（可反复调用，用于实时预览）。 */
  apply(config: SkinConfig): void
  /** 卸载皮肤，恢复 dsh 原生外观。 */
  dispose(): void
}

function ensureStyle(css: string): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (style === null) {
    style = document.createElement('style')
    style.id = STYLE_ID
    // 作为普通的作者样式表插入 head 末尾：这样行内写的 --skin-* 变量能正常覆盖它。
    // （若改用 Electron 的 insertCSS 注入，那是「用户样式表」，其 !important
    //   会反过来压过行内样式，实时预览就失效了。）
    document.head.appendChild(style)
  }
  if (style.textContent !== css) style.textContent = css
}

function ensureArtLayer(): void {
  if (document.getElementById(ART_ID) !== null) return
  const art = document.createElement('div')
  art.id = ART_ID
  for (const className of ['skin-backdrop', 'skin-canvas']) {
    const layer = document.createElement('div')
    layer.className = className
    art.appendChild(layer)
  }

  // 视频层与 .skin-canvas 同级同位，按 data-skin-bg 二选一显示。
  // muted 必须在放 src 之前设好：浏览器只允许静音视频自动播放，
  // 顺序反了会被拦下，表现为背景是黑的、第一帧都不出。
  const video = document.createElement('video')
  video.id = VIDEO_ID
  video.className = 'skin-video'
  video.muted = true
  video.defaultMuted = true
  video.loop = true
  video.autoplay = true
  video.playsInline = true
  // 背景不需要声音轨，也不该被系统当成正在播放的媒体（否则会抢走
  // 耳机的播放/暂停键，还会出现在系统的媒体控制中心里）
  video.setAttribute('disableRemotePlayback', '')
  art.appendChild(video)

  const wash = document.createElement('div')
  wash.className = 'skin-wash'
  art.appendChild(wash)

  document.body.appendChild(art)
}

function isDark(): boolean {
  return document.body.hasAttribute(DARK_ATTR)
}

/** 把 wash 强度换算成盖在背景图上的颜色，明暗各取自己的底色。 */
function washColor(config: SkinConfig, dark: boolean): string {
  const hex = (dark ? config.bgDark : config.bgLight).replace('#', '')
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex.slice(0, 6)
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${config.wash.toFixed(3)})`
}

/**
 * 创建运行时。
 * @param css - 皮肤样式表内容（构建时内联进来，避免运行时再发一次请求）。
 */
export function createSkinRuntime(css: string): SkinRuntime {
  let current: SkinConfig | undefined
  let observer: MutationObserver | undefined
  /** 当前 <video> 用的 blob URL，换片或卸载时要主动回收。 */
  let objectUrl: string | undefined
  /** 已经装上去的视频 id，避免每次 paint 都重新加载同一段。 */
  let loadedVideoId = ''

  const releaseUrl = (): void => {
    if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    objectUrl = undefined
  }

  const videoElement = (): HTMLVideoElement | null =>
    document.getElementById(VIDEO_ID) as HTMLVideoElement | null

  /**
   * 系统开了「减弱动态效果」就只显示首帧，不循环播放。
   *
   * 这是无障碍设置，会晃的背景正是它要治的东西。CSS 管不了视频播放
   * （animation-play-state 对 <video> 无效），只能在这里判断。
   */
  const reduceMotion = (): boolean =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const syncVideo = (config: SkinConfig): void => {
    const video = videoElement()
    if (video === null) return

    if (config.videoId === '') {
      loadedVideoId = ''
      video.removeAttribute('src')
      // 只清 src 不会放掉解码器，得再 load() 一次才真正释放
      video.load()
      releaseUrl()
      return
    }
    if (config.videoId === loadedVideoId) return

    loadedVideoId = config.videoId
    void getVideo(config.videoId).then((blob) => {
      // 取的过程中用户可能又换了一段，晚到的结果直接丢掉
      if (blob === undefined || loadedVideoId !== config.videoId) return
      releaseUrl()
      objectUrl = URL.createObjectURL(blob)
      video.src = objectUrl
      if (reduceMotion()) return
      void video.play().catch(() => {
        // 自动播放被拦时停在首帧即可，背景图的位置上弹提示只会更烦人
      })
    }).catch((error: unknown) => {
      console.warn('skin-studio: 背景视频加载失败', error)
    })
  }

  /** 窗口切到后台就暂停：背景视频在看不见的时候解码纯属白烧 CPU 和电。 */
  const handleVisibility = (): void => {
    const video = videoElement()
    if (video === null || video.getAttribute('src') === null) return
    if (document.hidden) video.pause()
    else if (!reduceMotion()) void video.play().catch(() => { /* 同上 */ })
  }

  const paint = (): void => {
    if (current === undefined) return
    const root = document.documentElement
    const dark = isDark()
    root.dataset.skinMode = dark ? 'dark' : 'light'

    const style = root.style
    style.setProperty('--skin-accent', current.accent)
    style.setProperty('--skin-bg', dark ? current.bgDark : current.bgLight)
    style.setProperty('--skin-image', current.image === '' ? 'none' : `url("${current.image}")`)
    style.setProperty('--skin-image-opacity', String(current.imageOpacity))
    style.setProperty('--skin-image-blur', `${String(current.imageBlur)}px`)
    style.setProperty('--skin-transparency', String(current.transparency))
    style.setProperty('--skin-wash', washColor(current, dark))
    // 没有背景图时不需要垫底的模糊层，省一次合成
    style.setProperty('--skin-backdrop-opacity', current.image === '' ? '0' : '0.18')
    // 图层用哪一套由它决定：视频优先于图片，样式表据此二选一显示
    root.dataset.skinBg = current.videoId !== '' ? 'video' : (current.image === '' ? 'none' : 'image')
    syncVideo(current)
  }

  return {
    apply(config: SkinConfig): void {
      current = config
      if (!config.enabled) {
        this.dispose()
        current = config
        return
      }
      ensureStyle(css)
      ensureArtLayer()
      document.documentElement.classList.add('skin-studio')
      paint()
      // dsh 的明暗开关改的是 body 上的属性，跟着它走，避免皮肤与界面脱节
      observer ??= new MutationObserver(paint)
      observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTR] })
      // 重复 apply（实时预览时每动一下都会调）不该越挂越多，同一个函数引用即可去重
      document.addEventListener('visibilitychange', handleVisibility)
    },

    dispose(): void {
      observer?.disconnect()
      observer = undefined
      current = undefined
      document.removeEventListener('visibilitychange', handleVisibility)
      releaseUrl()
      loadedVideoId = ''
      document.getElementById(ART_ID)?.remove()
      document.getElementById(STYLE_ID)?.remove()
      const root = document.documentElement
      root.classList.remove('skin-studio')
      delete root.dataset.skinMode
      delete root.dataset.skinBg
      for (const name of [
        '--skin-accent', '--skin-bg', '--skin-image', '--skin-image-opacity',
        '--skin-image-blur', '--skin-transparency', '--skin-wash', '--skin-backdrop-opacity',
      ]) {
        root.style.removeProperty(name)
      }
    },
  }
}

/**
 * 把用户选的图片压到适合当背景的尺寸，再转成 data URI。
 *
 * 原图动辄几 MB，转成 data URI 后超过 CSS 对属性值的长度限制，会被整条丢弃
 * （实测 4MB 的图 background-image 直接变成 none）。这里统一缩到最长边
 * 1920px 并转 JPEG，通常落在 200~400KB，既能存进设置又不会被拒。
 */
export async function imageToDataUri(file: File, maxEdge = 1920, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('无法创建画布上下文')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}
