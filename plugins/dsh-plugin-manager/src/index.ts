/**
 * Host 半侧：给浏览器端开一组插件管理接口。
 *
 * 浏览器里做不了安装/卸载——那要在主机上跑进程。dsh 的 `webServer` 服务允许
 * 插件注册自己的 HTTP 路由（packages/host/webserver），这就是正规通道。
 *
 * 安装动作仍然转发官方的 `dsh plugin --profile <name>`（它本质是 pnpm 转发器，
 * 装完会把声明了 `dsh.bundle` 的依赖并入 `dsh.profile.bundles`）。我们不自己
 * 实现安装逻辑，以免和官方的对账规则脱节。
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const ROUTE_PREFIX = '/_dsh-skin-studio/api'
const PROFILE = 'web'
/** 一次插件命令的最长执行时间，超时后判失败，避免请求永远挂着。 */
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000

/**
 * dsh 的目录选择能力（`ctx.directoryPicker`）。
 *
 * 它是个可辨识联合：桌面壳里是 `native`（在宿主屏幕上开原生选择器），
 * 纯浏览器远程访问时是 `browse`（应用内列目录）。这里只接 native——
 * 装插件时要的就是「在本机挑个目录」；拿不到 native 就不显示这个入口，
 * 让用户手填路径，这也是该 seam 文档写明的未知 kind 处理方式。
 */
interface DirectoryPickerService {
  capability: () => { kind: string; pick?: (signal: AbortSignal) => Promise<string | null> }
}

/** 选目录要等人操作，给一个上限，避免请求永远挂着。 */
const PICK_TIMEOUT_MS = 5 * 60 * 1000

/** Loader 里一条运行中的插件条目。 */
interface RuntimeEntry {
  /** Loader 条目 id。 */
  id: string
  /** 模块（包）名。 */
  module: string
  /** 配置里是否启用。 */
  enabled: boolean
  /** 运行状态；没有存活 fiber 时为 null。 */
  phase: string | null
}

interface PluginEntry {
  name: string
  spec: string
  version?: string
  description?: string
  isBundle: boolean
  isLocal: boolean
  active: boolean
}

/** Cordis fiber 状态 → 可读名称，取值对照 packages/host/plugin-inventory。 */
const FIBER_PHASE: Record<number, string | null> = {
  0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: null, 5: 'unloading',
}

/**
 * 读取 Loader 当前挂载的全部条目。
 *
 * 每次调用直接读 Loader，不做缓存——Cordis 自己维护着 Entry.fiber 与
 * Fiber.state，再存一份只会多出一处需要同步的真相（官方 plugin-inventory
 * 的注释也是这么说的）。跳过纯结构性的 group 行。
 */
function listRuntime(loader: {
  entries: () => Iterable<{
    id: string
    disabled?: boolean
    options: { name: string; group?: unknown }
    fiber?: { state: number }
  }>
}): RuntimeEntry[] {
  const entries: RuntimeEntry[] = []
  for (const entry of loader.entries()) {
    if (entry.options.group !== undefined && entry.options.group !== false) continue
    entries.push({
      id: String(entry.id),
      module: entry.options.name,
      enabled: entry.disabled !== true,
      phase: entry.fiber === undefined ? null : (FIBER_PHASE[entry.fiber.state] ?? null),
    })
  }
  return entries
}

function profileDir(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'profiles', PROFILE)
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** 读取 profile 当前的插件安装状态。 */
function listPlugins(): { profileDir: string; builtin: string[]; installed: PluginEntry[] } {
  const dir = profileDir()
  const manifest = readJson(join(dir, 'package.json')) ?? {}
  const dsh = manifest.dsh as { profile?: { bundles?: string[] } } | undefined
  const bundles = dsh?.profile?.bundles ?? []
  const dependencies = (manifest.dependencies ?? {}) as Record<string, string>

  const installed: PluginEntry[] = Object.entries(dependencies).map(([name, spec]) => {
    const own = readJson(join(dir, 'node_modules', name, 'package.json'))
    const ownDsh = own?.dsh as { bundle?: unknown } | undefined
    return {
      name,
      spec,
      ...(typeof own?.version === 'string' ? { version: own.version } : {}),
      ...(typeof own?.description === 'string' ? { description: own.description } : {}),
      isBundle: ownDsh?.bundle !== undefined,
      isLocal: /^(file:|link:|\.|\/)/.test(spec),
      active: bundles.includes(name),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return {
    profileDir: dir,
    builtin: bundles.filter(name => name.startsWith('@deepseek-ai/')),
    installed,
  }
}

/** 带值的选项：从命令里摘包名时，这些选项后面那个词是它的值，要一并跳过。 */
const VALUE_FLAGS = new Set(['--profile', '-p', '--registry', '--dir', '-C'])
/** 命令里的动词，它后面才是真正的包名。 */
const VERBS = new Set(['add', 'install', 'i', 'remove', 'rm', 'uninstall'])

/**
 * 从一条命令里摘出包名。
 *
 * 用户很可能直接把文档里的整行命令粘进来，比如
 * `dsh plugin --profile web add dsh-browser`，或者 `pnpm add xxx`、`npm i xxx`。
 * 与其报错让人自己删前缀，不如认出来。
 *
 * @returns 摘不出来时返回 undefined，交给调用方按原样处理。
 */
function fromCommand(input: string): string | undefined {
  const tokens = input.split(/\s+/).filter(token => token !== '')
  if (tokens.length < 2) return undefined

  // 动词之后才是包名；没有动词就不是命令，别乱猜
  const verbAt = tokens.findIndex(token => VERBS.has(token))
  if (verbAt < 0) return undefined

  const rest = tokens.slice(verbAt + 1)
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i] as string
    if (!token.startsWith('-')) return token
    // `--profile=web` 自带值；`--profile web` 的值在下一个词
    if (!token.includes('=') && VALUE_FLAGS.has(token)) i += 1
  }
  return undefined
}

/**
 * 把各种网页地址折成 pnpm 认识的写法。
 *
 * 用户手里最常有的就是浏览器地址栏里那一串，而不是 `github:用户/仓库`
 * 这种简写。能换算的就换算，换不了的原样返回让后面报真正的错。
 */
function fromUrl(input: string): string | undefined {
  const npm = /^https?:\/\/(?:www\.)?npmjs\.com\/package\/(@?[^/?#]+(?:\/[^/?#]+)?)/.exec(input)
  if (npm !== null) return npm[1]

  const github = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)/.exec(input)
  if (github !== null) {
    const owner = github[1] as string
    // 去掉 .git 后缀；/tree/<分支> 这类路径已被上面的正则截断
    const repo = (github[2] as string).replace(/\.git$/, '')
    return `github:${owner}/${repo}`
  }
  return undefined
}

/**
 * 解析用户填的安装来源。
 *
 * 接受四类输入：整条命令、网页地址、包名（可带版本或 scope）、本地路径。
 * 解析只做「换个等价写法」，真正认不认得由 pnpm 判断——我们不预先否定
 * 那些自己没见过但 pnpm 支持的写法（git+ssh、tarball 地址等）。
 *
 * 安全上仍然挡两样：以 - 开头会被当成命令行选项，换行与空字符能拼出第二条命令。
 */
function validateSpec(raw: unknown): string {
  const input = String(raw ?? '').trim()
  if (input === '') throw new Error('请填写插件来源')
  if (/[\n\r\0]/.test(input)) throw new Error('插件来源不能包含换行')

  const spec = fromCommand(input) ?? fromUrl(input) ?? input
  if (spec.startsWith('-')) throw new Error('插件来源不能以 - 开头')
  if (/\s/.test(spec)) throw new Error(`没看懂「${input}」，请填包名、仓库地址或本地路径`)
  return spec
}

/**
 * 转发一次 `dsh plugin` 子命令。
 *
 * dsh 的入口就是当前进程的 argv[1]（无论是桌面壳启动还是 `dsh web` 命令行启动），
 * 直接复用它，不必猜安装位置。
 */
async function runPluginCommand(args: readonly string[]): Promise<{ ok: boolean; output: string }> {
  const entry = process.argv[1]
  if (entry === undefined || !existsSync(entry)) {
    return { ok: false, output: '找不到 dsh 入口，无法执行插件命令' }
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, 'plugin', '--profile', PROFILE, ...args], {
      cwd: profileDir(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    const collect = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-16_384) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ ok: false, output: `${output}\n插件命令超时（超过 ${String(COMMAND_TIMEOUT_MS / 1000)} 秒）` })
    }, COMMAND_TIMEOUT_MS)

    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, output: `无法启动插件命令：${error.message}` })
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve({ ok: true, output })
      else resolve({ ok: false, output: `${output}\n命令失败（${code === null ? `信号 ${String(signal)}` : `退出码 ${String(code)}`}）` })
    })
  })
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    // 这些请求只带一个短字符串，超出就是异常输入
    if (size > 64 * 1024) throw new Error('请求体过大')
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Loader 引用在插件挂载时注入，路由处理器据此读取运行中的条目。 */
let loaderRef: Parameters<typeof listRuntime>[0] | undefined
/** 插件上下文；目录选择服务要现取，不能在 apply 时缓存。 */
let ctxRef: { get?: (name: string) => unknown } | undefined

/**
 * 取原生选择器；不可用（远程浏览器、未挂该后端）时返回 undefined。
 *
 * 每次都重新 get：`directory-picker-auto` 是在启动时判定宿主处境后，
 * 才把 native 或 browse 后端作为条目挂进内存根树的，本插件 apply 的那一刻
 * 未必已经挂好。缓存一次就可能永远停在 undefined。
 */
function nativePick(): ((signal: AbortSignal) => Promise<string | null>) | undefined {
  try {
    const picker = ctxRef?.get?.('directoryPicker') as DirectoryPickerService | undefined
    const capability = picker?.capability()
    if (capability?.kind === 'native' && typeof capability.pick === 'function') return capability.pick
  } catch {
    // 能力探测失败按不可用处理
  }
  return undefined
}

/** 开一次原生目录选择器，返回选中的绝对路径；用户取消返回空。 */
async function pickDirectory(): Promise<{ ok: boolean; path?: string; output?: string }> {
  const pick = nativePick()
  if (pick === undefined) return { ok: false, output: '当前环境不支持目录选择，请手动填写路径' }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, PICK_TIMEOUT_MS)
  try {
    const chosen = await pick(controller.signal)
    return chosen === null ? { ok: true } : { ok: true, path: chosen }
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0] ?? ''
  const action = path.slice(ROUTE_PREFIX.length)
  try {
    if (action === '/plugins' && req.method === 'GET') {
      sendJson(res, 200, {
        ...listPlugins(),
        runtime: loaderRef === undefined ? [] : listRuntime(loaderRef),
        // 前端据此决定要不要显示「选择目录」按钮
        canPickDirectory: nativePick() !== undefined,
      })
      return
    }
    if (action === '/plugins/pick-directory' && req.method === 'POST') {
      const result = await pickDirectory()
      sendJson(res, result.ok ? 200 : 400, result)
      return
    }
    if (action === '/plugins/install' && req.method === 'POST') {
      const spec = validateSpec((await readBody(req)).spec)
      const result = await runPluginCommand(['add', spec])
      sendJson(res, result.ok ? 200 : 500, result)
      return
    }
    if (action === '/plugins/remove' && req.method === 'POST') {
      const name = validateSpec((await readBody(req)).name)
      const result = await runPluginCommand(['remove', name])
      sendJson(res, result.ok ? 200 : 500, result)
      return
    }
    sendJson(res, 404, { ok: false, output: '未知接口' })
  } catch (error) {
    sendJson(res, 400, { ok: false, output: error instanceof Error ? error.message : String(error) })
  }
}

/** webServer 用来挂路由，loader 用来读运行中的插件清单。 */
export const inject = ['webServer', 'loader']

export function apply(ctx: {
  webServer: { register: (route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }) => () => void }
  loader: Parameters<typeof listRuntime>[0]
  get?: (name: string) => unknown
  effect?: (setup: () => (() => void) | void, label?: string) => void
}): void {
  loaderRef = ctx.loader
  // 目录选择是可选能力：顶层 inject 里声明它，会让没挂该服务的组合完全不加载本插件
  ctxRef = ctx
  ctx.effect?.(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req, res) => { void handle(req, res) },
  }), 'skin-studio: 插件管理接口')
}
