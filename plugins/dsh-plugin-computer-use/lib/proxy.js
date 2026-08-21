// src/proxy.ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
var BIN = process.env.CUA_PROXY_BIN ?? "";
var ARGS = (process.env.CUA_PROXY_ARGS ?? "mcp").split("\n").filter((part) => part !== "");
var DROP = (process.env.CUA_PROXY_DROP ?? "").split(",").map((part) => part.trim()).filter((part) => part !== "");
var MAX_ELEMENTS = Number(process.env.CUA_PROXY_MAX_ELEMENTS ?? "200");
if (BIN === "") {
  process.stderr.write("cua \u4EE3\u7406\uFF1A\u6CA1\u6709\u7ED9 CUA_PROXY_BIN\n");
  process.exit(1);
}
function dropped(name) {
  return DROP.some((rule) => rule.endsWith("*") ? name.startsWith(rule.slice(0, -1)) : name === rule);
}
function sanitize(node) {
  if (Array.isArray(node)) return node.map(sanitize);
  if (typeof node !== "object" || node === null) return node;
  const source = node;
  const result = {};
  for (const [key, value] of Object.entries(source)) result[key] = sanitize(value);
  for (const keyword of ["anyOf", "oneOf"]) {
    const branches = result[keyword];
    if (!Array.isArray(branches) || result.type === void 0) continue;
    const inherited = result.type;
    result[keyword] = branches.map((branch) => {
      if (typeof branch !== "object" || branch === null) return branch;
      const copy = { ...branch };
      copy.type ??= inherited;
      return copy;
    });
    delete result.type;
  }
  return result;
}
var child = spawn(BIN, ARGS, { stdio: ["pipe", "pipe", "inherit"] });
child.once("error", (error) => {
  process.stderr.write(`cua \u4EE3\u7406\uFF1A\u62C9\u8D77 ${BIN} \u5931\u8D25\uFF1A${error.message}
`);
  process.exit(1);
});
child.once("exit", (code) => {
  process.exit(code ?? 0);
});
function rewriteCall(frame) {
  const params = frame.params;
  if (params?.name !== "get_window_state") return;
  const args = typeof params.arguments === "object" && params.arguments !== null ? params.arguments : {};
  if (typeof args.screenshot_out_file !== "string" || args.screenshot_out_file === "") {
    args.include_screenshot = false;
  }
  if (MAX_ELEMENTS > 0 && args.max_elements === void 0) args.max_elements = MAX_ELEMENTS;
  params.arguments = args;
}
createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.trim() === "") return;
  let frame;
  try {
    frame = JSON.parse(line);
  } catch {
    child.stdin.write(`${line}
`);
    return;
  }
  const message = frame;
  if (message.method === "tools/call") {
    rewriteCall(message);
    child.stdin.write(`${JSON.stringify(frame)}
`);
    return;
  }
  child.stdin.write(`${line}
`);
});
createInterface({ input: child.stdout }).on("line", (line) => {
  if (line.trim() === "") return;
  let frame;
  try {
    frame = JSON.parse(line);
  } catch {
    process.stdout.write(`${line}
`);
    return;
  }
  const message = frame;
  const tools = message.result?.tools;
  if (!Array.isArray(tools)) {
    process.stdout.write(`${line}
`);
    return;
  }
  const kept = tools.filter((tool) => !dropped(String(tool.name ?? ""))).map((tool) => {
    const copy = { ...tool };
    if (copy.inputSchema !== void 0) copy.inputSchema = sanitize(copy.inputSchema);
    return copy;
  });
  if (message.result !== void 0) message.result.tools = kept;
  process.stdout.write(`${JSON.stringify(frame)}
`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
