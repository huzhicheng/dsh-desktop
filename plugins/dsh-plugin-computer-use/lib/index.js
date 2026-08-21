// src/index.ts
import { fileURLToPath } from "node:url";
import { dirname, join as join2 } from "node:path";

// src/driver.ts
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join } from "node:path";
var INSTALL_SH = "https://cua.ai/driver/install.sh";
var INSTALL_PS1 = "https://cua.ai/driver/install.ps1";
function candidates() {
  const home = homedir();
  if (platform() === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
      join(local, "Programs", "Cua", "cua-driver", "bin", "cua-driver.exe"),
      join(local, "Programs", "trycua", "cua-driver-rs", "bin", "cua-driver.exe")
    ];
  }
  return [
    join(home, ".local", "bin", "cua-driver"),
    "/Applications/CuaDriver.app/Contents/MacOS/cua-driver",
    "/usr/local/bin/cua-driver",
    "/opt/homebrew/bin/cua-driver"
  ];
}
function fromPath() {
  const name2 = platform() === "win32" ? "cua-driver.exe" : "cua-driver";
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    const candidate = join(dir, name2);
    if (existsSync(candidate)) return candidate;
  }
  return "";
}
function run(file, args, timeoutMs = 2e4) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
      const out = `${stdout}${stderr}`.trim();
      resolve({ code: error === null ? 0 : 1, out });
    });
  });
}
function locate(configured) {
  if (configured !== "") return existsSync(configured) ? configured : "";
  return candidates().find((path) => existsSync(path)) ?? fromPath();
}
var permissionCache = {
  accessibility: false,
  screenRecording: false,
  ok: false,
  detail: ""
};
async function inspect(configured) {
  const binPath = locate(configured);
  const info = {
    binPath,
    version: "",
    platform: platform(),
    permissions: platform() === "darwin" ? permissionCache : { accessibility: true, screenRecording: true, ok: true, detail: "" }
  };
  if (binPath === "") return info;
  const version = await run(binPath, ["--version"], 5e3);
  info.version = version.code === 0 ? version.out.split("\n")[0] ?? "" : "";
  return info;
}
async function checkPermissions(configured) {
  if (platform() !== "darwin") {
    permissionCache = { accessibility: true, screenRecording: true, ok: true, detail: "" };
    return permissionCache;
  }
  const binPath = locate(configured);
  if (binPath === "") {
    permissionCache = { accessibility: false, screenRecording: false, ok: false, detail: "" };
    return permissionCache;
  }
  const probe = await run(binPath, ["permissions", "status", "--json"], 2e4);
  let accessibility = false;
  let screenRecording = false;
  try {
    const parsed = JSON.parse(probe.out);
    accessibility = parsed.accessibility === true;
    screenRecording = parsed.screen_recording === true;
  } catch {
  }
  permissionCache = {
    accessibility,
    screenRecording,
    ok: accessibility && screenRecording,
    detail: probe.out.slice(0, 600)
  };
  return permissionCache;
}
async function requestPermissions(configured) {
  if (platform() !== "darwin") return "\u5F53\u524D\u5E73\u53F0\u4E0D\u9700\u8981\u989D\u5916\u6388\u6743";
  const binPath = locate(configured);
  if (binPath === "") return "\u8FD8\u6CA1\u5B89\u88C5 cua-driver";
  const result = await run(binPath, ["permissions", "grant"], 18e4);
  return result.out.slice(0, 800);
}
function install(onOutput) {
  const isWindows = platform() === "win32";
  const child = isWindows ? spawn("powershell", ["-NoProfile", "-Command", `irm ${INSTALL_PS1} | iex`], { windowsHide: true }) : spawn("/bin/bash", ["-c", `curl -fsSL ${INSTALL_SH} | /bin/bash`]);
  let out = "";
  const take = (chunk) => {
    const text = chunk.toString();
    out += text;
    onOutput(text);
  };
  child.stdout?.on("data", take);
  child.stderr?.on("data", take);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, out: `${out}
\u5B89\u88C5\u8D85\u65F6\uFF0810 \u5206\u949F\uFF09` });
    }, 6e5);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, out: `${out}
${error.message}` });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out });
    });
  });
}

// src/index.ts
var ROUTE_PREFIX = "/_dsh-computer-use/api";
var SERVER_NAME = "cua";
var name = "computer-use";
var inject = ["webServer", "tools"];
var DEFAULT_CONFIG = {
  binPath: "",
  permissionMode: "standard",
  extraArgs: [],
  autoConnect: true,
  blockImageResults: true,
  // get_desktop_state 只回截图，对只收文本的模型没用，默认也藏掉
  hideTools: ["browser_*", "page", "replay_trajectory", "install_ffmpeg", "get_desktop_state"],
  fastEffort: "low",
  maxElements: 200
};
var fork;
var lastError = "";
var ctxRef;
var configRef = DEFAULT_CONFIG;
var installLog = "";
var installing = false;
var usingComputer = false;
var currentTurn;
function mcpLaunch(config, binPath) {
  const env = {
    CUA_PROXY_BIN: binPath,
    CUA_PROXY_ARGS: ["mcp", ...config.extraArgs].join("\n"),
    CUA_PROXY_DROP: config.hideTools.join(","),
    CUA_PROXY_MAX_ELEMENTS: String(config.maxElements)
  };
  if (config.permissionMode !== "") env.CUA_DRIVER_PERMISSION_MODE = config.permissionMode;
  const proxy = join2(dirname(fileURLToPath(import.meta.url)), "proxy.js");
  return { command: process.execPath, args: [proxy], env };
}
function imageDenial(execution) {
  const raw = execution.name;
  if (!raw.startsWith(`mcp__${SERVER_NAME}__`)) return void 0;
  const tool = raw.slice(`mcp__${SERVER_NAME}__`.length);
  if (tool !== "get_desktop_state" && tool !== "get_window_state") return void 0;
  const args = typeof execution.arguments === "object" && execution.arguments !== null ? execution.arguments : {};
  const outFile = args.screenshot_out_file;
  if (typeof outFile === "string" && outFile !== "") return void 0;
  if (tool === "get_window_state" && args.include_screenshot === false) return void 0;
  return `\u5F53\u524D\u6A21\u578B\u4E0D\u63A5\u53D7\u56FE\u7247\uFF0C\u622A\u56FE\u4E0D\u80FD\u76F4\u63A5\u56DE\u5230\u5BF9\u8BDD\u91CC\uFF08\u4E00\u65E6\u8FDB\u5165\u5386\u53F2\uFF0C\u4E4B\u540E\u6BCF\u6B21\u8BF7\u6C42\u90FD\u4F1A\u5931\u8D25\uFF09\u3002\u8BF7\u6539\u7528\u4EE5\u4E0B\u4EFB\u4E00\u79CD\uFF1A\u7ED9\u8FD9\u6B21\u8C03\u7528\u4F20 screenshot_out_file \u628A\u622A\u56FE\u5199\u5230\u6587\u4EF6\u518D\u56DE\u4E00\u4E2A\u8DEF\u5F84\uFF1B\u6216\u8005\u6539\u7528 mcp__${SERVER_NAME}__get_window_state \u8BFB\u7A97\u53E3\u7684\u65E0\u969C\u788D\u6811\u2014\u2014\u5B83\u662F\u7EAF\u6587\u672C\uFF0C\u6BCF\u4E2A\u53EF\u64CD\u4F5C\u5143\u7D20\u5E26 [element_index N]\uFF0C\u70B9\u51FB\u76F4\u63A5\u4F20\u90A3\u4E2A\u7D22\u5F15\u5373\u53EF\u3002`;
}
async function connect() {
  const ctx = ctxRef;
  if (ctx === void 0) return { ok: false, message: "\u63D2\u4EF6\u5C1A\u672A\u521D\u59CB\u5316" };
  disconnect();
  const binPath = locate(configRef.binPath);
  if (binPath === "") {
    lastError = "\u6CA1\u6709\u627E\u5230 cua-driver\uFF0C\u8BF7\u5148\u5B89\u88C5";
    return { ok: false, message: lastError };
  }
  try {
    const mcpClient = await import("@deepseek-ai/dsh-mcp-client");
    const launch = mcpLaunch(configRef, binPath);
    fork = ctx.plugin(mcpClient, {
      transport: "stdio",
      serverName: SERVER_NAME,
      command: launch.command,
      args: launch.args,
      env: launch.env,
      failOnStartupError: false
    });
    lastError = "";
    return { ok: true, message: `\u5DF2\u8FDE\u63A5 ${binPath}` };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return { ok: false, message: lastError };
  }
}
function disconnect() {
  fork?.dispose();
  fork = void 0;
}
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(text);
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
async function handle(req, res) {
  const path = (req.url ?? "").split("?")[0]?.slice(ROUTE_PREFIX.length) ?? "";
  try {
    if (path === "/status") {
      const info = await inspect(configRef.binPath);
      sendJson(res, 200, {
        ...info,
        connected: fork !== void 0,
        permissionMode: configRef.permissionMode,
        blockImageResults: configRef.blockImageResults,
        hideTools: configRef.hideTools,
        fastEffort: configRef.fastEffort,
        maxElements: configRef.maxElements,
        installing,
        installLog: installLog.slice(-4e3),
        error: lastError,
        toolPrefix: `mcp__${SERVER_NAME}__`
      });
      return;
    }
    if (path === "/install" && req.method === "POST") {
      if (installing) {
        sendJson(res, 200, { ok: false, message: "\u6B63\u5728\u5B89\u88C5\u4E2D" });
        return;
      }
      installing = true;
      installLog = "";
      void install((chunk) => {
        installLog += chunk;
      }).then(async (result) => {
        installing = false;
        installLog += result.ok ? "\n\u5B89\u88C5\u5B8C\u6210\u3002" : "\n\u5B89\u88C5\u5931\u8D25\u3002";
        if (result.ok && configRef.autoConnect) {
          const connected = await connect();
          installLog += `
${connected.message}`;
        }
      });
      sendJson(res, 200, { ok: true, message: "\u5DF2\u5F00\u59CB\u5B89\u88C5" });
      return;
    }
    if (path === "/connect" && req.method === "POST") {
      sendJson(res, 200, await connect());
      return;
    }
    if (path === "/disconnect" && req.method === "POST") {
      disconnect();
      sendJson(res, 200, { ok: true, message: "\u5DF2\u65AD\u5F00" });
      return;
    }
    if (path === "/permissions/check" && req.method === "POST") {
      sendJson(res, 200, await checkPermissions(configRef.binPath));
      return;
    }
    if (path === "/permissions/grant" && req.method === "POST") {
      const detail = await requestPermissions(configRef.binPath);
      const after = await checkPermissions(configRef.binPath);
      sendJson(res, 200, { ok: after.ok, detail, permissions: after });
      return;
    }
    if (path === "/fast-effort" && req.method === "POST") {
      const body = await readBody(req);
      const value = typeof body.effort === "string" ? body.effort : "";
      if (!["", "off", "low", "high", "max"].includes(value)) {
        sendJson(res, 400, { ok: false, message: `\u4E0D\u8BA4\u8BC6\u7684\u63A8\u7406\u5F3A\u5EA6\uFF1A${value}` });
        return;
      }
      configRef = { ...configRef, fastEffort: value };
      sendJson(res, 200, { ok: true, fastEffort: value });
      return;
    }
    if (path === "/block-images" && req.method === "POST") {
      const body = await readBody(req);
      configRef = { ...configRef, blockImageResults: body.enabled === true };
      sendJson(res, 200, { ok: true, blockImageResults: configRef.blockImageResults });
      return;
    }
    if (path === "/mode" && req.method === "POST") {
      const body = await readBody(req);
      const mode = typeof body.mode === "string" ? body.mode : "";
      if (!["standard", "bounded", "unrestricted"].includes(mode)) {
        sendJson(res, 400, { ok: false, message: `\u4E0D\u8BA4\u8BC6\u7684\u6743\u9650\u6A21\u5F0F\uFF1A${mode}` });
        return;
      }
      configRef = { ...configRef, permissionMode: mode };
      sendJson(res, 200, fork === void 0 ? { ok: true, message: "\u5DF2\u4FDD\u5B58" } : await connect());
      return;
    }
    sendJson(res, 404, { ok: false, message: "\u6CA1\u6709\u8FD9\u4E2A\u63A5\u53E3" });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}
function apply(ctx, config = {}) {
  ctxRef = ctx;
  configRef = { ...DEFAULT_CONFIG, ...config };
  ctx.effect?.(() => ctx.webServer.register({
    kind: "prefix",
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      void handle(req, res);
    }
  }), "computer-use: \u72B6\u6001\u63A5\u53E3");
  ctx.effect?.(() => ctx.tools.guard((execution) => {
    if (execution.name.startsWith(`mcp__${SERVER_NAME}__`)) usingComputer = true;
    return configRef.blockImageResults ? imageDenial(execution) : void 0;
  }), "computer-use: \u62E6\u622A\u4F1A\u8FD4\u56DE\u56FE\u7247\u7684\u8C03\u7528");
  ctx.effect?.(() => ctx.on("agent/request", async (payload, next) => {
    const config2 = await next();
    if (payload.turn !== currentTurn) {
      currentTurn = payload.turn;
      usingComputer = false;
    }
    if (configRef.fastEffort === "" || !usingComputer) return config2;
    return { ...config2, reasoningEffort: configRef.fastEffort };
  }), "computer-use: \u64CD\u4F5C\u671F\u95F4\u964D\u4F4E\u63A8\u7406\u5F3A\u5EA6");
  ctx.effect?.(() => () => {
    disconnect();
  }, "computer-use: \u65AD\u5F00 MCP");
  if (configRef.autoConnect && locate(configRef.binPath) !== "") {
    void connect();
  }
}
export {
  apply,
  inject,
  name
};
