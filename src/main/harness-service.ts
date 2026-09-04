/**
 * Harness 服务生命周期：用内置 Node 启动 `dsh web`，
 * 从 stdout 捕获就绪行（`dsh web: http://127.0.0.1:<port>`）拿到访问地址，
 * 支持优雅停止与换版本重启。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { delimiter } from 'node:path'
import { app } from 'electron'
import { PREFERRED_PORT, READINESS_TIMEOUT_MS, SHUTDOWN_GRACE_MS } from './config'
import { log } from './logger'
import { bundledNode, bundledNodePathEntry, corepackHome, pnpmShimDir } from './paths'

const READY_PATTERN = /^dsh web: (http:\/\/[^\s]+)/m

/**
 * 终止服务进程。Windows 没有 SIGTERM 语义且需要连同子进程一起结束，
 * 用 taskkill /T /F 终止整棵进程树；其余平台走信号。
 */
function terminate(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (process.platform === 'win32') {
    if (child.pid === undefined || child.exitCode !== null) return
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.once('error', () => { child.kill() })
    return
  }
  child.kill(signal)
}

export interface HarnessService {
  /** 启动指定版本入口，返回本地访问地址（origin）。port 省略时用固定端口。 */
  start(entry: string, port?: number): Promise<string>
  /** 优雅停止（幂等）。 */
  stop(): Promise<void>
  /** 停止后用新入口重启。 */
  restart(entry: string): Promise<string>
  readonly origin: string | undefined
}

export interface HarnessServiceOptions {
  /** 服务在运行中意外退出（非本壳主动停止）时回调。 */
  onUnexpectedExit?: (detail: { code: number | null; signal: NodeJS.Signals | null }) => void
}

/**
 * 校验就绪行给出的地址，并原样保留查询串。
 *
 * 不能只取 url.origin。Harness 从 0.1.1 起给 `dsh web` 加了鉴权，就绪行是
 * `dsh web: http://127.0.0.1:37080/?token=...`，token 在查询串里。丢掉它，
 * 页面会停在「authentication required; reopen the URL printed by dsh web」。
 *
 * 以前没暴露，是因为 dsh 会自己打开那个带 token 的 URL 把会话种进默认浏览器；
 * 桌面端加上 --no-open 之后这条路断了，壳加载的裸地址就没有凭据了。
 */
function validateOrigin(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) {
    throw new Error(`Harness 返回了非本机回环地址，拒绝加载：${raw}`)
  }
  return url.toString()
}

export function createHarnessService(options: HarnessServiceOptions = {}): HarnessService {
  let child: ChildProcess | undefined
  let exitPromise: Promise<void> | undefined
  let currentOrigin: string | undefined
  let stopping = false

  async function start(entry: string, port: number = PREFERRED_PORT): Promise<string> {
    if (child !== undefined) throw new Error('Harness 服务已在运行')
    stopping = false
    const startedAt = Date.now()
    log.info(`正在启动 Harness 本地服务（端口 ${String(port)}）…`)
    // --no-open：Harness 从 0.1.0-rc.8 起会在 `dsh web` 启动时自动打开默认浏览器。
    // 那对命令行用户是方便，对桌面端是多余——壳自己就有窗口，再弹一个浏览器标签页
    // 等于同一个界面开两份，而且用户关掉哪个都不影响服务，只会更困惑。
    const spawned = spawn(bundledNode(), [entry, 'web', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
      cwd: app.getPath('home'),
      env: {
        ...process.env,
        // 让 Harness 及其派生的 shell 都能找到内置 Node；再前置 pnpm 包装脚本，
        // 这样在 Web UI 里装插件时，官方的 dsh plugin（pnpm 转发器）才跑得起来
        PATH: `${pnpmShimDir()}${delimiter}${bundledNodePathEntry()}${delimiter}${process.env.PATH ?? ''}`,
        COREPACK_HOME: corepackHome(),
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
        ELECTRON_RUN_AS_NODE: undefined,
        DSH_DESKTOP_SHELL: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child = spawned
    const exited = new Promise<void>((resolve) => { spawned.once('exit', () => { resolve() }) })
    exitPromise = exited

    const readiness = new Promise<string>((resolve, reject) => {
      let buffer = ''
      let tail = ''
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }
      const timer = setTimeout(() => {
        finish(() => { reject(new Error(`Harness 启动超时（${String(READINESS_TIMEOUT_MS / 1000)} 秒未就绪）\n最近输出：\n${tail}`)) })
        terminate(spawned, 'SIGTERM')
      }, READINESS_TIMEOUT_MS)

      const onChunk = (chunk: Buffer): void => {
        const text = chunk.toString()
        log.host(text)
        tail = (tail + text).slice(-8192)
        buffer = (buffer + text).slice(-65_536)
        const match = READY_PATTERN.exec(buffer)
        if (match?.[1] !== undefined) {
          try {
            const validated = validateOrigin(match[1])
            finish(() => { resolve(validated) })
          } catch (error) {
            finish(() => { reject(error) })
            terminate(spawned, 'SIGTERM')
          }
        }
      }
      spawned.stdout?.on('data', onChunk)
      spawned.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        log.host(text)
        tail = (tail + text).slice(-8192)
      })
      spawned.once('error', (error) => {
        finish(() => { reject(new Error(`Harness 进程启动失败：${error.message}`)) })
      })
      spawned.once('exit', (code, signal) => {
        finish(() => { reject(new Error(`Harness 未就绪即退出（code ${String(code)}, signal ${String(signal)}）\n最近输出：\n${tail}`)) })
      })
    })

    let origin: string
    try {
      origin = await readiness
    } catch (error) {
      // 启动失败：确保进程结束并复位状态，让调用方可以直接换版本重试
      terminate(spawned, 'SIGTERM')
      const outcome = await Promise.race([
        exited.then(() => 'exited' as const),
        new Promise<'timeout'>((resolve) => { setTimeout(() => { resolve('timeout') }, SHUTDOWN_GRACE_MS) }),
      ])
      if (outcome === 'timeout') {
        terminate(spawned, 'SIGKILL')
        await exited
      }
      child = undefined
      exitPromise = undefined
      throw error
    }

    currentOrigin = origin
    spawned.once('exit', (code, signal) => {
      child = undefined
      currentOrigin = undefined
      if (!stopping) {
        log.error(`Harness 服务意外退出（code ${String(code)}, signal ${String(signal)}）`)
        options.onUnexpectedExit?.({ code, signal })
      }
    })
    log.info(`Harness 服务就绪：${origin}（耗时 ${String(Math.round((Date.now() - startedAt) / 1000))} 秒）`)
    return origin
  }

  async function stop(): Promise<void> {
    const spawned = child
    if (spawned === undefined) return
    stopping = true
    terminate(spawned, 'SIGTERM')
    const exited = exitPromise ?? Promise.resolve()
    const outcome = await Promise.race([
      exited.then(() => 'exited' as const),
      new Promise<'timeout'>((resolve) => { setTimeout(() => { resolve('timeout') }, SHUTDOWN_GRACE_MS) }),
    ])
    if (outcome === 'timeout') {
      log.warn('Harness 优雅退出超时，强制结束')
      terminate(spawned, 'SIGKILL')
      await exited
    }
    child = undefined
    currentOrigin = undefined
  }

  return {
    start,
    stop,
    async restart(entry: string): Promise<string> {
      await stop()
      return start(entry)
    },
    get origin() {
      return currentOrigin
    },
  }
}
