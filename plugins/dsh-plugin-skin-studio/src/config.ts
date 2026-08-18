/** 皮肤配置：一份配置完整描述一套外观，可持久化、可分享。 */

/**
 * 配置版本。
 *
 * 改默认值时加一。老配置里那些字段是存过的实际值，不是「没设置」，合并默认值时
 * 不会被覆盖——结果就是改了默认值只对全新安装生效，老用户还得自己手动调一遍。
 * 有了版本号就能做一次性迁移，把这一版调整的那组值推给老配置。
 */
export const CONFIG_VERSION = 2

/**
 * 每次升版要跟上的字段。
 *
 * 只列这一版真正改了默认值的那组（背景呈现强度与适配方式），配色、字体、
 * 背景素材这些是用户自己挑的，不在迁移范围内。
 */
const MIGRATED_KEYS = [
  'imageFit', 'imageOpacity', 'wash', 'transparency', 'textContrast', 'textStroke',
] as const

export interface SkinConfig {
  /** 配置版本，见 CONFIG_VERSION。 */
  version: number
  /** 是否启用皮肤。关掉即恢复 dsh 原生外观。 */
  enabled: boolean
  /** 强调色（按钮、链接、选中态）。 */
  accent: string
  /** 暗色底色。 */
  bgDark: string
  /** 浅色底色。 */
  bgLight: string
  /**
   * 背景图，压缩后的 data URI；空字符串表示纯色底。
   *
   * 图本身另有一份存在图库里（见 library），这里留一份是为了让运行时同步取用，
   * 不必等一次异步读库才画得出背景。
   */
  image: string
  /**
   * 背景视频的 id；空字符串表示没有视频。视频本体存在 IndexedDB（见 library），
   * 配置里只留标识——几十 MB 的二进制既塞不进 localStorage，也不该跟着配置到处走。
   * 有视频时它优先于背景图。
   */
  videoId: string
  /** 视频文件名，仅用于界面回显。 */
  videoName: string
  /**
   * 背景适配方式。
   *
   * 默认 cover：填满窗口，长宽比对不上时裁掉伸出去的部分。绝大多数人选的是
   * 横版壁纸，跟窗口比例接近，铺满才是他们要的效果；contain 会留出四圈留白，
   * 第一眼像没设置成功。竖图放进宽窗口只剩一条横切片，那种情况改用 contain。
   * tile 原尺寸平铺，适合纹理小图；stretch 硬拉，会变形。
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
  /** 文字对比 0~1：把次级、三级文字往主文字色拉，越大越浓。 */
  textContrast: number
  /**
   * 文字描边 0~1，默认关闭。
   *
   * 给字形描一圈与底色同色的硬边。只在背景深或杂乱、文字压不住时才需要——
   * 描边色只在恰好等于底色时隐形，背景稍微带点颜色（比如浅蓝的图）就会
   * 露出一圈白边，所以不能默认开着。
   */
  textStroke: number
}

/*
 * 默认值取「清晰」那一档。
 *
 * 之前默认偏保守（背景浓度 50%、蒙版 58%），设完背景图第一眼几乎看不出变化，
 * 用户以为没生效。既然人是特地来设背景的，就默认让背景看得见，觉得晃眼再往回调。
 * 这几个值必须与 BACKGROUND_LEVELS 里的 clear 一致，否则一进面板「清晰」不会高亮。
 */
export const DEFAULT_CONFIG: SkinConfig = {
  version: CONFIG_VERSION,
  enabled: true,
  accent: '#d3aa61',
  bgDark: '#171817',
  bgLight: '#f6f5f1',
  image: '',
  videoId: '',
  videoName: '',
  imageFit: 'cover',
  imageOpacity: 1,
  imageBlur: 0,
  transparency: 0.95,
  wash: 0.1,
  fontFamily: '',
  textContrast: 1,
  textStroke: 0.45,
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
  { id: 'soft', name: '淡雅', patch: { imageOpacity: 0.4, wash: 0.5, transparency: 0.5, textContrast: 0.75, textStroke: 0 } },
  { id: 'medium', name: '适中', patch: { imageOpacity: 0.7, wash: 0.3, transparency: 0.75, textContrast: 0.85, textStroke: 0 } },
  // 「清晰」指背景图看得清楚，不是取消保护：蒙版仍留一层，靠文字光晕补足可读性
  { id: 'clear', name: '清晰', patch: { imageOpacity: 1, wash: 0.1, transparency: 0.95, textContrast: 1, textStroke: 0.45 } },
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
  { id: 'default', name: '跟随 Harness（无衬线，默认）', stack: '' },
  { id: 'pingfang', name: '苹方（无衬线）', stack: '"PingFang SC", "PingFang TC", sans-serif' },
  { id: 'noto', name: '思源黑体（无衬线）', stack: '"Noto Sans SC", "Source Han Sans SC", sans-serif' },
  { id: 'yahei', name: '微软雅黑（无衬线）', stack: '"Microsoft YaHei", sans-serif' },
  { id: 'hiragino', name: '冬青黑体（无衬线）', stack: '"Hiragino Sans GB", sans-serif' },
  { id: 'mono', name: '等宽', stack: '"SF Mono", Menlo, Consolas, monospace' },
  // 衬线体明确标注：正文长期阅读一般用无衬线，别让人误选
  { id: 'songti', name: '宋体（衬线）', stack: '"Songti SC", "STSong", serif' },
  { id: 'kaiti', name: '楷体（衬线）', stack: '"Kaiti SC", "STKaiti", serif' },
  { id: 'wenkai', name: '霞鹜文楷（楷体）', stack: '"LXGW WenKai", "LXGW WenKai GB", serif' },
]

/** 适配方式的合法取值，兼作界面上的选项来源。 */
export const FITS: readonly SkinConfig['imageFit'][] = ['contain', 'cover', 'tile', 'stretch']

/** 适配方式的中文名，界面直接用。 */
export const FIT_LABELS: Record<SkinConfig['imageFit'], string> = {
  contain: '自适应（完整显示，留白）',
  cover: '填满窗口（会裁掉边缘，默认）',
  tile: '平铺',
  stretch: '拉伸铺满（会变形）',
}

/**
 * 判断当前配置是否正落在某个预设/档位上，界面据此高亮。
 *
 * 只比对 patch 里出现的字段：档位管的是背景那几个量，用户改了字体或强调色
 * 不该让「清晰」掉高亮。
 */
export function matchesPatch(config: SkinConfig, patch: Partial<SkinConfig>): boolean {
  return Object.entries(patch).every(([key, value]) => config[key as keyof SkinConfig] === value)
}

/** 存下来的这份配置是不是还没跟上当前版本。 */
export function needsMigration(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  return (raw as Partial<SkinConfig>).version !== CONFIG_VERSION
}

/** 合并用户配置与默认值，并把越界值夹回合法范围。 */
export function normalizeConfig(raw: unknown): SkinConfig {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SkinConfig>
  // 老版本的配置：把这一版调整过默认值的那几项换成新默认，其余原样保留
  const input = needsMigration(raw)
    ? { ...stored, ...Object.fromEntries(MIGRATED_KEYS.map(key => [key, DEFAULT_CONFIG[key]])) }
    : stored
  const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return Math.min(max, Math.max(min, n))
  }
  const color = (value: unknown, fallback: string): string =>
    typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : fallback

  return {
    version: CONFIG_VERSION,
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
    /*
     * 这个值会被写进 CSS 变量，所以要挡住能借它改写样式的字符：分号、花括号、
     * 尖括号、反斜杠，以及括号（否则可以写出 url(...) 之类的函数）。
     * 只能用黑名单不能用白名单——本机字体名什么字符都有，中文名（如
     * 「LeeFont蒙黑体」）就会被 \w 这类白名单直接挡掉。
     */
    fontFamily: typeof input.fontFamily === 'string' && !/[;{}()<>\\]/.test(input.fontFamily)
      ? input.fontFamily.trim().slice(0, 200)
      : '',
    textContrast: clamp(input.textContrast, 0, 1, DEFAULT_CONFIG.textContrast),
    textStroke: clamp(input.textStroke, 0, 1, DEFAULT_CONFIG.textStroke),
  }
}
