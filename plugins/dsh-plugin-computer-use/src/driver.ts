/**
 * Cua Driver 的探测、安装与权限检查。
 *
 * 这一层只跟本机打交道，不碰 dsh 的任何东西，方便单独调试。
 */

import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { delimiter, join } from 'node:path'

/** 安装脚本地址，官方文档给的就是这两条。 */
const INSTALL_SH = 'https://cua.ai/driver/install.sh'
const INSTALL_PS1 = 'https://cua.ai/driver/install.ps1'

/**
 * 可执行文件的候选位置。
 *
 * macOS/Linux 装到 ~/.local/bin（用户级、不需要 sudo），macOS 上那个文件其实是
 * 指向 /Applications/CuaDriver.app 里真身的软链。
 *
 * Windows 装到 %LOCALAPPDATA%\Programs\Cua\cua-driver\bin——路径在 v0.2.14
 * 从 `Programs\trycua\cua-driver-rs\` 改过名，旧安装会在下次安装时自动迁移，
 * 但这里仍把旧路径列上，免得停在老版本的人被判成没装。
 */
function candidates(): string[] {
  const home = homedir()
  if (platform() === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return [
      join(local, 'Programs', 'Cua', 'cua-driver', 'bin', 'cua-driver.exe'),
      join(local, 'Programs', 'trycua', 'cua-driver-rs', 'bin', 'cua-driver.exe'),
    ]
  }
  return [
    join(home, '.local', 'bin', 'cua-driver'),
    '/Applications/CuaDriver.app/Contents/MacOS/cua-driver',
    '/usr/local/bin/cua-driver',
    '/opt/homebrew/bin/cua-driver',
  ]
}

/**
 * 从 PATH 里找。
 *
 * 安装脚本会把自己的 bin 目录追加进用户 PATH，所以即便上面的固定路径全落空，
 * PATH 上仍可能有——比如用户用 CUA_DRIVER_RS_INSTALL_DIR 装到了别处。
 * 放在固定路径之后再试：开发机上常有多份，优先认官方位置能少一类困惑。
 */
function fromPath(): string {
  const name = platform() === 'win32' ? 'cua-driver.exe' : 'cua-driver'
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return ''
}

function run(
  file: string, args: string[], timeoutMs = 20_000,
): Promise<{ code: number, out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, encoding: 'utf8' }, (error, stdout, stderr) => {
      const out = `${stdout}${stderr}`.trim()
      resolve({ code: error === null ? 0 : 1, out })
    })
  })
}

export interface DriverInfo {
  /** 找到的可执行文件路径；没装时为空串。 */
  binPath: string
  /** `cua-driver --version` 的输出，没装时为空串。 */
  version: string
  /** 本机平台，界面据此决定显示哪套安装说明。 */
  platform: NodeJS.Platform
  /** 权限状态。macOS 之外恒为已就绪（没有 TCC 这套东西）。 */
  permissions: PermissionInfo
}

/** 找出本机上的 cua-driver。配置里显式给了路径就只认那个。 */
export function locate(configured: string): string {
  if (configured !== '') return existsSync(configured) ? configured : ''
  return candidates().find(path => existsSync(path)) ?? fromPath()
}

export interface PermissionInfo {
  /** 辅助功能：控制鼠标键盘、读无障碍树都要它。 */
  accessibility: boolean
  /** 屏幕录制：截图要它。 */
  screenRecording: boolean
  /** 两项都齐。 */
  ok: boolean
  /** 自检原文，出问题时给用户看。 */
  detail: string
}

/** 权限查询结果的缓存，供状态接口快速返回。 */
let permissionCache: PermissionInfo = {
  accessibility: false, screenRecording: false, ok: false, detail: '',
}

/**
 * 读驱动状态。只做「装没装」这类快查询，几十毫秒回来。
 *
 * 权限自检不放这里：那条路要拉起守护进程再等它就绪，最坏几十秒，而状态接口是
 * 被界面每两秒轮询一次的。慢查询走 checkPermissions，结果缓存下来给这里读。
 */
export async function inspect(configured: string): Promise<DriverInfo> {
  const binPath = locate(configured)
  const info: DriverInfo = {
    binPath, version: '', platform: platform(),
    permissions: platform() === 'darwin'
      ? permissionCache
      : { accessibility: true, screenRecording: true, ok: true, detail: '' },
  }
  if (binPath === '') return info
  const version = await run(binPath, ['--version'], 5000)
  info.version = version.code === 0 ? (version.out.split('\n')[0] ?? '') : ''
  return info
}

/**
 * 查一次权限状态。
 *
 * 用官方的 `permissions status --json`：它是只读的、不会弹窗，而且答案来自
 * CuaDriver 守护进程，带的是 com.trycua.driver 这个 TCC 身份——直接在终端里问
 * 得到的是终端自己的授权，不是驱动的。守护进程没跑时它老实回 unknown。
 */
export async function checkPermissions(configured: string): Promise<PermissionInfo> {
  if (platform() !== 'darwin') {
    permissionCache = { accessibility: true, screenRecording: true, ok: true, detail: '' }
    return permissionCache
  }
  const binPath = locate(configured)
  if (binPath === '') {
    permissionCache = { accessibility: false, screenRecording: false, ok: false, detail: '' }
    return permissionCache
  }

  const probe = await run(binPath, ['permissions', 'status', '--json'], 20_000)
  let accessibility = false
  let screenRecording = false
  try {
    const parsed = JSON.parse(probe.out) as { accessibility?: unknown, screen_recording?: unknown }
    accessibility = parsed.accessibility === true
    screenRecording = parsed.screen_recording === true
  } catch {
    // 守护进程没跑时会回 unknown 而不是 JSON，当作「还不知道」处理
  }
  permissionCache = {
    accessibility, screenRecording,
    ok: accessibility && screenRecording,
    detail: probe.out.slice(0, 600),
  }
  return permissionCache
}

/**
 * 请求授权。
 *
 * 必须走 `permissions grant` 而不是自己打开系统设置页：它通过 LaunchServices
 * 拉起 CuaDriver，系统弹窗才会归属到那个 App 上，用户点的「允许」也才会落到
 * com.trycua.driver 这个身份。自己开设置页只能让用户去手动找条目，而且找错
 * 对象（比如勾了终端）授权是不生效的。
 */
export async function requestPermissions(configured: string): Promise<string> {
  if (platform() !== 'darwin') return '当前平台不需要额外授权'
  const binPath = locate(configured)
  if (binPath === '') return '还没安装 cua-driver'
  // 这一步会弹系统对话框，用户点完才返回，给足时间
  const result = await run(binPath, ['permissions', 'grant'], 180_000)
  return result.out.slice(0, 800)
}

/**
 * 跑官方安装脚本。
 *
 * 不自己下载二进制、也不随包分发：macOS 的辅助功能与屏幕录制授权是绑在签名身份
 * 上的（CuaDriver.app 的 Team ID），换个来源的副本等于换个身份，用户得重新授权，
 * 而我们也没法用人家的证书签名。所以只能装官方那一份。
 *
 * @param onOutput - 实时输出回调，界面据此显示进度。
 */
export function install(onOutput: (chunk: string) => void): Promise<{ ok: boolean, out: string }> {
  const isWindows = platform() === 'win32'
  const child = isWindows
    ? spawn('powershell', ['-NoProfile', '-Command', `irm ${INSTALL_PS1} | iex`], { windowsHide: true })
    : spawn('/bin/bash', ['-c', `curl -fsSL ${INSTALL_SH} | /bin/bash`])

  let out = ''
  const take = (chunk: Buffer): void => {
    const text = chunk.toString()
    out += text
    onOutput(text)
  }
  child.stdout?.on('data', take)
  child.stderr?.on('data', take)

  return new Promise((resolve) => {
    // 下载 65MB 左右的 App 加解压，慢网络下几分钟很正常
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, out: `${out}\n安装超时（10 分钟）` }) }, 600_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, out: `${out}\n${error.message}` })
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, out })
    })
  })
}

