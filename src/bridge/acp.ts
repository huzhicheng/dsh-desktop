/**
 * ACP 客户端：把聊天会话映射到 `dsh --profile acp` 的 agent 会话。
 *
 * 按工作目录分进程，而不是所有会话共用一个：dsh-base 里沙箱的
 * workspaceRoot 取的是 `process.cwd()`（进程级），而 ACP 的 cwd 是 session 级，
 * 共用一个进程会让不同工作目录的会话共享同一条沙箱边界。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { findToolCallDetail, summarizeToolCall } from './session-log'
import type { ApprovalDecision, PermissionMode } from './types'

export interface AcpPoolOptions {
  /** 内置 Node 可执行文件。 */
  nodePath: string
  /** dsh 入口（runtime/versions/<版本>/.../bin.js）。 */
  dshEntry: string
  /** harness home，会话日志也在这下面。 */
  dshHome: string
  permissionMode: PermissionMode
  idleTimeoutMs: number
  promptTimeoutMs: number
  /** agent 提交一段文本时回调。 */
  onText: (chatKey: string, text: string) => void
  /** agent 请求授权时回调，返回决定。 */
  onApproval: (ask: {
    chatKey: string
    toolName: string
    summary: string
    reason?: string
    arguments?: string
  }) => Promise<ApprovalDecision>
  log: (message: string) => void
}

interface SessionRecord {
  chatKey: string
  sessionId: string
  cwd: string
  /** 本会话内已被「一直允许」的工具名。 */
  allowedTools: Set<string>
  busy: boolean
}

/** 单个工作目录对应的一个 dsh 进程。 */
class AcpProcess {
  readonly cwd: string
  private readonly options: AcpPoolOptions
  private child: ChildProcess | undefined
  private conn: ClientSideConnection | undefined
  private readonly byChat = new Map<string, SessionRecord>()
  private readonly bySession = new Map<string, SessionRecord>()
  private starting: Promise<void> | undefined
  lastActivity = Date.now()

  constructor(cwd: string, options: AcpPoolOptions) {
    this.cwd = cwd
    this.options = options
  }

  private async ensureStarted(): Promise<void> {
    if (this.conn !== undefined) return
    this.starting ??= this.start()
    try {
      await this.starting
    } finally {
      this.starting = undefined
    }
  }

  private async start(): Promise<void> {
    const child = spawn(this.options.nodePath, [this.options.dshEntry, '--profile', 'acp'], {
      cwd: this.cwd,
      env: {
        ...process.env,
        DSH_HOME: this.options.dshHome,
        DSH_PERMISSION_MODE: this.options.permissionMode,
        ELECTRON_RUN_AS_NODE: undefined,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    child.stderr?.on('data', (chunk: Buffer) => {
      this.options.log(`[acp:${this.cwd}] ${chunk.toString().trimEnd()}`)
    })
    child.once('exit', (code, signal) => {
      this.options.log(`[acp:${this.cwd}] 进程退出 code=${String(code)} signal=${String(signal)}`)
      this.child = undefined
      this.conn = undefined
      this.byChat.clear()
      this.bySession.clear()
    })

    if (child.stdin === null || child.stdout === null) throw new Error('ACP 进程没有 stdio 管道')
    // node:stream 的 toWeb 返回 Node 自己的 WebStreams 类型，与 lib.dom 的同名类型
    // 结构上不互认（只是 TS 层面的分歧，运行时是同一套实现），这里直接断言过去。
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as unknown as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
    )
    const unsupported = (name: string) => async (): Promise<never> => {
      throw new Error(`bridge client does not support ${name}`)
    }

    const conn = new ClientSideConnection(() => ({
      sessionUpdate: async ({ sessionId, update }) => {
        if (update.sessionUpdate !== 'agent_message_chunk') return
        const record = this.bySession.get(sessionId)
        if (record === undefined) return
        const content = update.content
        const text = content.type === 'text' ? content.text : ''
        if (text.trim() !== '') this.options.onText(record.chatKey, text)
      },
      requestPermission: async (params) => {
        const record = this.bySession.get(params.sessionId)
        const callId = params.toolCall.toolCallId
        const allow = params.options.find((option) => option.kind === 'allow_once')
          ?? params.options.find((option) => option.kind?.startsWith('allow') === true)
        const deny = params.options.find((option) => option.kind === 'reject_once')
          ?? params.options.find((option) => option.kind?.startsWith('reject') === true)
        const fallbackReject = (): { outcome: { outcome: 'selected'; optionId: string } } => ({
          outcome: { outcome: 'selected', optionId: (deny ?? params.options[0])?.optionId ?? '' },
        })
        if (record === undefined || allow === undefined) return fallbackReject()

        // ACP 只给了 toolCallId，具体干什么要去会话日志里补
        const detail = await findToolCallDetail({
          sessionsRoot: join(this.options.dshHome, 'sessions'),
          cwd: this.cwd,
          sessionId: params.sessionId,
          callId,
        })
        const toolName = detail.toolName ?? 'unknown'
        if (record.allowedTools.has(toolName)) {
          this.options.log(`[acp] ${record.chatKey} 已放行工具 ${toolName}，自动允许`)
          return { outcome: { outcome: 'selected', optionId: allow.optionId } }
        }

        const decision = await this.options.onApproval({
          chatKey: record.chatKey,
          toolName,
          summary: summarizeToolCall(detail),
          reason: detail.reason,
          arguments: detail.arguments,
        })
        if (decision === 'reject') return fallbackReject()
        if (decision === 'allow-always') record.allowedTools.add(toolName)
        return { outcome: { outcome: 'selected', optionId: allow.optionId } }
      },
      writeTextFile: unsupported('fs/write_text_file'),
      readTextFile: unsupported('fs/read_text_file'),
      createTerminal: unsupported('terminal/create'),
    }), stream)

    await conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    })
    this.conn = conn
    this.options.log(`[acp] 已启动，工作目录 ${this.cwd}，权限 ${this.options.permissionMode}`)
  }

  private async ensureSession(chatKey: string): Promise<SessionRecord> {
    await this.ensureStarted()
    const existing = this.byChat.get(chatKey)
    if (existing !== undefined) return existing
    if (this.conn === undefined) throw new Error('ACP 连接尚未就绪')
    const { sessionId } = await this.conn.newSession({ cwd: this.cwd, mcpServers: [] })
    const record: SessionRecord = { chatKey, sessionId, cwd: this.cwd, allowedTools: new Set(), busy: false }
    this.byChat.set(chatKey, record)
    this.bySession.set(sessionId, record)
    this.options.log(`[acp] ${chatKey} 新建会话 ${sessionId}`)
    return record
  }

  isBusy(chatKey: string): boolean {
    return this.byChat.get(chatKey)?.busy === true
  }

  hasSession(chatKey: string): boolean {
    return this.byChat.has(chatKey)
  }

  /** 丢弃某个聊天的会话，下一条消息会开一个全新的。 */
  forget(chatKey: string): void {
    const record = this.byChat.get(chatKey)
    if (record === undefined) return
    this.byChat.delete(chatKey)
    this.bySession.delete(record.sessionId)
  }

  async prompt(chatKey: string, text: string): Promise<string> {
    const record = await this.ensureSession(chatKey)
    if (record.busy) throw new Error('busy')
    record.busy = true
    this.lastActivity = Date.now()
    const conn = this.conn
    if (conn === undefined) throw new Error('ACP 连接尚未就绪')
    let timer: NodeJS.Timeout | undefined
    try {
      const result = await Promise.race([
        conn.prompt({ sessionId: record.sessionId, prompt: [{ type: 'text', text }] }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void conn.cancel({ sessionId: record.sessionId })
            reject(new Error('timeout'))
          }, this.options.promptTimeoutMs)
        }),
      ])
      return result.stopReason
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      record.busy = false
      this.lastActivity = Date.now()
    }
  }

  async cancel(chatKey: string): Promise<boolean> {
    const record = this.byChat.get(chatKey)
    if (record === undefined || this.conn === undefined || !record.busy) return false
    await this.conn.cancel({ sessionId: record.sessionId })
    return true
  }

  idleFor(): number {
    if (this.byChat.size === 0 && this.child === undefined) return Number.POSITIVE_INFINITY
    for (const record of this.byChat.values()) if (record.busy) return 0
    return Date.now() - this.lastActivity
  }

  dispose(): void {
    const child = this.child
    this.child = undefined
    this.conn = undefined
    this.byChat.clear()
    this.bySession.clear()
    if (child === undefined) return
    if (process.platform === 'win32' && child.pid !== undefined) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }
}

/** 按工作目录分池的 ACP 进程管理器。 */
export class AcpPool {
  private readonly options: AcpPoolOptions
  private readonly processes = new Map<string, AcpProcess>()
  private readonly sweeper: NodeJS.Timeout

  constructor(options: AcpPoolOptions) {
    this.options = options
    this.sweeper = setInterval(() => { this.sweep() }, 60_000)
    this.sweeper.unref?.()
  }

  private processFor(cwd: string): AcpProcess {
    const existing = this.processes.get(cwd)
    if (existing !== undefined) return existing
    const created = new AcpProcess(cwd, this.options)
    this.processes.set(cwd, created)
    return created
  }

  isBusy(chatKey: string, cwd: string): boolean {
    return this.processes.get(cwd)?.isBusy(chatKey) === true
  }

  async prompt(chatKey: string, cwd: string, text: string): Promise<string> {
    return this.processFor(cwd).prompt(chatKey, text)
  }

  async cancel(chatKey: string, cwd: string): Promise<boolean> {
    const target = this.processes.get(cwd)
    if (target === undefined) return false
    return target.cancel(chatKey)
  }

  /** 换工作目录或 /new 时调用：丢掉旧会话，保留进程。 */
  forget(chatKey: string): void {
    for (const target of this.processes.values()) target.forget(chatKey)
  }

  hasSession(chatKey: string, cwd: string): boolean {
    return this.processes.get(cwd)?.hasSession(chatKey) === true
  }

  private sweep(): void {
    for (const [cwd, target] of this.processes) {
      if (target.idleFor() > this.options.idleTimeoutMs) {
        this.options.log(`[acp] 回收闲置进程 ${cwd}`)
        target.dispose()
        this.processes.delete(cwd)
      }
    }
  }

  dispose(): void {
    clearInterval(this.sweeper)
    for (const target of this.processes.values()) target.dispose()
    this.processes.clear()
  }
}
