/**
 * 飞书应用扫码创建。
 *
 * 手动路径要用户去开放平台建应用、加机器人能力、导权限、设可用范围、发版本、
 * 配长连接、加事件、再发一次版本——八步网页操作，还有个顺序死结（必须先发版本、
 * 再起进程建连接、才能保存长连接配置）。绝大多数人卡在这里。
 *
 * 飞书官方 SDK 的 registerApp 走设备码流程：用户扫码确认一次，飞书那边就把
 * 应用创建、权限、事件订阅（默认长连接）全配好，并把 App ID / App Secret 与
 * 扫码人的 open_id 一起返回。用户一个字段都不用填。
 *
 * 这条路依赖平台灰度、且底层 HTTP 端点没有接口级公开文档，所以设置页始终保留
 * 手填兜底，扫码失败不影响手动配置。
 */

import { registerApp } from '@larksuiteoapi/node-sdk'
import QRCode from 'qrcode'
import { log } from './logger'

/** 只申请通道真正用得到的权限，多要一条都是给用户和管理员添审核负担。 */
const SCOPES = [
  // 收私聊消息（im.message.receive_v1 的前置权限）
  'im:message.p2p_msg:readonly',
  // 群里被 @ 时收消息
  'im:message.group_at_msg:readonly',
  // 以机器人身份回消息
  'im:message:send_as_bot',
  // 流式卡片：回复是逐字刷新的，需要卡片写权限
  'cardkit:card:write',
  // 反查应用 owner 的 open_id，手填兜底时用来自动补白名单
  'application:application:self_manage',
] as const

/** 只订阅「收到消息」，其余事件用不上。 */
const EVENTS = ['im.message.receive_v1'] as const

/** 扫码过程中推给界面的状态。 */
export type RegisterEvent =
  | { phase: 'qr'; qrDataUrl: string; url: string; expireIn: number }
  | { phase: 'polling' }
  | { phase: 'slow-down' }
  | { phase: 'done'; appId: string; domain: 'feishu' | 'lark'; openId?: string }
  | { phase: 'error'; message: string }
  | { phase: 'cancelled' }

export interface RegisterResult {
  appId: string
  appSecret: string
  domain: 'feishu' | 'lark'
  /** 扫码人的 open_id，用来自动填白名单，免去让用户自己去找。 */
  openId?: string
}

/** 同时只允许一次扫码流程；再点一次先取消上一次。 */
let controller: AbortController | undefined

/** 取消进行中的扫码流程（关闭设置页或用户点取消时调用）。 */
export function cancelFeishuRegistration(): void {
  controller?.abort()
  controller = undefined
}

/**
 * 走一次扫码创建。
 * @param onEvent - 过程状态回调，用于界面展示二维码与进度。
 * @returns 成功时返回凭据；用户取消或失败时返回 undefined。
 */
export async function startFeishuRegistration(
  onEvent: (event: RegisterEvent) => void,
): Promise<RegisterResult | undefined> {
  cancelFeishuRegistration()
  const abort = new AbortController()
  controller = abort

  try {
    const result = await registerApp({
      signal: abort.signal,
      // 只允许新建：避免用户误选一个已有应用，把它的回调配置覆盖掉
      createOnly: true,
      appPreset: {
        name: '{user} 的 DSH 助手',
        desc: '在本机运行的 DeepSeek Harness 智能体，通过飞书远程发起任务',
      },
      addons: {
        // 丢掉平台默认模板，从「仅机器人能力」的最小基座开始，只加下面声明的
        preset: false,
        scopes: { tenant: [...SCOPES] },
        events: { items: { tenant: [...EVENTS] } },
      },
      onQRCodeReady: (info) => {
        void QRCode.toDataURL(info.url, { margin: 1, width: 260 })
          .then((qrDataUrl) => {
            onEvent({ phase: 'qr', qrDataUrl, url: info.url, expireIn: info.expireIn })
          })
          .catch(() => {
            // 二维码画不出来不该中断流程，链接本身照样能点
            onEvent({ phase: 'qr', qrDataUrl: '', url: info.url, expireIn: info.expireIn })
          })
      },
      onStatusChange: (info) => {
        if (info.status === 'slow_down') onEvent({ phase: 'slow-down' })
        else if (info.status === 'polling') onEvent({ phase: 'polling' })
        // domain_switched 表示识别出是国际版 Lark 租户，已自动切域，无需打扰用户
      },
    })

    if (result.client_id === '' || result.client_secret === '') {
      onEvent({ phase: 'error', message: '飞书未返回完整凭据，请改用手动配置' })
      return undefined
    }

    const domain: 'feishu' | 'lark' = result.user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu'
    log.info(`飞书扫码创建成功：${result.client_id}（${domain}）`)
    onEvent({
      phase: 'done',
      appId: result.client_id,
      domain,
      ...(result.user_info?.open_id === undefined ? {} : { openId: result.user_info.open_id }),
    })
    return {
      appId: result.client_id,
      appSecret: result.client_secret,
      domain,
      ...(result.user_info?.open_id === undefined ? {} : { openId: result.user_info.open_id }),
    }
  } catch (error) {
    if (abort.signal.aborted) {
      onEvent({ phase: 'cancelled' })
      return undefined
    }
    const message = error instanceof Error ? error.message : String(error)
    log.warn('飞书扫码创建失败：', message)
    onEvent({ phase: 'error', message })
    return undefined
  } finally {
    if (controller === abort) controller = undefined
  }
}

/** 手填兜底时给用户复制的权限清单，粘进开放平台「批量导入权限」即可。 */
export function permissionJson(): string {
  return JSON.stringify({ scopes: { tenant: [...SCOPES], user: [] } }, undefined, 2)
}

/** 手填兜底时展示的事件清单。 */
export const REQUIRED_EVENTS: readonly string[] = EVENTS
