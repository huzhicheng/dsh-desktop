/**
 * 准备 ACP profile：飞书桥接靠 `dsh --profile acp` 驱动 agent，
 * 而官方的 @deepseek-ai/dsh-acp 不在运行时依赖里，得单独装到 profile 目录。
 *
 * profile 的 bundle（dsh-base 等）从运行时解析，这里只装 dsh-acp 自己，
 * 并且版本跟当前运行时对齐——它的 peer 依赖指向同版本的 agent/session/approval。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { delimiter, join } from 'node:path'
import { dump, load } from 'js-yaml'
import { REGISTRIES } from './config'
import { log } from './logger'
import { bundledNode, bundledNodePathEntry, bundledNpmCli, dshHome, npmCacheDir, profileDir } from './paths'
import type { PermissionMode } from '../bridge/types'

const ACP_PACKAGE = '@deepseek-ai/dsh-acp'
const PROFILE = 'acp'

/** profile 根：条目全部由 bundle 与 patch 组合而来。 */
const CORDIS_YML = `# 由 DSH Desktop 生成：ACP 自动化 profile 的根条目表恒为空，
# 组合结果来自 package.json 的 dsh.profile.bundles 与 cordis.patch.yml。
[]
`

/** dsh-base 自带的默认模型；桌面端没选过模型时用它。 */
const FALLBACK_MODEL: ModelSelection = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }

interface ModelSelection {
  provider: string
  model: string
}

/**
 * patch 层。要点：
 * - 挂 code-runtime（headless 组合也这么做，Code Mode 属于核心执行能力）
 * - 关 HMR：长驻自动化进程不需要，而且它会干扰 stdio 上的协议帧
 * - settings 指向独立文件：桌面端可以放开权限，聊天里驱动的会话必须留在 ask
 * - acp 插件必须拿到 provider/model：它不读 ctx.agentDefaultModel，
 *   缺了会在第一轮就报 `{{model}}` 无值
 */
function cordisPatch(selection: ModelSelection): string {
  return `# 由 DSH Desktop 生成，供远程控制使用。手改后会在下次启动桥接时被覆盖。
- id: system-prompt
  config:
    persona: >-
      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.
      You are being driven through an instant-messaging bridge, so the user reads your replies in a chat app:
      keep final answers short and self-contained, and never assume the user can see your terminal.

- id: hmr
  disabled: true

- id: settings
  config:
    path: !!js dshHomePath('acp-settings.yaml')

- insert:
    - id: code-runtime
      name: '@deepseek-ai/dsh-code-runtime-worker-thread'

    - id: acp
      name: '@deepseek-ai/dsh-acp'
      config:
        provider: ${JSON.stringify(selection.provider)}
        model: ${JSON.stringify(selection.model)}
`
}

const WORKSPACE_YAML = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

function packageJson(version: string): string {
  return `${JSON.stringify({
    name: 'dsh-profile-acp',
    private: true,
    dependencies: { [ACP_PACKAGE]: version },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }, null, 2)}\n`
}

/** 已装的 dsh-acp 版本；没装返回 undefined。 */
async function installedVersion(): Promise<string | undefined> {
  try {
    const file = join(profileDir(PROFILE), 'node_modules', ACP_PACKAGE, 'package.json')
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { version?: string }
    return parsed.version
  } catch {
    return undefined
  }
}

async function npmInstall(registry: string): Promise<void> {
  const dir = profileDir(PROFILE)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bundledNode(), [
      bundledNpmCli(), 'install',
      // 不装 peer：dsh-agent / dsh-session 这些要走运行时那一份，
      // 装第二份会让插件和宿主拿到不同的模块实例
      '--legacy-peer-deps',
      '--no-audit', '--no-fund', '--no-progress', '--loglevel=warn',
      `--registry=${registry}`,
    ], {
      cwd: dir,
      env: {
        ...process.env,
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
      tail = (tail + chunk.toString()).slice(-4096)
      log.host(chunk.toString())
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`安装 ${ACP_PACKAGE} 失败（exit ${String(code)}）\n${tail}`))
    })
  })
}

async function readYaml(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed = load(await readFile(file, 'utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * 同步 ACP 侧的独立设置文件。
 *
 * 模型选择跟随桌面端（用户在 Web UI 里换了模型，聊天里也该换），
 * 权限则由桥接设置单独决定——桌面端可以是 danger-full-access，
 * 而聊天里驱动的会话要留在 ask 上，才有卡片审批可言。
 */
async function syncAcpSettings(permissionMode: PermissionMode): Promise<ModelSelection> {
  const target = join(dshHome(), 'acp-settings.yaml')
  const desktop = await readYaml(join(dshHome(), 'settings.yaml'))
  const current = await readYaml(target)
  const next: Record<string, unknown> = { ...current }
  const desktopModel = desktop['agent-default-model']
  if (desktopModel !== undefined) next['agent-default-model'] = desktopModel
  next['permission'] = { defaultPreset: permissionMode }
  const header = '# 由 DSH Desktop 生成：IM 桥接（ACP profile）专用设置，与桌面端 settings.yaml 隔离。\n'
    + '# 模型跟随桌面端，权限由「远程控制」设置决定。\n'
  await writeFile(target, header + dump(next))

  const selection = next['agent-default-model']
  if (selection !== null && typeof selection === 'object') {
    const { provider, model } = selection as Partial<ModelSelection>
    if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== '') {
      return { provider, model }
    }
  }
  return FALLBACK_MODEL
}

/**
 * 确保 acp profile 就绪并与运行时版本对齐。
 * 抛错由调用方决定怎么处理（桥接是可选能力，不该拦住应用启动）。
 */
export async function ensureAcpProfile(runtimeVersion: string, permissionMode: PermissionMode): Promise<void> {
  const dir = profileDir(PROFILE)
  await mkdir(dir, { recursive: true })

  // profile 骨架每次对齐，保证壳升级带来的 patch 变化与换过的模型都能落地
  const selection = await syncAcpSettings(permissionMode)
  await writeFile(join(dir, 'cordis.yml'), CORDIS_YML)
  await writeFile(join(dir, 'cordis.patch.yml'), cordisPatch(selection))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), WORKSPACE_YAML)
  await writeFile(join(dir, 'package.json'), packageJson(runtimeVersion))

  if (await installedVersion() === runtimeVersion) return

  log.info(`准备 ACP profile：安装 ${ACP_PACKAGE}@${runtimeVersion}`)
  let lastError: unknown
  for (const registry of REGISTRIES) {
    try {
      await npmInstall(registry)
      const installed = await installedVersion()
      if (installed === undefined) throw new Error('安装完成但找不到包')
      log.info(`ACP profile 就绪（${ACP_PACKAGE}@${installed}）`)
      return
    } catch (error) {
      lastError = error
      log.warn(`从 ${registry} 安装 ${ACP_PACKAGE} 失败，尝试下一个源`)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
