/**
 * 桥接进程入口。由桌面壳用内置 Node 拉起，独立于 Electron 主进程，
 * 这样长连接断线、SDK 抛错都不会带倒界面。
 *
 * 与父进程的约定：状态走 stdout 的 JSON 行，日志走 stderr。
 */

import { readFileSync } from 'node:fs'
import { AcpPool } from './acp'
import { BridgeCore } from './core'
import { FeishuChannel } from './feishu'
import { ChannelRouter, tagChatKey } from './router'
import { TelegramChannel } from './telegram'
import type { Channel } from './types'
import { DEFAULT_CONFIG, type BridgeConfig } from './types'

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`缺少环境变量 ${name}`)
  return value
}

function report(state: 'starting' | 'connected' | 'error' | 'stopped', message?: string): void {
  process.stdout.write(`${JSON.stringify({ type: 'status', state, message })}\n`)
}

function log(message: string): void {
  process.stderr.write(`${message}\n`)
}

function loadConfig(file: string): BridgeConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<BridgeConfig>
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    feishu: { ...DEFAULT_CONFIG.feishu, ...raw.feishu },
  }
}

async function main(): Promise<void> {
  const config = loadConfig(required('BRIDGE_CONFIG_FILE'))
  report('starting')

  // pool 要往 core 推文本、core 要用 channel 发卡片，三者互相引用，
  // 用一个可变引用把环打开（回调都在启动完成后才会被调到）。
  const channelRef: { current: Channel | undefined } = { current: undefined }
  const coreRef: { current: BridgeCore | undefined } = { current: undefined }

  const pool = new AcpPool({
    nodePath: required('BRIDGE_NODE_PATH'),
    dshEntry: required('BRIDGE_DSH_ENTRY'),
    dshHome: required('BRIDGE_DSH_HOME'),
    permissionMode: config.permissionMode,
    idleTimeoutMs: config.idleTimeoutMs,
    promptTimeoutMs: config.promptTimeoutMs,
    onText: (chatKey, text) => { coreRef.current?.pushText(chatKey, text) },
    onApproval: async (ask) => {
      const channel = channelRef.current
      if (channel === undefined) return 'reject'
      try {
        return await channel.askApproval({
          chatId: ask.chatKey,
          toolName: ask.toolName,
          summary: ask.summary,
          reason: ask.reason,
          arguments: ask.arguments,
        })
      } catch (error) {
        log(`[bridge] 发审批卡片失败，按拒绝处理：${String(error)}`)
        return 'reject'
      }
    },
    log,
  })

  // 按启用状态装配通道。会话标识统一加 `通道名:` 前缀，回复才知道发回哪家；
  // 前缀在这里加、由 ChannelRouter 剥，各通道自身不必知道这件事。
  const deliver = (channelName: string) => (input: {
    chatId: string; userId: string; text: string; messageId: string
  }): void => {
    void coreRef.current
      ?.handleMessage({ ...input, chatId: tagChatKey(channelName, input.chatId) })
      .catch((error: unknown) => { log(`[bridge] 处理消息失败：${String(error)}`) })
  }

  const channels: Channel[] = []
  if (config.feishu.enabled) {
    channels.push(new FeishuChannel({ config, onMessage: deliver('feishu'), log }))
  }
  if (config.telegram.enabled) {
    channels.push(new TelegramChannel({ getConfig: () => config, onMessage: deliver('telegram'), log }))
  }
  if (channels.length === 0) throw new Error('没有启用任何通道')
  log(`[bridge] 已装配通道：${channels.map(item => item.name).join('、')}`)

  const channel = new ChannelRouter(channels, log)
  channelRef.current = channel

  const core = new BridgeCore({
    config,
    pool,
    channel,
    stateFile: required('BRIDGE_STATE_FILE'),
    log,
  })
  coreRef.current = core

  const shutdown = (): void => {
    report('stopped')
    void channel.stop().finally(() => {
      pool.dispose()
      process.exit(0)
    })
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  try {
    await channel.start()
    report('connected')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    report('error', message)
    log(`[bridge] 启动失败：${message}`)
    pool.dispose()
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  report('error', message)
  log(`[bridge] 未捕获错误：${message}`)
  process.exit(1)
})
