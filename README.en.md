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

Grab a build from [Releases](https://github.com/huzhicheng/dsh-desktop/releases):

| Platform | Download |
| --- | --- |
| macOS (Apple Silicon) | [**Get the .dmg**](https://github.com/huzhicheng/dsh-desktop/releases/latest) |
| Windows 11 (x64) | [**Get the .exe**](https://github.com/huzhicheng/dsh-desktop/releases/latest) |

Files are named `DSH-Desktop-<version>-arm64.dmg` and `DSH-Desktop-Setup-<version>.exe`.

Builds are not signed with a paid developer certificate, so the OS will stop you the first time:

- **macOS**: right-click the icon, choose *Open*, then confirm *Open* in the dialog.
  If you see "is damaged and can't be opened" (older builds did this), run
  `xattr -cr "/Applications/DSH Desktop.app"` in Terminal first.
- **Windows**: on the SmartScreen prompt, click *More info → Run anyway*.

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
