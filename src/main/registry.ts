/** 查询 npm registry：上游一发新版（dist-tag），桌面端即可感知。 */

import { HARNESS_PACKAGE, REGISTRIES, UPDATE_CHANNEL, UPDATE_CHANNEL_FALLBACK } from './config'
import { log } from './logger'

export interface LatestInfo {
  version: string
  /** 本次实际响应成功的 registry，下载安装时沿用它。 */
  registry: string
}

/** 依次尝试各 registry，返回目标 dist-tag 指向的最新版本。 */
export async function fetchLatestVersion(): Promise<LatestInfo> {
  const escaped = HARNESS_PACKAGE.replace('/', '%2F')
  let lastError: unknown
  for (const registry of REGISTRIES) {
    try {
      const response = await fetch(`${registry}/${escaped}`, {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json() as { 'dist-tags'?: Record<string, string> }
      const tags = body['dist-tags']
      // 上游哪天不再维护 next，退回 latest，别让升级整个失效
      const version = tags?.[UPDATE_CHANNEL] ?? tags?.[UPDATE_CHANNEL_FALLBACK]
      if (version === undefined) {
        throw new Error(`registry 响应缺少 dist-tag "${UPDATE_CHANNEL}" 与 "${UPDATE_CHANNEL_FALLBACK}"`)
      }
      if (tags?.[UPDATE_CHANNEL] === undefined) {
        log.warn(`dist-tag "${UPDATE_CHANNEL}" 不存在，本次改用 "${UPDATE_CHANNEL_FALLBACK}"`)
      }
      return { version, registry }
    } catch (error) {
      lastError = error
      log.warn(`查询 ${registry} 失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`所有 registry 均不可达：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
