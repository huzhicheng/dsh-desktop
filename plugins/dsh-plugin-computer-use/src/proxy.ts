/**
 * 夹在 Harness 与 cua-driver 之间的 MCP 代理。
 *
 * 只做一件事：改写 `tools/list` 的响应。其余所有帧原样转发，两头都感觉不到它存在。
 *
 * 为什么需要它。工具的 JSON Schema 是随每次请求发给模型的，跟调不调用无关，所以
 * 「拦截调用」那类手段（tools.guard、能力清单）对 schema 问题一概无效——实测把
 * cua 的能力清单收到只剩 33 个工具，`tools/list` 照样返回 56 个，清单管的是能不能
 * 执行、不管要不要暴露。而 Harness 官方的 mcp-client 没有留过滤钩子，普通插件上下文
 * 也用不了 agent 作用域的 ctx.tools.restrict。夹一层代理是改动最小的正解。
 *
 * 它解决两类问题：
 *
 * 一、schema 方言。Moonshot 拒收「父层有 type、anyOf 分支没有」的写法，报
 *    `when using anyOf, type should be defined in anyOf items instead of the parent schema`。
 *    这在 JSON Schema 标准里合法，DeepSeek 也收，但 Kimi 不收。cua 的 browser_prepare
 *    正是这个形状，于是挂上电脑操作之后 Kimi 一句话都发不出去。
 *
 * 二、工具面太大。浏览器那一组对「操作本机应用」没用，却占着工具位、也占提示词预算。
 *
 * 环境变量：
 *   CUA_PROXY_BIN         cua-driver 可执行文件路径（必填）
 *   CUA_PROXY_ARGS        传给它的参数，用换行分隔
 *   CUA_PROXY_DROP        要隐藏的工具名或前缀，逗号分隔
 *   CUA_PROXY_MAX_ELEMENTS  get_window_state 的元素上限，0 表示不干预
 *   CUA_PROXY_NO_IMAGES     为 1 时强制不让截图回到对话（只收文本的模型必须开）
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const BIN = process.env.CUA_PROXY_BIN ?? ''
const ARGS = (process.env.CUA_PROXY_ARGS ?? 'mcp').split('\n').filter(part => part !== '')
const DROP = (process.env.CUA_PROXY_DROP ?? '').split(',').map(part => part.trim()).filter(part => part !== '')
const MAX_ELEMENTS = Number(process.env.CUA_PROXY_MAX_ELEMENTS ?? '200')
const NO_IMAGES = process.env.CUA_PROXY_NO_IMAGES !== '0'

if (BIN === '') {
  process.stderr.write('cua 代理：没有给 CUA_PROXY_BIN\n')
  process.exit(1)
}

/** 名字命中要隐藏的清单：整名相等，或以「前缀*」的形式命中。 */
function dropped(name: string): boolean {
  return DROP.some(rule => (rule.endsWith('*') ? name.startsWith(rule.slice(0, -1)) : name === rule))
}

/**
 * 把 `anyOf` / `oneOf` 父层的 type 挪进各个分支。
 *
 * 只在分支自己没写 type 时补，写了的不动——那种情况父层的 type 本就是冗余的，
 * 删掉即可。递归处理，因为这种形状可能出现在嵌套的属性里。
 */
function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize)
  if (typeof node !== 'object' || node === null) return node

  const source = node as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) result[key] = sanitize(value)

  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const branches = result[keyword]
    if (!Array.isArray(branches) || result.type === undefined) continue
    const inherited = result.type
    result[keyword] = branches.map((branch) => {
      if (typeof branch !== 'object' || branch === null) return branch
      const copy = { ...branch as Record<string, unknown> }
      copy.type ??= inherited
      return copy
    })
    delete result.type
  }
  return result
}

const child = spawn(BIN, ARGS, { stdio: ['pipe', 'pipe', 'inherit'] })
child.once('error', (error) => {
  process.stderr.write(`cua 代理：拉起 ${BIN} 失败：${error.message}\n`)
  process.exit(1)
})
child.once('exit', (code) => { process.exit(code ?? 0) })

/**
 * 上行改写：把 get_window_state 的调法收拢。
 *
 * 两个问题都出在这个工具的默认值上，实测（Ghostty 窗口）：
 *
 *   不传 include_screenshot     内容块 [image, text]   1,743,273 字符
 *   include_screenshot=false    内容块 [text]          1,013,600 字符
 *   再加 max_elements=200       内容块 [text]              20,033 字符
 *
 * 一是**默认带截图**。官方文档也写明「always returns BOTH the element tree and a
 * screenshot」。对只收文本的模型来说这张图是灾难：它会进对话历史、之后每轮重发，
 * 整段会话从此报 `unknown variant \`image_url\``，只能弃用重开。
 *
 * 二是**默认 max_elements 是 2000**，Electron 类应用能撑出一兆的树。官方对这个
 * 参数的说明就是「Lower this for Electron / Obsidian / large web apps that produce
 * 10k+ element trees and blow context windows」。
 *
 * 这里选择改写参数而不是拒绝调用：agent 不会收到一堆拒绝、也不用学会怎么传参，
 * 拿到的就是一棵干净的小树。要看图的话有 get_desktop_state，那是另一件事。
 */
function rewriteCall(frame: Record<string, unknown>): void {
  const params = frame.params as { name?: unknown, arguments?: unknown } | undefined
  if (params?.name !== 'get_window_state') return
  const args = (typeof params.arguments === 'object' && params.arguments !== null
    ? params.arguments
    : {}) as Record<string, unknown>
  // 能看图的模型不必压制截图；只收文本的才强制关掉。
  // 已经指定了写文件的也别动：那是调用方自己要图，且图落盘不进对话。
  if (NO_IMAGES && (typeof args.screenshot_out_file !== 'string' || args.screenshot_out_file === '')) {
    args.include_screenshot = false
  }
  if (MAX_ELEMENTS > 0 && args.max_elements === undefined) args.max_elements = MAX_ELEMENTS
  params.arguments = args
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return
  let frame: unknown
  try {
    frame = JSON.parse(line)
  } catch {
    child.stdin.write(`${line}\n`)
    return
  }
  const message = frame as Record<string, unknown>
  if (message.method === 'tools/call') {
    rewriteCall(message)
    child.stdin.write(`${JSON.stringify(frame)}\n`)
    return
  }
  child.stdin.write(`${line}\n`)
})

// 下行：逐行看，只有 tools/list 的结果需要动
createInterface({ input: child.stdout }).on('line', (line) => {
  if (line.trim() === '') return
  let frame: unknown
  try {
    frame = JSON.parse(line)
  } catch {
    // 不是完整的 JSON 帧就原样放行，别把不认识的东西吃掉
    process.stdout.write(`${line}\n`)
    return
  }
  const message = frame as { result?: { tools?: unknown[] } }
  const tools = message.result?.tools
  if (!Array.isArray(tools)) {
    process.stdout.write(`${line}\n`)
    return
  }
  const kept = tools
    .filter(tool => !dropped(String((tool as { name?: unknown }).name ?? '')))
    .map((tool) => {
      const copy = { ...tool as Record<string, unknown> }
      if (copy.inputSchema !== undefined) copy.inputSchema = sanitize(copy.inputSchema)
      return copy
    })
  if (message.result !== undefined) message.result.tools = kept
  process.stdout.write(`${JSON.stringify(frame)}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { child.kill(signal) })
}
