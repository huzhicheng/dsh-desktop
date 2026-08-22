window.__ModuleLoader__.load({
	id: "dsh-plugin-computer-use",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply
});
module.exports = __toCommonJS(index_exports);

// ../shared/entry-row.ts
var import_react = require("react");
var STACK_STYLE_ID = "dsh-sidebar-entry-stack";
function ensureVerticalFooter() {
  if (document.getElementById(STACK_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STACK_STYLE_ID;
  style.textContent = '[class*="footerActions"]{flex-direction:column;}';
  document.head.appendChild(style);
}
function entryRow(label, iconPath, wide, onClick) {
  const base = {
    flex: "none",
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    overflow: "hidden",
    color: "var(--dsw-alias-label-primary)",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: "22px"
  };
  const shape = wide ? {
    gap: "8px",
    width: "calc(100% + 8px)",
    height: "34px",
    margin: "4px -4px 4px",
    padding: "6px 2px 6px 10px",
    borderRadius: "12px"
  } : {
    gap: "0",
    width: "36px",
    height: "36px",
    justifyContent: "center",
    margin: "8px 0 10px",
    padding: "0",
    borderRadius: "50%"
  };
  return (0, import_react.createElement)(
    "button",
    {
      type: "button",
      title: label,
      "aria-label": label,
      onClick,
      style: { ...base, ...shape },
      // hover 底色与「设置」同一个 token；内联样式没有 :hover，只能这样接
      onMouseEnter: (event) => {
        event.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
      },
      onMouseLeave: (event) => {
        event.currentTarget.style.background = "transparent";
      }
    },
    (0, import_react.createElement)("svg", {
      width: wide ? 16 : 18,
      height: wide ? 16 : 18,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { flex: "none" }
    }, (0, import_react.createElement)("path", { d: iconPath })),
    wide ? (0, import_react.createElement)("span", { style: { overflow: "hidden", whiteSpace: "nowrap" } }, label) : null
  );
}
function registerPluginSettings(packageName, open) {
  const host = globalThis;
  host.__dshPluginSettings__ ??= {};
  host.__dshPluginSettings__[packageName] = open;
}

// src/client/index.ts
var API = "/_dsh-computer-use/api";
var ICON_DESKTOP = "M3 5.5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM8 20.5h8M12 16.5v4";
async function api(path, body) {
  const response = await fetch(API + path, body === void 0 ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return await response.json();
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}
var CSS = `
.cu-mask { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,0.32); backdrop-filter: blur(2px); }
.cu-dialog { width: min(620px, calc(100vw - 64px)); max-height: min(80vh, 780px);
  display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; font-size: 13px;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111);
  border: 1px solid var(--dsw-alias-border-l2, #8883); box-shadow: 0 24px 70px rgba(0,0,0,0.3); }
.cu-head { display: flex; align-items: center; padding: 15px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #8882); }
.cu-title { font-size: 15px; font-weight: 650; }
.cu-body { padding: 16px 18px 20px; overflow-y: auto; flex: 1 1 auto; min-height: 0; line-height: 1.65; }
.cu-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex: none;
  padding: 12px 18px; border-top: 1px solid var(--dsw-alias-border-l1, #8882); }
.cu-btn { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
.cu-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary, #c99); color: var(--dsw-alias-brand-primary, #c99); }
.cu-btn:disabled { opacity: 0.45; cursor: default; }
.cu-btn.primary { background: var(--dsw-alias-brand-primary, #c99); border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 600; }
.cu-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #8883); border-radius: 10px; }
.cu-row .cu-main { flex: 1; min-width: 0; }
.cu-name { font-weight: 640; }
.cu-meta { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; margin-top: 2px; word-break: break-all; }
.cu-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.cu-dot.on { background: var(--dsw-alias-state-success-primary, #6a4); }
.cu-dot.off { background: var(--dsw-alias-label-caption, #999); }
.cu-dot.warn { background: var(--dsw-alias-state-warn-primary, #b80); }
.cu-note { font-size: 12px; line-height: 1.7; padding: 10px 12px; border-radius: 9px; margin-bottom: 14px;
  border: 1px solid var(--dsw-alias-state-warn-primary, #b80); }
.cu-log { margin-top: 10px; padding: 10px 12px; border-radius: 9px; font-size: 11.5px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow: auto;
  background: var(--dsw-alias-markdown-code-block, #0002); font-family: ui-monospace, Menlo, monospace; }
.cu-h { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-tertiary, #888); margin: 18px 0 9px; }
.cu-h:first-child { margin-top: 0; }
.cu-select { font: inherit; font-size: 12px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
`;
function openPanel() {
  if (document.querySelector(".cu-mask") !== null) return;
  const mask = el("div", { class: "cu-mask" });
  const dialog = el("div", { class: "cu-dialog" });
  mask.append(el("style", {}, CSS), dialog);
  let timer;
  const close = () => {
    if (timer !== void 0) clearInterval(timer);
    mask.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  mask.addEventListener("click", (event) => {
    if (event.target === mask) close();
  });
  const body = el("div", { class: "cu-body" });
  const closeBtn = el("button", { class: "cu-btn primary", type: "button" }, "\u5173\u95ED");
  closeBtn.addEventListener("click", close);
  dialog.append(
    el("div", { class: "cu-head" }, el("div", { class: "cu-title" }, "\u7535\u8111\u64CD\u4F5C")),
    body,
    el("div", { class: "cu-foot" }, closeBtn)
  );
  mask.appendChild(dialog);
  document.body.appendChild(mask);
  const render = (status) => {
    body.replaceChildren();
    body.appendChild(el(
      "div",
      { class: "cu-note" },
      "\u5F00\u542F\u540E\uFF0Cagent \u53EF\u4EE5\u76F4\u63A5\u63A7\u5236\u8FD9\u53F0\u7535\u8111\u7684\u952E\u76D8\u3001\u9F20\u6807\u548C\u754C\u9762\u5143\u7D20\u3002\u5B83\u4E0D\u53D7\u5DE5\u4F5C\u76EE\u5F55\u7EA6\u675F\uFF0C\u4E5F\u4E0D\u8D70\u5BA1\u6279\u5361\u7247\u3002\u53EA\u5728\u4F60\u6E05\u695A\u5B83\u8981\u505A\u4EC0\u4E48\u65F6\u5F00\u542F\u3002"
    ));
    const installed = status.binPath !== "";
    const line = (name, meta, state, ...actions) => el(
      "div",
      { class: "cu-row" },
      el("span", { class: `cu-dot ${state}` }),
      el("div", { class: "cu-main" }, el("div", { class: "cu-name" }, name), el("div", { class: "cu-meta" }, meta)),
      ...actions
    );
    body.appendChild(el("div", { class: "cu-h" }, "\u9A71\u52A8"));
    if (installed) {
      body.appendChild(line("Cua Driver \u5DF2\u5B89\u88C5", `${status.version || "\u7248\u672C\u672A\u77E5"}\u3000${status.binPath}`, "on"));
    } else {
      const installBtn = el(
        "button",
        { class: "cu-btn primary", type: "button" },
        status.installing ? "\u5B89\u88C5\u4E2D\u2026" : "\u5B89\u88C5"
      );
      installBtn.disabled = status.installing;
      installBtn.addEventListener("click", () => {
        installBtn.disabled = true;
        installBtn.textContent = "\u5B89\u88C5\u4E2D\u2026";
        void api("/install", {});
      });
      const where = status.platform === "darwin" ? "\u88C5\u5230\u300C\u5E94\u7528\u7A0B\u5E8F\u300D\u3002\u4E0D\u968F\u672C\u5E94\u7528\u5206\u53D1\u662F\u56E0\u4E3A macOS \u7684\u6388\u6743\u7ED1\u5B9A\u7B7E\u540D\u8EAB\u4EFD\uFF0C\u6362\u4E2A\u526F\u672C\u8981\u91CD\u65B0\u6388\u6743" : status.platform === "win32" ? "\u88C5\u5230 %LOCALAPPDATA%\\Programs\\Cua\\cua-driver\uFF0C\u5E76\u628A\u5B83\u52A0\u8FDB\u7528\u6237 PATH" : "\u88C5\u5230 ~/.local/bin";
      body.appendChild(line(
        "\u5C1A\u672A\u5B89\u88C5 Cua Driver",
        `\u4F1A\u4ECE cua.ai \u4E0B\u8F7D\u5B98\u65B9\u5B89\u88C5\u5305\uFF08\u7EA6 65 MB\uFF09\uFF0C${where}\u3002`,
        "off",
        installBtn
      ));
    }
    if (status.platform === "darwin" && installed) {
      const perm = status.permissions;
      body.appendChild(el("div", { class: "cu-h" }, "\u7CFB\u7EDF\u6743\u9650"));
      const grant = el("button", { class: "cu-btn primary", type: "button" }, "\u53BB\u6388\u6743");
      grant.addEventListener("click", () => {
        grant.disabled = true;
        grant.textContent = "\u7B49\u4F60\u786E\u8BA4\u2026";
        void api("/permissions/grant", {}).then(refresh).catch(() => refresh());
      });
      const recheck = el("button", { class: "cu-btn", type: "button" }, "\u91CD\u65B0\u68C0\u67E5");
      recheck.addEventListener("click", () => {
        recheck.disabled = true;
        recheck.textContent = "\u68C0\u67E5\u4E2D\u2026";
        void api("/permissions/check", {}).then(refresh).catch(() => refresh());
      });
      const mark = (ok) => ok ? "\u5DF2\u6388\u6743" : "\u672A\u6388\u6743";
      body.appendChild(line(
        perm.ok ? "\u6743\u9650\u5DF2\u5C31\u7EEA" : "\u9700\u8981\u6388\u6743",
        `\u8F85\u52A9\u529F\u80FD ${mark(perm.accessibility)}\u3000\u5C4F\u5E55\u5F55\u5236 ${mark(perm.screenRecording)}` + (perm.ok ? "" : "\u3000\uFF08\u5F39\u7A97\u53EA\u80FD\u4F60\u81EA\u5DF1\u70B9\uFF0C\u7A0B\u5E8F\u4EE3\u52B3\u4E0D\u4E86\uFF09"),
        perm.ok ? "on" : "warn",
        ...perm.ok ? [recheck] : [grant, recheck]
      ));
    }
    if (installed) {
      body.appendChild(el("div", { class: "cu-h" }, "\u8FDE\u63A5"));
      const toggle = el("button", { class: "cu-btn", type: "button" }, status.connected ? "\u65AD\u5F00" : "\u8FDE\u63A5");
      toggle.addEventListener("click", () => {
        toggle.disabled = true;
        void api(status.connected ? "/disconnect" : "/connect", {}).then(refresh);
      });
      body.appendChild(line(
        status.connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5",
        status.connected ? `\u5DE5\u5177\u5DF2\u6CE8\u518C\u4E3A ${status.toolPrefix}*\uFF0C\u53EF\u4EE5\u76F4\u63A5\u8BA9 agent \u64CD\u4F5C\u7535\u8111\u4E86` : status.error || "\u8FDE\u63A5\u540E Cua Driver \u7684\u5DE5\u5177\u4F1A\u6CE8\u518C\u7ED9 agent",
        status.connected ? "on" : "off",
        toggle
      ));
      const mode = el("select", { class: "cu-select" });
      for (const [value, label] of [
        ["standard", "standard\u3000\u4E0D\u5F39\u786E\u8BA4\uFF08\u5B98\u65B9\u9ED8\u8BA4\uFF09"],
        ["bounded", "bounded\u3000\u4EC5\u9650\u6E05\u5355\u5185\uFF08\u9700\u81EA\u5907 capability manifest\uFF09"],
        ["unrestricted", "unrestricted\u3000\u5B8C\u5168\u653E\u884C"]
      ]) {
        mode.append(el("option", { value }, label));
      }
      mode.value = status.permissionMode;
      mode.addEventListener("change", () => {
        void api("/mode", { mode: mode.value }).then(refresh);
      });
      body.appendChild(line("\u6743\u9650\u6A21\u5F0F", "\u4EE5 CUA_DRIVER_PERMISSION_MODE \u4F20\u7ED9 cua-driver", "on", mode));
      const block = el("input", { type: "checkbox" });
      block.checked = status.blockImageResults;
      block.addEventListener("change", () => {
        void api("/block-images", { enabled: block.checked }).then(refresh);
      });
      body.appendChild(line(
        "\u4E0D\u8BA9\u622A\u56FE\u8FDB\u5165\u5BF9\u8BDD",
        status.blockImageResults ? "\u5F53\u524D\u6309\u300C\u6A21\u578B\u53EA\u6536\u6587\u672C\u300D\u5904\u7406\uFF1A\u622A\u56FE\u4E0D\u4F1A\u56DE\u5230\u5BF9\u8BDD\uFF0Cget_desktop_state \u4E5F\u4E0D\u66B4\u9732\u3002\u6362\u6210\u80FD\u770B\u56FE\u7684\u6A21\u578B\uFF08\u5982 deepseek-v4-flash-vision-exp\uFF09\u540E\u5173\u6389\u8FD9\u9879\u3002" : "\u5F53\u524D\u6309\u300C\u6A21\u578B\u80FD\u770B\u56FE\u300D\u5904\u7406\uFF1A\u622A\u56FE\u4F1A\u56DE\u5230\u5BF9\u8BDD\u3002\u82E5\u6A21\u578B\u5176\u5B9E\u4E0D\u6536\u56FE\uFF0C\u4E00\u6B21\u8C03\u7528\u5C31\u4F1A\u8BA9\u6574\u6BB5\u4F1A\u8BDD\u62A5\u9519\u5E76\u4E14\u6551\u4E0D\u56DE\u6765\u3002",
        status.blockImageResults ? "on" : "warn",
        block
      ));
    }
    if (status.installLog !== "") {
      body.appendChild(el("div", { class: "cu-log" }, status.installLog));
    }
  };
  const refresh = () => {
    void api("/status").then(render).catch(() => {
      body.replaceChildren(el("div", { class: "cu-note" }, "\u8BFB\u4E0D\u5230\u63D2\u4EF6\u72B6\u6001\uFF0C\u53EF\u80FD\u662F\u5BBF\u4E3B\u4FA7\u6CA1\u6709\u52A0\u8F7D\u6210\u529F\u3002"));
    });
  };
  refresh();
  void api("/permissions/check", {}).then(refresh).catch(() => void 0);
  timer = setInterval(refresh, 2500);
}
function apply(ctx) {
  ensureVerticalFooter();
  registerPluginSettings("dsh-plugin-computer-use", openPanel);
  ctx.inject?.(["slots"], (scoped) => {
    scoped.slots.inject("sidebar.footer.action", () => scoped.slots.register({
      name: "sidebar.footer.action",
      id: "computer-use-entry",
      order: 130,
      label: () => "\u7535\u8111\u64CD\u4F5C"
    }, function ComputerUseEntry(props) {
      return entryRow("\u7535\u8111\u64CD\u4F5C", ICON_DESKTOP, props.wide !== false, openPanel);
    }));
  });
}

		return module.exports;
	}
});
