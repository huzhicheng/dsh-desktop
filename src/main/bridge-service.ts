/**
 * 飞书桥接进程的生命周期：用内置 Node 起 dist/bridge/index.js，
 * 读它 stdout 上的状态行，异常退出时按退避重启。
 *
 * 和 Harness 服务一样跑在壳外面，桥接崩了不影响主界面。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { app, safeStorage } from 'electron'
import { log } from './logger'
import { bundledNode, bundledNodePathEntry, dataRoot, dshHome } from './paths'
import { DEFAULT_CONFIG, type BridgeConfig } from '../bridge/types'

/** 连续失败后的重启退避上限。 */
const MAX_RESTART_DELAY_MS = 60_000

export type BridgeState = 'stopped' | 'starting' | 'connected' | 'error'

export interface BridgeStatus {
  state: BridgeState
  message?: string
}

function configFile(): string {
  return join(dataRoot(), 'bridge', 'config.json')
}

function secretFile(): string {
  return join(dataRoot(), 'bridge', 'app-secret.bin')
}

function stateFile(): string {
  return join(dataRoot(), 'bridge', 'chats.json')
}

/** 运行时配置文件：给子进程用，App Secret 在这里才是明文。 */
function runtimeConfigFile(): string {
  return join(dataRoot(), 'bridge', 'runtime-config.json')
}

/**
 * 读配置。App Secret 单独用系统钥匙串加密存放，
 * 不和其余配置混在一个明文 JSON 里。
 */
export function readBridgeConfig(): BridgeConfig {
  let stored: Partial<BridgeConfig> = {}
  try {
    stored = JSON.parse(readFileSync(configFile(), 'utf8')) as Partial<BridgeConfig>
  } catch {
    // 尚未配置
  }
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    feishu: { ...DEFAULT_CONFIG.feishu, ...stored.feishu, appSecret: '' },
  }
}

/** 读出明文 App Secret（仅在启动子进程时用）。 */
function readSecret(): string {
  try {
    const raw = readFileSync(secretFile())
    if (!safeStorage.isEncryptionAvailable()) return raw.toString('utf8')
    return safeStorage.decryptString(raw)
  } catch {
    return ''
  }
}

/** 是否已经存过 App Secret（设置页据此显示「留空则沿用」）。 */
export function bridgeHasSecret(): boolean {
  return readSecret() !== ''
}

export function writeBridgeConfig(next: BridgeConfig): void {
  mkdirSync(join(dataRoot(), 'bridge'), { recursive: true })
  const secret = next.feishu.appSecret
  if (secret !== '') {
    const payload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(secret)
      : Buffer.from(secret, 'utf8')
    writeFileSync(secretFile(), payload, { mode: 0o600 })
  }
  const persisted: BridgeConfig = { ...next, feishu: { ...next.feishu, appSecret: '' } }
  writeFileSync(configFile(), JSON.stringify(persisted, null, 2), { mode: 0o600 })
}

export interface BridgeService {
  start(entry: string): Promise<void>
  stop(): Promise<void>
  restart(entry: string): Promise<void>
  readonly status: BridgeStatus
}

export interface BridgeServiceOptions {
  onStatus?: (status: BridgeStatus) => void
}

export function createBridgeService(options: BridgeServiceOptions = {}): BridgeService {
  let child: ChildProcess | undefined
  let status: BridgeStatus = { state: 'stopped' }
  let stopping = false
  let restartDelay = 2_000
  let restartTimer: NodeJS.Timeout | undefined
  let currentEntry: string | undefined

  const setStatus = (next: BridgeStatus): void => {
    status = next
    options.onStatus?.(next)
  }

  /** 把明文配置写到只给子进程读的文件，进程退出后删掉。 */
  const writeRuntimeConfig = (): string => {
    const config = readBridgeConfig()
    const runtime: BridgeConfig = { ...config, feishu: { ...config.feishu, appSecret: readSecret() } }
    mkdirSync(join(dataRoot(), 'bridge'), { recursive: true })
    writeFileSync(runtimeConfigFile(), JSON.stringify(runtime), { mode: 0o600 })
    return runtimeConfigFile()
  }

  const spawnBridge = (harnessEntryPath: string): void => {
    const bridgeScript = join(app.getAppPath(), 'dist/bridge/index.js')
    const spawned = spawn(bundledNode(), [bridgeScript], {
      cwd: app.getPath('home'),
      env: {
        ...process.env,
        PATH: `${bundledNodePathEntry()}${delimiter}${process.env.PATH ?? ''}`,
        ELECTRON_RUN_AS_NODE: undefined,
        BRIDGE_CONFIG_FILE: writeRuntimeConfig(),
        BRIDGE_STATE_FILE: stateFile(),
        BRIDGE_NODE_PATH: bundledNode(),
        BRIDGE_DSH_ENTRY: harnessEntryPath,
        BRIDGE_DSH_HOME: dshHome(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child = spawned

    let buffer = ''
    spawned.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() === '') continue
        try {
          const event = JSON.parse(line) as { type?: string; state?: BridgeState; message?: string }
          if (event.type === 'status' && event.state !== undefined) {
            if (event.state === 'connected') restartDelay = 2_000
            setStatus({ state: event.state, message: event.message })
          }
        } catch {
          log.host(`[bridge] ${line}\n`)
        }
      }
    })
    spawned.stderr?.on('data', (chunk: Buffer) => { log.host(`[bridge] ${chunk.toString()}`) })

    spawned.once('error', (error) => {
      log.error(`桥接进程启动失败：${error.message}`)
      setStatus({ state: 'error', message: error.message })
    })

    spawned.once('exit', (code, signal) => {
      child = undefined
      if (stopping) {
        setStatus({ state: 'stopped' })
        return
      }
      log.warn(`桥接进程退出（code ${String(code)}, signal ${String(signal)}），${String(restartDelay / 1000)} 秒后重启`)
      setStatus({ state: 'error', message: `进程退出（code ${String(code)}）` })
      restartTimer = setTimeout(() => {
        if (currentEntry !== undefined) spawnBridge(currentEntry)
      }, restartDelay)
      restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY_MS)
    })
  }

  const stop = async (): Promise<void> => {
    stopping = true
    if (restartTimer !== undefined) {
      clearTimeout(restartTimer)
      restartTimer = undefined
    }
    const spawned = child
    if (spawned === undefined) {
      setStatus({ state: 'stopped' })
      return
    }
    const exited = new Promise<void>((resolve) => { spawned.once('exit', () => { resolve() }) })
    if (process.platform === 'win32' && spawned.pid !== undefined) {
      spawn('taskkill', ['/pid', String(spawned.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      spawned.kill('SIGTERM')
    }
    await Promise.race([exited, new Promise<void>((resolve) => { setTimeout(resolve, 5_000) })])
    child = undefined
    setStatus({ state: 'stopped' })
  }

  return {
    async start(entry: string): Promise<void> {
      if (child !== undefined) return
      const config = readBridgeConfig()
      if (!config.feishu.enabled) {
        setStatus({ state: 'stopped' })
        return
      }
      stopping = false
      currentEntry = entry
      setStatus({ state: 'starting' })
      spawnBridge(entry)
    },
    stop,
    async restart(entry: string): Promise<void> {
      await stop()
      stopping = false
      currentEntry = entry
      const config = readBridgeConfig()
      if (!config.feishu.enabled) {
        setStatus({ state: 'stopped' })
        return
      }
      setStatus({ state: 'starting' })
      spawnBridge(entry)
    },
    get status() {
      return status
    },
  }
}
