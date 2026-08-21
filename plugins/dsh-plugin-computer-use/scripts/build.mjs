/**
 * 构建插件产物。
 *
 * Host 半侧走 `main`（lib/index.js），是普通 ESM。
 *
 * 浏览器半侧不是普通 ESM：dsh 的页面用自己的模块加载器，client bundle 必须是
 * 一次 `window.__ModuleLoader__.load({ id, factory })` 注册调用，factory 里用
 * 传入的 `require()` 取宿主提供的模块（react、@deepseek-ai/* 等）。直接产出
 * ESM 会在页面里报 `Unexpected token 'export'`。这里用 esbuild 打成 CJS，
 * 再套上官方那层壳（格式对照官方 client bundle 的实际产物）。
 *
 * 皮肤样式表以文本内联，浏览器端不必再发一次请求，也就不会先闪一下原配色。
 */
import { build } from 'esbuild'
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LIB = join(ROOT, 'lib')
const PKG = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))

await rm(LIB, { recursive: true, force: true })
await mkdir(LIB, { recursive: true })

const shared = {
  bundle: true,
  target: 'es2022',
  loader: { '.css': 'text' },
  logLevel: 'warning',
}

// Host 半侧
await build({
  ...shared,
  entryPoints: [join(ROOT, 'src/index.ts')],
  outfile: join(LIB, 'index.js'),
  format: 'esm',
  platform: 'node',
  // dsh 随运行时分发的包不进产物：本插件被 link 进 profile，运行时能从
  // profile 的 node_modules 解析到它们；打进来反而会锁死一份副本
  external: ['@deepseek-ai/*'],
})

// MCP 代理：由宿主 spawn 成独立 node 进程，自带全部依赖
await build({
  ...shared,
  entryPoints: [join(ROOT, 'src/proxy.ts')],
  outfile: join(LIB, 'proxy.js'),
  format: 'esm',
  platform: 'node',
})

// 浏览器半侧：先打成 CJS，宿主提供的模块保持 external
const clientRaw = join(LIB, '.client.cjs')
await build({
  ...shared,
  entryPoints: [join(ROOT, 'src/client/index.ts')],
  outfile: clientRaw,
  format: 'cjs',
  platform: 'browser',
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/*'],
})

const body = await readFile(clientRaw, 'utf8')
await rm(clientRaw, { force: true })
await writeFile(join(LIB, 'client.js'), `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PKG.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
\t\treturn module.exports;
\t}
});
`)

console.log('构建完成：lib/index.js、lib/proxy.js、lib/client.js')
