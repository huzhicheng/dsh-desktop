# 开发文档

面向想改这个项目的人。用户向的说明在 [README](../README.md)。

## 核心设计：壳与运行时解耦

App 壳和 Harness 运行时是分开升级的。上游在 npm 发版，壳只要检测 dist-tag
就能把运行时装到用户目录里；壳自身很少变，需要时才走 electron-updater 发新包。

这是本项目与社区参考项目（anywhere-labs/deepseek-harness-desktop）的关键差异：
那边 fork 了官方 monorepo、把编译产物冻结进安装包，Harness 每升一次就得重发整个 App。

```
┌────────────────────────── DSH Desktop.app ──────────────────────────┐
│  Electron 壳（主进程）                                               │
│  ├─ runtime-store   版本仓库：versions/<版本>/ + current.json 回滚链  │
│  ├─ installer       内置 npm 安装新版本 → staging → 原子改名启用      │
│  ├─ registry        查询 npm registry dist-tag（npmjs → npmmirror）  │
│  ├─ harness-service 启动/监督 dsh web，解析就绪行拿到本地地址          │
│  ├─ updater         检测→安装→重启→失败回滚 的升级编排                │
│  ├─ acp-profile     生成 acp profile、装 dsh-acp、同步模型与权限      │
│  ├─ bridge-service  启动/监督桥接进程，退避重启，状态上报托盘与设置页   │
│  └─ 窗口/托盘        主窗口加载 http://127.0.0.1:37080，托盘常驻       │
│                                                                     │
│  dist/bridge        远程控制桥接（独立进程，内置 Node 执行）           │
│  ├─ router          多通道路由，会话标识形如 `通道名:原会话id`         │
│  ├─ feishu          长连接、流式卡片、审批卡片                        │
│  ├─ telegram        长轮询、消息编辑实现打字机效果                     │
│  ├─ core            指令解析、会话与工作目录映射、白名单               │
│  ├─ acp             ACP 客户端，按工作目录分进程池                     │
│  └─ session-log     从会话日志补出审批要展示的工具名/参数/理由         │
│                                                                     │
│  resources/node     官方 Node.js 运行时（含 npm）                     │
│  resources/seed     种子版 Harness（tar.gz，首启解压）                │
└─────────────────────────────────────────────────────────────────────┘

用户目录（~/Library/Application Support/DSH Desktop/）
├── runtime/versions/<版本号>/   每个版本独立目录，升级互不影响
├── runtime/current.json         当前版本 + 上一版本（回滚用）+ 坏版本黑名单
├── npm-cache/                   在线升级的 npm 缓存
├── bridge/config.json           桥接配置（机密另用系统钥匙串加密存放）
└── logs/desktop.log             壳日志 + Harness 服务输出
```

## 界面：为什么壳不注入 DOM

主窗口就是一个普通 `BrowserWindow`，直接加载 Harness 的 Web UI，壳不往页面里
注入任何元素或样式。侧栏里的「插件」「皮肤」「远程控制」三个入口由
[皮肤插件](../plugins/dsh-plugin-skin-studio) 通过 dsh 官方的 slot 机制注册，
是 dsh 自己的一部分。

壳只经 preload 暴露一个方法（打开远程控制设置窗口）：远程控制要跑进程、
存加密凭据，浏览器里做不到，只能由壳来做；而入口属于界面，归插件。
纯浏览器访问 dsh 时拿不到这个通道，那一项就不显示，插件照样能用。

**本地端口固定 37080**（被占用才回退随机分配）。这不是可选项：插件把配置存在
localStorage，而 localStorage 按 origin 隔离；端口每次随机的话，用户设过的
背景图和配色**每次重启都会丢**。

## 插件安装

走官方命令 `dsh plugin --profile web <add|remove>`（本质是 pnpm 转发器，装完会
把声明了 `dsh.bundle` 的依赖并入 `dsh.profile.bundles`）。不自己实现安装逻辑，
以免和官方的对账规则脱节。

dsh 不带 pnpm、用户机器上也不会有，因此用随内置 Node 分发的 corepack 按需提供：
生成一个调用 corepack 的包装脚本放进 PATH。不用符号链接——Windows 上普通用户
建符号链接需要额外权限。

插件装在 `~/.dsh/profiles/web`，独立于本应用的数据目录，所以 Harness 在线升级
不会影响已装插件。

## 远程控制桥接

底座是官方的 `@deepseek-ai/dsh-acp`（Agent Client Protocol over stdio），不是逆向出来的
私有协议：`session/new` 建会话、`session/prompt` 派活、`session/update` 回传输出、
`session/request_permission` 走审批、`session/cancel` 中断。

各通道一律用出站长连接（飞书 WebSocket、Telegram 长轮询），**不需要公网地址
或内网穿透**。加通道只需实现 `Channel` 接口并注册进 router。

几个要点：

- 每个工作目录起一个独立的 dsh 进程——沙箱的 workspaceRoot 取进程 cwd，
  共用进程会让不同目录的会话共享同一条边界
- ACP 只传文本，图片语音不支持
- 桥接进程重启后聊天上下文会丢（dsh-acp 不提供 loadSession）
- 首次启用时壳会自动创建 `~/.dsh/profiles/acp/` 并装上与当前运行时同版本的
  `dsh-acp`，权限与模型写在 `~/.dsh/acp-settings.yaml`（与桌面端的 `settings.yaml`
  隔离，模型跟随桌面端、权限单独定）
- 会话日志的目录名规则（`--路径--`）是从产物逆向的，dsh 换了规则会导致审批卡片
  查不到工具详情；此时卡片退化成「未知操作」，不影响审批本身能用

## 开发

```sh
npm install            # 安装依赖（含 Electron）
npm run prepare:node   # 下载官方 Node 运行时到 vendor/node/
npm run prepare:seed   # 安装最新版 dsh 打成种子包到 vendor/seed/
npm run dev            # 构建并启动应用
```

- `DSHD_USER_DATA_DIR=/tmp/dshd-test npm run dev` 用独立数据目录模拟全新用户
- 日志在数据目录 `logs/desktop.log`（托盘菜单里也有「打开日志目录」）

改皮肤插件时在插件目录 `npm run build`，然后重启应用即可——它是以 `link:`
装进 profile 的，产物直接生效。

## 打包发布

推一个 `v*` 标签，`.github/workflows/release.yml` 会在 macos-14 与 windows-latest
上各自原生构建、上传到同一个草稿 Release，人工确认后发布。

两个平台必须各自原生构建，不能交叉出包（原因见下面的 Windows 一节）。

本地出包：

```sh
npm run dist:mac       # release/DSH Desktop-<版本>-arm64.dmg 与 .zip
npm run dist:win:zip   # 免安装 zip（macOS 上只能出这个）
```

### macOS 签名与公证

当前是**未签名**构建（`electron-builder.yml` 里 `identity: null`），本机能用，
分发给别人需要：

1. 申请 Developer ID Application 证书
2. 删掉 `identity: null`，加上 `hardenedRuntime: true`、`notarize: true`
3. 配好 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 后重新打包
4. 内置的 `resources/node/bin/node` 会被一并签名，需要 JIT 相关 entitlements
   （`com.apple.security.cs.allow-jit`、`allow-unsigned-executable-memory`）

### 壳自身的在线升级

Harness 的升级开箱即用（走 npm registry）。壳自己的升级走 electron-updater：
`electron-builder.yml` 里已配好 `publish`，发布时用 `--publish always`
（需要 `GH_TOKEN`）。壳启动 60 秒后自动检查；没配发布源时静默跳过。

**必须走 electron-builder 自己的 publish，不能手工传附件**：它会同时生成
`latest.yml` / `latest-mac.yml`，自动更新靠这两个文件发现新版，手工传会漏掉。

## Windows

完整的虚拟机原生构建、安装与卸载验证步骤见 [windows-build.md](windows-build.md)。

**macOS 上出不了 NSIS 安装包。** electron-builder 生成卸载器时必须真正执行一遍
NSIS 的 `WriteUninstaller`（见 `app-builder-lib/out/targets/nsis/NsisTarget.js`）：
Windows 上原生执行，其它平台走 Wine。没有 Wine 时这一步静默失败、构建仍返回成功，
但卸载器是坏的——用户能装上却卸不掉，卸载时报 `Installer integrity check has failed`。
`npm run dist:win` 已加前置检查（`scripts/check-win-build.mjs`）直接拒绝这种构建。

卸载器坏掉后的手动清理：`scripts/win-cleanup.ps1`。建议先加 `-DryRun` 演练看清楚
会删什么，`-KeepData` 可保留用户数据。

该脚本必须以**带 BOM 的 UTF-8** 保存：Windows PowerShell 5.1 在中文系统上会把
无 BOM 的 UTF-8 当成 GBK 解码，中文变乱码后还会破坏引号配对，直接报
「字符串缺少终止符」。修改后这样重新落盘：

```sh
python3 -c "
from pathlib import Path
p = Path('scripts/win-cleanup.ps1')
t = p.read_text(encoding='utf-8').lstrip('﻿').replace('\r\n','\n').replace('\n','\r\n')
p.write_bytes(b'\xef\xbb\xbf' + t.encode('utf-8'))"
```

### 两个跨平台坑

**种子 tar 包里不能有符号链接。** npm 在 mac 上装包会把 `node_modules/.bin` 做成
符号链接，而 Windows 解压符号链接需要管理员权限或开发者模式，普通用户直接失败
（Invalid argument）。桌面壳从不经由 `.bin` 启动，所以 `seed-runtime.mjs` 在打包前
会删除所有符号链接与 `.bin` 目录，打包后强制校验「零符号链接条目」。

**electron-builder 会忽略 extraResources 里的根级 node_modules。** Windows 版 Node 的
npm 与 corepack 恰好分别在根级 `node_modules/npm` 和 `node_modules/corepack`，所以
`electron-builder.yml` 里为它们单独写了拷贝规则。改动打包配置后务必确认包内
`resources/node/node_modules/npm/bin/npm-cli.js` 与
`resources/node/node_modules/corepack/dist/corepack.js` 都存在——前者缺失会让在线升级
失效，后者缺失会让插件安装失效。

交叉种子用 `npm install --os win32 --cpu x64 --ignore-scripts` 安装：所有原生模块
（node-pty、koffi、sharp）都自带 win32 预编译并在运行时按平台加载，脚本经过逐个
审查跳过无害；`seed-runtime.mjs` 里有完整性校验兜底。

### 已处理的平台差异

- `paths.ts`：`node.exe` 与 npm 路径按平台分支；PATH 拼接用 `path.delimiter`
- `harness-service.ts`：进程终止走 `taskkill /T /F`（终止整棵进程树）
- `tray.ts`：Windows 无模板图机制，图标用品牌蓝；支持双击打开主窗口
- `index.ts`：设置 AppUserModelID（Windows 通知必需）
- 安装包为 NSIS（可选安装目录，非一键）；未签名的 exe 会触发 SmartScreen
  「未知发布者」提示，正式分发需要代码签名证书（EV 证书可即时消除提示）
