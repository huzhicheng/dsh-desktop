/**
 * Telegram 通道。
 *
 * 用 Bot API 的 getUpdates 长轮询：客户端主动往外拉，**不需要公网地址、
 * 域名或内网穿透**，和飞书走长连接是同一个道理，适合装在用户自己机器上的桌面应用。
 *
 * 刻意不引第三方库：整套只用到 4 个 HTTPS 接口（getMe / getUpdates /
 * sendMessage / editMessageText），fetch 就够了。桌面应用很在意打包体积，
 * 能不加依赖就不加。
 *
 * 用户侧配置只有一项：找 @BotFather 发 /newbot，拿到的那串 token。
 */

import type { ApprovalDecision, ApprovalRequest, BridgeConfig, Channel } from './types'
import type { OutputPipe } from './output'

const API = 'https://api.telegram.org'
/** 长轮询挂起时长；Telegram 允许最长 50 秒，取 25 秒兼顾及时性与连接数。 */
const POLL_TIMEOUT_S = 25
/** 单条消息上限 4096 字符，留出余量给分段标记。 */
const MAX_MESSAGE = 3900
/** 流式刷新的最小间隔：Telegram 对 editMessageText 限流，刷太密会 429。 */
const EDIT_INTERVAL_MS = 1200
/** 审批等待上限，超时按拒绝处理。 */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

interface TelegramMessage {
  message_id: number
  text?: string
  chat: { id: number }
  from?: { id: number; username?: string; first_name?: string }
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

export interface TelegramChannelOptions {
  getConfig: () => BridgeConfig
  /** 收到一条用户消息；会话前缀由装配层统一添加。 */
  onMessage: (input: { chatId: string; userId: string; text: string; messageId: string }) => void
  log: (line: string) => void
}

export class TelegramChannel implements Channel {
  readonly name = 'telegram'
  private readonly options: TelegramChannelOptions
  private running = false
  private offset = 0
  private abort: AbortController | undefined
  /** chatId → 等待中的审批：下一条 y/n 回复用来决定。 */
  private readonly pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>()

  constructor(options: TelegramChannelOptions) {
    this.options = options
  }

  private get token(): string {
    return this.options.getConfig().telegram?.token ?? ''
  }

  private async call<T>(method: string, payload?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      ...(signal === undefined ? {} : { signal }),
    })
    const body = await response.json() as { ok: boolean; result?: T; description?: string }
    if (!body.ok) throw new Error(`telegram ${method} 失败：${body.description ?? String(response.status)}`)
    return body.result as T
  }

  async start(): Promise<void> {
    if (this.token === '') throw new Error('未配置 Telegram Bot Token')
    const me = await this.call<{ username?: string }>('getMe')
    this.options.log(`[telegram] 已连接：@${me.username ?? '未知'}`)
    this.running = true
    void this.pollLoop()
  }

  async stop(): Promise<void> {
    this.running = false
    this.abort?.abort()
    this.abort = undefined
    for (const resolve of this.pendingApprovals.values()) resolve('reject')
    this.pendingApprovals.clear()
    return Promise.resolve()
  }

  /**
   * 长轮询主循环。
   *
   * 出错时退避重试而不是退出：网络抖动、休眠唤醒都会让请求失败，
   * 一次失败就停掉通道的话，用户得手动重启才能恢复。
   */
  private async pollLoop(): Promise<void> {
    let backoffMs = 1000
    while (this.running) {
      const abort = new AbortController()
      this.abort = abort
      try {
        const updates = await this.call<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT_S,
          allowed_updates: ['message'],
        }, abort.signal)
        backoffMs = 1000
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1)
          if (update.message !== undefined) await this.onMessage(update.message)
        }
      } catch (error) {
        if (!this.running) break
        this.options.log(`[telegram] 轮询出错，${String(backoffMs / 1000)} 秒后重试：${error instanceof Error ? error.message : String(error)}`)
        await new Promise((done) => { setTimeout(done, backoffMs) })
        backoffMs = Math.min(backoffMs * 2, 60_000)
      }
    }
  }

  private async onMessage(message: TelegramMessage): Promise<void> {
    const text = message.text?.trim()
    if (text === undefined || text === '') return
    const chatId = String(message.chat.id)
    const userId = String(message.from?.id ?? '')

    // 有待处理的审批时，这条回复用来做决定，不进 agent
    const pending = this.pendingApprovals.get(chatId)
    if (pending !== undefined) {
      const answer = text.toLowerCase()
      if (['y', 'yes', '是', '同意', '允许'].includes(answer)) { pending('allow-once'); return }
      if (['a', 'always', '总是'].includes(answer)) { pending('allow-always'); return }
      if (['n', 'no', '否', '拒绝'].includes(answer)) { pending('reject'); return }
      await this.send(chatId, '请回复 y（允许一次）、a（一直允许）或 n（拒绝）。')
      return
    }

    const allowed = this.options.getConfig().allowedUserIds
    if (!allowed.includes(userId)) {
      // 直接把 id 告诉用户，省得他去别处找——这是最劝退的一步
      await this.send(chatId, `未授权。你的 Telegram 用户 ID 是 ${userId}，把它加进桌面端的白名单后即可使用。`)
      this.options.log(`[telegram] 拒绝未授权用户 ${userId}`)
      return
    }

    this.options.onMessage({
      chatId,
      userId,
      text,
      messageId: String(message.message_id),
    })
  }

  /** 超长消息按 Telegram 的 4096 上限切分，避免整条被拒。 */
  private chunk(text: string): string[] {
    if (text.length <= MAX_MESSAGE) return [text]
    const parts: string[] = []
    let rest = text
    while (rest.length > MAX_MESSAGE) {
      // 尽量在换行处断开，读起来不至于劈在句子中间
      const cut = rest.lastIndexOf('\n', MAX_MESSAGE)
      const at = cut > MAX_MESSAGE / 2 ? cut : MAX_MESSAGE
      parts.push(rest.slice(0, at))
      rest = rest.slice(at)
    }
    if (rest !== '') parts.push(rest)
    return parts
  }

  async send(chatId: string, text: string, replyTo?: string): Promise<void> {
    for (const part of this.chunk(text)) {
      await this.call('sendMessage', {
        chat_id: chatId,
        text: part,
        ...(replyTo === undefined ? {} : { reply_to_message_id: Number(replyTo) }),
      })
    }
  }

  /**
   * 流式回复：先发一条占位消息，再持续 editMessageText 刷新，做出打字机效果。
   * 内容超过单条上限后，把当前这条定稿、另起一条继续，避免编辑请求被拒。
   */
  async streamReply(chatId: string, pipe: OutputPipe, replyTo?: string): Promise<void> {
    let messageId: number | undefined
    let buffer = ''
    let lastEdit = 0
    let lastSent = ''

    const flush = async (force: boolean): Promise<void> => {
      const now = Date.now()
      if (!force && now - lastEdit < EDIT_INTERVAL_MS) return
      if (buffer === lastSent || buffer === '') return
      lastEdit = now
      if (messageId === undefined) {
        const sent = await this.call<{ message_id: number }>('sendMessage', {
          chat_id: chatId,
          text: buffer.slice(0, MAX_MESSAGE),
          ...(replyTo === undefined ? {} : { reply_to_message_id: Number(replyTo) }),
        })
        messageId = sent.message_id
      } else {
        try {
          await this.call('editMessageText', {
            chat_id: chatId, message_id: messageId, text: buffer.slice(0, MAX_MESSAGE),
          })
        } catch {
          // 编辑失败（内容没变、被限流、消息太旧）不该中断输出
        }
      }
      lastSent = buffer
    }

    await pipe.drainTo(async (chunk) => {
      if (buffer.length + chunk.length > MAX_MESSAGE) {
        await flush(true)
        // 当前这条写满了，另起一条继续
        messageId = undefined
        buffer = chunk.trimStart()
        lastSent = ''
      } else {
        buffer += chunk
      }
      await flush(false)
    })
    await flush(true)
  }

  /**
   * 审批：Telegram 的内联键盘要处理 callback_query，为少收一类事件、
   * 少要一份状态，这里用「回复 y / a / n」的文本方式，行为和卡片按钮一致。
   */
  async askApproval(input: ApprovalRequest): Promise<ApprovalDecision> {
    const lines = [
      `需要授权：${input.toolName}`,
      input.summary,
      ...(input.reason === undefined ? [] : [`原因：${input.reason}`]),
      ...(input.arguments === undefined ? [] : [`参数：${input.arguments.slice(0, 500)}`]),
      '',
      '回复 y 允许一次，a 一直允许，n 拒绝。',
    ]
    await this.send(input.chatId, lines.join('\n'))

    return new Promise<ApprovalDecision>((resolve) => {
      const settle = (decision: ApprovalDecision): void => {
        clearTimeout(timer)
        this.pendingApprovals.delete(input.chatId)
        resolve(decision)
      }
      const timer = setTimeout(() => {
        void this.send(input.chatId, '审批超时，已按拒绝处理。')
        settle('reject')
      }, APPROVAL_TIMEOUT_MS)
      this.pendingApprovals.set(input.chatId, settle)
    })
  }
}
