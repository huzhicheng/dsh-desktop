/**
 * Harness 在线升级编排：
 * 检测（npm registry dist-tag）→ 后台安装到独立版本目录 → 原子切换 →
 * 重启服务验证 → 就绪失败自动回滚上一版本。
 * 整个过程 app 本体不动，升级的只是用户目录里的运行时。
 */

import { Notification, dialog } from 'electron'
import * as semver from 'semver'
import { APP_DISPLAY_NAME, UPDATE_CHECK_INTERVAL_MS } from './config'
import type { HarnessService } from './harness-service'
import { installVersion } from './installer'
import { log } from './logger'
import { harnessEntry } from './paths'
import { fetchLatestVersion } from './registry'
import { activateVersion, isMarkedBroken, pruneOldVersions, readCurrent, rollback } from './runtime-store'

export type UpdatePhase =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'downloading'; version: string; message: string }
  | { phase: 'restarting'; version: string }

export interface HarnessUpdater {
  /** 手动或定时触发一次检查与升级。interactive 为真时弹窗反馈结果。 */
  check(options?: { interactive?: boolean }): Promise<void>
  /** 启动定时检查。 */
  schedule(): void
  readonly phase: UpdatePhase
}

export interface HarnessUpdaterOptions {
  service: HarnessService
  /** 服务换版本重启完成后回调（主窗口需要跳到新 origin）。 */
  onServiceRestarted: (origin: string) => void
  /** 升级状态变化回调（刷新托盘菜单）。 */
  onPhaseChange?: (phase: UpdatePhase) => void
}

export function createHarnessUpdater(options: HarnessUpdaterOptions): HarnessUpdater {
  let phase: UpdatePhase = { phase: 'idle' }
  let running = false

  const setPhase = (next: UpdatePhase): void => {
    phase = next
    options.onPhaseChange?.(next)
  }

  const notify = (title: string, body: string): void => {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  }

  async function applyUpdate(version: string, registry: string, interactive: boolean): Promise<void> {
    setPhase({ phase: 'downloading', version, message: '开始下载' })
    await installVersion(version, registry, (progress) => {
      setPhase({ phase: 'downloading', version, message: progress.message })
    })
    await activateVersion(version)

    setPhase({ phase: 'restarting', version })
    try {
      const origin = await options.service.restart(harnessEntry(version))
      await pruneOldVersions()
      options.onServiceRestarted(origin)
      notify(APP_DISPLAY_NAME, `Harness 已升级到 ${version}`)
      log.info(`升级完成并已生效：${version}`)
    } catch (error) {
      log.error(`新版本 ${version} 启动失败，尝试回滚`, error)
      const fallback = await rollback(version)
      if (fallback === undefined) throw error
      const origin = await options.service.restart(harnessEntry(fallback))
      options.onServiceRestarted(origin)
      const detail = error instanceof Error ? error.message : String(error)
      if (interactive) {
        await dialog.showMessageBox({
          type: 'warning',
          title: APP_DISPLAY_NAME,
          message: `新版本 ${version} 启动失败，已自动回滚到 ${fallback}`,
          detail,
        })
      } else {
        notify(APP_DISPLAY_NAME, `新版本 ${version} 启动失败，已自动回滚到 ${fallback}`)
      }
    }
  }

  async function check(checkOptions: { interactive?: boolean } = {}): Promise<void> {
    const interactive = checkOptions.interactive ?? false
    if (running) {
      if (interactive) {
        await dialog.showMessageBox({ type: 'info', title: APP_DISPLAY_NAME, message: '正在升级中，请稍候' })
      }
      return
    }
    running = true
    setPhase({ phase: 'checking' })
    try {
      const current = await readCurrent()
      log.info('主界面已就绪，开始联网检查 Harness 更新…')
      const latest = await fetchLatestVersion()
      const currentVersion = current?.version
      const hasUpdate = currentVersion === undefined || semver.gt(latest.version, currentVersion)

      if (!hasUpdate) {
        log.info(`已是最新版本：${currentVersion ?? '未安装'}（registry: ${latest.version}）`)
        if (interactive) {
          await dialog.showMessageBox({
            type: 'info',
            title: APP_DISPLAY_NAME,
            message: `当前 Harness ${currentVersion ?? ''} 已是最新版本`,
          })
        }
        return
      }
      if (await isMarkedBroken(latest.version)) {
        log.warn(`跳过曾启动失败的版本：${latest.version}`)
        if (interactive) {
          await dialog.showMessageBox({
            type: 'warning',
            title: APP_DISPLAY_NAME,
            message: `新版本 ${latest.version} 此前在本机启动失败，已跳过`,
            detail: '待上游发布修复版本后会自动恢复升级。',
          })
        }
        return
      }

      log.info(`发现新版本：${currentVersion ?? '无'} → ${latest.version}`)
      if (interactive) {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          title: APP_DISPLAY_NAME,
          message: `发现 Harness 新版本 ${latest.version}`,
          detail: `当前版本 ${currentVersion ?? '未安装'}。升级会在后台下载安装，完成后自动重启本地服务（页面会刷新，运行中的任务会中断）。`,
          buttons: ['立即升级', '暂不升级'],
          cancelId: 1,
          defaultId: 0,
        })
        if (response !== 0) return
      } else {
        notify(APP_DISPLAY_NAME, `发现 Harness 新版本 ${latest.version}，正在后台升级…`)
      }
      await applyUpdate(latest.version, latest.registry, interactive)
    } catch (error) {
      log.error('升级检查失败', error)
      if (interactive) {
        await dialog.showMessageBox({
          type: 'error',
          title: APP_DISPLAY_NAME,
          message: '检查更新失败',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      running = false
      setPhase({ phase: 'idle' })
    }
  }

  return {
    check,
    schedule() {
      setInterval(() => {
        void check({ interactive: false })
      }, UPDATE_CHECK_INTERVAL_MS)
    },
    get phase() {
      return phase
    },
  }
}
