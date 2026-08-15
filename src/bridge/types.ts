/** 桥接器的配置与通道抽象：飞书是第一个实现，QQ（OneBot）按同一组接口再加即可。 */

/** 权限姿态。IM 场景默认 read-only：任何写入都要人在聊天里点头。 */
export type PermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export interface WorkspaceEntry {
  /** 聊天里用来切换的短名，如「产品站」。 */
  name: string
  /** 绝对路径。 */
  path: string
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

/** 一个 IM 通道要实现的东西。 */
export interface Channel {
  readonly name: string
  start(): Promise<void>
  stop(): Promise<void>
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
