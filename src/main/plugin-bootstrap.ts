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
import { delimiter, dirname, join } from 'node:path'
import { app } from 'electron'
import { log } from './logger'
import {
  bundledNode, bundledNodePathEntry, dataRoot, harnessEntry, pnpmShimDir, profileDir,
} from './paths'

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

/**
 * 插件副本放进 profile 自己的隐藏目录。
 *
 * 这里刻意不用 Electron 的 userData（Windows 默认是
 * `AppData\\Roaming\\DSH Desktop`）。dsh 0.1.0-rc.6 在 Windows 上用 shell
 * 转发 pnpm 参数，绝对路径里的空格会被拆开，最终把依赖写成坏掉的
 * `link:Desktop\\plugins\\...`。传给 pnpm 的 profile 内相对路径不含空格，用户目录
 * 本身即使有空格也不会受影响。
 */
function installedPluginsDir(): string {
  return join(profileDir(PROFILE), '.dsh-desktop-plugins')
}

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

async function readProfileManifest(): Promise<ProfileManifest | undefined> {
  try {
    const raw = await readFile(join(profileDir(PROFILE), 'package.json'), 'utf8')
    return JSON.parse(raw) as ProfileManifest
  } catch {
    return undefined
  }
}

/** pnpm 看到的是相对于 profile 的 link: 路径，整个参数不含空格。 */
function pluginSpec(name: string): string {
  // 必须是 link:，不能是 file:；应用升级覆盖副本后，profile 要立刻读取新代码，
  // 不能继续使用 pnpm 存进内容寻址仓库的旧快照。
  return `link:.dsh-desktop-plugins/${name}`
}

/**
 * 不能只检查 dependencies 里有没有名字：0.2.1 正是因此把三个坏链接误判成
 * 已安装。依赖必须指向本应用维护的副本、node_modules 能解析，并且 bundle 已启用。
 */
function pluginReady(name: string, manifest: ProfileManifest | undefined): boolean {
  const spec = manifest?.dependencies?.[name]?.replaceAll('\\', '/')
  const expectedSuffix = `.dsh-desktop-plugins/${name}`
  const usesBundledCopy = spec?.endsWith(expectedSuffix) === true
  const resolves = existsSync(join(profileDir(PROFILE), 'node_modules', name, 'package.json'))
  const enabled = manifest?.dsh?.profile?.bundles?.includes(name) === true
  return usesBundledCopy && resolves && enabled
}

/**
 * 0.2.1 的带空格绝对路径被 Windows shell 拆成了两个 pnpm 参数，除三个坏掉的
 * Desktop\\plugins 链接外，还会多出一个名为 `DSH` 的半截路径依赖。只匹配本应用
 * 旧 userData 路径且目标确实不存在时才清理，避免误删用户自己安装的同名包。
 */
function hasLegacySplitDependency(manifest: ProfileManifest | undefined): boolean {
  if (process.platform !== 'win32') return false
  const spec = manifest?.dependencies?.DSH?.replaceAll('\\', '/').toLowerCase()
  const target = join(dirname(dataRoot()), 'DSH')
  const expected = `link:${target.replaceAll('\\', '/')}`.toLowerCase()
  return spec === expected && !existsSync(join(target, 'package.json'))
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

/** 转发一次 `dsh plugin --profile web <pnpm 参数...>`。 */
async function runPluginCommand(runtimeVersion: string, args: string[]): Promise<void> {
  const entry = harnessEntry(runtimeVersion)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bundledNode(), [entry, 'plugin', '--profile', PROFILE, ...args], {
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

async function runAdd(runtimeVersion: string, names: string[]): Promise<void> {
  await runPluginCommand(runtimeVersion, ['add', ...names.map(pluginSpec)])
}

/**
 * 确保随包分发的插件都装好了。
 *
 * 必须在启动 `dsh web` 之前调用——profile 是在 dsh 启动时读的，装晚了要等下次重启。
 * 插件装不上会抛错，由启动流程明确提示用户。静默打开一个缺少三个主入口的界面
 * 会让坏安装被误认为正常安装，且后续启动也无法自愈。
 *
 * @param runtimeVersion - 当前运行时版本，用来定位 dsh 入口。
 */
export async function ensureBundledPlugins(runtimeVersion: string): Promise<void> {
  const names = (await bundledPlugins()).sort()
  if (names.length === 0) throw new Error(`安装包中没有找到内置插件：${bundledPluginsDir()}`)

  const source = bundledPluginsDir()
  const target = installedPluginsDir()
  await mkdir(target, { recursive: true })

  // 先把全部副本准备好，再用一次 pnpm add 同时修复全部依赖。旧版留下的三个坏
  // link: 互相依赖；逐个修时，pnpm 会先因另外两个目标不存在而失败。
  for (const name of names) {
    const dest = join(target, name)
    await rm(dest, { recursive: true, force: true })
    await cp(join(source, name), dest, { recursive: true })
  }

  let manifest = await readProfileManifest()
  const needsRepair = names.filter(name => !pluginReady(name, manifest))
  if (needsRepair.length > 0) {
    log.info(`正在安装或修复内置插件：${names.join('、')} …`)
    await runAdd(runtimeVersion, names)
    manifest = await readProfileManifest()
  }

  if (hasLegacySplitDependency(manifest)) {
    log.info('正在清理旧版本遗留的无效 DSH 插件链接…')
    await runPluginCommand(runtimeVersion, ['remove', 'DSH'])
    manifest = await readProfileManifest()
  }

  const broken = names.filter(name => !pluginReady(name, manifest))
  if (broken.length > 0) {
    throw new Error(`插件安装命令结束后仍未正确启用：${broken.join('、')}`)
  }
  log.info(`内置插件已就绪：${names.join('、')}`)
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
