/** 路径解析：开发态用 vendor/，打包态用 resources/；运行时数据一律放用户目录。 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { app } from 'electron'

/** 开发态仓库根目录（dist/main/index.js 往上两级）。 */
const DEV_ROOT = resolve(__dirname, '../..')

function resourceRoot(): string {
  return app.isPackaged ? process.resourcesPath : DEV_ROOT
}

function nodeRuntimeDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'node')
    : join(DEV_ROOT, 'vendor/node', `${process.platform}-${process.arch}`)
}

/** 打包进 app 的官方 Node.js 可执行文件（两个平台的发行包布局不同）。 */
export function bundledNode(): string {
  return process.platform === 'win32'
    ? join(nodeRuntimeDir(), 'node.exe')
    : join(nodeRuntimeDir(), 'bin/node')
}

/** 打包进 app 的 npm CLI 入口（随官方 Node 一起分发）。 */
export function bundledNpmCli(): string {
  return process.platform === 'win32'
    ? join(nodeRuntimeDir(), 'node_modules/npm/bin/npm-cli.js')
    : join(nodeRuntimeDir(), 'lib/node_modules/npm/bin/npm-cli.js')
}

/** 子进程 PATH 里应前置的目录：让 Harness 与安装脚本能找到内置 Node。 */
export function bundledNodePathEntry(): string {
  return process.platform === 'win32' ? nodeRuntimeDir() : join(nodeRuntimeDir(), 'bin')
}

/** 随 Node 分发的 corepack 入口，用它按需提供 pnpm（dsh plugin 依赖 pnpm）。 */
export function bundledCorepackCli(): string {
  return process.platform === 'win32'
    ? join(nodeRuntimeDir(), 'node_modules/corepack/dist/corepack.js')
    : join(nodeRuntimeDir(), 'lib/node_modules/corepack/dist/corepack.js')
}

/** 我们自己生成的 pnpm 包装脚本所在目录（不用符号链接，Windows 也安全）。 */
/**
 * 随包分发的 pnpm 入口。
 *
 * 不走 corepack：corepack 只是转发器，首次执行会去 registry 下载真正的 pnpm。
 * 开发机早就缓存过所以一直没暴露，全新用户机器上这一步要联网，装插件因此失败。
 */
export function bundledPnpmCli(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'pnpm')
    : join(DEV_ROOT, 'vendor/pnpm')
  return join(base, 'bin/pnpm.cjs')
}

export function pnpmShimDir(): string {
  return join(dataRoot(), 'pnpm-shim')
}

/** corepack 下载的包管理器缓存，放进用户数据目录便于随应用一起清理。 */
export function corepackHome(): string {
  return join(dataRoot(), 'corepack')
}

/** Harness home（插件与 profile 都在这里，独立于本应用的数据目录）。 */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** 指定 profile 的目录。 */
export function profileDir(profile: string): string {
  return join(dshHome(), 'profiles', profile)
}

/** 种子运行时目录（含 runtime.tar.gz 与 seed.json）。 */
export function seedDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'seed')
    : join(DEV_ROOT, 'vendor/seed', `${process.platform}-${process.arch}`)
}

/** 用户侧数据根目录；测试时可用 DSHD_USER_DATA_DIR 覆盖。 */
export function dataRoot(): string {
  return process.env.DSHD_USER_DATA_DIR ?? app.getPath('userData')
}

export function runtimeRoot(): string {
  return join(dataRoot(), 'runtime')
}

export function versionsDir(): string {
  return join(runtimeRoot(), 'versions')
}

export function npmCacheDir(): string {
  return join(dataRoot(), 'npm-cache')
}

export function logsDir(): string {
  return join(dataRoot(), 'logs')
}

/** 指定版本运行时的 dsh 入口文件。 */
export function harnessEntry(version: string): string {
  return join(versionsDir(), version, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
}

export function assertBundledToolchain(): void {
  const node = bundledNode()
  if (!existsSync(node)) {
    throw new Error(`缺少内置 Node 运行时：${node}（开发态请先执行 npm run prepare:node）`)
  }
  if (!existsSync(bundledNpmCli())) {
    throw new Error(`缺少内置 npm：${bundledNpmCli()}`)
  }
}
