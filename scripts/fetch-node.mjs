/**
 * 下载官方 Node.js 运行时到 vendor/node/<platform>-<arch>/。
 * 打包时会作为 extraResources 进入 app，用户因此无需自行安装 Node.js。
 *
 * 用法：node scripts/fetch-node.mjs [--platform darwin|win32] [--arch arm64|x64]
 * 不传参数时下载当前机器平台；跨平台打包（如 mac 上出 Windows 包）时显式指定。
 */
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ROOT = resolve(import.meta.dirname, '..')
// dsh 要求 Node ^22.19.0 || >=24.0.0，选 24 的最新版；解析失败时退回这个已知版本
const FALLBACK_VERSION = 'v24.10.0'
const NODE_MAJOR = 24
const MIRRORS = [
  'https://nodejs.org/dist',
  'https://npmmirror.com/mirrors/node',
]

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}
const platform = flag('--platform') ?? process.platform
const arch = flag('--arch') ?? process.arch
if (platform !== 'darwin' && platform !== 'win32') {
  console.error(`不支持的平台：${platform}（支持 darwin、win32）`)
  process.exit(1)
}

// 两个平台的发行包形态不同：
// darwin: node-vX-darwin-arm64.tar.gz，内含 bin/node 与 lib/node_modules/npm
// win32:  node-vX-win-x64.zip，node.exe 与 node_modules/npm 都在根目录
const distPlatform = platform === 'win32' ? 'win' : 'darwin'
const extension = platform === 'win32' ? 'zip' : 'tar.gz'
const nodeBinary = platform === 'win32' ? 'node.exe' : 'bin/node'

async function resolveVersion() {
  for (const base of MIRRORS) {
    try {
      const response = await fetch(`${base}/index.json`, { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) continue
      const releases = await response.json()
      const match = releases.find(r => Number(r.version.slice(1).split('.')[0]) === NODE_MAJOR)
      if (match) return match.version
    } catch {
      // 换下一个镜像
    }
  }
  return FALLBACK_VERSION
}

async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) })
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）：${url}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

async function main() {
  const version = await resolveVersion()
  const name = `node-${version}-${distPlatform}-${arch}`
  const targetDir = join(ROOT, 'vendor/node', `${platform}-${arch}`)
  const markerFile = join(targetDir, '.version')

  if (existsSync(join(targetDir, nodeBinary)) && existsSync(markerFile)) {
    console.log(`Node 运行时已就绪：${targetDir}`)
    return
  }

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(join(ROOT, 'vendor/node'), { recursive: true })
  const archive = join(ROOT, 'vendor/node', `${name}.${extension}`)

  let lastError
  for (const base of MIRRORS) {
    const url = `${base}/${version}/${name}.${extension}`
    console.log(`下载 Node 运行时：${url}`)
    try {
      await download(url, archive)
      lastError = undefined
      break
    } catch (error) {
      lastError = error
      console.warn(`该镜像下载失败，尝试下一个：${error.message}`)
    }
  }
  if (lastError) throw lastError

  console.log('解压中…')
  // bsdtar（macOS 自带、Windows 11 自带）同时支持 tar.gz 与 zip
  execFileSync('tar', ['-xf', archive, '-C', join(ROOT, 'vendor/node')])
  await rename(join(ROOT, 'vendor/node', name), targetDir)
  await rm(archive, { force: true })
  await writeFile(markerFile, `${version}\n`)

  if (platform === process.platform && arch === process.arch) {
    const reported = execFileSync(join(targetDir, nodeBinary), ['--version'], { encoding: 'utf8' }).trim()
    console.log(`Node 运行时就绪：${targetDir}（${reported}）`)
  } else {
    console.log(`Node 运行时就绪（交叉准备，未验证可执行）：${targetDir}（${version}）`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
