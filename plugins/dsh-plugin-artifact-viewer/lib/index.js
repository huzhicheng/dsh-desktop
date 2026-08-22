// src/index.ts
var ROUTE_PREFIX = "/_dsh-artifact-viewer/api";
var HANDLERS = {};
var name = "artifact-viewer";
var inject = ["webServer"];
function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return {};
  }
}
function apply(ctx) {
  const fs = ctx.get("fs");
  if (fs === void 0) return;
  const sandboxPolicy = ctx.get("sandboxPolicy");
  const shell = ctx.get("shell");
  const fallbackRoot = sandboxPolicy && typeof sandboxPolicy.workspaceRoot === "string" ? sandboxPolicy.workspaceRoot : "";
  const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"];
  const DOC_EXTS = ["md", "markdown", "txt", "html", "htm", "json", "csv", "xml", "yaml", "yml", "toml", "js", "jsx", "ts", "tsx", "py", "css", "scss", "less", "sh", "bash", "zsh", "java", "c", "cpp", "cc", "h", "hpp", "rs", "go", "rb", "php", "sql", "log", "ini", "conf", "env", "bat", "ps1", "docx", "pptx", "pdf"];
  const SKIP_DIRS = ["node_modules", ".git", ".dsh", "dist", "build", "out", "__pycache__", ".next", ".cache", "coverage", "vendor", ".venv", "venv", ".idea", ".vscode"];
  const MAX_DEPTH = 6;
  const MAX_ITEMS = 500;
  const DOC_MAX = 2 * 1024 * 1024;
  const IMG_MAX = 10 * 1024 * 1024;
  const PDF_MAX = 20 * 1024 * 1024;
  const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", ico: "image/x-icon", avif: "image/avif" };
  const imageSet = new Set(IMAGE_EXTS);
  const docSet = new Set(DOC_EXTS);
  const skipSet = new Set(SKIP_DIRS);
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function extOf(name2) {
    const i = name2.lastIndexOf(".");
    return i < 0 ? "" : name2.slice(i + 1).toLowerCase();
  }
  function classify(name2) {
    const ext = extOf(name2);
    if (imageSet.has(ext)) return "image";
    if (docSet.has(ext)) return "doc";
    return null;
  }
  function isAbsolute(path) {
    return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
  }
  function toAbsolute(path, cwd) {
    if (!path) return "";
    if (isAbsolute(path)) return path;
    const base = cwd || fallbackRoot;
    if (!base) return path;
    return base.replace(/[\\/]+$/, "") + "/" + path.replace(/^[\\/]+/, "");
  }
  function writePolicy(base) {
    let mode = "workspace-write";
    try {
      if (sandboxPolicy && typeof sandboxPolicy.resolve === "function") {
        const resolved = sandboxPolicy.resolve();
        if (resolved && resolved.mode) mode = resolved.mode;
      }
    } catch (e) {
    }
    return { mode, workspaceRoot: base };
  }
  function bytesToBase64(bytes) {
    let result = "";
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < len ? bytes[i + 1] : 0;
      const b2 = i + 2 < len ? bytes[i + 2] : 0;
      result += B64.charAt(b0 >> 2);
      result += B64.charAt((b0 & 3) << 4 | b1 >> 4);
      result += i + 1 < len ? B64.charAt((b1 & 15) << 2 | b2 >> 6) : "=";
      result += i + 2 < len ? B64.charAt(b2 & 63) : "=";
    }
    return result;
  }
  function extractTagText(xml, tag) {
    const re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g");
    let out = "";
    let m;
    while ((m = re.exec(xml)) !== null) out += m[1];
    return out;
  }
  function paragraphsText(xml, paraTag, runTag) {
    const paras = xml.split(new RegExp("</" + paraTag + ">"));
    const lines = [];
    for (const p of paras) {
      const text = extractTagText(p, runTag).replace(/\n/g, "").trim();
      if (text) lines.push(text);
    }
    return lines.join("\n");
  }
  async function unzipMember(abs, member) {
    if (!shell) throw new Error("shell unavailable");
    const spec = shell.resolve({ command: 'unzip -p "' + abs + '" "' + member + '"', stdoutMaxBytes: 4 * 1024 * 1024 });
    const result = await shell.run(spec);
    if (result.exitCode !== 0) throw new Error("unzip exit " + result.exitCode);
    return result.stdout && result.stdout.text ? result.stdout.text : "";
  }
  async function officeText(abs, ext) {
    try {
      if (ext === "docx") {
        const xml = await unzipMember(abs, "word/document.xml");
        return paragraphsText(xml, "w:p", "w:t");
      }
      if (ext === "pptx") {
        const xml = await unzipMember(abs, "ppt/slides/*.xml");
        return paragraphsText(xml, "a:p", "a:t");
      }
    } catch (e) {
      return "\uFF08\u65E0\u6CD5\u63D0\u53D6\u8BE5\u6587\u6863\u6587\u672C\uFF1A" + (e && e.message ? e.message : String(e)) + "\uFF09";
    }
    return "";
  }
  async function scan(target, relPrefix, depth, out) {
    if (depth > MAX_DEPTH || out.length >= MAX_ITEMS) return;
    let entries;
    try {
      entries = await fs.listDir(target);
    } catch (e) {
      return;
    }
    if (!entries) return;
    for (const entry of entries) {
      if (out.length >= MAX_ITEMS) break;
      const name2 = entry.name;
      if (!name2 || name2.charAt(0) === ".") continue;
      const rel = relPrefix ? relPrefix + "/" + name2 : name2;
      if (entry.type === "directory") {
        if (skipSet.has(name2)) continue;
        await scan(entry.target, rel, depth + 1, out);
      } else if (entry.type === "file") {
        const kind = classify(name2);
        if (kind === null) continue;
        let abs = "";
        try {
          abs = fs.processPath(entry.target);
        } catch (e) {
          abs = rel;
        }
        out.push({ path: abs, rel, name: name2, kind, size: entry.size || 0 });
      }
    }
  }
  async function resolveInRoot(path, cwd) {
    const base = cwd || fallbackRoot;
    if (!base) throw new Error("workspace root unavailable");
    const baseTarget = await fs.resolve(base);
    const fileTarget = await fs.resolve(toAbsolute(path, cwd));
    if (!fs.contains(baseTarget, fileTarget)) throw new Error("path is outside the workspace");
    return fileTarget;
  }
  HANDLERS["list-artifacts"] = async (args) => {
    try {
      const cwd = args && typeof args.cwd === "string" ? args.cwd : "";
      const base = cwd || fallbackRoot;
      if (!base) return { ok: true, root: "", items: [] };
      const rootTarget = await fs.resolve(base);
      const out = [];
      await scan(rootTarget, "", 0, out);
      out.sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
      return { ok: true, root: base, items: out };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };
  HANDLERS["read-doc"] = async (args) => {
    try {
      const path = args && typeof args.path === "string" ? args.path : "";
      const cwd = args && typeof args.cwd === "string" ? args.cwd : "";
      if (!path) throw new Error("missing path");
      const fileTarget = await resolveInRoot(path, cwd);
      const info = await fs.stat(fileTarget);
      if (info && info.type !== "file") throw new Error("not a regular file");
      const ext = extOf(path);
      if (ext === "docx" || ext === "pptx") {
        const abs = fs.processPath(fileTarget);
        const text = await officeText(abs, ext);
        return { ok: true, path, content: text, format: "text" };
      }
      if (ext === "pdf") {
        if (info && info.size && info.size > PDF_MAX) throw new Error("\u6587\u6863\u8FC7\u5927\uFF0C\u65E0\u6CD5\u9884\u89C8");
        const bytes = await fs.readBytes(fileTarget, void 0, PDF_MAX);
        return { ok: true, path, format: "pdf", dataUrl: "data:application/pdf;base64," + bytesToBase64(bytes) };
      }
      if (info && info.size && info.size > DOC_MAX) throw new Error("\u6587\u6863\u8FC7\u5927\uFF0C\u65E0\u6CD5\u9884\u89C8");
      const content = await fs.readText(fileTarget);
      const format = ext === "md" || ext === "markdown" ? "markdown" : "text";
      return { ok: true, path, content, format };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };
  HANDLERS["write-doc"] = async (args) => {
    try {
      const path = args && typeof args.path === "string" ? args.path : "";
      const cwd = args && typeof args.cwd === "string" ? args.cwd : "";
      const content = args && typeof args.content === "string" ? args.content : "";
      if (!path) throw new Error("missing path");
      const base = cwd || fallbackRoot;
      const fileTarget = await resolveInRoot(path, cwd);
      await fs.writeText(fileTarget, content, void 0, void 0, writePolicy(base));
      return { ok: true, path };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };
  HANDLERS["read-image"] = async (args) => {
    try {
      const path = args && typeof args.path === "string" ? args.path : "";
      const cwd = args && typeof args.cwd === "string" ? args.cwd : "";
      if (!path) throw new Error("missing path");
      const fileTarget = await resolveInRoot(path, cwd);
      const info = await fs.stat(fileTarget);
      if (info && info.type !== "file") throw new Error("not a regular file");
      if (info && info.size && info.size > IMG_MAX) throw new Error("\u56FE\u7247\u8FC7\u5927\uFF0C\u65E0\u6CD5\u9884\u89C8");
      const bytes = await fs.readBytes(fileTarget, void 0, IMG_MAX);
      const mime = MIME[extOf(path)] || "application/octet-stream";
      return { ok: true, path, dataUrl: "data:" + mime + ";base64," + bytesToBase64(bytes), mime };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };
  ctx.effect?.(() => ctx.webServer.register({
    kind: "prefix",
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      void (async () => {
        const action = (req.url ?? "").split("?")[0]?.slice(ROUTE_PREFIX.length + 1) ?? "";
        const run = HANDLERS[action];
        if (run === void 0) {
          sendJson(res, 404, { ok: false, error: `\u6CA1\u6709\u8FD9\u4E2A\u52A8\u4F5C\uFF1A${action}` });
          return;
        }
        try {
          sendJson(res, 200, await run(await readBody(req)));
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      })();
    }
  }), "artifact-viewer: \u6587\u4EF6\u63A5\u53E3");
}
export {
  apply,
  inject,
  name
};
