/**
 * 飞书通道：用官方 SDK 的 LarkChannel 走 WebSocket 长连接，
 * 因此不需要公网地址或内网穿透，桌面端直接连飞书服务器。
 *
 * 白名单、群内必须 @、同会话串行、消息去重、连发合并这些都交给 SDK 的
 * policy/safety 配置，不自己造一遍。
 */

import { OutputPipe } from './output'
import { createLarkChannel, Domain, type LarkChannel, type CardStreamController, type NormalizedMessage } from '@larksuiteoapi/node-sdk'
import type { ApprovalDecision, BridgeConfig, Channel } from './types'

/** 等待审批的一张卡片。 */
interface PendingApproval {
  chatId: string
  messageId: string
  summary: string
  resolve: (decision: ApprovalDecision) => void
  timer: NodeJS.Timeout
}

/** 审批卡片的等待上限，超时按拒绝处理，避免 agent 永远挂在那儿。 */
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000

export interface FeishuChannelOptions {
  config: BridgeConfig
  /** 收到一条应当交给 agent 的消息。 */
  onMessage: (input: { chatId: string; userId: string; text: string; messageId: string; isGroup: boolean }) => void
  log: (message: string) => void
}

/** agent 输出的推送管道：ACP 那侧异步吐字，SDK 这侧需要一个 producer 去消费。 */
export class FeishuChannel implements Channel {
  readonly name = 'feishu'
  private readonly options: FeishuChannelOptions
  private channel: LarkChannel | undefined
  private readonly pending = new Map<string, PendingApproval>()
  private approvalSeq = 0

  constructor(options: FeishuChannelOptions) {
    this.options = options
  }

  private get config(): BridgeConfig {
    return this.options.config
  }

  async start(): Promise<void> {
    const { feishu, allowedUserIds } = this.config
    if (!feishu.enabled) throw new Error('飞书通道未启用')
    if (feishu.appId === '' || feishu.appSecret === '') throw new Error('缺少飞书 App ID 或 App Secret')
    if (allowedUserIds.length === 0) throw new Error('白名单为空：请先指定允许驱动 agent 的飞书用户')

    const channel = createLarkChannel({
      appId: feishu.appId,
      appSecret: feishu.appSecret,
      // SDK 要的是 Domain 枚举，不是 'feishu' / 'lark' 这种简称
      domain: feishu.domain === 'lark' ? Domain.Lark : Domain.Feishu,
      transport: 'websocket',
      policy: {
        // 私聊按 open_id 白名单放行；群里必须 @ 机器人，且不响应 @所有人
        dmMode: 'allowlist',
        dmAllowlist: allowedUserIds,
        requireMention: true,
        respondToMentionAll: false,
      },
      safety: {
        // 不用 SDK 的会话串行队列：agent 正忙时 /stop 必须能插队，
        // 排队会让中断指令排在它要中断的任务后面。并发由桥接核心自己挡。
        chatQueue: { enabled: false },
        // 用户连发几条短消息合并成一条再交给 agent
        batch: { text: { delayMs: 900, maxMessages: 5 } },
        // 重启后不去回应几分钟前的旧消息
        staleMessageWindowMs: 3 * 60 * 1000,
      },
      outbound: { streamThrottleMs: 700, streamInitialText: '思考中…' },
    })
    this.channel = channel

    channel.on('message', (message: NormalizedMessage) => {
      const text = message.content.trim()
      if (text === '') return
      // 群里发言人也必须在白名单内：SDK 的 dmAllowlist 只管私聊
      if (!this.config.allowedUserIds.includes(message.senderId)) {
        this.options.log(`[feishu] 拒绝非白名单用户 ${message.senderId}`)
        void this.send(message.chatId, '你不在这个机器人的白名单里。')
        return
      }
      this.options.onMessage({
        chatId: message.chatId,
        userId: message.senderId,
        text,
        messageId: message.messageId,
        isGroup: message.chatType === 'group',
      })
    })

    channel.on('cardAction', (event) => {
      const value = event.action.value as { approvalId?: string; decision?: ApprovalDecision } | undefined
      const approvalId = value?.approvalId
      const decision = value?.decision
      if (approvalId === undefined || decision === undefined) return
      const entry = this.pending.get(approvalId)
      if (entry === undefined) return
      if (!this.config.allowedUserIds.includes(event.operator.openId)) {
        this.options.log(`[feishu] 非白名单用户 ${event.operator.openId} 点了审批按钮，忽略`)
        return
      }
      this.settle(approvalId, decision, event.operator.name ?? event.operator.openId)
    })

    channel.on('reject', (event) => {
      this.options.log(`[feishu] 消息被策略拒绝：${event.reason}（chat=${event.chatId} sender=${event.senderId}）`)
    })
    channel.on('error', (error) => { this.options.log(`[feishu] 错误：${error.code} ${error.message}`) })
    channel.on('reconnecting', () => { this.options.log('[feishu] 连接断开，重连中') })
    channel.on('reconnected', () => { this.options.log('[feishu] 已重连') })

    await channel.connect()
    this.options.log('[feishu] 长连接已建立')
  }

  async stop(): Promise<void> {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.resolve('reject')
      this.pending.delete(id)
    }
    await this.channel?.disconnect()
    this.channel = undefined
  }

  isConnected(): boolean {
    return this.channel?.getConnectionStatus()?.state === 'connected'
  }

  private require(): LarkChannel {
    if (this.channel === undefined) throw new Error('飞书通道尚未启动')
    return this.channel
  }

  async send(chatId: string, text: string, replyTo?: string): Promise<void> {
    await this.require().send(chatId, { markdown: text }, replyTo === undefined ? undefined : { replyTo })
  }

  /** 以流式卡片回复 agent 的输出。 */
  async streamReply(chatId: string, pipe: OutputPipe, replyTo?: string): Promise<void> {
    await this.require().stream(
      chatId,
      { markdown: async (controller) => { await pipe.drainTo((chunk) => controller.append(chunk)) } },
      replyTo === undefined ? undefined : { replyTo },
    )
  }

  /** 发一张审批卡片并等人点按钮。 */
  async askApproval(input: {
    chatId: string
    toolName: string
    summary: string
    reason?: string
    arguments?: string
  }): Promise<ApprovalDecision> {
    this.approvalSeq += 1
    const approvalId = `ap-${String(Date.now())}-${String(this.approvalSeq)}`
    const card = this.approvalCard(approvalId, input)
    const { messageId } = await this.require().send(input.chatId, { card })

    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => { this.settle(approvalId, 'reject', '超时') }, APPROVAL_TIMEOUT_MS)
      this.pending.set(approvalId, { chatId: input.chatId, messageId, summary: input.summary, resolve, timer })
    })
  }

  private settle(approvalId: string, decision: ApprovalDecision, by: string): void {
    const entry = this.pending.get(approvalId)
    if (entry === undefined) return
    this.pending.delete(approvalId)
    clearTimeout(entry.timer)
    entry.resolve(decision)
    const label = decision === 'reject' ? '已拒绝' : decision === 'allow-always' ? '已允许（本会话内同类操作不再询问）' : '已允许一次'
    void this.require()
      .updateCard(entry.messageId, this.resultCard(entry.summary, label, by))
      .catch((error: unknown) => { this.options.log(`[feishu] 更新审批卡片失败：${String(error)}`) })
  }

  private approvalCard(approvalId: string, input: { toolName: string; summary: string; reason?: string; arguments?: string }): object {
    const elements: object[] = [
      { tag: 'div', text: { tag: 'lark_md', content: `**操作**\n\`${input.summary.replaceAll('`', "'")}\`` } },
    ]
    if (input.reason !== undefined && input.reason !== '') {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**agent 给出的理由**\n${input.reason}` } })
    }
    if (input.arguments !== undefined && input.arguments !== '') {
      const shown = input.arguments.length > 800 ? `${input.arguments.slice(0, 800)}…` : input.arguments
      elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: shown }] })
    }
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '允许一次' },
          type: 'primary',
          value: { approvalId, decision: 'allow-once' },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: `本会话内都允许 ${input.toolName}` },
          type: 'default',
          value: { approvalId, decision: 'allow-always' },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '拒绝' },
          type: 'danger',
          value: { approvalId, decision: 'reject' },
        },
      ],
    })
    return {
      config: { wide_screen_mode: true },
      header: { title: { tag: 'plain_text', content: '需要你授权' }, template: 'orange' },
      elements,
    }
  }

  private resultCard(summary: string, label: string, by: string): object {
    return {
      config: { wide_screen_mode: true },
      header: { title: { tag: 'plain_text', content: label }, template: label.startsWith('已拒绝') ? 'red' : 'green' },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: `\`${summary.replaceAll('`', "'")}\`` } },
        { tag: 'note', elements: [{ tag: 'plain_text', content: `处理人：${by}` }] },
      ],
    }
  }
}

export type { CardStreamController }
export { OutputPipe }
