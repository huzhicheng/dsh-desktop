import type { OutputPipe } from './output'

/** 桥接器的配置与通道抽象：飞书是第一个实现，QQ（OneBot）按同一组接口再加即可。 */

/** 权限姿态。IM 场景默认 read-only：任何写入都要人在聊天里点头。 */
export type PermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export interface WorkspaceEntry {
  /** 聊天里用来切换的短名，如「产品站」。 */
  name: string
  /** 绝对路径。 */
  path: string
}

/** Telegram：BotFather 给的那串 token 就是全部配置，长轮询免公网。 */
export interface TelegramConfig {
  enabled: boolean
  token: string
}

export interface FeishuConfig {
  enabled: boolean
  appId: string
  appSecret: string
  /** 自建应用一般用 feishu；国际版 Lark 填 lark。 */
  domain: 'feishu' | 'lark'
}

export interface BridgeConfig {
  feishu: FeishuConfig
  telegram: TelegramConfig
  /** 允许驱动 agent 的人（飞书 open_id）。空表示谁都不允许，防止误配成全员可用。 */
  allowedUserIds: string[]
  /** 预配的工作目录，聊天里用 /cd 切换。 */
  workspaces: WorkspaceEntry[]
  /** 新会话默认落在哪个工作目录（工作目录名）。 */
  defaultWorkspace?: string
  permissionMode: PermissionMode
  /** 会话闲置多久后回收 ACP 进程。 */
  idleTimeoutMs: number
  /** 单条任务的最长等待时间，超时按取消处理。 */
  promptTimeoutMs: number
}

export const DEFAULT_CONFIG: BridgeConfig = {
  feishu: { enabled: false, appId: '', appSecret: '', domain: 'feishu' },
  telegram: { enabled: false, token: '' },
  allowedUserIds: [],
  workspaces: [],
  permissionMode: 'read-only',
  idleTimeoutMs: 30 * 60 * 1000,
  promptTimeoutMs: 15 * 60 * 1000,
}

/** 审批决定。allowAlways 是桥接层自己的记忆，ACP 只认一次性允许。 */
export type ApprovalDecision = 'allow-once' | 'allow-always' | 'reject'

export interface ApprovalAsk {
  /** 发起会话（聊天）标识。 */
  chatKey: string
  toolName: string
  /** 一行摘要，可直接作卡片标题。 */
  summary: string
  /** agent 自己写的升权理由。 */
  reason?: string
  /** 工具入参原文，卡片里折叠展示。 */
  arguments?: string
}

/**
 * 一个 IM 通道要实现的东西。
 *
 * 各家平台的输出能力差别很大：飞书有流式卡片、Telegram 与 Discord 能编辑已发
 * 消息、有的只能整条发。差异全部收敛在 streamReply 与 askApproval 的实现里，
 * 核心逻辑只面对这组接口。
 */
export interface Channel {
  readonly name: string
  start(): Promise<void>
  stop(): Promise<void>
  /**
   * 发一条消息。
   * @param chatId - 会话标识，由通道自己解释。
   * @param text - Markdown 文本；不支持富文本的通道自行降级。
   * @param replyTo - 要回复的原消息 id。
   */
  send(chatId: string, text: string, replyTo?: string): Promise<void>
  /**
   * 流式回复：持续把 pipe 里的内容送出去，直到它关闭。
   * 能编辑消息的通道刷成打字机效果，不能的攒够再发。
   */
  streamReply(chatId: string, pipe: OutputPipe, replyTo?: string): Promise<void>
  /**
   * 请求人工审批某次工具调用，阻塞到用户决定或超时。
   * 有交互按钮的通道用按钮，没有的退化成「回复 y / n」。
   */
  askApproval(input: ApprovalRequest): Promise<ApprovalDecision>
}

/** 一次审批请求要展示给用户的信息。 */
export interface ApprovalRequest {
  chatId: string
  toolName: string
  summary: string
  reason?: string
  /** 工具入参原文，折叠展示。 */
  arguments?: string
}

/** 桥接核心暴露给通道的能力。 */
export interface BridgeCore {
  /** 收到一条用户消息。 */
  handleMessage(input: {
    chatKey: string
    userId: string
    text: string
    /** 回复该条消息用的原始 id，通道自己解释。 */
    replyTo?: string
  }): Promise<void>
}
