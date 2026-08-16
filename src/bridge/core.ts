/**
 * 桥接核心：把一条聊天消息翻译成一次 agent 任务，并决定回什么。
 * 通道（飞书 / 以后的 QQ）只负责收发，规则都在这里。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { AcpPool } from './acp'
import { OutputPipe } from './output'
import type { BridgeConfig, WorkspaceEntry, Channel } from './types'

interface ChatState {
  /** 当前工作目录名。 */
  workspace?: string
}

const HELP = [
  '**可用指令**',
  '`/ls` 列出可用的工作目录',
  '`/cd 名称` 切换工作目录（会开一个新会话）',
  '`/new` 在当前目录重开一个会话，清空上下文',
  '`/stop` 中断正在跑的任务',
  '`/status` 看当前状态',
  '',
  '直接发消息就是给 agent 派活。危险操作会弹卡片等你点允许。',
].join('\n')

export interface BridgeCoreOptions {
  config: BridgeConfig
  pool: AcpPool
  channel: Channel
  /** 会话与工作目录的绑定关系存哪。 */
  stateFile: string
  log: (message: string) => void
}

export class BridgeCore {
  private readonly options: BridgeCoreOptions
  private readonly chats = new Map<string, ChatState>()
  private readonly busy = new Set<string>()
  /** 正在接收 agent 输出的聊天，供 ACP 那侧把文本推进来。 */
  private readonly pipes = new Map<string, OutputPipe>()

  constructor(options: BridgeCoreOptions) {
    this.options = options
    this.load()
  }

  private get config(): BridgeConfig {
    return this.options.config
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.options.stateFile, 'utf8')) as Record<string, ChatState>
      for (const [chatId, state] of Object.entries(raw)) this.chats.set(chatId, state)
    } catch {
      // 首次运行没有状态文件
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.options.stateFile), { recursive: true })
      writeFileSync(this.options.stateFile, JSON.stringify(Object.fromEntries(this.chats), null, 2))
    } catch (error) {
      this.options.log(`[core] 保存会话状态失败：${String(error)}`)
    }
  }

  private workspaceOf(chatId: string): WorkspaceEntry | undefined {
    const name = this.chats.get(chatId)?.workspace ?? this.config.defaultWorkspace
    if (name === undefined) return undefined
    return this.config.workspaces.find((entry) => entry.name === name)
  }

  private listWorkspaces(): string {
    if (this.config.workspaces.length === 0) return '还没有配置任何工作目录，去桌面端「飞书桥接」设置里加。'
    return ['**可用工作目录**', ...this.config.workspaces.map((entry) => `- \`${entry.name}\` — ${entry.path}`)].join('\n')
  }

  /** ACP 提交一段 assistant 文本时调这里，转进对应聊天的流式卡片。 */
  pushText(chatId: string, text: string): void {
    this.pipes.get(chatId)?.push(text)
  }

  /** 通道收到消息后调这里。 */
  async handleMessage(input: { chatId: string; userId: string; text: string; messageId: string }): Promise<void> {
    const { chatId, text, messageId } = input
    const trimmed = text.trim()
    const reply = async (body: string): Promise<void> => {
      try {
        await this.options.channel.send(chatId, body, messageId)
      } catch (error) {
        this.options.log(`[core] 回复失败：${String(error)}`)
      }
    }

    if (trimmed.startsWith('/') || trimmed.startsWith('／')) {
      await this.handleCommand(chatId, trimmed.replace(/^／/, '/'), reply)
      return
    }

    const workspace = this.workspaceOf(chatId)
    if (workspace === undefined) {
      await reply(`还没选工作目录，先用 \`/cd 名称\` 选一个。\n\n${this.listWorkspaces()}`)
      return
    }
    if (this.busy.has(chatId)) {
      await reply('上一条还在跑，等它结束，或者发 `/stop` 中断。')
      return
    }

    this.busy.add(chatId)
    const pipe = new OutputPipe()
    this.pipes.set(chatId, pipe)
    const streaming = this.options.channel.streamReply(chatId, pipe, messageId)
      .catch((error: unknown) => { this.options.log(`[core] 流式回复失败：${String(error)}`) })

    try {
      const stopReason = await this.options.pool.prompt(chatId, workspace.path, trimmed)
      if (stopReason === 'cancelled') pipe.close('_任务已中断。_')
      else if (stopReason !== 'end_turn') pipe.close(`_结束原因：${stopReason}_`)
      else pipe.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.log(`[core] 任务失败：${message}`)
      pipe.close(message === 'timeout' ? '_任务超时，已中断。_' : `_出错了：${message}_`)
    } finally {
      this.busy.delete(chatId)
      this.pipes.delete(chatId)
      await streaming
    }
  }

  private async handleCommand(chatId: string, command: string, reply: (body: string) => Promise<void>): Promise<void> {
    const [head = '', ...rest] = command.slice(1).split(/\s+/)
    const argument = rest.join(' ').trim()

    switch (head) {
      case 'help': case '帮助': {
        await reply(HELP)
        return
      }
      case 'ls': case '目录': {
        await reply(this.listWorkspaces())
        return
      }
      case 'cd': case '切换': {
        if (argument === '') {
          await reply(`用法：\`/cd 名称\`\n\n${this.listWorkspaces()}`)
          return
        }
        const target = this.config.workspaces.find((entry) => entry.name === argument)
        if (target === undefined) {
          await reply(`没有叫 \`${argument}\` 的工作目录。\n\n${this.listWorkspaces()}`)
          return
        }
        this.options.pool.forget(chatId)
        this.chats.set(chatId, { workspace: target.name })
        this.save()
        await reply(`已切到 \`${target.name}\`（${target.path}），会话已重开。`)
        return
      }
      case 'new': case '新会话': {
        this.options.pool.forget(chatId)
        const workspace = this.workspaceOf(chatId)
        await reply(workspace === undefined ? '会话已清空。' : `会话已重开，工作目录 \`${workspace.name}\`。`)
        return
      }
      case 'stop': case '停': case '中断': {
        const workspace = this.workspaceOf(chatId)
        if (workspace === undefined) {
          await reply('当前没有会话。')
          return
        }
        const cancelled = await this.options.pool.cancel(chatId, workspace.path)
        await reply(cancelled ? '已发出中断。' : '当前没有正在跑的任务。')
        return
      }
      case 'status': case '状态': {
        const workspace = this.workspaceOf(chatId)
        const lines = [
          `工作目录：${workspace === undefined ? '未选择' : `\`${workspace.name}\` — ${workspace.path}`}`,
          `权限模式：${this.config.permissionMode}`,
          `当前状态：${this.busy.has(chatId) ? '正在跑任务' : '空闲'}`,
          `会话：${workspace !== undefined && this.options.pool.hasSession(chatId, workspace.path) ? '进行中（有上下文）' : '尚未开始'}`,
        ]
        await reply(lines.join('\n'))
        return
      }
      default: {
        await reply(`不认识的指令 \`/${head}\`。\n\n${HELP}`)
      }
    }
  }
}
