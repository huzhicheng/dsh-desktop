/**
 * 运行时版本仓库：versions/<版本号>/ 按版本存放 Harness 安装，
 * current.json 记录当前启用版本与上一个可用版本（用于失败回滚）。
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as semver from 'semver'
import { KEEP_RUNTIME_VERSIONS } from './config'
import { log } from './logger'
import { harnessEntry, runtimeRoot, seedDir, versionsDir } from './paths'

interface CurrentState {
  /** 当前启用的运行时版本。 */
  version: string
  /** 上一个正常工作过的版本，升级失败时回滚到它。 */
  previous?: string
  /** 被标记为损坏的版本（就绪失败），升级检查会跳过。 */
  broken?: string[]
}

export interface SeedInstallProgress {
  stage: 'extracting' | 'finalizing'
  version: string
}

function currentFile(): string {
  return join(runtimeRoot(), 'current.json')
}

export async function readCurrent(): Promise<CurrentState | undefined> {
  try {
    const state = JSON.parse(await readFile(currentFile(), 'utf8')) as CurrentState
    if (typeof state.version === 'string' && existsSync(harnessEntry(state.version))) return state
  } catch {
    // 不存在或损坏都按未安装处理
  }
  return undefined
}

export async function writeCurrent(state: CurrentState): Promise<void> {
  await mkdir(runtimeRoot(), { recursive: true })
  const temp = `${currentFile()}.tmp`
  await writeFile(temp, `${JSON.stringify(state, undefined, 2)}\n`)
  await rename(temp, currentFile())
}

/** 异步解压，避免 Windows 首启时阻塞 Electron 主线程、让启动窗口看起来卡死。 */
async function extractSeed(tarball: string, staging: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile('tar', ['-xzf', tarball, '-C', staging], { windowsHide: true }, (error) => {
      if (error === null) resolve()
      else reject(error)
    })
  })
}

/** 首次启动：把随 app 分发的种子运行时解压为初始版本。 */
export async function ensureSeedInstalled(
  onProgress?: (progress: SeedInstallProgress) => void,
): Promise<CurrentState> {
  const existing = await readCurrent()
  if (existing) {
    log.info(`使用已安装的本地运行时：${existing.version}（跳过解压）`)
    return existing
  }

  const manifestFile = join(seedDir(), 'seed.json')
  const tarball = join(seedDir(), 'runtime.tar.gz')
  if (!existsSync(manifestFile) || !existsSync(tarball)) {
    throw new Error(`应用内缺少种子运行时（${seedDir()}），安装包可能不完整`)
  }
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as { version: string }
  const version = manifest.version
  log.info(`首次启动，解压种子运行时 ${version} …`)
  onProgress?.({ stage: 'extracting', version })

  const staging = join(runtimeRoot(), `.seed-staging`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  const extractStartedAt = Date.now()
  await extractSeed(tarball, staging)
  log.info(`种子运行时解压完成：${version}（耗时 ${String(Math.round((Date.now() - extractStartedAt) / 1000))} 秒）`)
  onProgress?.({ stage: 'finalizing', version })

  const target = join(versionsDir(), version)
  await mkdir(versionsDir(), { recursive: true })
  await rm(target, { recursive: true, force: true })
  await rename(staging, target)
  if (!existsSync(harnessEntry(version))) {
    throw new Error(`种子运行时解压后缺少入口文件：${harnessEntry(version)}`)
  }
  const state: CurrentState = { version }
  await writeCurrent(state)
  log.info(`种子运行时安装完成：${version}`)
  return state
}

/** 切换到新版本；保留旧版本以便回滚。 */
export async function activateVersion(version: string): Promise<void> {
  const current = await readCurrent()
  const state: CurrentState = {
    version,
    ...(current !== undefined && current.version !== version ? { previous: current.version } : {}),
    ...(current?.broken !== undefined ? { broken: current.broken } : {}),
  }
  await writeCurrent(state)
}

/** 新版本就绪失败：标记损坏并回滚到上一版本。返回回滚后的版本，无处可退返回 undefined。 */
export async function rollback(badVersion: string): Promise<string | undefined> {
  const current = await readCurrent()
  const fallback = current?.previous
  if (fallback === undefined || !existsSync(harnessEntry(fallback))) return undefined
  const broken = [...new Set([...(current?.broken ?? []), badVersion])]
  await writeCurrent({ version: fallback, broken })
  log.warn(`运行时 ${badVersion} 启动失败，已回滚到 ${fallback}`)
  return fallback
}

export async function isMarkedBroken(version: string): Promise<boolean> {
  const current = await readCurrent()
  return current?.broken?.includes(version) ?? false
}

/** 清理多余的历史版本，保留当前 + 上一个。 */
export async function pruneOldVersions(): Promise<void> {
  const current = await readCurrent()
  if (!current) return
  const keep = new Set([current.version, current.previous].filter((v): v is string => v !== undefined))
  let entries: string[]
  try {
    entries = await readdir(versionsDir())
  } catch {
    return
  }
  const removable = entries
    .filter(name => !name.startsWith('.') && !keep.has(name) && semver.valid(name) !== null)
    .sort(semver.rcompare)
    .slice(Math.max(0, KEEP_RUNTIME_VERSIONS - keep.size))
  for (const name of removable) {
    log.info(`清理历史运行时版本：${name}`)
    await rm(join(versionsDir(), name), { recursive: true, force: true })
  }
}
