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
  /**
   * 背景视频的 id；空字符串表示没有视频。视频本体存在 IndexedDB（见 video-store），
   * 配置里只留标识——几十 MB 的二进制既塞不进 localStorage，也不该跟着配置到处走。
   * 有视频时它优先于背景图。
   */
  videoId: string
  /** 视频文件名，仅用于界面回显。 */
  videoName: string
  /**
   * 背景适配方式。
   *
   * 默认 contain：整张图/整段视频都看得见，长宽比对不上时四周留白，
   * 留白处由那层放大模糊的同图（视频则是它的一帧）垫底，不会露出空底。
   * cover 填满窗口但会裁掉伸出去的部分——竖图放进宽窗口只剩一条横切片，
   * 所以不适合当默认；tile 原尺寸平铺，适合纹理小图；stretch 硬拉，会变形。
   */
  imageFit: 'cover' | 'contain' | 'tile' | 'stretch'
  /** 背景（图或视频）不透明度 0~1。 */
  imageOpacity: number
  /** 背景（图或视频）模糊半径（像素）。 */
  imageBlur: number
  /**
   * 界面透明度 0~1：0 为完全不透（看不见背景图），1 为最透。
   * 上限刻意收窄，再透文字就压不住背景图了。
   */
  transparency: number
  /** 蒙版强度 0~1：盖在背景图之上压暗它，越大界面越清晰、图越淡。 */
  wash: number
  /** 字体栈（CSS font-family 的值）；空字符串表示跟随 Harness 原生字体。 */
  fontFamily: string
  /**
   * 文字对比 0~1。
   *
   * 做两件事：把次级、三级文字往主文字色拉；给文字加一层与底色同色的光晕，
   * 把身后透上来的背景图压住。界面越透，这项越需要往上调。
   */
  textContrast: number
}

export const DEFAULT_CONFIG: SkinConfig = {
  enabled: true,
  accent: '#d3aa61',
  bgDark: '#171817',
  bgLight: '#f6f5f1',
  image: '',
  videoId: '',
  videoName: '',
  imageFit: 'contain',
  imageOpacity: 0.5,
  imageBlur: 0,
  transparency: 0.8,
  wash: 0.58,
  fontFamily: '',
  textContrast: 0.85,
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

/**
 * 背景强度档位。
 *
 * 「背景看得清不清楚」其实由三个量共同决定——背景浓度、蒙版强度、界面透明，
 * 只调其中一个都到不了位。这里把三者绑成几档，一键切到想要的效果，
 * 之后仍可用滑块微调。
 */
export const BACKGROUND_LEVELS: readonly SkinPreset[] = [
  { id: 'soft', name: '淡雅', patch: { imageOpacity: 0.4, wash: 0.5, transparency: 0.5, textContrast: 0.75 } },
  { id: 'medium', name: '适中', patch: { imageOpacity: 0.7, wash: 0.3, transparency: 0.75, textContrast: 0.85 } },
  // 「清晰」指背景图看得清楚，不是取消保护：蒙版仍留一层，靠文字光晕补足可读性
  { id: 'clear', name: '清晰', patch: { imageOpacity: 1, wash: 0.1, transparency: 0.95, textContrast: 1 } },
]

/** 可选字体。stack 为空表示不覆盖，沿用 Harness 自己的字体栈。 */
export interface FontOption {
  id: string
  name: string
  stack: string
}

/**
 * 候选字体。
 *
 * 只列各平台自带或中文用户常见的，且都给出同族回退。装没装由界面实测决定，
 * 没装的不显示——列一堆选了没反应的选项只会让人以为功能坏了。
 */
export const FONTS: readonly FontOption[] = [
  { id: 'default', name: '跟随 Harness（默认）', stack: '' },
  { id: 'pingfang', name: '苹方', stack: '"PingFang SC", "PingFang TC", sans-serif' },
  { id: 'noto', name: '思源黑体', stack: '"Noto Sans SC", "Source Han Sans SC", sans-serif' },
  { id: 'yahei', name: '微软雅黑', stack: '"Microsoft YaHei", sans-serif' },
  { id: 'hiragino', name: '冬青黑体', stack: '"Hiragino Sans GB", sans-serif' },
  { id: 'wenkai', name: '霞鹜文楷', stack: '"LXGW WenKai", "LXGW WenKai GB", sans-serif' },
  { id: 'songti', name: '宋体', stack: '"Songti SC", "STSong", serif' },
  { id: 'kaiti', name: '楷体', stack: '"Kaiti SC", "STKaiti", serif' },
  { id: 'mono', name: '等宽', stack: '"SF Mono", Menlo, Consolas, monospace' },
]

/** 适配方式的合法取值，兼作界面上的选项来源。 */
export const FITS: readonly SkinConfig['imageFit'][] = ['contain', 'cover', 'tile', 'stretch']

/** 适配方式的中文名，界面直接用。 */
export const FIT_LABELS: Record<SkinConfig['imageFit'], string> = {
  contain: '自适应（完整显示，默认）',
  cover: '填满窗口（会裁掉边缘）',
  tile: '平铺',
  stretch: '拉伸铺满（会变形）',
}

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
    // id 由本插件生成，限定字符集，免得被拿去当 IndexedDB 的任意键用
    videoId: typeof input.videoId === 'string' && /^[a-z0-9-]{1,64}$/i.test(input.videoId) ? input.videoId : '',
    videoName: typeof input.videoName === 'string' ? input.videoName.slice(0, 120) : '',
    imageFit: FITS.includes(input.imageFit as SkinConfig['imageFit'])
      ? input.imageFit as SkinConfig['imageFit']
      : DEFAULT_CONFIG.imageFit,
    imageOpacity: clamp(input.imageOpacity, 0, 1, DEFAULT_CONFIG.imageOpacity),
    imageBlur: clamp(input.imageBlur, 0, 40, DEFAULT_CONFIG.imageBlur),
    transparency: clamp(input.transparency, 0, 1, DEFAULT_CONFIG.transparency),
    wash: clamp(input.wash, 0, 1, DEFAULT_CONFIG.wash),
    // 这个值会被写进 CSS 变量，限定字符集挡掉借它注入样式的可能
    fontFamily: typeof input.fontFamily === 'string' && /^[\w\s"',\-]{0,160}$/.test(input.fontFamily)
      ? input.fontFamily.trim()
      : '',
    textContrast: clamp(input.textContrast, 0, 1, DEFAULT_CONFIG.textContrast),
  }
}
