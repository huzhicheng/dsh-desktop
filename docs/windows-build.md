# Windows 安装包构建与虚拟机验证

本文记录 DSH Desktop 的 Windows 11 x64 安装包构建方法。该流程已在 macOS
宿主机上的 Parallels Windows 11 虚拟机中实际验证。

## 为什么必须在 Windows 中构建

`npm run dist:win` 生成的是 NSIS 安装包。NSIS 在构建过程中必须实际执行一次
`WriteUninstaller` 来生成卸载器：Windows 可以原生执行，其他平台需要 Wine。

没有 Wine 时，macOS 上的 electron-builder 可能仍然返回成功，但生成的卸载器会损坏，
最终表现为应用可以安装，却无法正常卸载。因此：

- 正式安装包 `.exe` 必须在 Windows 中构建。
- macOS 只能直接构建免安装 `.zip`：`npm run dist:win:zip`。
- `scripts/check-win-build.mjs` 会阻止在没有 Wine 的非 Windows 系统中误构建 NSIS。

## 一、在 macOS 上准备 Windows 资源

在项目目录执行：

```sh
cd /path/to/dsh-desktop
npm install
npm run prepare:node
npm run prepare:win
```

完成后确认以下文件存在：

```text
vendor/node/win32-x64/node.exe
vendor/node/win32-x64/node_modules/npm/bin/npm-cli.js
vendor/node/win32-x64/node_modules/corepack/dist/corepack.js
vendor/pnpm/bin/pnpm.cjs
vendor/seed/win32-x64/runtime.tar.gz
vendor/seed/win32-x64/seed.json
```

其中 npm 用于 Harness 在线升级，随包 pnpm 用于离线安装三个内置插件，Corepack 是
pnpm 缺失时的联网兜底；这些文件都不能从安装包中遗漏。

## 二、把源码复制到 Windows 本地磁盘

不要直接复用 macOS 安装出来的根级 `node_modules`，其中包含 macOS 平台依赖。
建议把源码复制到虚拟机的 `C:\dsh-win-build`，然后在 Windows 中重新执行 `npm ci`。

Parallels 默认可通过 `C:\Mac\Home` 访问 macOS 用户目录。以下命令在 Windows 的
命令提示符中执行：

```bat
set "SOURCE=C:\Mac\Home\products\deepseek-herness-app"
set "TARGET=C:\dsh-win-build"

robocopy "%SOURCE%" "%TARGET%" /E ^
  /XD "%SOURCE%\node_modules" "%SOURCE%\release" "%SOURCE%\dist" "%SOURCE%\build" ^
  /XF .DS_Store /R:1 /W:1
```

这里的 `/XD` 必须使用完整路径，只排除项目根级目录。不要写成简单的
`/XD node_modules`，否则 `vendor/node/win32-x64/node_modules` 中的 npm 和
Corepack 也会被排除。

复制后再次确认：

```bat
dir "C:\dsh-win-build\vendor\node\win32-x64\node_modules\npm\bin\npm-cli.js"
dir "C:\dsh-win-build\vendor\node\win32-x64\node_modules\corepack\dist\corepack.js"
```

## 三、安装 Windows 构建依赖

Windows 虚拟机不需要另外安装全局 Node.js，可以直接使用项目已经准备好的 Windows
Node 运行时。关键是必须先把它加入 `PATH`，否则 Electron、esbuild 等依赖的安装脚本
会报“找不到 node”。

在 Windows 命令提示符中执行：

```bat
cd /d C:\dsh-win-build
set "NODE_HOME=C:\dsh-win-build\vendor\node\win32-x64"
set "PATH=%NODE_HOME%;%PATH%"

node "%NODE_HOME%\node_modules\npm\bin\npm-cli.js" ci --no-audit --no-fund
```

然后做一次基础检查：

```bat
node "%NODE_HOME%\node_modules\npm\bin\npm-cli.js" run typecheck
node "%NODE_HOME%\node_modules\npm\bin\npm-cli.js" run build
```

## 四、生成 NSIS 安装包

继续在同一个命令提示符窗口执行：

```bat
node "%NODE_HOME%\node_modules\npm\bin\npm-cli.js" run dist:win
```

构建成功后会看到：

```text
Windows 包关键资源检查通过（Node、npm、corepack、种子运行时、三个内置插件均完整）。
```

安装包位于：

```text
C:\dsh-win-build\release\DSH Desktop Setup <版本>.exe
```

文件名中的版本号来自根目录 `package.json`。构建脚本还会生成 `.blockmap`，供以后接入
electron-updater 时使用。

`scripts/verify-win-package.mjs` 会自动检查以下关键文件，缺失时让构建直接失败：

- Electron 主程序和 `app.asar`
- 内置 `node.exe`
- npm CLI
- Corepack CLI
- Harness 种子运行时和清单
- 随包 pnpm
- 插件管理、皮肤、远程控制三个内置插件的 package.json 与浏览器端代码

## 五、在虚拟机中安装和启动验证

### 1. 安装

双击安装包，选择“仅为我安装”并完成安装。也可以在 PowerShell 中进行无界面测试：

```powershell
$installer = 'C:\dsh-win-build\release\DSH Desktop Setup <版本>.exe'
(Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru).ExitCode
```

返回 `0` 表示安装器正常结束。默认安装目录为：

```text
C:\Users\<用户名>\AppData\Local\Programs\DSH Desktop
```

### 2. 检查安装资源

```powershell
$app = "$env:LOCALAPPDATA\Programs\DSH Desktop"
Test-Path "$app\DSH Desktop.exe"
Test-Path "$app\Uninstall DSH Desktop.exe"
Test-Path "$app\resources\node\node.exe"
Test-Path "$app\resources\node\node_modules\npm\bin\npm-cli.js"
Test-Path "$app\resources\node\node_modules\corepack\dist\corepack.js"
Test-Path "$app\resources\pnpm\bin\pnpm.cjs"
Test-Path "$app\resources\seed\runtime.tar.gz"
Test-Path "$app\resources\plugins\dsh-plugin-manager\lib\client.js"
Test-Path "$app\resources\plugins\dsh-plugin-remote-control\lib\client.js"
Test-Path "$app\resources\plugins\dsh-plugin-skin-studio\lib\client.js"
```

所有结果都应为 `True`。

### 3. 首次启动

从开始菜单打开 DSH Desktop。首次启动需要解压 Harness 种子并启动本地服务，在虚拟机
中可能需要 1～2 分钟。启动窗口会依次显示“检查环境 → 准备资源 → 启动服务 →
打开界面”、累计用时和当前阶段说明；解压与服务初始化都在本机完成，不是下载。

日志位置：

```text
C:\Users\<用户名>\AppData\Roaming\DSH Desktop\logs\desktop.log
```

正常日志应包含：

```text
种子运行时安装完成
内置插件已就绪：dsh-plugin-manager、dsh-plugin-remote-control、dsh-plugin-skin-studio
dsh web: http://127.0.0.1:37080
Harness 服务就绪：http://127.0.0.1:37080
```

也可以用 PowerShell 检查端口：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 37080
```

最后确认应用能够显示内测声明、API Key 配置页以及完整的 Harness 主界面，并且左侧栏
同时出现「插件」「皮肤」「远程控制」三个入口。

三个插件的可解析状态可用 PowerShell 检查：

```powershell
$profile = "$HOME\.dsh\profiles\web"
@('dsh-plugin-manager', 'dsh-plugin-remote-control', 'dsh-plugin-skin-studio') |
  ForEach-Object { Test-Path "$profile\node_modules\$_\package.json" }
```

三个结果都必须为 `True`。`package.json` 的 `dsh.profile.bundles` 中也必须有这三个包名。

### 4. 验证插件所需的 pnpm

应用启动后会在用户数据目录生成 pnpm 包装脚本：

```bat
"%APPDATA%\DSH Desktop\pnpm-shim\pnpm.cmd" --version
```

能输出 pnpm 版本号，说明插件安装链路可用。当前安装包直接携带 pnpm，这一步不需要联网；
只有随包 pnpm 异常缺失、退回 Corepack 时才可能下载。

### 5. 验证卸载器

可以从 Windows“已安装的应用”中卸载，也可以在 PowerShell 中测试：

```powershell
$uninstaller = "$env:LOCALAPPDATA\Programs\DSH Desktop\Uninstall DSH Desktop.exe"
(Start-Process -FilePath $uninstaller -ArgumentList '/S', '/currentuser' -Wait -PassThru).ExitCode
```

返回 `0` 后，程序目录、开始菜单快捷方式和卸载注册表项应被移除。当前配置
`deleteAppDataOnUninstall: false` 会保留用户数据，这是预期行为。

正式交付前建议完成一次完整的“安装 → 首启 → 主界面 → pnpm → 卸载 → 重装”回归。

## 六、复制安装包回项目目录

在 Windows 命令提示符中执行：

```bat
copy /Y "C:\dsh-win-build\release\DSH Desktop Setup <版本>.exe" ^
  "C:\Mac\Home\products\deepseek-herness-app\release\DSH Desktop Setup <版本>.exe"

copy /Y "C:\dsh-win-build\release\DSH Desktop Setup <版本>.exe.blockmap" ^
  "C:\Mac\Home\products\deepseek-herness-app\release\DSH Desktop Setup <版本>.exe.blockmap"
```

回到 macOS 后可计算校验值：

```sh
shasum -a 256 "release/DSH Desktop Setup <版本>.exe"
```

## 常见问题

### `'node' 不是内部或外部命令`

Windows Node 没有加入 `PATH`。重新执行：

```bat
set "NODE_HOME=C:\dsh-win-build\vendor\node\win32-x64"
set "PATH=%NODE_HOME%;%PATH%"
```

### 构建提示 `file source doesn't exist ... corepack`

复制项目时误排除了 `vendor/node/win32-x64/node_modules`。重新复制该目录，或重新按本文
第二步使用完整路径排除根级 `node_modules`。

### `EBUSY ... release\win-unpacked`

通常是上一次中断构建后残留的 `7za.exe`、`makensis.exe` 或安全软件仍占用文件。结束残留
构建进程后重试；无法确认占用方时重启虚拟机最稳妥。

### 安装成功，但左侧没有「插件 / 皮肤 / 远程控制」

先看日志里是否有“内置插件已就绪”，再检查 `~/.dsh/profiles/web/package.json`。旧版曾把
插件复制到 `AppData\Roaming\DSH Desktop\plugins`，Harness 在 Windows 上转发参数时会
把带空格的绝对路径截成 `link:Desktop\plugins\...`，看似安装成功但链接实际不存在。

当前版本把副本放在 profile 内的 `.dsh-desktop-plugins`，并传不含空格的相对 `link:`
路径；启动时会同时核对依赖地址、`node_modules` 是否可解析、bundle 是否启用，发现旧坏
链接会自动重装三个插件，并清理同一问题留下的无效 `DSH` 半截路径依赖。任一项仍失败时
应用会明确报错，不再静默打开残缺主界面。

### 安装时提示“未知发布者”

当前安装包没有 Windows 代码签名，SmartScreen 可能显示未知发布者。这不影响本机测试，
正式对外分发应配置 Windows 代码签名证书。
