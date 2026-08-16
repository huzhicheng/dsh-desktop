# Skin Studio

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI 换个样子：
背景图或视频、字体、配色、透明度。

[English](README.en.md)

它是**标准的 dsh 插件**，不是外部套壳的注入——装进 profile 之后，命令行启动
`dsh web` 和用桌面端打开都一样生效。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-skin-studio
```

重启 `dsh web` 即可。入口在侧栏底部的「皮肤」。

卸载：`dsh plugin --profile web remove dsh-plugin-skin-studio`

## 能调什么

**文字**

- 字体：从本机装的全部字体里选，每一项用它自己的字体显示
- 文字浓度：各级文字往主文字色靠拢的程度
- 文字描边：给字描一圈硬边。默认关闭，背景深或杂乱、字压不住时再开

**背景**

- 图片或 mp4 视频，四种适配方式（默认「自适应」完整显示，不裁边）
- 浓度、模糊、蒙版强度、界面透明
- 淡雅 / 适中 / 清晰三档一键切换

**配色**

- 五个预设：暖砂 / 青竹 / 墨蓝 / 绛梅 / 素石
- 强调色与明暗底色可自定义，按钮、链接、选中态跟着走

## 一些取舍

**配置存 localStorage，视频存 IndexedDB。** dsh 的设置体系对树外插件是封死的
（`packages/host/apiproxy` 里有一份硬编码的 namespace 白名单），皮肤本就是纯展示
偏好，存本地合适。视频动辄几十 MB，localStorage 只有约 5MB，所以另存 IndexedDB，
配置里只留一个 id——一份配置要能复制、能分享，不该塞进二进制。

**背景图会先缩到最长边 1920px 再转 JPEG。** 原图动辄几 MB，转成 data URI 会超出
CSS 对属性值的长度限制被整条丢弃（实测 4MB 的图 `background-image` 直接变 `none`）。

**只改变量，不碰结构。** 换肤全部通过覆盖 dsh 的 `--dsw-static-*` 色板与
`--dsw-alias-*` 语义层完成，所以 dsh 升级换了组件实现，皮肤依然有效。仅有三处
用到结构选择器（侧栏留白、侧栏底色去重、Markdown 容器字体），匹配不上时各自退回
原样，不会把界面弄坏。

**尊重系统的无障碍设置。** 开了「降低透明度」就退成纯色、撤掉背景层；开了
「减弱动态效果」视频只显示首帧；系统要求高对比时文字自动拉满。

## 开发

```sh
npm run build   # 产出 lib/index.js（host 半侧）与 lib/client.js（浏览器半侧）
```

浏览器半侧不是普通 ESM——dsh 页面用自己的模块加载器，产物必须是一次
`window.__ModuleLoader__.load({ id, factory })` 调用，否则页面报
`Unexpected token 'export'`。构建脚本已处理。

本地调试：`dsh plugin --profile web add /path/to/this/folder`，之后改完
`npm run build` 重启即可。

## 许可

MIT
