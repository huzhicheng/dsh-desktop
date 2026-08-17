/**
 * Host 半侧 —— 空壳。
 *
 * 本插件的功能全在浏览器端，主机上什么都不做。但这个文件不能省：
 * Cordis 的 loader 会把 profile 的 bundles 里每一项都当成 host 插件 import
 * 一次，包里没有 main / exports["."] 会直接抛
 * ERR_PACKAGE_PATH_NOT_EXPORTED，并让整个 dsh 起不来（实测踩过）。
 */

export function apply(): void {
  // 浏览器半侧见 src/client/index.ts
}
