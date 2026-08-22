/**
 * 右侧栏的文档与图片查看器。
 *
 * 前身是 2026-08-14 用 cordis_define / cordis_run 定义的动态插件——那种插件只活在
 * 内存里、重启即丢，所以一直没进设置里的插件列表。这里把它做成正式包。
 *
 * 两半通信没有沿用当时设想的 Remote service（api-remotes/Typert），改用
 * ctx.webServer 挂 HTTP 路由：本仓库另外三个插件都是这么做的，已经跑通，
 * 也省掉一层类型生成。文件扫描、docx/pptx 提取那些核心逻辑原样保留。
 *
 * 文件读写一律走 ctx.fs 与 ctx.sandboxPolicy，不自己碰 node:fs——工作区边界由
 * Harness 判定，插件绕过去就等于把沙箱开了个洞。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

const ROUTE_PREFIX = '/_dsh-artifact-viewer/api'

type Handler = (args: Record<string, unknown>) => Promise<unknown>

/** 动作名到实现的登记表，由下面的插件主体填充。 */
const HANDLERS: Record<string, Handler> = {}

export const name = 'artifact-viewer'
/** webServer 用来挂接口；fs / shell / sandboxPolicy 走可选的 ctx.get。 */
export const inject = ['webServer']

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * 插件入口。
 * @param ctx - cordis 上下文。
 */
export function apply(ctx: any): void {

    const fs = ctx.get('fs')
    if (fs === undefined) return

    const sandboxPolicy = ctx.get('sandboxPolicy')
    const shell = ctx.get('shell')
    const fallbackRoot = sandboxPolicy && typeof sandboxPolicy.workspaceRoot === 'string' ? sandboxPolicy.workspaceRoot : ''

    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif']
    const DOC_EXTS = ['md', 'markdown', 'txt', 'html', 'htm', 'json', 'csv', 'xml', 'yaml', 'yml', 'toml', 'js', 'jsx', 'ts', 'tsx', 'py', 'css', 'scss', 'less', 'sh', 'bash', 'zsh', 'java', 'c', 'cpp', 'cc', 'h', 'hpp', 'rs', 'go', 'rb', 'php', 'sql', 'log', 'ini', 'conf', 'env', 'bat', 'ps1', 'docx', 'pptx', 'pdf']
    const SKIP_DIRS = ['node_modules', '.git', '.dsh', 'dist', 'build', 'out', '__pycache__', '.next', '.cache', 'coverage', 'vendor', '.venv', 'venv', '.idea', '.vscode']
    const MAX_DEPTH = 6
    const MAX_ITEMS = 500
    const DOC_MAX = 2 * 1024 * 1024
    const IMG_MAX = 10 * 1024 * 1024
    const PDF_MAX = 20 * 1024 * 1024
    const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif' }

    const imageSet = new Set(IMAGE_EXTS)
    const docSet = new Set(DOC_EXTS)
    const skipSet = new Set(SKIP_DIRS)
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

    function extOf(name) {
      const i = name.lastIndexOf('.')
      return i < 0 ? '' : name.slice(i + 1).toLowerCase()
    }

    function classify(name) {
      const ext = extOf(name)
      if (imageSet.has(ext)) return 'image'
      if (docSet.has(ext)) return 'doc'
      return null
    }

    function isAbsolute(path) {
      return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
    }

    function toAbsolute(path, cwd) {
      if (!path) return ''
      if (isAbsolute(path)) return path
      const base = cwd || fallbackRoot
      if (!base) return path
      return base.replace(/[\\/]+$/, '') + '/' + path.replace(/^[\\/]+/, '')
    }

    function writePolicy(base) {
      let mode = 'workspace-write'
      try {
        if (sandboxPolicy && typeof sandboxPolicy.resolve === 'function') {
          const resolved = sandboxPolicy.resolve()
          if (resolved && resolved.mode) mode = resolved.mode
        }
      } catch (e) {}
      return { mode: mode, workspaceRoot: base }
    }

    function bytesToBase64(bytes) {
      let result = ''
      const len = bytes.length
      for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i]
        const b1 = i + 1 < len ? bytes[i + 1] : 0
        const b2 = i + 2 < len ? bytes[i + 2] : 0
        result += B64.charAt(b0 >> 2)
        result += B64.charAt(((b0 & 3) << 4) | (b1 >> 4))
        result += i + 1 < len ? B64.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '='
        result += i + 2 < len ? B64.charAt(b2 & 63) : '='
      }
      return result
    }

    function extractTagText(xml, tag) {
      const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g')
      let out = ''
      let m
      while ((m = re.exec(xml)) !== null) out += m[1]
      return out
    }

    function paragraphsText(xml, paraTag, runTag) {
      const paras = xml.split(new RegExp('</' + paraTag + '>'))
      const lines = []
      for (const p of paras) {
        const text = extractTagText(p, runTag).replace(/\n/g, '').trim()
        if (text) lines.push(text)
      }
      return lines.join('\n')
    }

    async function unzipMember(abs, member) {
      if (!shell) throw new Error('shell unavailable')
      const spec = shell.resolve({ command: 'unzip -p "' + abs + '" "' + member + '"', stdoutMaxBytes: 4 * 1024 * 1024 })
      const result = await shell.run(spec)
      if (result.exitCode !== 0) throw new Error('unzip exit ' + result.exitCode)
      return result.stdout && result.stdout.text ? result.stdout.text : ''
    }

    async function officeText(abs, ext) {
      try {
        if (ext === 'docx') {
          const xml = await unzipMember(abs, 'word/document.xml')
          return paragraphsText(xml, 'w:p', 'w:t')
        }
        if (ext === 'pptx') {
          const xml = await unzipMember(abs, 'ppt/slides/*.xml')
          return paragraphsText(xml, 'a:p', 'a:t')
        }
      } catch (e) {
        return '（无法提取该文档文本：' + (e && e.message ? e.message : String(e)) + '）'
      }
      return ''
    }

    async function scan(target, relPrefix, depth, out) {
      if (depth > MAX_DEPTH || out.length >= MAX_ITEMS) return
      let entries
      try {
        entries = await fs.listDir(target)
      } catch (e) {
        return
      }
      if (!entries) return
      for (const entry of entries) {
        if (out.length >= MAX_ITEMS) break
        const name = entry.name
        if (!name || name.charAt(0) === '.') continue
        const rel = relPrefix ? relPrefix + '/' + name : name
        if (entry.type === 'directory') {
          if (skipSet.has(name)) continue
          await scan(entry.target, rel, depth + 1, out)
        } else if (entry.type === 'file') {
          const kind = classify(name)
          if (kind === null) continue
          let abs = ''
          try { abs = fs.processPath(entry.target) } catch (e) { abs = rel }
          out.push({ path: abs, rel: rel, name: name, kind: kind, size: entry.size || 0 })
        }
      }
    }

    async function resolveInRoot(path, cwd) {
      const base = cwd || fallbackRoot
      if (!base) throw new Error('workspace root unavailable')
      const baseTarget = await fs.resolve(base)
      const fileTarget = await fs.resolve(toAbsolute(path, cwd))
      if (!fs.contains(baseTarget, fileTarget)) throw new Error('path is outside the workspace')
      return fileTarget
    }

    HANDLERS['list-artifacts'] = async (args) => {
      try {
        const cwd = args && typeof args.cwd === 'string' ? args.cwd : ''
        const base = cwd || fallbackRoot
        if (!base) return { ok: true, root: '', items: [] }
        const rootTarget = await fs.resolve(base)
        const out = []
        await scan(rootTarget, '', 0, out)
        out.sort((a, b) => (a.rel < b.rel ? -1 : (a.rel > b.rel ? 1 : 0)))
        return { ok: true, root: base, items: out }
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) }
      }
    }

    HANDLERS['read-doc'] = async (args) => {
      try {
        const path = args && typeof args.path === 'string' ? args.path : ''
        const cwd = args && typeof args.cwd === 'string' ? args.cwd : ''
        if (!path) throw new Error('missing path')
        const fileTarget = await resolveInRoot(path, cwd)
        const info = await fs.stat(fileTarget)
        if (info && info.type !== 'file') throw new Error('not a regular file')
        const ext = extOf(path)

        if (ext === 'docx' || ext === 'pptx') {
          const abs = fs.processPath(fileTarget)
          const text = await officeText(abs, ext)
          return { ok: true, path: path, content: text, format: 'text' }
        }
        if (ext === 'pdf') {
          if (info && info.size && info.size > PDF_MAX) throw new Error('文档过大，无法预览')
          const bytes = await fs.readBytes(fileTarget, undefined, PDF_MAX)
          return { ok: true, path: path, format: 'pdf', dataUrl: 'data:application/pdf;base64,' + bytesToBase64(bytes) }
        }

        if (info && info.size && info.size > DOC_MAX) throw new Error('文档过大，无法预览')
        const content = await fs.readText(fileTarget)
        const format = (ext === 'md' || ext === 'markdown') ? 'markdown' : 'text'
        return { ok: true, path: path, content: content, format: format }
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) }
      }
    }

    HANDLERS['write-doc'] = async (args) => {
      try {
        const path = args && typeof args.path === 'string' ? args.path : ''
        const cwd = args && typeof args.cwd === 'string' ? args.cwd : ''
        const content = args && typeof args.content === 'string' ? args.content : ''
        if (!path) throw new Error('missing path')
        const base = cwd || fallbackRoot
        const fileTarget = await resolveInRoot(path, cwd)
        await fs.writeText(fileTarget, content, undefined, undefined, writePolicy(base))
        return { ok: true, path: path }
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) }
      }
    }

    HANDLERS['read-image'] = async (args) => {
      try {
        const path = args && typeof args.path === 'string' ? args.path : ''
        const cwd = args && typeof args.cwd === 'string' ? args.cwd : ''
        if (!path) throw new Error('missing path')
        const fileTarget = await resolveInRoot(path, cwd)
        const info = await fs.stat(fileTarget)
        if (info && info.type !== 'file') throw new Error('not a regular file')
        if (info && info.size && info.size > IMG_MAX) throw new Error('图片过大，无法预览')
        const bytes = await fs.readBytes(fileTarget, undefined, IMG_MAX)
        const mime = MIME[extOf(path)] || 'application/octet-stream'
        return { ok: true, path: path, dataUrl: 'data:' + mime + ';base64,' + bytesToBase64(bytes), mime: mime }
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) }
      }
    }
  
  ctx.effect?.(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        const action = (req.url ?? '').split('?')[0]?.slice(ROUTE_PREFIX.length + 1) ?? ''
        const run = HANDLERS[action]
        if (run === undefined) { sendJson(res, 404, { ok: false, error: `没有这个动作：${action}` }); return }
        try {
          sendJson(res, 200, await run(await readBody(req)))
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      })()
    },
  }), 'artifact-viewer: 文件接口')
}
