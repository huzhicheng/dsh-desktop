/**
 * 构建期准备"种子运行时"：用 vendor 里的 Node/npm 安装 @deepseek-ai/dsh，
 * 打成 tar.gz 放进 vendor/seed/，随 app 分发。用户首次启动时解压即用，
 * 无需联网；之后的升级走应用内在线升级。
 *
 * 支持交叉准备：在 mac 上用 --platform win32 --arch x64 生成 Windows 种子。
 * 交叉时给 npm 传 --os/--cpu 选平台相关依赖，并 --ignore-scripts 避免在
 * 本机生成错误平台的构建产物（原生模块运行时都会从各自的 prebuilds/平台包加载）。
 *
 * 用法：node scripts/seed-runtime.mjs [--version <x.y.z>] [--platform darwin|win32] [--arch arm64|x64]
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = '@deepseek-ai/dsh'
const REGISTRY = process.env.SEED_NPM_REGISTRY ?? 'https://registry.npmjs.org'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}
const targetPlatform = flag('--platform') ?? process.platform
const targetArch = flag('--arch') ?? process.arch
const cross = targetPlatform !== process.platform || targetArch !== process.arch

// 安装工具链永远用"本机"的 vendor Node/npm；目标平台只影响依赖选择与产物目录
const hostDir = join(ROOT, 'vendor/node', `${process.platform}-${process.arch}`)
const nodeBin = process.platform === 'win32' ? join(hostDir, 'node.exe') : join(hostDir, 'bin/node')
const npmCli = process.platform === 'win32'
  ? join(hostDir, 'node_modules/npm/bin/npm-cli.js')
  : join(hostDir, 'lib/node_modules/npm/bin/npm-cli.js')

function runNpm(args, options = {}) {
  return execFileSync(nodeBin, [npmCli, ...args], {
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: {
      ...process.env,
      PATH: `${process.platform === 'win32' ? hostDir : join(hostDir, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
      npm_config_update_notifier: 'false',
    },
    ...options,
  })
}

/** 交叉种子的完整性校验：这些平台产物缺一不可。 */
function verifyStaged(staging) {
  const modules = join(staging, 'node_modules')
  const required = [
    join(modules, '@deepseek-ai/dsh/lib/bin.js'),
    join(modules, '@deepseek-ai/dsh-web-frontend/dist/index.html'),
    join(modules, `node-pty/prebuilds/${targetPlatform}-${targetArch}`),
    join(modules, `@koromix/koffi-${targetPlatform}-${targetArch}`),
  ]
  if (targetPlatform === 'win32') {
    required.push(
      join(modules, `node-pty/prebuilds/win32-${targetArch}/conpty.node`),
      join(modules, `node-pty/prebuilds/win32-${targetArch}/winpty.dll`),
    )
  }
  const missing = required.filter(path => !existsSync(path))
  if (missing.length > 0) {
    throw new Error(`种子缺少目标平台产物：\n${missing.join('\n')}`)
  }
  // 交叉 --ignore-scripts 时不应存在本机平台的构建产物
  const buildDir = join(modules, 'node-pty/build')
  if (cross && existsSync(buildDir)) {
    throw new Error(`交叉种子中出现了本机构建产物，应清理：${buildDir}`)
  }
}

/**
 * 清理种子里的符号链接与 .bin 目录。
 * Windows 解压符号链接需要管理员/开发者模式，普通用户会直接失败；
 * 而桌面壳从不经由 .bin 启动（直接 node <入口文件>），删掉即可，
 * 两个平台统一处理，保证行为一致。
 */
async function stripSymlinks(staging) {
  let removed = 0
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        await rm(path, { force: true })
        removed++
      } else if (entry.isDirectory()) {
        if (entry.name === '.bin') {
          await rm(path, { recursive: true, force: true })
          removed++
        } else {
          await walk(path)
        }
      }
    }
  }
  await walk(join(staging, 'node_modules'))
  console.log(`已清理符号链接与 .bin 目录：${removed} 处`)
}

/** 最后一道防线：确认 tar 包里没有任何符号链接条目。 */
function assertNoSymlinkEntries(tarball) {
  const listing = execFileSync('tar', ['-tvf', tarball], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  const symlinks = listing.split('\n').filter(line => line.startsWith('l'))
  if (symlinks.length > 0) {
    throw new Error(`种子 tar 包中仍存在符号链接（Windows 无法解压）：\n${symlinks.slice(0, 5).join('\n')}`)
  }
}

async function main() {
  if (!existsSync(nodeBin)) {
    console.error(`未找到本机 vendor Node 运行时，请先执行：npm run prepare:node（期望路径 ${nodeBin}）`)
    process.exit(1)
  }

  const version = flag('--version')
    ?? runNpm(['view', `${PACKAGE}@latest`, 'version', `--registry=${REGISTRY}`], { quiet: true, stdio: ['ignore', 'pipe', 'inherit'] }).trim()
  console.log(`准备种子运行时：${PACKAGE}@${version}（目标 ${targetPlatform}-${targetArch}${cross ? '，交叉准备' : ''}）`)

  const seedDir = join(ROOT, 'vendor/seed', `${targetPlatform}-${targetArch}`)
  const manifestFile = join(seedDir, 'seed.json')
  const tarball = join(seedDir, 'runtime.tar.gz')
  if (existsSync(manifestFile) && existsSync(tarball)) {
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
    if (manifest.version === version) {
      console.log(`种子已是最新（${version}），跳过`)
      return
    }
  }

  const staging = join(ROOT, 'vendor/seed', `.staging-${targetPlatform}-${targetArch}`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  runNpm([
    'install', `${PACKAGE}@${version}`,
    '--prefix', staging,
    '--omit=dev', '--no-audit', '--no-fund', '--no-progress',
    '--loglevel=warn',
    `--registry=${REGISTRY}`,
    ...(cross ? [`--os=${targetPlatform}`, `--cpu=${targetArch}`, '--ignore-scripts'] : []),
  ])

  verifyStaged(staging)
  await stripSymlinks(staging)

  await rm(seedDir, { recursive: true, force: true })
  await mkdir(seedDir, { recursive: true })
  console.log('打包种子 tar.gz…')
  execFileSync('tar', ['-czf', tarball, '-C', staging, 'node_modules', 'package.json', 'package-lock.json'])
  assertNoSymlinkEntries(tarball)
  await writeFile(manifestFile, `${JSON.stringify({ package: PACKAGE, version, platform: targetPlatform, arch: targetArch }, undefined, 2)}\n`)
  await rm(staging, { recursive: true, force: true })
  console.log(`种子运行时就绪：${tarball}（${PACKAGE}@${version}）`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
