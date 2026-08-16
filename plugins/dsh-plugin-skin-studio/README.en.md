# Skin Studio

Restyle the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI:
background image or video, fonts, colors, translucency.

[中文](README.md)

It's a **regular dsh plugin**, not an injection from some wrapper app — once it's in your
profile it applies the same whether you launch `dsh web` from a terminal or open a desktop app.

## Install

```sh
dsh plugin --profile web add dsh-plugin-skin-studio
```

Restart `dsh web`. The entry point is **皮肤 (Skin)** at the bottom of the sidebar.

Uninstall: `dsh plugin --profile web remove dsh-plugin-skin-studio`

## What you can change

**Text**

- Font: pick from every font installed on your machine, each option previewed in its own face
- Text weight: how far the secondary and tertiary levels move toward the primary color
- Text outline: a hard 1px outline around glyphs. Off by default — turn it on only when the
  background is dark or busy enough to swallow the text

**Background**

- An image or an mp4, with four fit modes (default shows the whole thing rather than cropping)
- Opacity, blur, scrim strength, surface translucency
- Three one-click presets: soft / medium / clear

**Colors**

- Five palettes: amber, jade, ink, rose, slate
- Custom accent and light/dark base colors; buttons, links and selection follow along

## Design notes

**Settings live in localStorage, videos in IndexedDB.** dsh's settings system is closed to
out-of-tree plugins (there's a hardcoded namespace allowlist in `packages/host/apiproxy`), and
a skin is a pure display preference anyway. Videos routinely run to tens of megabytes while
localStorage caps out around 5 MB, so they go to IndexedDB and the config keeps only an id —
a config should stay copyable and shareable, not carry binaries.

**Background images are downscaled to 1920px on the long edge and re-encoded as JPEG.**
A multi-megabyte original turned into a data URI exceeds the CSS length limit for property
values and gets dropped wholesale — a 4 MB image makes `background-image` resolve to `none`.

**Variables only, no structure.** All theming works by overriding dsh's `--dsw-static-*`
palette and `--dsw-alias-*` semantic layer, so the skin survives dsh changing its component
internals. Only three rules reach for structural selectors (sidebar inset, sidebar fill
de-duplication, markdown container font); each degrades to the previous behaviour if it stops
matching, rather than breaking the UI.

**System accessibility settings are respected.** *Reduce transparency* collapses every surface
to solid and drops the background layer; *Reduce motion* freezes video on its first frame;
a system request for higher contrast maxes out text strength.

## Development

```sh
npm run build   # emits lib/index.js (host half) and lib/client.js (browser half)
```

The browser half is not plain ESM — the dsh page uses its own module loader, so the bundle must
be a single `window.__ModuleLoader__.load({ id, factory })` call or the page throws
`Unexpected token 'export'`. The build script handles this.

For local work: `dsh plugin --profile web add /path/to/this/folder`, then `npm run build` and
restart after each change.

## License

MIT
