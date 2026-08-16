# DSH Desktop

DeepSeek Harness（[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）的桌面端封装。目标用户是不想折腾命令行的普通用户：

- **免环境**：内置官方 Node.js 运行时，用户无需安装 Node、npm，下载 App 即用
- **开箱即用**：内置"种子版"Harness，首次启动离线可用，自动启动本地服务并打开界面
- **在线升级**：官方在 npm 发新版（`@deepseek-ai/dsh`）后，App 自动检测、后台下载安装、原子切换并重启服务，**无需重新下载 App**
- **升级安全**：新版本启动失败会自动回滚上一版本，并把坏版本拉黑（跳过），等上游发修复版再恢复升级

支持 macOS（Apple Silicon）与 Windows 11（x64）。Windows 最低要求 Windows 11（依赖系统自带的 `tar.exe` 与 ConPTY；Windows 10 1809+ 理论可用但未列入支持范围）。

## 界面结构与插件管理

窗口由壳自己组装（`BaseWindow` + 三个 `WebContentsView`）：最左是壳拥有的图标栏，
右侧内容区在「对话」（Harness Web UI）与「插件」（壳的本地页面）之间切换。

之所以不往 dsh 的页面里注入元素来加菜单：那是 dsh 自己的前端，随版本升级会变，
注入方案一升级就碎。三个视图彼此独立，dsh 怎么改都不影响壳。

插件管理走官方命令 `dsh plugin --profile web <add|remove>`（本质是 pnpm 转发器，
装完会自动把声明了 `dsh.bundle` 的依赖并入 `dsh.profile.bundles`）。我们不自己实现
安装逻辑，以免和官方的对账规则脱节。dsh 不带 pnpm、用户机器上也不会有，
因此用随内置 Node 分发的 corepack 按需提供：生成一个调用 corepack 的包装脚本放进
PATH（不用符号链接，Windows 上普通用户建符号链接需要额外权限）。

插件装在 `~/.dsh/profiles/web`，独立于本应用的数据目录，因此 Harness 在线升级
不会影响已装插件。

## 与皮肤插件的配合

皮肤由 dsh 插件 [dsh-plugin-skin-studio](plugins/dsh-plugin-skin-studio) 负责，
壳不注入任何样式，只做两件事让两边看起来是一个整体：

- **对齐**：启动后量一次 dsh 侧栏第一个内容元素的位置（实测 74px），图标栏据此
  设置顶部留白，两边第一行永远齐平；dsh 换版本改了头部高度也能自动跟上
- **同一张背景图**：壳给 Harness 页面设 `--skin-inset-left = 图标栏宽度`，
  插件的画布便按整窗宽度铺图；壳这条栏再画出同一张图的左侧切片，
  两边接成一整张而非两块拼图（实测接缝色差 4~6/255，肉眼不可辨）

**本地端口固定为 37080**（被占用才回退到随机分配）。这不是可选项：浏览器端插件
把配置存在 localStorage，而 localStorage 按 origin 隔离；端口每次随机的话，
用户设过的背景图和配色**每次重启都会丢**。

## 皮肤

壳自己的界面（图标栏、插件页）通过 `src/renderer/tokens.css` 取色，并在运行时
接收主进程下发的皮肤状态（配色、透明度、背景图、对齐基线），与 Harness 保持一致。

## 飞书桥接

在飞书里 @ 机器人就能驱动本机的 agent，像用聊天窗口一样派活。托盘菜单「飞书桥接设置…」里配置。

底座是官方的 `@deepseek-ai/dsh-acp`（Agent Client Protocol over stdio），不是逆向出来的私有协议：
`session/new` 建会话、`session/prompt` 派活、`session/update` 回传输出、`session/request_permission` 走审批、
`session/cancel` 中断。飞书侧用 SDK 的 WebSocket 长连接，**不需要公网地址或内网穿透**。

```
飞书长连接 ──→ 桥接进程（dist/bridge）──→ dsh --profile acp（每个工作目录一个进程）
                  会话映射 / 白名单 / 审批卡片 / 流式回复
```

怎么用：

- 私聊直接说话；群里要 @ 机器人。只有白名单里的 open_id 能驱动，其他人一律拒绝。
- `/ls` 看可用工作目录，`/cd 名称` 切换（会重开会话），`/new` 清空上下文，`/stop` 中断，`/status` 看状态。
- 需要授权的操作会发一张卡片，上面有具体命令、参数和 agent 给出的理由，可选「允许一次」「本会话内都允许」「拒绝」。

几个要点：

- **谁能给机器人发消息，谁就能在这台机器上执行命令。** 白名单是唯一的人员边界，别放不认识的人。
- 权限默认「只读」：任何写入都要在卡片上点头。macOS 上「工作目录内可写」的越界拦截并不可靠（实测越界写不会触发审批），真要拦住就用只读。
- 每个工作目录起一个独立的 dsh 进程——沙箱的 workspaceRoot 取进程 cwd，共用进程会让不同目录的会话共享同一条边界。
- ACP 只传文本：发图片、语音给 agent 目前不支持。
- 回复是「整段提交」而不是逐 token，卡片会一段一段刷新，不是打字机效果。
- 桥接进程重启后聊天上下文会丢（dsh-acp 不提供 loadSession）。
- 首次启用时壳会自动创建 `~/.dsh/profiles/acp/` 并装上与当前运行时同版本的 `dsh-acp`，权限与模型写在 `~/.dsh/acp-settings.yaml`（与桌面端的 `settings.yaml` 隔离，模型跟随桌面端、权限单独定）。

## 架构

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
│  └─ 窗口/托盘        主窗口加载 http://127.0.0.1:<port>，托盘常驻      │
│                                                                     │
│  dist/bridge        飞书桥接（独立进程，内置 Node 执行）              │
│  ├─ feishu          长连接、白名单策略、流式卡片、审批卡片            │
│  ├─ core            指令解析、会话与工作目录映射                      │
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
├── bridge/config.json           桥接配置（App Secret 单独用系统钥匙串加密存放）
└── logs/desktop.log             壳日志 + Harness 服务输出
```

关键设计：**App 壳与 Harness 运行时解耦**。上游发版走 npm，App 只需检测 dist-tag 就能升级运行时；App 壳本身很少变，需要时用 electron-updater 走自己的发布渠道（见下文）。

与社区参考项目（anywhere-labs/deepseek-harness-desktop）的区别：参考项目 fork 官方 monorepo、把编译产物冻结进安装包，Harness 升级必须重发整个 App；本项目运行时装在用户目录、独立于 App 在线升级，这是产品的核心差异。

## 开发

```sh
npm install            # 安装依赖（含 Electron）
npm run prepare:node   # 下载官方 Node 运行时到 vendor/node/
npm run prepare:seed   # 安装最新版 dsh 打成种子包到 vendor/seed/
npm run dev            # 构建并启动应用
```

调试技巧：

- `DSHD_USER_DATA_DIR=/tmp/dshd-test npm run dev` 用独立数据目录模拟全新用户
- 日志在数据目录 `logs/desktop.log`（托盘菜单里也有"打开日志目录"）

## 打包发布（macOS）

```sh
npm run dist:mac       # 产出 release/DSH Desktop-<版本>-arm64.dmg 与 .zip
```

当前配置是**未签名**构建（`electron-builder.yml` 里 `identity: null`），本机可直接使用；分发给其他用户需要签名与公证：

1. 申请 Apple Developer 证书（Developer ID Application）
2. 删掉 `electron-builder.yml` 里的 `identity: null`，加上 `hardenedRuntime: true`、`notarize: true`
3. 配置环境变量（`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` 或 API Key 方案）后重新打包
4. 注意：内置的 `resources/node/bin/node` 会被一并签名，需要 JIT 相关 entitlements（`com.apple.security.cs.allow-jit`、`allow-unsigned-executable-memory`）

## App 壳自身的在线升级

Harness 的在线升级开箱即用（走 npm registry）。App 壳自身的升级用 electron-updater：

1. 在 `electron-builder.yml` 底部取消 `publish` 注释，填上 GitHub 仓库
2. 用 `electron-builder --mac --publish always` 发布（需要 `GH_TOKEN`）
3. 壳启动 60 秒后会自动检查并提示更新；未配置发布源时静默跳过，不影响使用

## Windows 打包（两种方式）

完整的 Windows 虚拟机原生构建、安装与卸载验证步骤见
[docs/windows-build.md](docs/windows-build.md)。

**方式一：mac 上交叉打包，只出免安装版**

```sh
npm run prepare:win    # 下载 win-x64 Node + 交叉安装 Windows 种子
npm run dist:win:zip   # 产出 release/DSH Desktop-<版本>-win.zip（解压即用）
```

macOS 上**不能**出 NSIS 安装包。electron-builder 生成卸载器时必须真正执行一遍
NSIS 的 `WriteUninstaller`（见 `app-builder-lib/out/targets/nsis/NsisTarget.js`）：
Windows 上原生执行，其它平台走 Wine。没有 Wine 时这一步静默失败、构建仍返回成功，
但安装包里的卸载器是坏的——用户能装上却卸不掉，卸载时报
`Installer integrity check has failed`。`npm run dist:win` 已加前置检查
（`scripts/check-win-build.mjs`）在这种情况下直接拒绝构建。

卸载器坏掉后的手动清理：`scripts/win-cleanup.ps1`（结束进程、删程序目录、
清注册表卸载项与快捷方式）。建议先加 `-DryRun` 演练一遍看清楚会删什么，
`-KeepData` 可保留用户数据。

该脚本必须以**带 BOM 的 UTF-8** 保存：Windows PowerShell 5.1 在中文系统上会把
无 BOM 的 UTF-8 当成 GBK 解码，中文变乱码后还会破坏引号配对，直接报
"字符串缺少终止符"。修改后请用以下方式重新落盘：

```sh
python3 -c "
from pathlib import Path
p = Path('scripts/win-cleanup.ps1')
t = p.read_text(encoding='utf-8').lstrip('﻿').replace('\r\n','\n').replace('\n','\r\n')
p.write_bytes(b'\xef\xbb\xbf' + t.encode('utf-8'))"
```

交叉种子用 `npm install --os win32 --cpu x64 --ignore-scripts` 安装：所有原生模块
（node-pty、koffi、sharp）都自带 win32 预编译并在运行时按平台加载，脚本经过逐个
审查跳过无害；`seed-runtime.mjs` 里有完整性校验兜底。

注意两个跨平台坑：

第一，种子 tar 包里不能有符号链接。npm 在 mac 上装包会把 `node_modules/.bin`
做成符号链接，而 Windows 解压符号链接需要管理员权限或开发者模式，普通用户直接
失败（Invalid argument）。桌面壳从不经由 `.bin` 启动，所以 `seed-runtime.mjs`
在打包前会删除所有符号链接与 `.bin` 目录，打包后强制校验"零符号链接条目"。

第二，electron-builder 的坑：extraResources 里"根级 node_modules"会被默认忽略。
Windows 版 Node 的 npm 与 corepack 恰好分别位于根级 `node_modules/npm` 和
`node_modules/corepack`，所以 `electron-builder.yml` 里为它们单独写了拷贝规则；
改动打包配置后务必确认包内 `resources/node/node_modules/npm/bin/npm-cli.js` 与
`resources/node/node_modules/corepack/dist/corepack.js` 都存在（前者缺失会让在线升级
失效，后者缺失会让插件安装失效）。

**方式二：GitHub Actions 原生构建（正式分发推荐）**

`.github/workflows/build.yml` 已配好 macos-14 + windows-latest 双平台流水线，
手动触发或推 `v*` 标签即可，Windows 侧种子为原生安装（安装脚本完整执行）。

Windows 平台差异已在代码中处理：

- `paths.ts`：`node.exe` 与 npm 路径按平台分支；PATH 拼接用 `path.delimiter`
- `harness-service.ts`：进程终止走 `taskkill /T /F`（终止整棵进程树）
- `tray.ts`：Windows 无模板图机制，图标用品牌蓝；支持双击打开主窗口
- `index.ts`：设置 AppUserModelID（Windows 通知必需）
- 安装包为 NSIS（可选安装目录，非一键）；未签名的 exe 会触发 SmartScreen
  提示"未知发布者"，正式分发需要代码签名证书（EV 证书可即时消除提示）

## 已知边界

- 上游处于 developer preview，官方明确会有破坏性变更；若某个新版本坏了，App 会自动回滚并拉黑该版本
- 升级会重启本地服务，运行中的 Agent 任务会中断（交互式升级前有确认弹窗；静默升级发生在后台定时检查时）
- App 被强杀（`kill -9`）时来不及停服务，可能残留 `dsh web` 进程；正常退出（托盘/Cmd+Q）会优雅停止
- 飞书桥接把本机的命令执行能力开给了聊天窗口，边界只有白名单和审批卡片两道；`dsh-acp` 目前是 `0.1.0-rc` 且不在运行时依赖里，随运行时升级需要重装（壳会自动对齐版本）
- 会话日志的目录名规则（`--路径--`）是从产物逆向的，dsh 换了规则会导致审批卡片查不到工具详情；此时卡片退化成「未知操作」，不影响审批本身能用
