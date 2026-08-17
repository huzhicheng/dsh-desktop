/**
 * 随包分发的插件：首启装进 profile，之后跟着壳一起升级。
 *
 * 侧栏上的「插件」「皮肤」「远程控制」三个入口，各由一个独立插件提供。它们
 * 不能只放在仓库里等用户自己装——用户装的是一个桌面应用，不该再去碰命令行。
 * 所以三个插件的构建产物随安装包分发，第一次启动时装进 `~/.dsh/profiles/web`，
 * 全程离线、不依赖网络。
 *
 * 安装动作转发官方命令 `dsh plugin --profile web add <路径>`：它会在 profile
 * 不存在时自动初始化，并把插件并入 `dsh.profile.bundles`（也就是自动启用）。
 * 不自己改 profile 的 package.json——那样迟早和官方的对账规则脱节。
 *
 * 装的是「链接」而不是拷贝，链接指向用户数据目录下的一份副本，不是应用包内。
 * 应用包在 macOS 上可能只读、升级时整个被替换，链接进去会在下次升级时断掉；
 * 指向用户目录则只要覆盖那份副本，profile 里的插件代码就跟着更新了。
 */

import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { app } from 'electron'
import { log } from './logger'
import { bundledNode, bundledNodePathEntry, dataRoot, dshHome, harnessEntry, pnpmShimDir } from './paths'

/** profile 名，与 `dsh web` 使用的一致。 */
const PROFILE = 'web'
/** 单个插件的安装超时；装的是本地目录，正常一两秒就好。 */
const INSTALL_TIMEOUT_MS = 3 * 60 * 1000

/** 随包分发的插件所在目录。开发态直接用仓库里的 plugins/。 */
function bundledPluginsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(app.getAppPath(), 'plugins')
}

/** 插件副本落在用户数据目录下，profile 里的链接指向这里。 */
function installedPluginsDir(): string {
  return join(dataRoot(), 'plugins')
}

/** 读 profile 已声明的依赖，判断哪些还没装。 */
async function installedNames(): Promise<Set<string>> {
  try {
    const raw = await readFile(join(dshHome(), 'profiles', PROFILE, 'package.json'), 'utf8')
    const manifest = JSON.parse(raw) as { dependencies?: Record<string, string> }
    return new Set(Object.keys(manifest.dependencies ?? {}))
  } catch {
    // profile 还不存在（全新用户）——一个都没装
    return new Set()
  }
}

/** 列出随包分发的插件目录名；只认带 package.json 的。 */
async function bundledPlugins(): Promise<string[]> {
  const dir = bundledPluginsDir()
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('dsh-plugin-'))
    .filter(entry => existsSync(join(dir, entry.name, 'package.json')))
    .map(entry => entry.name)
}

/** 转发一次 `dsh plugin --profile web add <路径>`。 */
async function runAdd(runtimeVersion: string, pluginPath: string): Promise<void> {
  const entry = harnessEntry(runtimeVersion)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bundledNode(), [entry, 'plugin', '--profile', PROFILE, 'add', pluginPath], {
      cwd: dataRoot(),
      // pnpm 由内置 Node 带的 corepack 提供，得让它在 PATH 里找得到
      env: {
        ...process.env,
        // Windows 的 PATH 分隔符是分号，写死冒号会让内置 node 与 pnpm 都找不到
        PATH: [pnpmShimDir(), bundledNodePathEntry(), process.env.PATH ?? ''].join(delimiter),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    const collect = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-4096) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`安装超时：${output}`))
    }, INSTALL_TIMEOUT_MS)

    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`退出码 ${String(code)}：${output}`))
    })
  })
}

/**
 * 确保随包分发的插件都装好了。
 *
 * 必须在启动 `dsh web` 之前调用——profile 是在 dsh 启动时读的，装晚了要等下次重启。
 * 失败不抛：插件装不上只是少几个入口，主界面照样能用，不该因此拦住启动。
 *
 * @param runtimeVersion - 当前运行时版本，用来定位 dsh 入口。
 */
export async function ensureBundledPlugins(runtimeVersion: string): Promise<void> {
  const names = await bundledPlugins()
  if (names.length === 0) return

  const source = bundledPluginsDir()
  const target = installedPluginsDir()
  await mkdir(target, { recursive: true })

  const already = await installedNames()
  for (const name of names) {
    try {
      // 每次启动都覆盖一遍副本：壳升级后插件代码也要跟着换，
      // 而 profile 里是链接，副本一换就生效，不必重新执行安装
      const dest = join(target, name)
      await rm(dest, { recursive: true, force: true })
      await cp(join(source, name), dest, { recursive: true })

      if (already.has(name)) continue
      log.info(`正在安装内置插件 ${name} …`)
      await runAdd(runtimeVersion, dest)
      log.info(`内置插件 ${name} 已安装并启用`)
    } catch (error) {
      log.warn(`内置插件 ${name} 安装失败：`, error instanceof Error ? error.message : String(error))
    }
  }
}

/** 供设置界面显示：随包分发的插件清单。 */
export async function bundledPluginNames(): Promise<string[]> {
  return bundledPlugins()
}

/** 写一份说明放进插件副本目录，免得用户翻到时不知道这是什么。 */
export async function writePluginsReadme(): Promise<void> {
  const path = join(installedPluginsDir(), 'README.txt')
  if (existsSync(path)) return
  await mkdir(installedPluginsDir(), { recursive: true })
  await writeFile(path, [
    '这里是 DSH Desktop 随安装包分发的插件副本。',
    '',
    '每次启动会用安装包内的版本覆盖，手动改动会丢失。',
    '要卸载某个插件，在应用里打开「插件」，或执行：',
    '  dsh plugin --profile web remove <插件名>',
    '',
  ].join('\n'), 'utf8')
}
