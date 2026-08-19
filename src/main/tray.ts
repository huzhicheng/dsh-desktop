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
 * macOS 要求菜单栏图标是「模板图」（纯黑 + 透明），系统据此自动适配深浅色，
 * 所以这里用的是单色鲸鱼剪影而不是彩色 logo——那张插画缩到 16pt 会糊成色块。
 * Windows 没有模板图机制，且黑色剪影在深色任务栏上几乎不可见，所以单独使用
 * 32px 彩色产品 Logo；Windows 会按当前 DPI 缩到通知区域的实际尺寸。
 *
 * 取不到文件时退回空图：宁可菜单栏图标是空的，也不该让托盘创建失败、
 * 导致用户连退出菜单都没有。
 */
function trayIcon(): Electron.NativeImage {
  const name = process.platform === 'win32' ? 'trayIcon.png' : 'trayTemplate.png'
  const file = app.isPackaged
    ? join(process.resourcesPath, name)
    : join(__dirname, '../../resources', name)
  const image = nativeImage.createFromPath(file)
  if (image.isEmpty()) {
    log.warn(`菜单栏图标缺失：${file}`)
    return nativeImage.createEmpty()
  }
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
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
