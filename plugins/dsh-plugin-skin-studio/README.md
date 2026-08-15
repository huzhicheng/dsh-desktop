# dsh-plugin-skin-studio

DeepSeek Harness 的皮肤插件：换背景图、调透明度与配色。风格参考
[codex-skin-studio](https://github.com/) 的「玻璃盖在图片上」做法。

它是一个**标准的 dsh 插件**，不是外部套壳的注入——装进 profile 之后，
Harness 的 Web UI 自己就是这个样子，命令行启动、桌面端启动都一样生效。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-skin-studio   # 从 npm
dsh plugin --profile web add /path/to/this/folder     # 或本地目录
```

装完重启 `dsh web`，皮肤即生效。配置入口在 Web UI 的「设置 → 插件 → 皮肤」。

卸载：`dsh plugin --profile web remove dsh-plugin-skin-studio`。

## 可调项

- **配色预设**：暖砂 / 青竹 / 墨蓝 / 绛梅 / 素石
- **强调色**与**明暗底色**：按钮、链接、选中态跟着走
- **背景图**：选一张本地图片；浏览器内会先缩到最长边 1920px 再转 JPEG
  （原图动辄几 MB，转成 data URI 会超出 CSS 对属性值的长度限制被整条丢弃，
  实测 4MB 的图 `background-image` 直接变成 `none`）
- **图片浓度 / 模糊**：背景图本身的强度
- **蒙版强度**：盖在背景图之上压暗它，越大界面越清晰、图越淡
- **界面透明**：所有表面让出多少给背景图。上限刻意收窄，再透文字就压不住图了

改动即时预览，「保存」后持久化。

## 实现要点

**换肤只改变量，不碰 dsh 的结构。** dsh 的样式分三层，皮肤逐层覆盖：

| 层 | 变量 | 数量 |
| --- | --- | --- |
| 色板 | `--dsw-static-*` | 品牌色阶整条换成强调色 |
| 语义 | `--dsw-alias-*` | 78 个，表面/文字/描边/状态 |
| 组件 | `--dsw-specific-*`、`--dsw-hovercard-bg` | 侧栏、输入框、气泡等不走语义层的部分 |

因为一个结构选择器都没用到，dsh 升级换了组件实现，皮肤依然有效。

**背景图靠一个画布层。** 页面最底层放固定的 `#skin-studio-art`（模糊垫底层 +
主图层 + 蒙版层，z-index -1），界面所有表面改成半透明，图便透上来。

**装本地插件可以直接选目录。** 「安装新插件」里除了手填路径，还有一个「选择目录…」
按钮，走 dsh 的 `ctx.directoryPicker` seam：桌面端判定为 `native`，在宿主屏幕上弹原生
选择器，选完把绝对路径填进输入框（不直接安装，留一步让人核对）。远程浏览器访问时
seam 给的是 `browse` 后端——原生对话框弹在服务器上没人看得见——此时按钮自动隐藏，
退回手填，这也是该 seam 文档写明的未知/不匹配 kind 处理方式。

注意这个服务由 `directory-picker-auto` 在启动时判定宿主处境后才挂进内存根树，
本插件 apply 那一刻未必已经就绪，所以是**每次请求现取**而不是启动时缓存一次。

**配置存在浏览器本地（localStorage），不走 dsh 的 settings 体系。**
后者对树外插件是封死的：`packages/host/apiproxy/src/api-proxy.ts` 里有一份硬编码的
`WEB_SETTINGS_NAMESPACES` 白名单，不在其中的 namespace 一律返回
`settings-not-exposed`（源码注释写明这是待改的临时设计）。皮肤是纯展示偏好，
存本地既合适也绕开了这条限制。注册设置页的 slot 本身不受白名单限制。

## 开发中踩过的三个坑

写别的 dsh 插件时同样会遇到：

1. **patch 插入新行要用 `- insert:`**。顶层直接写 `- id: xxx` 是「按 id 修改已有条目」，
   对新插件会报 `patch: entry "xxx" not found`。
2. **client bundle 不是普通 ESM**。dsh 页面用自己的模块加载器，产物必须是一次
   `window.__ModuleLoader__.load({ id, factory })` 注册调用，factory 里用传入的
   `require()` 取宿主模块。直接产出 ESM 会在页面里报 `Unexpected token 'export'`。
3. **`ctx.effect(fn)` 的 fn 是 setup，会被立即执行**，它的返回值才是清理函数。
   把 `dispose` 直接传进去，会让插件刚生效就被自己卸掉。

## 构建

```sh
npm install
npm run build     # 产出 lib/index.js（Host 半）与 lib/client.js（浏览器半）
```
