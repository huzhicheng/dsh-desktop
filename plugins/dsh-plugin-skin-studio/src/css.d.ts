/** skin.css 由构建以文本形式内联（esbuild loader: text）。 */
declare module '*.css' {
  const content: string
  export default content
}
