/**
 * 给 Harness 进程备好 pnpm。
 *
 * dsh 的插件安装命令是 pnpm 转发器，而 dsh 自己不带 pnpm、用户机器上也不会有。
 * 这里生成一个包装脚本放进 PATH。刻意不用符号链接：Windows 上普通用户创建
 * 符号链接需要额外权限。
 *
 * 优先用随安装包分发的 pnpm。以前走的是内置 corepack，但 corepack 只是个
 * 转发器，第一次执行时会去 registry 下载真正的 pnpm——开发机早就下过、缓存
 * 在 COREPACK_HOME 里，所以一直没发现；到了全新的用户机器上这一步要联网，
 * 插件因此一个都装不上（Windows 上实测踩到）。corepack 留作兜底，
 * 万一随包的 pnpm 缺失还能靠它（有网的话）。
 */

import { existsSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bundledCorepackCli, bundledNode, bundledPnpmCli, corepackHome, pnpmShimDir } from './paths'
import { log } from './logger'

/** 生成包装脚本；失败只记日志，不该因此拦住应用启动。 */
export async function ensurePnpmShim(): Promise<void> {
  try {
    const pnpm = bundledPnpmCli()
    const corepack = bundledCorepackCli()
    // 随包的 pnpm 直接跑，不需要网络；退回 corepack 时才可能要下载
    const args = existsSync(pnpm) ? [pnpm] : [corepack, 'pnpm']
    if (!existsSync(pnpm) && !existsSync(corepack)) {
      log.warn(`随包 pnpm 与 corepack 都缺失，将无法安装插件：${pnpm}`)
      return
    }
    if (!existsSync(pnpm)) log.warn('随包 pnpm 缺失，退回 corepack（首次使用需要联网）')
    const dir = pnpmShimDir()
    await mkdir(dir, { recursive: true })
    await mkdir(corepackHome(), { recursive: true })
    const node = bundledNode()
    if (process.platform === 'win32') {
      const quoted = args.map(a => `"${a}"`).join(' ')
      await writeFile(join(dir, 'pnpm.cmd'), `@echo off\r\n"${node}" ${quoted} %*\r\n`)
    } else {
      const script = join(dir, 'pnpm')
      const quoted = args.map(a => `"${a}"`).join(' ')
      await writeFile(script, `#!/bin/sh\nexec "${node}" ${quoted} "$@"\n`)
      await chmod(script, 0o755)
    }
  } catch (error) {
    log.warn('准备 pnpm 失败：', error instanceof Error ? error.message : String(error))
  }
}
