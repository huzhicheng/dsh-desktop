/** 启动/错误状态小窗。主窗口在 shell-window.ts。 */

import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { APP_DISPLAY_NAME } from './config'

let statusWindow: BrowserWindow | undefined

/** 启动状态小窗（无边框，纯本地页面）。 */
export function showStatusWindow(): void {
  if (statusWindow !== undefined && !statusWindow.isDestroyed()) return
  statusWindow = new BrowserWindow({
    width: 420,
    height: 260,
    resizable: false,
    frame: false,
    show: false,
    title: APP_DISPLAY_NAME,
    webPreferences: {
      preload: join(__dirname, '../preload/status.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void statusWindow.loadFile(join(__dirname, '../status/status.html'))
  statusWindow.once('ready-to-show', () => { statusWindow?.show() })
  statusWindow.on('closed', () => { statusWindow = undefined })
}

export function pushStatus(update: { stage: string; message: string; error?: string }): void {
  if (statusWindow !== undefined && !statusWindow.isDestroyed()) {
    statusWindow.webContents.send('status', update)
  }
}

export function closeStatusWindow(): void {
  statusWindow?.close()
  statusWindow = undefined
}

let settingsWindow: BrowserWindow | undefined

/** 远程控制设置窗口。 */
export function showBridgeSettings(): void {
  if (settingsWindow !== undefined && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 520,
    title: '远程控制',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // 兜底：这个窗口只该显示本地设置页。任何指向外部的跳转或新开窗口
  // 一律交给系统默认浏览器，避免把第三方登录页装进应用内置窗口。
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  settingsWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  void settingsWindow.loadFile(join(__dirname, '../settings/settings.html'))
  settingsWindow.once('ready-to-show', () => { settingsWindow?.show() })
  settingsWindow.on('closed', () => { settingsWindow = undefined })
}

/** 把扫码创建的过程状态推给设置窗口（没开则忽略）。 */
export function pushBridgeRegister(event: unknown): void {
  if (settingsWindow !== undefined && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('bridge:register', event)
  }
}

/** 把桥接状态推给设置窗口（没开则忽略）。 */
export function pushBridgeStatus(status: { state: string; message?: string }): void {
  if (settingsWindow !== undefined && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('bridge:status', status)
  }
}

export function bridgeSettingsWindow(): BrowserWindow | undefined {
  return settingsWindow !== undefined && !settingsWindow.isDestroyed() ? settingsWindow : undefined
}
