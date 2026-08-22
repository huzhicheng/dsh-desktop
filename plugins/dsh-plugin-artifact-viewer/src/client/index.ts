/**
 * 右侧栏文档查看器的浏览器半边。
 *
 * 挂在 dsh 的 `details` 插槽（右侧栏），另在侧栏底部放一个「文档」入口。
 *
 * 原本是动态插件，用临时 RPC `host.call` 跟宿主通信；这里换成打宿主半边的
 * HTTP 接口，和本仓库另外几个插件一致。除此之外界面逻辑原样保留。
 */

import * as React from 'react'

const API = '/_dsh-artifact-viewer/api'

/**
 * 样式注入。
 *
 * 动态插件运行时提供过一个全局 `styles` 服务，正式包里没有这个东西，所以自己插一个
 * <style>。用 id 去重：插件热重载或重复 apply 时不该往 head 里堆同样的规则。
 */
const styles = {
  insert(css: string): void {
    const id = 'dsh-artifact-viewer-styles'
    if (document.getElementById(id) !== null) return
    const node = document.createElement('style')
    node.id = id
    node.textContent = css
    document.head.appendChild(node)
  },
}

/**
 * 调宿主半边的一个动作。
 * @param action - 动作名，对应宿主 HANDLERS 里的键。
 * @param args - 参数，会以 JSON 发过去。
 */
async function call(action: string, args: unknown): Promise<any> {
  const response = await fetch(`${API}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  })
  return await response.json()
}

/**
 * 插件入口。
 * @param ctx - dsh 的浏览器端上下文。
 */
export function apply(ctx: any): void {

    const slots = ctx.get('slots')
    const layout = ctx.get('layout')
    const sessions = ctx.get('sessions')

    styles.insert(`
.art-root{display:flex;flex-direction:column;height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.4}
.art-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.art-title{font-weight:600;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.art-head-actions{display:flex;gap:6px;align-items:center}
.art-ibtn{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;padding:4px 8px;font-size:14px;line-height:1}
.art-ibtn:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.art-ibtn-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.art-tabs{display:flex;gap:4px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.art-tab{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;padding:4px 10px;font-size:12px}
.art-tab:hover{background:var(--dsw-alias-bg-layer-1)}
.art-tab-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.art-error{margin:8px 14px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary);border-radius:6px;font-size:12px;flex:0 0 auto}
.art-body{flex:1 1 auto;display:flex;min-height:0}
.art-list{width:46%;min-width:0;border-right:1px solid var(--dsw-alias-border-l1);overflow-y:auto;flex:0 0 auto}
.art-row{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1)}
.art-row:hover{background:var(--dsw-alias-bg-layer-1)}
.art-row-on{background:var(--dsw-alias-bg-layer-1);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.art-row-icon{flex:0 0 auto;font-size:14px}
.art-row-main{flex:1 1 auto;min-width:0}
.art-row-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.art-row-rel{color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.art-row-size{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:11px}
.art-preview{flex:1 1 auto;min-width:0;overflow:auto;background:var(--dsw-alias-bg-layer-1)}
.art-pbar{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.art-doc{margin:0;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}
.art-md{padding:16px;font-size:14px;line-height:1.7;color:var(--dsw-alias-label-primary)}
.art-md h1,.art-md h2,.art-md h3,.art-md h4{margin:16px 0 8px;line-height:1.3}
.art-md h1{font-size:22px}.art-md h2{font-size:18px}.art-md h3{font-size:15px}.art-md h4{font-size:14px}
.art-md p{margin:8px 0}
.art-md pre{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.art-md code{background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:1px 5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.art-md pre code{background:transparent;padding:0}
.art-md blockquote{border-left:3px solid var(--dsw-alias-border-l2);margin:8px 0;padding:4px 12px;color:var(--dsw-alias-label-secondary)}
.art-md a{color:var(--dsw-alias-brand-primary)}
.art-md ul,.art-md ol{margin:8px 0;padding-left:24px}
.art-edit{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:12px;gap:8px}
.art-edit textarea{flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;padding:12px;line-height:1.5}
.art-img{display:block;max-width:100%;height:auto;margin:0 auto;padding:12px;box-sizing:border-box}
.art-pdf{width:100%;height:100%;min-height:480px;border:none;background:#fff}
.art-empty{display:flex;align-items:center;justify-content:center;height:100%;min-height:80px;color:var(--dsw-alias-label-secondary);font-size:12px;padding:16px;text-align:center;box-sizing:border-box;flex-direction:column;gap:8px}
.art-footer{padding:6px 14px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto}
.art-fab{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;padding:6px 8px;font-size:13px;line-height:1}
.art-fab:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
`)

    let openSink = null
    let pendingOpen = null

    const FILE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|md|markdown|txt|html?|json|csv|xml|ya?ml|toml|jsx?|tsx?|py|css|scss|less|sh|bash|zsh|java|c|cpp|cc|h|hpp|rs|go|rb|php|sql|log|ini|conf|env|bat|ps1|docx|pptx|pdf)$/i

    function currentCwd() {
      try {
        if (sessions && sessions.list && typeof sessions.list.getSnapshot === 'function') {
          const snap = sessions.list.getSnapshot()
          if (snap && snap.byId && snap.current && snap.byId[snap.current]) {
            return snap.byId[snap.current].cwd || ''
          }
        }
      } catch (e) {}
      return ''
    }

    function fmtSize(n) {
      if (!n || n <= 0) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1024 / 1024).toFixed(1) + ' MB'
    }

    function kindFromPath(path) {
      return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path || '') ? 'image' : 'doc'
    }

    function basename(path) {
      const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
      return at === -1 ? path : path.slice(at + 1)
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }

    function inlineMarkdown(s) {
      let t = escapeHtml(s)
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
      return t
    }

    function markdownToHtml(md) {
      const lines = String(md || '').split('\n')
      const out = []
      let inCode = false
      let codeLines = []
      let inUl = false
      let inOl = false
      const closeLists = () => { if (inUl) { out.push('</ul>'); inUl = false } if (inOl) { out.push('</ol>'); inOl = false } }
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/^```/.test(line)) {
          if (inCode) { out.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>'); codeLines = []; inCode = false }
          else { closeLists(); inCode = true }
          continue
        }
        if (inCode) { codeLines.push(line); continue }
        if (line.trim() === '') { closeLists(); continue }
        const h = /^(#{1,6})\s+(.*)$/.exec(line)
        if (h) { closeLists(); const lv = h[1].length; out.push('<h' + lv + '>' + inlineMarkdown(h[2]) + '</h' + lv + '>'); continue }
        const ul = /^\s*[-*+]\s+(.*)$/.exec(line)
        if (ul) { if (!inUl) { closeLists(); out.push('<ul>'); inUl = true } out.push('<li>' + inlineMarkdown(ul[1]) + '</li>'); continue }
        const ol = /^\s*\d+\.\s+(.*)$/.exec(line)
        if (ol) { if (!inOl) { closeLists(); out.push('<ol>'); inOl = true } out.push('<li>' + inlineMarkdown(ol[1]) + '</li>'); continue }
        const quote = /^>\s?(.*)$/.exec(line)
        if (quote) { closeLists(); out.push('<blockquote>' + inlineMarkdown(quote[1]) + '</blockquote>'); continue }
        closeLists()
        out.push('<p>' + inlineMarkdown(line) + '</p>')
      }
      closeLists()
      if (inCode) out.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>')
      return out.join('')
    }

    function findMentionTarget(el) {
      if (!el || typeof el.closest !== 'function') return null
      const btn = el.closest('button')
      if (btn) {
        const title = btn.getAttribute && btn.getAttribute('title')
        if (title) {
          const parent = btn.parentElement
          const cls = typeof btn.className === 'string' ? btn.className : ''
          const inCode = !!(parent && (parent.tagName === 'CODE' || parent.nodeName === 'CODE'))
          const fileClass = cls.indexOf('fileMention') >= 0 || cls.indexOf('file-mention') >= 0 || cls.indexOf('file') >= 0
          if (inCode || fileClass) return title
        }
      }
      const code = el.closest('code')
      if (code) {
        const text = (code.textContent || '').trim()
        if (text && text.indexOf('\n') === -1 && FILE_EXT_RE.test(text)) return text
      }
      return null
    }

    function handleDocumentClick(e) {
      const path = findMentionTarget(e.target)
      if (!path) return
      e.preventDefault()
      e.stopPropagation()
      const cwd = currentCwd()
      if (layout) layout.openDetails()
      if (openSink) openSink(path, cwd)
      else pendingOpen = { path: path, cwd: cwd }
    }

    ctx.effect(() => {
      const doc = typeof document !== 'undefined' ? document : (typeof window !== 'undefined' ? window.document : null)
      if (!doc) return
      doc.addEventListener('click', handleDocumentClick, true)
      return () => doc.removeEventListener('click', handleDocumentClick, true)
    })

    function ArtifactViewer(props) {
      const layoutRef = props && props.layout
      const [items, setItems] = React.useState([])
      const [root, setRoot] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      const [error, setError] = React.useState('')
      const [filter, setFilter] = React.useState('all')
      const [selected, setSelected] = React.useState(null)
      const [view, setView] = React.useState(null)
      const [viewLoading, setViewLoading] = React.useState(false)
      const [listOpen, setListOpen] = React.useState(false)
      const [editMode, setEditMode] = React.useState(false)
      const [editText, setEditText] = React.useState('')
      const [saving, setSaving] = React.useState(false)

      const loadList = async () => {
        setLoading(true)
        setError('')
        try {
          const res = await call('list-artifacts', { cwd: currentCwd() })
          if (res && res.ok) {
            setItems(res.items || [])
            setRoot(res.root || '')
          } else {
            setError(res && res.error ? res.error : '扫描失败')
          }
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
        } finally {
          setLoading(false)
        }
      }

      const renderView = async (path, kind, name, cwd, collapse) => {
        if (collapse) setListOpen(false)
        setEditMode(false)
        setSelected({ path: path, rel: path, name: name, kind: kind, size: 0 })
        setView(null)
        setViewLoading(true)
        setError('')
        try {
          const method = kind === 'image' ? 'read-image' : 'read-doc'
          const res = await call(method, { path: path, cwd: cwd || '' })
          if (res && res.ok) {
            if (kind === 'image') {
              setView({ kind: 'image', dataUrl: res.dataUrl, name: name })
            } else {
              const fmt = res.format || 'text'
              const docView = { kind: 'doc', name: name, path: path, cwd: cwd || '', format: fmt }
              if (fmt === 'pdf') docView.dataUrl = res.dataUrl
              else docView.text = res.content
              setView(docView)
            }
          } else {
            setError(res && res.error ? res.error : '读取失败')
          }
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
        } finally {
          setViewLoading(false)
        }
      }

      const open = (item) => renderView(item.path, item.kind, item.name, root, false)
      const openByPath = (path, cwd) => renderView(path, kindFromPath(path), basename(path), cwd, true)

      const startEdit = () => { setEditText(view ? view.text || '' : ''); setEditMode(true) }
      const cancelEdit = () => setEditMode(false)
      const saveEdit = async () => {
        if (!view) return
        setSaving(true)
        try {
          const res = await call('write-doc', { path: view.path, cwd: view.cwd || '', content: editText })
          if (res && res.ok) {
            setView({ ...view, text: editText })
            setEditMode(false)
            loadList()
          } else {
            setError(res && res.error ? res.error : '保存失败')
          }
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
        } finally {
          setSaving(false)
        }
      }

      React.useEffect(() => {
        openSink = openByPath
        if (pendingOpen) {
          const p = pendingOpen
          pendingOpen = null
          openByPath(p.path, p.cwd)
        }
        return () => { openSink = null }
      }, [])

      React.useEffect(() => { loadList() }, [])

      const filtered = filter === 'all' ? items : items.filter(i => i.kind === filter)
      const imgCount = items.filter(i => i.kind === 'image').length
      const docCount = items.filter(i => i.kind === 'doc').length
      const showList = listOpen || !view

      const tab = (key, label) => React.createElement('button', {
        key: key,
        type: 'button',
        className: 'art-tab' + (filter === key ? ' art-tab-on' : ''),
        onClick: () => setFilter(key),
      }, label)

      const listRows = filtered.map(item => React.createElement('div', {
        key: item.path,
        className: 'art-row' + (selected && selected.path === item.path ? ' art-row-on' : ''),
        onClick: () => open(item),
      },
        React.createElement('span', { className: 'art-row-icon' }, item.kind === 'image' ? '🖼' : '📄'),
        React.createElement('div', { className: 'art-row-main' },
          React.createElement('div', { className: 'art-row-name' }, item.name),
          React.createElement('div', { className: 'art-row-rel' }, item.rel),
        ),
        React.createElement('span', { className: 'art-row-size' }, fmtSize(item.size)),
      ))

      let previewContent = null
      if (viewLoading) {
        previewContent = React.createElement('div', { className: 'art-empty' }, '加载中…')
      } else if (view && view.kind === 'image') {
        previewContent = React.createElement('img', { className: 'art-img', src: view.dataUrl, alt: view.name })
      } else if (view && view.kind === 'doc') {
        if (editMode) {
          previewContent = React.createElement('div', { className: 'art-edit' },
            React.createElement('textarea', { value: editText, onChange: (e) => setEditText(e.target.value), autoFocus: true }),
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
              React.createElement('button', { type: 'button', className: 'art-ibtn', onClick: saveEdit, disabled: saving }, saving ? '保存中…' : '保存'),
              React.createElement('button', { type: 'button', className: 'art-ibtn', onClick: cancelEdit }, '取消'),
            ),
          )
        } else if (view.format === 'pdf') {
          previewContent = React.createElement('embed', { className: 'art-pdf', src: view.dataUrl, type: 'application/pdf' })
        } else if (view.format === 'markdown') {
          previewContent = React.createElement('div', { className: 'art-md', dangerouslySetInnerHTML: { __html: markdownToHtml(view.text) } })
        } else {
          previewContent = React.createElement('pre', { className: 'art-doc' }, view.text)
        }
      } else {
        previewContent = React.createElement('div', { className: 'art-empty' }, '点击左侧文件查看内容')
      }

      const isMd = view && view.kind === 'doc' && view.format === 'markdown'
      const previewBar = (isMd && !editMode)
        ? React.createElement('div', { className: 'art-pbar' },
            React.createElement('button', { type: 'button', className: 'art-ibtn', onClick: startEdit }, '✎ 编辑'),
          )
        : null

      const previewPane = React.createElement('div', { className: 'art-preview' }, previewBar, previewContent)
      const listPane = React.createElement('div', { className: 'art-list' },
        listRows.length === 0
          ? React.createElement('div', { className: 'art-empty' }, loading ? '正在扫描工作区…' : '没有找到文档或图片')
          : listRows,
      )

      const body = showList
        ? React.createElement('div', { className: 'art-body' }, listPane, previewPane)
        : React.createElement('div', { className: 'art-body' }, previewPane)

      return React.createElement('div', { className: 'art-root' },
        React.createElement('div', { className: 'art-header' },
          React.createElement('div', { className: 'art-title' }, view ? view.name : '文档与图片'),
          React.createElement('div', { className: 'art-head-actions' },
            React.createElement('button', { type: 'button', className: 'art-ibtn' + (showList ? ' art-ibtn-on' : ''), title: '展开/收起文件列表', onClick: () => setListOpen(!listOpen) }, '☰'),
            React.createElement('button', { type: 'button', className: 'art-ibtn', title: '刷新', onClick: loadList }, loading ? '…' : '⟳'),
            React.createElement('button', { type: 'button', className: 'art-ibtn', title: '关闭', onClick: () => { if (layoutRef) layoutRef.closeDetails() } }, '×'),
          ),
        ),
        showList ? React.createElement('div', { className: 'art-tabs' },
          tab('all', '全部 ' + items.length),
          tab('image', '图片 ' + imgCount),
          tab('doc', '文档 ' + docCount),
        ) : null,
        error ? React.createElement('div', { className: 'art-error' }, error) : null,
        body,
        root ? React.createElement('div', { className: 'art-footer' }, root) : null,
      )
    }

    if (slots !== undefined) {
      slots.inject('details', () => slots.register(
        { name: 'details', priority: -1 },
        (p) => React.createElement(ArtifactViewer, { layout: layout }),
      ))
      // 刻意不在侧栏放入口：这是被动触发的能力——点对话里的文件名就会打开右侧栏
      // （见下面那个捕获阶段的全局点击监听）。为它单独占一个侧栏位，等于让用户
      // 先想起「有这么个面板」才用得上，反而绕。
    }
  
}
