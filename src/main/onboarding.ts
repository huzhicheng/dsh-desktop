/**
 * 跳过 Harness 的首次运行内测声明。
 *
 * dsh 首启会弹一个「内测声明」模态框，说明 0.1 版仍在面向 Harness 开发者
 * 测试。那是 dsh 面向自己开发者受众的话；桌面端面向的是不碰命令行的普通
 * 用户，装完先被一段开发者声明拦住并不合适。上游处于预览阶段这件事，我们
 * 在 README 与发布说明里都写着，信息并没有被藏起来。
 *
 * 做法是按 dsh 自己的约定预置确认状态：它把用户点过「继续」这件事记在
 * settings 的 `ui-onboarding.welcomeNoticeVersion` 里，与当前声明版本做全等
 * 比较（见 dsh-client-ui-settings-models 的 README 与 onboarding-copy）。
 * 预置成当前版本即可，不改 dsh 任何代码。
 *
 * 版本号从装好的运行时里现读，不写死：dsh 每次实质性修改声明都会 bump 这个
 * 版本让所有人重看一遍，写死的话升级后声明又会冒出来。读不到就跳过，
 * 让声明正常显示——这只是省一次点击，不值得为它冒险。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome, versionsDir } from './paths'
import { log } from './logger'

/** dsh 存放该确认状态的 settings namespace 与字段。 */
const NAMESPACE = 'ui-onboarding'
const FIELD = 'welcomeNoticeVersion'

/** 从运行时里读出当前声明版本。 */
async function noticeVersion(runtimeVersion: string): Promise<string | undefined> {
  const file = join(
    versionsDir(), runtimeVersion,
    'node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/types/onboarding-copy.d.ts',
  )
  if (!existsSync(file)) return undefined
  const source = await readFile(file, 'utf8')
  return /WELCOME_NOTICE_VERSION\s*=\s*["']([^"']+)["']/.exec(source)?.[1]
}

/**
 * 预置内测声明的确认状态。
 *
 * 只在用户还没有任何确认记录时写入：用户自己点过、或手动改过的值一律不动。
 * settings.yaml 是 dsh 的文件，这里只做「没有该字段就补一行」的最小改动，
 * 不重排、不重写其余内容。
 *
 * @param runtimeVersion - 当前运行时版本，用来定位声明版本号。
 */
export async function skipWelcomeNotice(runtimeVersion: string): Promise<void> {
  try {
    const version = await noticeVersion(runtimeVersion)
    if (version === undefined) return

    const path = join(dshHome(), 'settings.yaml')
    const existing = existsSync(path) ? await readFile(path, 'utf8') : ''
    // 已经有这个 namespace 就不碰——用户点过「继续」，或自己改过
    if (new RegExp(`^${NAMESPACE}:`, 'm').test(existing)) return

    const block = `${NAMESPACE}:\n  ${FIELD}: ${version}\n`
    const next = existing === '' ? block : `${block}${existing.startsWith('\n') ? '' : ''}${existing}`
    await writeFile(path, next, 'utf8')
    log.info(`已预置内测声明确认状态（${version}）`)
  } catch (error) {
    // 写不进去就让声明正常显示，不影响任何功能
    log.warn('预置内测声明状态失败：', error instanceof Error ? error.message : String(error))
  }
}
