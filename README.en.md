<p align="center">
  <img src="assets/logo.png" width="128" alt="DSH Desktop">
</p>

<h1 align="center">DSH Desktop</h1>

<p align="center">
  A desktop app for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>.<br>
  Download and run — no Node.js required, and Harness updates itself.
</p>

<p align="center">
  <a href="README.md">中文</a> ·
  <a href="https://github.com/huzhicheng/dsh-desktop/releases">Download</a> ·
  <a href="docs/development.md">Development</a>
</p>

<p align="center">
  <img src="docs/images/main-window-macos.jpg" width="820" alt="DSH Desktop main window: custom background with the Plugins, Skin and Remote Control entries in the sidebar">
</p>

---

> A community project, not an official release. DeepSeek Harness is currently in developer preview.

## Features

- **No toolchain to install** — ships with the official Node runtime; download the app and go
- **Harness updates itself** — new upstream releases are installed in the background, **no need to re-download the app**; if a version fails to start, it rolls back and skips that release
- **Theming** — background image or video, fonts, colors and translucency, all from the UI
- **Plugin manager** — install and remove community plugins without touching a terminal
- **Remote control** — drive the agent on your machine from Feishu or Telegram

Runs on macOS (Apple Silicon) and Windows 11 (x64).

## Install

### macOS (Apple Silicon)

**Step 1** — download `DSH-Desktop-<version>-arm64.dmg` from [Releases](https://github.com/huzhicheng/dsh-desktop/releases/latest)

**Step 2** — open the dmg and drag **DSH Desktop** into Applications

**Step 3** — open Terminal and run this line:

```sh
xattr -cr "/Applications/DSH Desktop.app"
```

> [!IMPORTANT]
> Do not skip step 3. macOS quarantines everything downloaded from the web, and
> because this app is not signed with a paid Apple developer certificate, that
> quarantine flag makes the system refuse it with **"is damaged and can't be opened"**.
> Nothing is actually damaged — the command above just clears the flag.
>
> That particular warning **cannot be bypassed by right-click → Open**. The command is the only way.

**Step 4** — double-click to launch. If you get "unidentified developer", right-click the icon, choose *Open*, then confirm *Open* (once only; after that a normal double-click works)

### Windows 11 (x64)

**Step 1** — download `DSH-Desktop-Setup-<version>.exe` from [Releases](https://github.com/huzhicheng/dsh-desktop/releases/latest)

**Step 2** — run it. When SmartScreen says "Windows protected your PC", click **More info**, then **Run anyway**

**Step 3** — pick an install location and finish

### After installing

The first launch unpacks the bundled Harness, so give it a few seconds. Once the UI loads you'll find four entries in the lower left: **插件 (Plugins) / 皮肤 (Skin) / 远程控制 (Remote control) / 设置 (Settings)**.

You'll need to enter a DeepSeek API key once before you can start a conversation.

On launch the app starts a local service and loads the UI. The first run unpacks the bundled Harness, so give it a few seconds.

## Theming

Click **皮肤 (Skin)** in the sidebar.

- **Text** — pick any font installed on your machine (the full local font list is enumerated), plus text weight and outline
- **Background** — choose an image or an mp4. Shown in full by default rather than cropped; opacity, blur and scrim are adjustable
- **Strength** — three presets (soft / medium / clear), then fine-tune with the sliders

Background videos live in the browser's local database, so they don't bloat your settings. When the system has *Reduce transparency* or *Reduce motion* enabled, the skin falls back to solid surfaces and the video holds on its first frame.

## Remote control

Click **远程控制 (Remote control)** in the sidebar to drive the local agent from a chat app.

**Feishu**: hit *Scan to set up* and scan the QR code. App creation, scopes, event subscription and credentials are all handled for you — there is nothing to fill in.

**Telegram**: message [@BotFather](https://t.me/BotFather) with `/newbot` and paste the token. That's the only field; it uses long polling, so no public URL is needed.

In chat:

- Direct-message the bot, or @-mention it in a group
- `/ls` lists workspaces, `/cd <name>` switches, `/new` clears context, `/stop` interrupts, `/status` shows state
- Anything needing approval arrives as a card showing the exact command and the agent's reasoning, with *allow once* / *allow for this session* / *deny*

> [!WARNING]
> **Anyone who can message the bot can run commands on your machine.**
> The allowlist is the only boundary — add yourself and people you actually trust, nobody else.
> Permissions default to read-only; every write asks first. On macOS the "writable inside the workspace" mode does not reliably block escapes, so use read-only if you need a hard boundary.

## Known limitations

- Upstream is a developer preview and has said to expect breaking changes. If a release breaks, the app rolls back and skips it
- Updating restarts the local service, which interrupts running tasks
- Remote control is text-only — images and voice are not supported yet; chat context is lost when the bridge process restarts
- Force-killing the app (`kill -9`) can leave a stray `dsh web` process behind; quitting normally does not

## Development

```sh
npm install
npm run prepare:node   # fetch the official Node runtime
npm run prepare:seed   # build a seed Harness
npm run dev
```

Architecture, packaging and the Windows-specific pitfalls are in [docs/development.md](docs/development.md).

## License

MIT. Not affiliated with DeepSeek.
