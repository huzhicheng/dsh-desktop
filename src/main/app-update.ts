/**
 * 应用本体的新版本检测。
 *
 * 和 updater.ts 分工不同：那个管 Harness 运行时，能后台装好并自动回滚，用户
 * 不用管；这个管的是壳自己，换壳必须重新下载安装包，只能提示、不能代劳。
 *
 * 检测走 GitHub Releases API 而不是 electron-updater：
 * 一是它在开发态也能跑（electron-updater 只在打包后工作，等于本地没法验证），
 * 二是要拿到发布页地址引导用户去下载。electron-updater 仍然保留着，它在
 * Windows 上负责真正的下载与安装，见 index.ts 的 checkShellUpdate。
 *
 * macOS 这边不做自动安装：应用只有 ad-hoc 签名，Squirrel 校验更新包的签名与
 * 运行中的应用是否同源，ad-hoc 每次构建的 cdhash 都不同，过不了这一关。与其
 * 提供一条走到一半才失败的路径，不如老实把人送到发布页。
 */

import { Notification, shell, app } from 'electron'
import * as semver from 'semver'
import { APP_DISPLAY_NAME, APP_RELEASES_URL, APP_REPO, UPDATE_CHECK_INTERVAL_MS } from './config'
import { log } from './logger'

export interface AppUpdateState {
  /** 当前运行的版本。 */
  current: string
  /** 已发布的最新版本；查不到时为空串。 */
  latest: string
  /** 是否有比当前更新的版本。 */
  hasUpdate: boolean
  /** 正在检查中，界面据此显示进行态。 */
  checking: boolean
  /** 上次检查完成的时间戳；从未成功过时为 0。 */
  checkedAt: number
  /** 上次失败原因；成功后清空。界面只在用户主动检查时展示。 */
  error: string
  /** 发布页地址。 */
  pageUrl: string
}

export interface AppUpdater {
  /** 检查一次。interactive 为真表示用户主动触发，失败要让他看见。 */
  check(options?: { interactive?: boolean }): Promise<AppUpdateState>
  /** 启动定时检查（立即先查一次）。 */
  schedule(): void
  /** 打开发布页。 */
  openReleasePage(): void
  readonly state: AppUpdateState
}

export interface AppUpdaterOptions {
  /** 状态变化回调：刷新托盘菜单、把徽标推给页面。 */
  onChange?: (state: AppUpdateState) => void
}

/** 从 tag 里取版本号：发布用的 tag 形如 v1.0.0。 */
function versionFromTag(tag: unknown): string {
  if (typeof tag !== 'string') return ''
  const cleaned = semver.clean(tag.replace(/^v/, ''))
  return cleaned ?? ''
}

export function createAppUpdater(options: AppUpdaterOptions = {}): AppUpdater {
  const state: AppUpdateState = {
    current: app.getVersion(),
    latest: '',
    hasUpdate: false,
    checking: false,
    checkedAt: 0,
    error: '',
    pageUrl: APP_RELEASES_URL,
  }

  /** 已经就哪个版本弹过通知；同一个版本只提醒一次，别每 4 小时骚扰一遍。 */
  let notifiedVersion = ''

  const emit = (): void => { options.onChange?.({ ...state }) }

  async function check(checkOptions: { interactive?: boolean } = {}): Promise<AppUpdateState> {
    if (state.checking) return { ...state }
    state.checking = true
    emit()
    try {
      const response = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      const body = await response.json() as { tag_name?: string, html_url?: string }
      const latest = versionFromTag(body.tag_name)
      if (latest === '') throw new Error('发布信息里没有可识别的版本号')

      state.latest = latest
      state.pageUrl = typeof body.html_url === 'string' && body.html_url !== ''
        ? body.html_url
        : APP_RELEASES_URL
      // 开发态版本号常常领先于已发布版本，semver 比较天然会判成「无更新」
      state.hasUpdate = semver.gt(latest, state.current)
      state.checkedAt = Date.now()
      state.error = ''
      log.info(`应用版本检查：当前 ${state.current}，最新 ${latest}${state.hasUpdate ? '（有更新）' : ''}`)

      if (state.hasUpdate && notifiedVersion !== latest) {
        notifiedVersion = latest
        notifyUpdate(latest)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state.error = message
      // 网络不通是常态，定时检查失败不该刷屏；用户主动点的才记 warn
      if (checkOptions.interactive === true) log.warn(`应用版本检查失败：${message}`)
      else log.info(`应用版本检查跳过：${message}`)
    } finally {
      state.checking = false
      emit()
    }
    return { ...state }
  }

  function notifyUpdate(version: string): void {
    if (!Notification.isSupported()) return
    const notification = new Notification({
      title: `${APP_DISPLAY_NAME} ${version} 已发布`,
      body: `当前版本 ${state.current}。点此打开发布页下载。`,
    })
    notification.on('click', () => { openReleasePage() })
    notification.show()
  }

  function openReleasePage(): void {
    log.info(`打开发布页：${state.pageUrl}`)
    shell.openExternal(state.pageUrl).catch((error: unknown) => {
      log.warn(`打开发布页失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }

  return {
    check,
    schedule() {
      void check()
      setInterval(() => { void check() }, UPDATE_CHECK_INTERVAL_MS)
    },
    openReleasePage,
    get state() { return { ...state } },
  }
}
