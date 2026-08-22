/** 系统托盘：常驻入口，展示版本、触发升级检查、退出。 */

import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import { log } from './logger'
import { APP_DISPLAY_NAME } from './config'
import type { AppUpdateState } from './app-update'
import type { UpdatePhase } from './updater'

export interface TrayDeps {
  openMainWindow: () => void
  checkUpdate: () => void
  /** 检查应用本体的新版本（换壳要重新下载安装包，只能提示）。 */
  checkAppUpdate: () => void
  restartService: () => void
  openLogs: () => void
  openBridgeSettings: () => void
  quit: () => void
  getVersion: () => string | undefined
  getPhase: () => UpdatePhase
  getAppUpdate: () => AppUpdateState | undefined
  getBridgeState: () => 'stopped' | 'starting' | 'connected' | 'error'
}

let tray: Tray | undefined

/**
 * 托盘图标由 `npm run icons` 生成。
 *
 * 两个平台都用彩色产品 Logo。
 *
 * macOS 这边是刻意不走「模板图」那条路的。模板图（纯黑 + 透明）能让系统自动适配
 * 深浅色菜单栏，是官方推荐做法，代价是只能单色——而菜单栏里一排应用图标时，
 * 单色剪影很难一眼认出是哪个。这里选择辨识度，接受两个后果：图标不随系统深浅色
 * 变化，且缩到 16pt 后插画细节会损失。
 *
 * 尺寸上 macOS 菜单栏按 16pt 排版，所以传 22px 那张会被压扁；仍用 16/32 这一对，
 * Retina 上由 @2x 那张顶上。Windows 没有模板图机制，按当前 DPI 缩到通知区域尺寸。
 *
 * 取不到文件时退回空图：宁可菜单栏图标是空的，也不该让托盘创建失败、
 * 导致用户连退出菜单都没有。
 */
function trayIcon(): Electron.NativeImage {
  const file = app.isPackaged
    ? join(process.resourcesPath, 'trayIcon.png')
    : join(__dirname, '../../resources/trayIcon.png')
  const image = nativeImage.createFromPath(file)
  if (image.isEmpty()) {
    log.warn(`菜单栏图标缺失：${file}`)
    return nativeImage.createEmpty()
  }
  // 菜单栏按 16pt 排版；不缩的话 32px 原图会把菜单栏撑高
  return process.platform === 'darwin'
    ? image.resize({ width: 16, height: 16, quality: 'best' })
    : image
}

export function createTray(deps: TrayDeps): void {
  tray = new Tray(trayIcon())
  tray.setToolTip(APP_DISPLAY_NAME)
  refreshTray(deps)
  tray.on('click', () => { deps.openMainWindow() })
  tray.on('double-click', () => { deps.openMainWindow() })
}

export function refreshTray(deps: TrayDeps): void {
  if (tray === undefined) return
  const version = deps.getVersion()
  const phase = deps.getPhase()
  const phaseLabel = phase.phase === 'checking'
    ? '正在检查更新…'
    : phase.phase === 'downloading'
      ? `正在升级到 ${phase.version} …`
      : phase.phase === 'restarting'
        ? `正在重启服务（${phase.version}）…`
        : undefined
  const bridgeLabel = {
    connected: '远程控制：已连接',
    starting: '远程控制：连接中…',
    error: '远程控制：异常',
    stopped: '远程控制：未启用',
  }[deps.getBridgeState()]
  // 应用自身的版本也要显示：机器上可能同时存在正式安装、本地构建、开发态
  // 三份，只显示 Harness 版本的话根本分不出跑的是哪一个（实测被这个坑过）
  const appUpdate = deps.getAppUpdate()
  const appSuffix = appUpdate?.hasUpdate === true ? `　可更新到 ${appUpdate.latest}` : ''
  const appLabel = `${APP_DISPLAY_NAME} ${app.getVersion()}${app.isPackaged ? '' : '（开发态）'}${appSuffix}`
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: appLabel, enabled: false },
    { label: version === undefined ? 'Harness 未安装' : `Harness ${version}`, enabled: false },
    ...(phaseLabel === undefined ? [] : [{ label: phaseLabel, enabled: false }]),
    { label: bridgeLabel, enabled: false },
    { type: 'separator' },
    { label: '打开主窗口', click: () => { deps.openMainWindow() } },
    { label: '远程控制设置…', click: () => { deps.openBridgeSettings() } },
    { label: '检查 Harness 更新', enabled: phase.phase === 'idle', click: () => { deps.checkUpdate() } },
    {
      label: appUpdate?.checking === true ? '正在检查应用更新…' : '检查应用更新',
      enabled: appUpdate?.checking !== true,
      click: () => { deps.checkAppUpdate() },
    },
    { label: '重启 Harness 服务', enabled: phase.phase === 'idle', click: () => { deps.restartService() } },
    { label: '打开日志目录', click: () => { deps.openLogs() } },
    { type: 'separator' },
    { label: `退出 ${APP_DISPLAY_NAME}`, click: () => { deps.quit() } },
  ]))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = undefined
}
