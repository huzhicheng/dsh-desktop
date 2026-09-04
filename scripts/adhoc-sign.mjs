/**
 * 给 macOS 产物做 ad-hoc 签名（electron-builder 的 afterPack 钩子）。
 *
 * 不签名的包在 Apple Silicon 上会被 Gatekeeper 判成「已损坏，无法打开」，
 * 而且这个提示**没法用右键「打开」绕过**——那条路只对「未验证的开发者」有效。
 * 用户只能去终端敲 xattr，对一个面向普通用户的桌面应用来说等于装不上。
 *
 * 原因是 electron-builder 在 identity: null 时完全跳过签名，包里只剩 Electron
 * 二进制自带的 linker-signed 签名：Info.plist 没被绑定、资源没签，
 * 签名与内容对不上，于是判定为损坏（codesign -dv 能看到 `Info.plist=not bound`）。
 *
 * ad-hoc 签名（codesign --sign -）不需要任何证书或开发者账号，能让签名与内容
 * 自洽。它不能让应用「受信任」——首次打开仍会提示「未验证的开发者」，但那个
 * 提示可以用右键「打开」绕过，是普通用户做得到的操作。
 *
 * 要彻底免提示需要 Developer ID 证书加公证，见 docs/development.md。
 */
import { execFileSync } from 'node:child_process'

/**
 * @param {{ appOutDir: string, packager: { appInfo: { productFilename: string } }, electronPlatformName: string }} context
 */
export default async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  /*
   * 有 Developer ID 证书时让路。
   *
   * electron-builder 自己会用证书签名并附上 entitlements；此时再跑一遍 ad-hoc
   * 会把那份签名连同 entitlements 一起覆盖掉，公证必然失败，而构建仍是绿的。
   * 判断依据取配置里的 identity：显式为 null 才是「不签名」，才轮到这里兜底。
   */
  if (context.packager.platformSpecificBuildOptions.identity !== null) {
    process.stdout.write('  • 已配置 Developer ID，跳过 ad-hoc 签名\n')
    return
  }

  const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  // --deep 连同内置的 Node、pnpm、helper 一起签；--force 覆盖 Electron 自带的
  // linker-signed 签名。顺序上必须先签内层再签外层，--deep 已经处理好。
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], {
    stdio: 'inherit',
  })

  // 签完立刻验一遍：签名失败但构建成功的包，要到用户双击时才暴露，
  // 那正是这个问题第一次出现时的情形
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  process.stdout.write(`  • ad-hoc 签名完成并校验通过  ${app}\n`)
}
