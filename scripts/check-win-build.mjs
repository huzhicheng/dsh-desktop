/**
 * Windows 打包前置检查。
 *
 * electron-builder 生成 NSIS 卸载器时，必须真正执行一遍 NSIS 的 WriteUninstaller
 * （见 app-builder-lib/out/targets/nsis/NsisTarget.js）：Windows 上原生执行，
 * 其它平台走 Wine。本机没有 Wine 时这一步会静默失败，构建照样返回成功，
 * 但安装包里嵌入的卸载器是坏的——用户能装上却卸不掉（NSIS 完整性校验失败）。
 *
 * 所以在非 Windows 且无 Wine 时直接拒绝构建 NSIS，避免再次产出坏包。
 */
import { execFileSync } from 'node:child_process'

function hasWine() {
  for (const binary of ['wine64', 'wine']) {
    try {
      execFileSync('command', ['-v', binary], { stdio: 'ignore', shell: true })
      return true
    } catch {
      // 继续试下一个
    }
  }
  return false
}

if (process.platform === 'win32') {
  console.log('打包前置检查通过：当前是 Windows，卸载器可原生生成。')
  process.exit(0)
}

if (hasWine()) {
  console.log('打包前置检查通过：检测到 Wine，electron-builder 可生成卸载器。')
  process.exit(0)
}

console.error(`
拒绝在 ${process.platform} 上构建 NSIS 安装包：本机没有 Wine。

原因：NSIS 卸载器必须实际运行一遍才能生成，非 Windows 平台依赖 Wine。
缺少 Wine 时 electron-builder 不会报错，但产出的安装包"能装不能卸"
（卸载时报 Installer integrity check has failed）。

请选择其一：
  1. 免安装版（推荐，立即可用）：npm run dist:win:zip
     产出 zip，解压后直接运行 DSH Desktop.exe，不涉及 NSIS。
  2. 在 Windows 上构建：推送到 GitHub 后触发 .github/workflows/build.yml
     （windows-latest 原生构建，安装器与卸载器都正确）。
  3. 本机安装 Wine 后重试：brew install --cask wine-stable
`.trim())
process.exit(1)
