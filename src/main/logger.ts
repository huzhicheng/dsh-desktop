/** 简单的落盘日志：桌面壳与 Harness 服务输出统一写到用户目录，便于排障。 */

import { createWriteStream, mkdirSync, statSync, renameSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

const MAX_LOG_BYTES = 5 * 1024 * 1024

let stream: WriteStream | undefined
let logDirectory: string | undefined

export function initLogger(directory: string): void {
  logDirectory = directory
  mkdirSync(directory, { recursive: true })
  const file = join(directory, 'desktop.log')
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG_BYTES) {
      renameSync(file, join(directory, 'desktop.log.1'))
    }
  } catch {
    // 轮转失败不影响继续写
  }
  stream = createWriteStream(file, { flags: 'a' })
}

export function logDir(): string | undefined {
  return logDirectory
}

function write(level: string, parts: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${parts.map(part => part instanceof Error ? (part.stack ?? part.message) : typeof part === 'string' ? part : JSON.stringify(part)).join(' ')}\n`
  stream?.write(line)
  if (level === 'error') process.stderr.write(line)
  else process.stdout.write(line)
}

export const log = {
  info: (...parts: unknown[]) => { write('info', parts) },
  warn: (...parts: unknown[]) => { write('warn', parts) },
  error: (...parts: unknown[]) => { write('error', parts) },
  /** Harness 子进程的原始输出，按块透传。 */
  host: (chunk: string) => { stream?.write(chunk) },
}
