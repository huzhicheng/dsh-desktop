/**
 * 会话日志读取：ACP 的 `session/request_permission` 只带一个 toolCallId，
 * 不含要执行的命令内容，直接拿去做审批卡片等于让人闭着眼睛点「允许」。
 * 好在同一次调用的工具名、参数和 agent 自己写的升权理由都会落到会话日志里，
 * 这里按 callId 把它们捞出来补进卡片。
 *
 * 日志是 `session.jsonl.zstd`：每次 flush 追加一个**独立的 zstd 帧**，
 * 所以既不能用 zstdDecompressSync（只解首帧），也不能用流式解压
 * （第二帧会报 Unknown frame descriptor）；必须按 magic 逐帧解。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** zstd 帧头。 */
const ZSTD_MAGIC = Buffer.from('28b52ffd', 'hex')

/** 只解析日志尾部这么多字节：审批要查的事件总在最后。 */
const TAIL_BYTES = 4 * 1024 * 1024

export interface ToolCallDetail {
  /** 工具名，如 write / bash。 */
  toolName?: string
  /** 工具入参的原始 JSON 文本。 */
  arguments?: string
  /** agent 申请升权时自己写的理由。 */
  reason?: string
}

interface SessionEvent {
  type?: string
  data?: Record<string, unknown>
}

/** 会话目录名：绝对路径的分隔符换成 `-`，再用 `--` 包起来。 */
function encodeCwd(cwd: string): string {
  return `--${cwd.replaceAll('/', '-').replace(/^-/, '')}--`
}

/**
 * 定位某会话的日志文件。先按 cwd 推算目录，推算不中就扫一遍
 * （目录名规则是从产物里逆向的，dsh 升级后有可能变，扫描是兜底）。
 */
function locateLog(sessionsRoot: string, cwd: string, sessionId: string): string | undefined {
  const candidates = [
    join(sessionsRoot, encodeCwd(cwd), sessionId, 'session.jsonl.zstd'),
    join(sessionsRoot, encodeCwd(cwd), `session-${sessionId}`, 'session.jsonl.zstd'),
  ]
  for (const candidate of candidates) {
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile() === true) return candidate
  }
  let groups: string[]
  try {
    groups = readdirSync(sessionsRoot)
  } catch {
    return undefined
  }
  for (const group of groups) {
    for (const name of [sessionId, `session-${sessionId}`]) {
      const candidate = join(sessionsRoot, group, name, 'session.jsonl.zstd')
      if (statSync(candidate, { throwIfNoEntry: false })?.isFile() === true) return candidate
    }
  }
  return undefined
}

/** 逐帧解压并解析事件；坏帧（写到一半的尾帧）跳过而不是整体失败。 */
function readEvents(file: string): SessionEvent[] {
  const size = statSync(file).size
  const start = Math.max(0, size - TAIL_BYTES)
  let buffer: Buffer
  if (start === 0) {
    buffer = readFileSync(file)
  } else {
    const handle = readFileSync(file)
    buffer = handle.subarray(start)
  }

  const frames: number[] = []
  let index = buffer.indexOf(ZSTD_MAGIC)
  while (index !== -1) {
    frames.push(index)
    index = buffer.indexOf(ZSTD_MAGIC, index + ZSTD_MAGIC.length)
  }

  let text = ''
  for (let i = 0; i < frames.length; i += 1) {
    const slice = buffer.subarray(frames[i], frames[i + 1] ?? buffer.length)
    try {
      text += zstdDecompressSync(slice).toString()
    } catch {
      // 半截帧或非帧数据，跳过
    }
  }

  const events: SessionEvent[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line) as SessionEvent)
    } catch {
      // 跨帧被切断的行
    }
  }
  return events
}

/** 从事件流里按 callId 归拢一次工具调用的可展示信息。 */
function collect(events: SessionEvent[], callId: string): ToolCallDetail {
  const detail: ToolCallDetail = {}
  for (const event of events) {
    const data = event.data
    if (data === undefined || data.callId !== callId) continue
    if (event.type === 'tool/call') {
      if (typeof data.name === 'string') detail.toolName = data.name
      if (typeof data.arguments === 'string') detail.arguments = data.arguments
    } else if (event.type === 'approval/asked') {
      if (typeof data.toolName === 'string') detail.toolName ??= data.toolName
      if (typeof data.reason === 'string') detail.reason = data.reason
    }
  }
  // 升权理由多数时候不在 approval/asked 上，而在工具入参的 justification 里
  if (detail.reason === undefined && detail.arguments !== undefined) {
    try {
      const parsed = JSON.parse(detail.arguments) as Record<string, unknown>
      const justification = parsed['justification']
      if (typeof justification === 'string' && justification !== '') detail.reason = justification
    } catch {
      // 参数不是 JSON，跳过
    }
  }
  return detail
}

/**
 * 查一次工具调用的详情。
 *
 * 审批请求到达时对应事件未必已经落盘（persistence 是订阅 flush 写的），
 * 所以带一小段重试；查不到就返回空对象，让卡片退化成「未知操作」而不是卡住。
 */
export async function findToolCallDetail(options: {
  sessionsRoot: string
  cwd: string
  sessionId: string
  callId: string
  /** 总等待上限，默认 1.5 秒。 */
  timeoutMs?: number
}): Promise<ToolCallDetail> {
  const deadline = Date.now() + (options.timeoutMs ?? 1500)
  for (;;) {
    const file = locateLog(options.sessionsRoot, options.cwd, options.sessionId)
    if (file !== undefined) {
      try {
        const detail = collect(readEvents(file), options.callId)
        if (detail.toolName !== undefined || detail.arguments !== undefined) return detail
      } catch {
        // 读到一半正在被写，重试
      }
    }
    if (Date.now() >= deadline) return {}
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
}

/** 把工具调用渲染成人能一眼看懂的一行摘要，用于卡片标题。 */
export function summarizeToolCall(detail: ToolCallDetail): string {
  const name = detail.toolName ?? '未知工具'
  if (detail.arguments === undefined) return name
  let parsed: unknown
  try {
    parsed = JSON.parse(detail.arguments)
  } catch {
    return `${name} ${detail.arguments.slice(0, 200)}`
  }
  if (parsed === null || typeof parsed !== 'object') return name
  const fields = parsed as Record<string, unknown>
  // 常见工具的关键入参，按优先级取第一个能说明意图的
  for (const key of ['command', 'path', 'file_path', 'filePath', 'pattern', 'url', 'name']) {
    const value = fields[key]
    if (typeof value === 'string' && value !== '') return `${name}: ${value.slice(0, 300)}`
  }
  return `${name} ${JSON.stringify(fields).slice(0, 300)}`
}
