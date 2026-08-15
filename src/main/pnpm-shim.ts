/**
 * 用随内置 Node 分发的 corepack 提供 pnpm。
 *
 * dsh 的插件安装命令是 pnpm 转发器，而 dsh 自己不带 pnpm、用户机器上也不会有。
 * 这里生成一个调用 corepack 的包装脚本放进 PATH，交给 Harness 进程使用。
 * 刻意不用符号链接：Windows 上普通用户创建符号链接需要额外权限。
 */

import { existsSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bundledCorepackCli, bundledNode, corepackHome, pnpmShimDir } from './paths'
import { log } from './logger'

/** 生成包装脚本；失败只记日志，不该因此拦住应用启动。 */
export async function ensurePnpmShim(): Promise<void> {
  try {
    const corepack = bundledCorepackCli()
    if (!existsSync(corepack)) {
      log.warn(`内置 corepack 缺失，Web UI 里将无法安装插件：${corepack}`)
      return
    }
    const dir = pnpmShimDir()
    await mkdir(dir, { recursive: true })
    await mkdir(corepackHome(), { recursive: true })
    const node = bundledNode()
    if (process.platform === 'win32') {
      await writeFile(join(dir, 'pnpm.cmd'), `@echo off\r\n"${node}" "${corepack}" pnpm %*\r\n`)
    } else {
      const script = join(dir, 'pnpm')
      await writeFile(script, `#!/bin/sh\nexec "${node}" "${corepack}" pnpm "$@"\n`)
      await chmod(script, 0o755)
    }
  } catch (error) {
    log.warn('准备 pnpm 失败：', error instanceof Error ? error.message : String(error))
  }
}
