/**
 * 应用入口：单实例、启动流程编排、macOS 生命周期。
 *
 * 启动流程：准备运行环境（首启解压种子）→ 启动 Harness 服务 →
 * 主窗口加载本地 Web UI → 常驻托盘 → 定时在线升级。
 */

import { join } from 'node:path'
import { app, dialog, ipcMain, nativeImage, shell } from 'electron'
import { ensureAcpProfile } from './acp-profile'
import {
  anyChannelEnabled, bridgeHasSecret, bridgeHasTelegramToken, createBridgeService,
  readBridgeConfig, writeBridgeConfig,
} from './bridge-service'
import {
  cancelFeishuRegistration, permissionJson, REQUIRED_EVENTS, startFeishuRegistration,
} from './feishu-register'
import { APP_DISPLAY_NAME } from './config'
import { createHarnessService } from './harness-service'
import { initLogger, log } from './logger'
import { assertBundledToolchain, harnessEntry, logsDir } from './paths'
import { ensureBundledPlugins, writePluginsReadme } from './plugin-bootstrap'
import { ensurePnpmShim } from './pnpm-shim'
import { ensureSeedInstalled, readCurrent, rollback } from './runtime-store'
import { focusWindow, hasWindow, reloadHarness, showShellWindow } from './shell-window'
import { createTray, destroyTray, refreshTray, type TrayDeps } from './tray'
import { createHarnessUpdater, type HarnessUpdater } from './updater'
import {
  bridgeSettingsWindow, closeStatusWindow, pushBridgeRegister, pushBridgeStatus, pushStatus,
  showBridgeSettings, showStatusWindow,
} from './windows'
import type { BridgeConfig } from '../bridge/types'

const service = createHarnessService({
  onUnexpectedExit: () => { void recoverFromCrash() },
})
const bridge = createBridgeService({
  onStatus: (status) => {
    pushBridgeStatus(status)
    if (trayDeps !== undefined) refreshTray(trayDeps)
  },
})
let updater: HarnessUpdater | undefined
let trayDeps: TrayDeps | undefined
let quitting = false
let recovering = false

async function fatal(message: string, detail: string): Promise<never> {
  log.error(message, detail)
  pushStatus({ stage: 'error', message, error: detail })
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: APP_DISPLAY_NAME,
    message,
    detail,
    buttons: ['打开日志目录', '退出'],
    defaultId: 1,
  })
  if (response === 0) await shell.openPath(logsDir())
  quitting = true
  app.exit(1)
  throw new Error(message)
}

/** 服务运行中崩溃：先原版本重启一次，仍失败则提示退出。 */
async function recoverFromCrash(): Promise<void> {
  if (quitting || recovering) return
  recovering = true
  try {
    const current = await readCurrent()
    if (current === undefined) throw new Error('未找到可用的 Harness 运行时')
    log.warn('尝试自动重启 Harness 服务…')
    const origin = await service.restart(harnessEntry(current.version))
    await reloadHarness(origin)
    log.info('Harness 服务已自动恢复')
  } catch (error) {
    await fatal('Harness 服务已停止且自动恢复失败', error instanceof Error ? error.message : String(error))
  } finally {
    recovering = false
  }
}

/**
 * 启动服务。固定端口被占用时先换随机端口重试；仍失败才回滚到上一版本。
 * 固定端口是为了让浏览器端插件的 localStorage 配置在重启后仍能读到。
 */
async function startServiceWithFallback(version: string): Promise<string> {
  try {
    return await service.start(harnessEntry(version))
  } catch (portError) {
    log.warn('固定端口启动失败，改用系统分配的端口重试：',
      portError instanceof Error ? portError.message : String(portError))
    pushStatus({ stage: 'starting', message: '固定端口不可用，正在换端口重试…' })
    try {
      return await service.start(harnessEntry(version), 0)
    } catch (error) {
      log.error(`版本 ${version} 启动失败`, error)
      const fallback = await rollback(version)
      if (fallback === undefined) throw error
      pushStatus({ stage: 'starting', message: `版本 ${version} 启动失败，回退到 ${fallback} …` })
      return service.start(harnessEntry(fallback), 0)
    }
  }
}

/** 壳自身的自动更新（electron-updater）。未配置发布源时静默跳过。 */
async function checkShellUpdate(): Promise<void> {
  if (!app.isPackaged) return
  try {
    // electron-updater 是 CommonJS；原生 dynamic import 下 getter 只挂在 default 上，
    // 不能直接解构 named export，否则 Windows 打包态拿到 undefined。
    const imported = await import('electron-updater')
    const updaterModule = imported as unknown as {
      default?: { autoUpdater?: typeof imported.autoUpdater }
      autoUpdater?: typeof imported.autoUpdater
    }
    const shellUpdater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater
    if (shellUpdater === undefined) throw new Error('electron-updater 未导出 autoUpdater')
    shellUpdater.logger = { info: log.info, warn: log.warn, error: log.error, debug: () => {} }
    await shellUpdater.checkForUpdatesAndNotify()
  } catch (error) {
    log.warn('壳更新检查跳过：', error instanceof Error ? error.message : String(error))
  }
}

async function boot(): Promise<void> {
  const bootStartedAt = Date.now()
  // Windows 通知与任务栏归组依赖 AppUserModelID（与 electron-builder 的 appId 一致）
  if (process.platform === 'win32') app.setAppUserModelId('com.moon.dsh-desktop')
  // 开发态的 Dock 图标：打包后的图标来自 .app 里的 icns，而 `electron .` 直接
  // 跑的是 Electron 二进制、Dock 显示它自带的图标。这里手动设一下，
  // 免得开发时看到的图标和用户看到的不一致。
  if (process.platform === 'darwin' && !app.isPackaged) {
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
    if (!icon.isEmpty()) app.dock?.setIcon(icon)
  }
  initLogger(logsDir())
  log.info(`${APP_DISPLAY_NAME} 启动（app ${app.getVersion()}）`)
  try {
    assertBundledToolchain()
  } catch (error) {
    await fatal('应用文件不完整', error instanceof Error ? error.message : String(error))
  }

  showStatusWindow()
  pushStatus({
    stage: 'preparing',
    message: '正在检查本地运行环境…',
    detail: '启动过程全部在本机完成，当前不会下载文件。',
  })

  let state
  try {
    state = await ensureSeedInstalled((progress) => {
      if (progress.stage === 'extracting') {
        pushStatus({
          stage: 'extracting',
          message: `首次启动：正在解压 Harness ${progress.version}`,
          detail: process.platform === 'win32'
            ? '正在释放安装包内置资源。Windows 安全扫描可能让这一步持续 1～2 分钟，程序仍在正常运行。'
            : '正在释放安装包内置资源。首次解压可能需要几十秒，程序仍在正常运行。',
        })
      } else {
        pushStatus({
          stage: 'extracting',
          message: '正在校验解压后的运行环境…',
          detail: '资源已经解压完成，正在完成最后的本地检查。',
        })
      }
    })
  } catch (error) {
    return fatal('初始化运行环境失败', error instanceof Error ? error.message : String(error))
  }

  // 先备好 pnpm：Harness 进程要靠它在 Web UI 里安装插件
  pushStatus({
    stage: 'preparing',
    message: `本地运行环境 ${state.version} 已就绪`,
    detail: '正在准备插件支持，不会在此时下载插件。',
  })
  await ensurePnpmShim()

  // 随包分发的三个插件（插件管理 / 皮肤 / 远程控制）要在 dsh 启动前装好：
  // profile 是 dsh 启动时读的，装晚了得等下次重启才出现入口
  pushStatus({
    stage: 'preparing',
    message: '正在准备内置插件…',
    detail: '插件已随安装包分发，这一步在本机完成，不会联网下载。',
  })
  await writePluginsReadme()
  await ensureBundledPlugins(state.version)

  pushStatus({
    stage: 'starting',
    message: `正在启动本地 Harness ${state.version}…`,
    detail: '正在初始化本机 Node.js 服务，不是在下载安装。通常需要 20～90 秒。',
  })
  let origin: string
  try {
    origin = await startServiceWithFallback(state.version)
  } catch (error) {
    return fatal('Harness 服务启动失败', error instanceof Error ? error.message : String(error))
  }

  updater = createHarnessUpdater({
    service,
    onServiceRestarted: (nextOrigin) => { void reloadHarness(nextOrigin) },
    onPhaseChange: () => { if (trayDeps !== undefined) refreshTray(trayDeps) },
  })

  trayDeps = {
    openMainWindow: () => { void openMain() },
    checkUpdate: () => { void updater?.check({ interactive: true }) },
    restartService: () => { void restartHarnessService() },
    openLogs: () => { void shell.openPath(logsDir()) },
    openBridgeSettings: () => { showBridgeSettings() },
    quit: () => { void shutdown() },
    getVersion: () => undefined,
    getPhase: () => updater?.phase ?? { phase: 'idle' },
    getBridgeState: () => bridge.status.state,
  }
  // getVersion 需要异步读取，用缓存值填充
  let cachedVersion: string | undefined = state.version
  trayDeps.getVersion = () => cachedVersion
  const refreshVersion = async (): Promise<void> => {
    cachedVersion = (await readCurrent())?.version
    if (trayDeps !== undefined) refreshTray(trayDeps)
  }
  createTray(trayDeps)

  pushStatus({
    stage: 'loading',
    message: 'Harness 已就绪，正在打开主界面…',
    detail: '本地服务已经启动，马上就好。',
  })
  try {
    await showShellWindow(origin)
  } catch (error) {
    return fatal('主界面加载失败', error instanceof Error ? error.message : String(error))
  }
  closeStatusWindow()
  log.info(`启动流程完成（总耗时 ${String(Math.round((Date.now() - bootStartedAt) / 1000))} 秒）`)

  registerBridgeIpc()
  // 桥接是可选能力：起不来只记日志，不影响主界面
  void startBridge(state.version)

  updater.schedule()
  setTimeout(() => {
    void updater?.check().then(refreshVersion)
  }, 20_000)
  setTimeout(() => { void checkShellUpdate() }, 60_000)
}

/**
 * 启动远程控制桥接：先把 ACP profile 准备好（装 dsh-acp、同步设置），再拉起进程。
 * 未启用时什么都不做；失败只记日志，桥接不该影响主界面。
 */
async function startBridge(runtimeVersion: string): Promise<void> {
  const config = readBridgeConfig()
  // 任一通道启用就得起进程：只开 Telegram 而不开飞书是完全合理的配置
  if (!anyChannelEnabled(config)) return
  try {
    await ensureAcpProfile(runtimeVersion, config.permissionMode)
    await bridge.start(harnessEntry(runtimeVersion))
  } catch (error) {
    log.warn('远程控制桥接启动失败：', error instanceof Error ? error.message : String(error))
  }
}

/** 设置窗口与主进程之间的通道。 */
function registerBridgeIpc(): void {
  // Harness 侧栏的「远程控制」入口由插件提供，经 preload 转到这里；
  // 插件在浏览器里跑，打不开壳的窗口，只能由壳自己来开。
  ipcMain.on('desktop:open-remote-control', () => { showBridgeSettings() })

  // 扫码创建飞书应用：过程状态实时推给设置页，成功后直接落盘并回填界面。
  // 手填兜底始终保留——扫码依赖平台灰度，不能当唯一路径。
  ipcMain.handle('bridge:register-start', async () => {
    const result = await startFeishuRegistration((event) => { pushBridgeRegister(event) })
    if (result === undefined) return { ok: false }
    const current = readBridgeConfig()
    writeBridgeConfig({
      ...current,
      feishu: {
        ...current.feishu,
        enabled: true,
        appId: result.appId,
        appSecret: result.appSecret,
        domain: result.domain,
      },
      // 扫码的人就是要用它的人，白名单自动补上，免去让用户自己去找 open_id
      allowedUserIds: result.openId === undefined || current.allowedUserIds.includes(result.openId)
        ? current.allowedUserIds
        : [...current.allowedUserIds, result.openId],
    })
    return { ok: true, appId: result.appId, domain: result.domain, openId: result.openId }
  })
  ipcMain.on('bridge:register-cancel', () => { cancelFeishuRegistration() })
  // 授权页要在系统默认浏览器里打开——用户的飞书登录态在那儿，
  // 开进应用内置窗口既登录不上，也不该让应用去承载第三方登录页
  ipcMain.on('bridge:open-external', (_event, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url)
  })
  // 手填路径的助手：一段可直接粘进开放平台「批量导入权限」的 JSON
  ipcMain.handle('bridge:permission-json', () => ({
    scopes: permissionJson(),
    events: [...REQUIRED_EVENTS],
  }))

  ipcMain.handle('bridge:get-config', () => ({
    ...readBridgeConfig(),
    hasSecret: bridgeHasSecret(),
    hasTelegramToken: bridgeHasTelegramToken(),
  }))

  ipcMain.handle('bridge:save-config', async (_event, incoming: Partial<BridgeConfig>) => {
    try {
      const previous = readBridgeConfig()
      const next: BridgeConfig = {
        ...previous,
        ...incoming,
        feishu: { ...previous.feishu, ...incoming.feishu },
      }
      if (next.feishu.enabled) {
        if (next.feishu.appId === '') return { error: '请填写 App ID' }
        if (next.feishu.appSecret === '' && !bridgeHasSecret()) return { error: '请填写 App Secret' }
        if (next.allowedUserIds.length === 0) return { error: '白名单为空，至少填一个 open_id' }
      }
      writeBridgeConfig(next)
      const current = await readCurrent()
      if (current === undefined) return { error: '未找到可用的 Harness 运行时' }
      if (next.feishu.enabled) await ensureAcpProfile(current.version, next.permissionMode)
      await bridge.restart(harnessEntry(current.version))
      return { ok: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('bridge:get-status', () => bridge.status)

  ipcMain.handle('bridge:pick-directory', async () => {
    const parent = bridgeSettingsWindow()
    const result = parent === undefined
      ? await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? undefined : result.filePaths[0]
  })
}

async function openMain(): Promise<void> {
  const origin = service.origin
  if (origin !== undefined) {
    await showShellWindow(origin)
    return
  }
  // 服务不在运行（例如恢复中），把已有窗口带到前台即可
  if (hasWindow()) focusWindow()
}

/** 当前启用版本的 Harness 入口，插件命令需要用它。 */
async function currentHarnessEntry(): Promise<string> {
  const current = await readCurrent()
  if (current === undefined) throw new Error('未找到可用的 Harness 运行时')
  return harnessEntry(current.version)
}

/** 重启服务并把窗口带到新地址（装完插件后需要重启才生效）。 */
async function restartHarnessService(): Promise<void> {
  const entry = await currentHarnessEntry()
  const origin = await service.restart(entry)
  await reloadHarness(origin)
}

async function shutdown(): Promise<void> {
  if (quitting) return
  quitting = true
  destroyTray()
  try {
    await bridge.stop()
  } catch (error) {
    log.error('停止桥接时出错', error)
  }
  try {
    await service.stop()
  } catch (error) {
    log.error('停止服务时出错', error)
  }
  app.exit(0)
}

// 测试/多开隔离：覆盖 userData 后，单实例锁、缓存都随之隔离，
// 不会与正式安装的实例互相干扰
if (process.env.DSHD_USER_DATA_DIR !== undefined) {
  app.setPath('userData', process.env.DSHD_USER_DATA_DIR)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { void openMain() })
  app.on('activate', () => { void openMain() })
  app.on('window-all-closed', () => {
    // 服务与托盘常驻；关窗不退出（两个平台都从托盘/程序坞恢复窗口）
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    void shutdown()
  })
  app.whenReady().then(boot).catch((error: unknown) => {
    console.error('启动失败：', error)
    app.exit(1)
  })
}
