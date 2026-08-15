/**
 * 皮肤运行时：把一份配置落到页面上。
 *
 * 只做三件事——挂画布层、把配置写成 CSS 变量、跟随 dsh 的明暗切换。
 * 不依赖 dsh 的任何 API，因此可以单独测试，也不会随 dsh 版本变化而失效。
 */

import type { SkinConfig } from './config'

const STYLE_ID = 'skin-studio-css'
const ART_ID = 'skin-studio-art'

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
  for (const className of ['skin-backdrop', 'skin-canvas', 'skin-wash']) {
    const layer = document.createElement('div')
    layer.className = className
    art.appendChild(layer)
  }
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
    },

    dispose(): void {
      observer?.disconnect()
      observer = undefined
      current = undefined
      document.getElementById(ART_ID)?.remove()
      document.getElementById(STYLE_ID)?.remove()
      const root = document.documentElement
      root.classList.remove('skin-studio')
      delete root.dataset.skinMode
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
