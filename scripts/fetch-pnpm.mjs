/**
 * 把 pnpm 下载到 vendor/pnpm，随安装包一起分发。
 *
 * 为什么不直接用 corepack：corepack 只是个转发器，第一次执行 `corepack pnpm`
 * 时会去 registry 下载真正的 pnpm。开发机上早就下过、缓存在 COREPACK_HOME 里，
 * 所以一直没暴露；到了全新的用户机器上这一步要联网，装插件因此失败——
 * 而 dsh 的插件安装命令本质就是 pnpm 转发器，没有 pnpm 就什么都装不了。
 * 应用承诺的是「下载即用」，不能在首启时依赖一次网络请求。
 *
 * 只保留运行必需的部分：artifacts/ 是独立可执行版才用的各平台原生二进制
 * （18MB），我们用 node 跑 bin/pnpm.cjs，不需要它。精简后约 20MB。
 *
 * 用法：node scripts/fetch-pnpm.mjs
 */
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TARGET = join(ROOT, 'vendor/pnpm')
/** 跑起来用不到、只占体积的部分。 */
const DROP = ['artifacts', 'CHANGELOG.md', 'README.md']

async function main() {
  if (existsSync(join(TARGET, 'bin/pnpm.cjs'))) {
    const manifest = JSON.parse(await readFile(join(TARGET, 'package.json'), 'utf8'))
    process.stdout.write(`vendor/pnpm 已存在（${manifest.version}），跳过\n`)
    return
  }

  const staging = join(ROOT, 'vendor/.pnpm-staging')
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  /*
   * 直接问 registry 要 tarball，不经过 npm 命令。
   *
   * 试过 `npm pack`，两个平台各挂一次：Windows 上 npm 是 npm.cmd，
   * execFileSync 不带扩展名报 ENOENT；带上扩展名之后，Node 20 起出于安全
   * 考虑禁止不经 shell 直接 spawn .cmd/.bat，又变成 EINVAL。与其为它加
   * shell 并处理引号转义，不如省掉这层依赖——registry 的接口两个平台一样。
   */
  process.stdout.write('正在下载 pnpm …\n')
  const meta = await (await fetch('https://registry.npmjs.org/pnpm/latest')).json()
  const url = meta?.dist?.tarball
  if (typeof url !== 'string') throw new Error('registry 未返回 pnpm 的 tarball 地址')

  const tarball = join(staging, 'pnpm.tgz')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载 pnpm 失败：HTTP ${response.status}`)
  await writeFile(tarball, Buffer.from(await response.arrayBuffer()))

  // tar 在 macOS 与 Windows 10+ 都是真正的可执行文件，不是 shell 内建
  execFileSync('tar', ['-xzf', tarball, '-C', staging], { stdio: 'inherit' })

  await rm(TARGET, { recursive: true, force: true })
  await mkdir(join(ROOT, 'vendor'), { recursive: true })
  await cp(join(staging, 'package'), TARGET, { recursive: true })
  for (const name of DROP) await rm(join(TARGET, name), { recursive: true, force: true })
  await rm(staging, { recursive: true, force: true })

  const manifest = JSON.parse(await readFile(join(TARGET, 'package.json'), 'utf8'))
  if (!existsSync(join(TARGET, 'bin/pnpm.cjs'))) {
    throw new Error('pnpm 产物缺少 bin/pnpm.cjs，包结构可能变了')
  }
  process.stdout.write(`pnpm ${manifest.version} 已放入 vendor/pnpm（${meta.version}）\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
