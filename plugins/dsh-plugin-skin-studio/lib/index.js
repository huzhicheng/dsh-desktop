// src/index.ts
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var ROUTE_PREFIX = "/_dsh-skin-studio/api";
var PROFILE = "web";
var COMMAND_TIMEOUT_MS = 5 * 60 * 1e3;
var PICK_TIMEOUT_MS = 5 * 60 * 1e3;
var FIBER_PHASE = {
  0: "pending",
  1: "loading",
  2: "active",
  3: "failed",
  4: null,
  5: "unloading"
};
function listRuntime(loader) {
  const entries = [];
  for (const entry of loader.entries()) {
    if (entry.options.group !== void 0 && entry.options.group !== false) continue;
    entries.push({
      id: String(entry.id),
      module: entry.options.name,
      enabled: entry.disabled !== true,
      phase: entry.fiber === void 0 ? null : FIBER_PHASE[entry.fiber.state] ?? null
    });
  }
  return entries;
}
function profileDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "profiles", PROFILE);
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return void 0;
  }
}
function listPlugins() {
  const dir = profileDir();
  const manifest = readJson(join(dir, "package.json")) ?? {};
  const dsh = manifest.dsh;
  const bundles = dsh?.profile?.bundles ?? [];
  const dependencies = manifest.dependencies ?? {};
  const installed = Object.entries(dependencies).map(([name, spec]) => {
    const own = readJson(join(dir, "node_modules", name, "package.json"));
    const ownDsh = own?.dsh;
    return {
      name,
      spec,
      ...typeof own?.version === "string" ? { version: own.version } : {},
      ...typeof own?.description === "string" ? { description: own.description } : {},
      isBundle: ownDsh?.bundle !== void 0,
      isLocal: /^(file:|link:|\.|\/)/.test(spec),
      active: bundles.includes(name)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    profileDir: dir,
    builtin: bundles.filter((name) => name.startsWith("@deepseek-ai/")),
    installed
  };
}
function validateSpec(raw) {
  const spec = String(raw ?? "").trim();
  if (spec === "") throw new Error("\u8BF7\u586B\u5199\u63D2\u4EF6\u6765\u6E90");
  if (spec.startsWith("-")) throw new Error("\u63D2\u4EF6\u6765\u6E90\u4E0D\u80FD\u4EE5 - \u5F00\u5934");
  if (/[\n\r\0]/.test(spec)) throw new Error("\u63D2\u4EF6\u6765\u6E90\u5305\u542B\u975E\u6CD5\u5B57\u7B26");
  return spec;
}
async function runPluginCommand(args) {
  const entry = process.argv[1];
  if (entry === void 0 || !existsSync(entry)) {
    return { ok: false, output: "\u627E\u4E0D\u5230 dsh \u5165\u53E3\uFF0C\u65E0\u6CD5\u6267\u884C\u63D2\u4EF6\u547D\u4EE4" };
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, "plugin", "--profile", PROFILE, ...args], {
      cwd: profileDir(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let output = "";
    const collect = (chunk) => {
      output = (output + chunk.toString()).slice(-16384);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, output: `${output}
\u63D2\u4EF6\u547D\u4EE4\u8D85\u65F6\uFF08\u8D85\u8FC7 ${String(COMMAND_TIMEOUT_MS / 1e3)} \u79D2\uFF09` });
    }, COMMAND_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `\u65E0\u6CD5\u542F\u52A8\u63D2\u4EF6\u547D\u4EE4\uFF1A${error.message}` });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, output });
      else resolve({ ok: false, output: `${output}
\u547D\u4EE4\u5931\u8D25\uFF08${code === null ? `\u4FE1\u53F7 ${String(signal)}` : `\u9000\u51FA\u7801 ${String(code)}`}\uFF09` });
    });
  });
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}
var loaderRef;
var ctxRef;
function nativePick() {
  try {
    const picker = ctxRef?.get?.("directoryPicker");
    const capability = picker?.capability();
    if (capability?.kind === "native" && typeof capability.pick === "function") return capability.pick;
  } catch {
  }
  return void 0;
}
async function pickDirectory() {
  const pick = nativePick();
  if (pick === void 0) return { ok: false, output: "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u76EE\u5F55\u9009\u62E9\uFF0C\u8BF7\u624B\u52A8\u586B\u5199\u8DEF\u5F84" };
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, PICK_TIMEOUT_MS);
  try {
    const chosen = await pick(controller.signal);
    return chosen === null ? { ok: true } : { ok: true, path: chosen };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
async function handle(req, res) {
  const path = (req.url ?? "").split("?")[0] ?? "";
  const action = path.slice(ROUTE_PREFIX.length);
  try {
    if (action === "/plugins" && req.method === "GET") {
      sendJson(res, 200, {
        ...listPlugins(),
        runtime: loaderRef === void 0 ? [] : listRuntime(loaderRef),
        // 前端据此决定要不要显示「选择目录」按钮
        canPickDirectory: nativePick() !== void 0
      });
      return;
    }
    if (action === "/plugins/pick-directory" && req.method === "POST") {
      const result = await pickDirectory();
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (action === "/plugins/install" && req.method === "POST") {
      const spec = validateSpec((await readBody(req)).spec);
      const result = await runPluginCommand(["add", spec]);
      sendJson(res, result.ok ? 200 : 500, result);
      return;
    }
    if (action === "/plugins/remove" && req.method === "POST") {
      const name = validateSpec((await readBody(req)).name);
      const result = await runPluginCommand(["remove", name]);
      sendJson(res, result.ok ? 200 : 500, result);
      return;
    }
    sendJson(res, 404, { ok: false, output: "\u672A\u77E5\u63A5\u53E3" });
  } catch (error) {
    sendJson(res, 400, { ok: false, output: error instanceof Error ? error.message : String(error) });
  }
}
var inject = ["webServer", "loader"];
function apply(ctx) {
  loaderRef = ctx.loader;
  ctxRef = ctx;
  ctx.effect?.(() => ctx.webServer.register({
    kind: "prefix",
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      void handle(req, res);
    }
  }), "skin-studio: \u63D2\u4EF6\u7BA1\u7406\u63A5\u53E3");
}
export {
  apply,
  inject
};
