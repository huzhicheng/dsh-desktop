/**
 * 在线安装指定版本的 Harness 运行时：
 * 用内置 npm 装到 staging 目录，校验入口后原子改名到 versions/<版本>/。
 * 全程不影响正在运行的旧版本，失败时直接丢弃 staging。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { HARNESS_PACKAGE } from './config'
import { log } from './logger'
import { bundledNode, bundledNodePathEntry, bundledNpmCli, harnessEntry, npmCacheDir, runtimeRoot, versionsDir } from './paths'

export interface InstallProgress {
  /** 面向用户的一句话状态。 */
  message: string
}

export async function installVersion(
  version: string,
  registry: string,
  onProgress?: (progress: InstallProgress) => void,
): Promise<void> {
  const staging = join(runtimeRoot(), `.staging-${version}`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  await mkdir(npmCacheDir(), { recursive: true })

  onProgress?.({ message: `正在下载并安装 Harness ${version} …` })
  log.info(`开始安装 ${HARNESS_PACKAGE}@${version}（registry: ${registry}）`)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bundledNode(), [
      bundledNpmCli(),
      'install', `${HARNESS_PACKAGE}@${version}`,
      '--prefix', staging,
      '--omit=dev', '--no-audit', '--no-fund', '--no-progress',
      '--loglevel=warn',
      `--registry=${registry}`,
    ], {
      env: {
        ...process.env,
        // npm 及依赖的安装脚本需要能找到 node（用户机器上没有装）
        PATH: `${bundledNodePathEntry()}${delimiter}${process.env.PATH ?? ''}`,
        npm_config_cache: npmCacheDir(),
        npm_config_update_notifier: 'false',
        ELECTRON_RUN_AS_NODE: undefined,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let tail = ''
    const collect = (chunk: Buffer): void => {
      tail = (tail + chunk.toString()).slice(-8192)
      log.host(chunk.toString())
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`npm install 失败（${code === null ? `signal ${String(signal)}` : `exit ${String(code)}`}）\n${tail}`))
    })
  })

  const stagedEntry = join(staging, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(stagedEntry)) {
    await rm(staging, { recursive: true, force: true })
    throw new Error(`安装完成但缺少入口文件：${stagedEntry}`)
  }

  onProgress?.({ message: `正在启用 Harness ${version} …` })
  const target = join(versionsDir(), version)
  await mkdir(versionsDir(), { recursive: true })
  await rm(target, { recursive: true, force: true })
  await rename(staging, target)
  if (!existsSync(harnessEntry(version))) {
    throw new Error(`启用后校验失败：${harnessEntry(version)}`)
  }
  log.info(`安装完成：${HARNESS_PACKAGE}@${version}`)
}
