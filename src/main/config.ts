/** 全局常量与可调参数。 */

/** 要跟踪升级的上游 npm 包（DeepSeek Harness 官方通过它发版）。 */
export const HARNESS_PACKAGE = '@deepseek-ai/dsh'

/** npm registry 列表，按顺序尝试（第二个是国内镜像，网络不佳时兜底）。 */
export const REGISTRIES = [
  'https://registry.npmjs.org',
  'https://registry.npmmirror.com',
] as const

/**
 * 升级通道对应的 dist-tag。
 *
 * 跟 next 而不是 latest：Harness 长期处于开发者预览阶段，上游把新版先发到 next，
 * latest 往往滞后好几天甚至更久（实测 rc.8 已在 GitHub 发布并推到 next 时，
 * latest 还停在 rc.7）。这个桌面端的用户就是冲着尝鲜来的，跟 latest 等于总慢一拍。
 *
 * 风险由既有机制兜着：新版起不来会自动回滚上一版，并把坏版本拉黑跳过。
 */
export const UPDATE_CHANNEL = 'next'

/** next 不存在时退回的通道。上游哪天不再维护 next，升级不该整个失效。 */
export const UPDATE_CHANNEL_FALLBACK = 'latest'

/** 自动检查升级的间隔。 */
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** 应用本体的发布仓库，检查新版本用。 */
export const APP_REPO = 'huzhicheng/dsh-desktop'

/** 发布页地址；检测到新版时引导用户来这里下载。 */
export const APP_RELEASES_URL = `https://github.com/${APP_REPO}/releases/latest`

/** 服务启动就绪的最长等待时间（首启需解压种子，放宽一些）。 */
export const READINESS_TIMEOUT_MS = 120_000

/** 优雅停止服务的宽限期，超时后强杀。 */
export const SHUTDOWN_GRACE_MS = 5_000

/** 本地保留的运行时版本数量（含当前版本，便于回滚）。 */
export const KEEP_RUNTIME_VERSIONS = 2

/**
 * 优先使用的本地端口。
 *
 * 必须固定：Harness 的浏览器端插件（皮肤等）把配置存在 localStorage 里，
 * 而 localStorage 按 origin 隔离。若每次都让系统随机分配端口，origin 一变
 * 用户设过的背景图与配色就全部读不到了。端口被占用时才回退到随机分配。
 */
export const PREFERRED_PORT = 37080

export const APP_DISPLAY_NAME = 'DSH Desktop'
