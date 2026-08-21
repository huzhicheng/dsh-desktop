/**
 * 电脑操作（computer use）：把 Cua Driver 的能力接进 Harness。
 *
 * 分工上这个插件只做三件事，真正操作电脑的活儿全在 Cua Driver 那边：
 *
 * 一是探测与安装。全新机器上没有 cua-driver，界面里给一个安装入口，装完再连。
 * 二是连接。cua-driver 讲的是 MCP over stdio，而 dsh 自带 `@deepseek-ai/dsh-mcp-client`
 *    能把一个 MCP 服务端的工具注册到 ctx.tools 上，所以这里不自己实现协议，
 *    直接以子插件形式挂一个客户端实例，工具名会是 `mcp__cua__*`。
 * 三是权限。macOS 要辅助功能与屏幕录制两项授权，只能用户自己在系统设置里点，
 *    插件能做的是查状态、把设置页打开。
 *
 * 为什么值得单独做一个插件而不是让用户自己写一行 MCP 配置：配置那条路只对
 * 「已经装好 cua-driver 的人」成立。对全新用户，缺的是探测、安装、授权引导，
 * 而这些恰好是一行配置给不了的。
 *
 * 模型侧有个前提值得记下来：Cua Driver 的 `get_window_state` 会把窗口的无障碍树
 * 渲染成带 `[element_index N]` 的文本，点击可以直接传元素索引。也就是说纯文本
 * 模型（比如 DeepSeek）不看截图也能操作界面，不必额外接一个视觉模型。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { checkPermissions, install, inspect, locate, requestPermissions } from './driver'

const ROUTE_PREFIX = '/_dsh-computer-use/api'

/**
 * MCP 服务端命名空间。
 *
 * 工具会以 `mcp__cua__<原名>` 注册，必须匹配 [A-Za-z0-9_-]{1,32}，
 * 且在所有存活的 mcp-client 实例里唯一。改这个名字等于改全部工具名。
 */
const SERVER_NAME = 'cua'

interface McpFork { dispose: () => void }

interface ToolExecution { readonly name: string, readonly arguments: unknown }

interface LlmCallConfig { provider: string, model: string, reasoningEffort?: string }

interface PluginContext {
  tools: { guard: (guard: (execution: ToolExecution) => string | undefined) => () => void }
  on: (
    event: 'agent/request',
    listener: (
      payload: { turn: number, step: number },
      next: () => Promise<LlmCallConfig>,
    ) => Promise<LlmCallConfig>,
  ) => () => void
  webServer: { register: (route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }) => () => void }
  plugin: (plugin: unknown, config: unknown) => McpFork
  effect?: (setup: () => (() => void) | void, label?: string) => void
}

export const name = 'computer-use'
/** webServer 挂状态接口，tools 挂调用守卫（子插件 mcp-client 另有自己的 inject）。 */
export const inject = ['webServer', 'tools']

export interface Config {
  /** cua-driver 可执行文件路径；留空表示自动探测。 */
  binPath: string
  /**
   * 权限模式，原样传给 cua-driver。
   *
   * standard 是官方默认，不弹确认；bounded 只允许清单里列出的工具与应用，但需要
   * 你自己准备一份 capability manifest 并用 --capability-manifest 指过去。
   */
  permissionMode: string
  /** 追加给 `cua-driver mcp` 的参数，用来接 bounded 清单一类的高级用法。 */
  extraArgs: string[]
  /** 启动时若已装好驱动，是否自动连上。 */
  autoConnect: boolean
  /**
   * 拦下会把截图塞进对话的调用。
   *
   * 默认开着，因为这个桌面端默认跑 DeepSeek，而它的接口只收文本内容块。截图一旦
   * 进了历史就会跟着之后每一次请求重发，整个会话从此每次都报
   * `unknown variant \`image_url\`, expected \`text\``，只能重开会话——一次误调用
   * 报废一整段对话，代价太大，所以默认拦住。
   *
   * 换成能看图的模型时把它关掉。
   */
  blockImageResults: boolean
  /**
   * 不暴露给模型的工具，支持 `前缀*` 通配。
   *
   * 默认藏掉浏览器那一组：它们对「操作本机应用」用不上，白占工具位和提示词预算；
   * 而且 browser_prepare 的 schema 是「父层有 type、anyOf 分支没有」的形状，
   * Moonshot 直接拒收整个请求（DeepSeek 收得下，所以只在换 Kimi 时才暴露）。
   */
  hideTools: string[]
  /**
   * 操作电脑期间临时把推理强度降到这一档；留空表示不动。
   *
   * 实测一次典型的操作会话里，cua 执行 15 次共 20 秒，而模型思考 14 次共 386 秒——
   * 95% 的时间花在模型上，中位每步 33 秒。而点按钮、读界面这类步骤本来也不需要
   * 深度推理，用 high 纯属浪费。
   *
   * 只在「本轮已经调用过 cua 工具」之后降档：第一步仍按你配置的强度做规划，
   * 之后的机械步骤走快档。新一轮开始时自动恢复。
   */
  fastEffort: string
  /**
   * get_window_state 每次最多走多少个无障碍节点。
   *
   * 官方默认 2000，Electron 类应用能撑出一兆的树，而这些会留在历史里、之后每轮
   * 重发。实测限到 200 后同一个窗口从 101 万字符降到 2 万。0 表示不干预。
   */
  maxElements: number
}

const DEFAULT_CONFIG: Config = {
  binPath: '', permissionMode: 'standard', extraArgs: [], autoConnect: true,
  blockImageResults: true,
  // get_desktop_state 只回截图，对只收文本的模型没用，默认也藏掉
  hideTools: ['browser_*', 'page', 'replay_trajectory', 'install_ffmpeg', 'get_desktop_state'],
  fastEffort: 'low',
  maxElements: 200,
}

let fork: McpFork | undefined
let lastError = ''
let ctxRef: PluginContext | undefined
let configRef: Config = DEFAULT_CONFIG
/** 安装过程的输出，界面轮询取走显示。 */
let installLog = ''
let installing = false
/** 守卫看到 cua 工具被调用时置位；agent/request 据此决定本轮之后的步骤要不要降档。 */
let usingComputer = false
/** 上一次见到的轮次号，用来判断何时该把上面那个标记清掉。 */
let currentTurn: number | undefined

/**
 * 组装 `cua-driver mcp` 的参数与环境。
 *
 * 权限模式必须走环境变量，不能当命令行参数传：`cua-driver mcp` 明确拒绝
 * --permission-mode（"authorization flags belong to `cua-driver serve`"），
 * 传了会导致子进程反复启动失败、连不上还刷屏。直连 MCP 时官方指定用
 * CUA_DRIVER_PERMISSION_MODE 这一组环境变量。
 */
function mcpLaunch(config: Config, binPath: string): { command: string, args: string[], env: Record<string, string> } {
  const env: Record<string, string> = {
    CUA_PROXY_BIN: binPath,
    CUA_PROXY_ARGS: ['mcp', ...config.extraArgs].join('\n'),
    CUA_PROXY_DROP: config.hideTools.join(','),
    CUA_PROXY_MAX_ELEMENTS: String(config.maxElements),
  }
  if (config.permissionMode !== '') env.CUA_DRIVER_PERMISSION_MODE = config.permissionMode
  // 用跑着 Harness 的那个 node 起代理，不依赖 PATH 上有没有 node
  const proxy = join(dirname(fileURLToPath(import.meta.url)), 'proxy.js')
  return { command: process.execPath, args: [proxy], env }
}

/**
 * 判断一次调用会不会把截图塞回对话。
 *
 * get_desktop_state 默认返回 base64 截图，传了 screenshot_out_file 就改为写文件、
 * 只回一个路径；get_window_state 只有显式 include_screenshot 才带图。所以拦的不是
 * 工具本身，而是「不写文件的那种调法」——路径形式照样能用，agent 想看图可以让别的
 * 工具去读那个文件。
 *
 * @returns 需要拦下时给出理由，同时告诉 agent 改用什么；放行则返回 undefined。
 */
function imageDenial(execution: ToolExecution): string | undefined {
  const raw = execution.name
  if (!raw.startsWith(`mcp__${SERVER_NAME}__`)) return undefined
  const tool = raw.slice(`mcp__${SERVER_NAME}__`.length)
  if (tool !== 'get_desktop_state' && tool !== 'get_window_state') return undefined

  const args = (typeof execution.arguments === 'object' && execution.arguments !== null
    ? execution.arguments
    : {}) as Record<string, unknown>
  const outFile = args.screenshot_out_file
  if (typeof outFile === 'string' && outFile !== '') return undefined
  // get_window_state 不传 include_screenshot 时**默认带图**（官方文档：always
  // returns BOTH the element tree and a screenshot），所以必须显式为 false 才放行
  if (tool === 'get_window_state' && args.include_screenshot === false) return undefined

  return '当前模型不接受图片，截图不能直接回到对话里（一旦进入历史，之后每次请求都会失败）。'
    + '请改用以下任一种：给这次调用传 screenshot_out_file 把截图写到文件再回一个路径；'
    + `或者改用 mcp__${SERVER_NAME}__get_window_state 读窗口的无障碍树——`
    + '它是纯文本，每个可操作元素带 [element_index N]，点击直接传那个索引即可。'
}

/**
 * 连上 cua-driver，把它的工具注册到 ctx.tools。
 *
 * failOnStartupError 传 false：连不上时只是没有这些工具，不该把整个 profile 拖垮。
 * 用户可能只是还没授权，或者刚把驱动卸了。
 */
async function connect(): Promise<{ ok: boolean, message: string }> {
  const ctx = ctxRef
  if (ctx === undefined) return { ok: false, message: '插件尚未初始化' }
  disconnect()

  const binPath = locate(configRef.binPath)
  if (binPath === '') {
    lastError = '没有找到 cua-driver，请先安装'
    return { ok: false, message: lastError }
  }
  try {
    // 运行时解析：这个包由 dsh 随运行时分发，不进本插件的产物
    const mcpClient = await import('@deepseek-ai/dsh-mcp-client')
    const launch = mcpLaunch(configRef, binPath)
    fork = ctx.plugin(mcpClient, {
      transport: 'stdio',
      serverName: SERVER_NAME,
      command: launch.command,
      args: launch.args,
      env: launch.env,
      failOnStartupError: false,
    })
    lastError = ''
    return { ok: true, message: `已连接 ${binPath}` }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    return { ok: false, message: lastError }
  }
}

function disconnect(): void {
  fork?.dispose()
  fork = undefined
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0]?.slice(ROUTE_PREFIX.length) ?? ''
  try {
    if (path === '/status') {
      const info = await inspect(configRef.binPath)
      sendJson(res, 200, {
        ...info,
        connected: fork !== undefined,
        permissionMode: configRef.permissionMode,
        blockImageResults: configRef.blockImageResults,
        hideTools: configRef.hideTools,
        fastEffort: configRef.fastEffort,
        maxElements: configRef.maxElements,
        installing,
        installLog: installLog.slice(-4000),
        error: lastError,
        toolPrefix: `mcp__${SERVER_NAME}__`,
      })
      return
    }
    if (path === '/install' && req.method === 'POST') {
      if (installing) { sendJson(res, 200, { ok: false, message: '正在安装中' }); return }
      installing = true
      installLog = ''
      // 不等安装结束就返回：装 65MB 的 App 要几分钟，界面靠轮询 /status 看进度
      void install((chunk) => { installLog += chunk }).then(async (result) => {
        installing = false
        installLog += result.ok ? '\n安装完成。' : '\n安装失败。'
        if (result.ok && configRef.autoConnect) {
          const connected = await connect()
          installLog += `\n${connected.message}`
        }
      })
      sendJson(res, 200, { ok: true, message: '已开始安装' })
      return
    }
    if (path === '/connect' && req.method === 'POST') {
      sendJson(res, 200, await connect())
      return
    }
    if (path === '/disconnect' && req.method === 'POST') {
      disconnect()
      sendJson(res, 200, { ok: true, message: '已断开' })
      return
    }
    if (path === '/permissions/check' && req.method === 'POST') {
      sendJson(res, 200, await checkPermissions(configRef.binPath))
      return
    }
    if (path === '/permissions/grant' && req.method === 'POST') {
      // 这一步会弹系统对话框、要用户点，可能停留很久
      const detail = await requestPermissions(configRef.binPath)
      const after = await checkPermissions(configRef.binPath)
      sendJson(res, 200, { ok: after.ok, detail, permissions: after })
      return
    }
    if (path === '/fast-effort' && req.method === 'POST') {
      const body = await readBody(req)
      const value = typeof body.effort === 'string' ? body.effort : ''
      if (!['', 'off', 'low', 'high', 'max'].includes(value)) {
        sendJson(res, 400, { ok: false, message: `不认识的推理强度：${value}` })
        return
      }
      configRef = { ...configRef, fastEffort: value }
      sendJson(res, 200, { ok: true, fastEffort: value })
      return
    }
    if (path === '/block-images' && req.method === 'POST') {
      const body = await readBody(req)
      configRef = { ...configRef, blockImageResults: body.enabled === true }
      sendJson(res, 200, { ok: true, blockImageResults: configRef.blockImageResults })
      return
    }
    if (path === '/mode' && req.method === 'POST') {
      const body = await readBody(req)
      const mode = typeof body.mode === 'string' ? body.mode : ''
      // 只认已知取值：这个字符串会变成子进程的命令行参数
      if (!['standard', 'bounded', 'unrestricted'].includes(mode)) {
        sendJson(res, 400, { ok: false, message: `不认识的权限模式：${mode}` })
        return
      }
      configRef = { ...configRef, permissionMode: mode }
      sendJson(res, 200, fork === undefined ? { ok: true, message: '已保存' } : await connect())
      return
    }
    sendJson(res, 404, { ok: false, message: '没有这个接口' })
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * 插件入口。
 * @param ctx - cordis 上下文。
 * @param config - 插件配置。
 */
export function apply(ctx: PluginContext, config: Partial<Config> = {}): void {
  ctxRef = ctx
  configRef = { ...DEFAULT_CONFIG, ...config }

  ctx.effect?.(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req, res) => { void handle(req, res) },
  }), 'computer-use: 状态接口')

  // 守卫在 tools/pre-execute 之后跑，返回理由即拒绝这次调用
  ctx.effect?.(() => ctx.tools.guard((execution) => {
    // 守卫每次调用都会走到，顺便用它记下「这一轮在操作电脑」
    if (execution.name.startsWith(`mcp__${SERVER_NAME}__`)) usingComputer = true
    return configRef.blockImageResults ? imageDenial(execution) : undefined
  }), 'computer-use: 拦截会返回图片的调用')

  /*
   * 操作电脑期间降低推理强度。
   *
   * agent/request 是个 waterfall：await next() 拿到本来要用的配置，返回替换值即可
   * 换掉。只在本轮已经调过 cua 工具之后才降——第一步还得靠正常强度做规划，
   * 之后那些「读一眼界面、点一下」的机械步骤不需要深度推理。
   */
  ctx.effect?.(() => ctx.on('agent/request', async (payload, next) => {
    const config = await next()
    // 换轮就重新开始：新一轮的第一步总是按你配置的原强度做规划
    if (payload.turn !== currentTurn) {
      currentTurn = payload.turn
      usingComputer = false
    }
    if (configRef.fastEffort === '' || !usingComputer) return config
    return { ...config, reasoningEffort: configRef.fastEffort }
  }), 'computer-use: 操作期间降低推理强度')

  // 卸载插件时要把 MCP 子进程一起收掉，否则留下一个没人管的 cua-driver
  ctx.effect?.(() => () => { disconnect() }, 'computer-use: 断开 MCP')

  // 已经装好就自动连上；没装则静默等用户从界面里装，不打扰启动流程
  if (configRef.autoConnect && locate(configRef.binPath) !== '') {
    void connect()
  }
}
