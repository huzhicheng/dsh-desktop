/** 皮肤配置：一份配置完整描述一套外观，可持久化、可分享。 */

export interface SkinConfig {
  /** 是否启用皮肤。关掉即恢复 dsh 原生外观。 */
  enabled: boolean
  /** 强调色（按钮、链接、选中态）。 */
  accent: string
  /** 暗色底色。 */
  bgDark: string
  /** 浅色底色。 */
  bgLight: string
  /** 背景图，data URI；空字符串表示纯色底。 */
  image: string
  /** 背景图不透明度 0~1。 */
  imageOpacity: number
  /** 背景图模糊半径（像素）。 */
  imageBlur: number
  /**
   * 界面透明度 0~1：0 为完全不透（看不见背景图），1 为最透。
   * 上限刻意收窄，再透文字就压不住背景图了。
   */
  transparency: number
  /** 蒙版强度 0~1：盖在背景图之上压暗它，越大界面越清晰、图越淡。 */
  wash: number
}

export const DEFAULT_CONFIG: SkinConfig = {
  enabled: true,
  accent: '#d3aa61',
  bgDark: '#171817',
  bgLight: '#f6f5f1',
  image: '',
  imageOpacity: 0.5,
  imageBlur: 0,
  transparency: 0.8,
  wash: 0.58,
}

/** 内置预设，用户不选图也能一键换个样子。 */
export interface SkinPreset {
  id: string
  name: string
  patch: Partial<SkinConfig>
}

export const PRESETS: readonly SkinPreset[] = [
  { id: 'amber', name: '暖砂', patch: { accent: '#d3aa61', bgDark: '#171817', bgLight: '#f6f5f1' } },
  { id: 'jade', name: '青竹', patch: { accent: '#6fae8f', bgDark: '#141816', bgLight: '#f2f5f3' } },
  { id: 'ink', name: '墨蓝', patch: { accent: '#7aa2d6', bgDark: '#141619', bgLight: '#f1f3f6' } },
  { id: 'rose', name: '绛梅', patch: { accent: '#c98089', bgDark: '#191516', bgLight: '#f7f2f3' } },
  { id: 'slate', name: '素石', patch: { accent: '#9aa0a6', bgDark: '#161718', bgLight: '#f4f4f5' } },
]

/** 合并用户配置与默认值，并把越界值夹回合法范围。 */
export function normalizeConfig(raw: unknown): SkinConfig {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SkinConfig>
  const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return Math.min(max, Math.max(min, n))
  }
  const color = (value: unknown, fallback: string): string =>
    typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : fallback

  return {
    enabled: input.enabled !== false,
    accent: color(input.accent, DEFAULT_CONFIG.accent),
    bgDark: color(input.bgDark, DEFAULT_CONFIG.bgDark),
    bgLight: color(input.bgLight, DEFAULT_CONFIG.bgLight),
    // 背景图只接受 data URI：外链会把用户的界面暴露给第三方站点
    image: typeof input.image === 'string' && input.image.startsWith('data:image/') ? input.image : '',
    imageOpacity: clamp(input.imageOpacity, 0, 1, DEFAULT_CONFIG.imageOpacity),
    imageBlur: clamp(input.imageBlur, 0, 40, DEFAULT_CONFIG.imageBlur),
    transparency: clamp(input.transparency, 0, 1, DEFAULT_CONFIG.transparency),
    wash: clamp(input.wash, 0, 1, DEFAULT_CONFIG.wash),
  }
}
