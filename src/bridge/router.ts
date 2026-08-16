/**
 * 通道路由：把多个 IM 通道合成一个 Channel 交给核心。
 *
 * 核心只认一个「会话标识」，但多通道并存时必须知道该把回复发回哪家，
 * 所以对外统一用 `通道名:原会话id`（例如 `telegram:12345`）。
 * 各通道自身不需要知道这件事——前缀由本模块加、也由本模块剥。
 */

import type { ApprovalDecision, ApprovalRequest, Channel } from './types'
import type { OutputPipe } from './output'

/** 给某个通道的会话标识加上前缀。 */
export function tagChatKey(channelName: string, chatId: string): string {
  return `${channelName}:${chatId}`
}

export class ChannelRouter implements Channel {
  readonly name = 'router'
  private readonly channels: readonly Channel[]
  private readonly log: (line: string) => void

  constructor(channels: readonly Channel[], log: (line: string) => void) {
    this.channels = channels
    this.log = log
  }

  /** 拆出目标通道与它自己的会话 id。 */
  private resolve(chatKey: string): { channel: Channel; chatId: string } {
    const at = chatKey.indexOf(':')
    const name = at < 0 ? '' : chatKey.slice(0, at)
    const channel = this.channels.find(item => item.name === name)
    if (channel === undefined) {
      throw new Error(`会话 ${chatKey} 没有对应的通道（可能是配置改动后残留的旧会话）`)
    }
    return { channel, chatId: chatKey.slice(at + 1) }
  }

  /**
   * 逐个启动。单个通道起不来不影响其余——用户可能只配好了其中一个，
   * 没道理因为 Telegram 的 token 填错就把已经能用的飞书也停掉。
   */
  async start(): Promise<void> {
    const failures: string[] = []
    for (const channel of this.channels) {
      try {
        await channel.start()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`${channel.name}：${message}`)
        this.log(`[bridge] 通道 ${channel.name} 启动失败：${message}`)
      }
    }
    if (failures.length === this.channels.length) {
      throw new Error(`所有通道均未能启动。${failures.join('；')}`)
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.channels.map(channel => channel.stop()))
  }

  async send(chatKey: string, text: string, replyTo?: string): Promise<void> {
    const { channel, chatId } = this.resolve(chatKey)
    await channel.send(chatId, text, replyTo)
  }

  async streamReply(chatKey: string, pipe: OutputPipe, replyTo?: string): Promise<void> {
    const { channel, chatId } = this.resolve(chatKey)
    await channel.streamReply(chatId, pipe, replyTo)
  }

  async askApproval(input: ApprovalRequest): Promise<ApprovalDecision> {
    const { channel, chatId } = this.resolve(input.chatId)
    return channel.askApproval({ ...input, chatId })
  }
}
