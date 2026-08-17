window.__ModuleLoader__.load({
	id: "dsh-plugin-manager",
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

// src/manager.ts
var API = "/_dsh-skin-studio/api";
var CSS = `
.pm-mask { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,0.32); backdrop-filter: blur(2px); }
.pm-dialog { width: min(760px, calc(100vw - 64px)); max-height: min(78vh, 760px);
  display: flex; flex-direction: column; border-radius: 14px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111);
  border: 1px solid var(--dsw-alias-border-l2, #8883); box-shadow: 0 24px 70px rgba(0,0,0,0.3);
  font-size: 13px; }
.pm-head { display: flex; align-items: center; gap: 10px; padding: 15px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #8882); }
.pm-title { font-size: 15px; font-weight: 650; }
.pm-sub { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; }
.pm-close { margin-left: auto; }
.pm-body { padding: 16px 18px 20px; overflow-y: auto; }
.pm-h { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-tertiary, #888); margin: 0 0 9px; }
.pm-h:not(:first-child) { margin-top: 22px; }
.pm-card { display: flex; gap: 12px; align-items: flex-start; padding: 11px 13px; margin-bottom: 7px;
  border: 1px solid var(--dsw-alias-border-l2, #8883); border-radius: 11px;
  background: var(--dsw-alias-bg-layer-2, transparent); }
.pm-card .pm-main { flex: 1; min-width: 0; }
.pm-name { font-weight: 640; word-break: break-all; }
.pm-meta { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; margin-top: 3px; word-break: break-all; }
.pm-badge { display: inline-block; font-size: 10.5px; font-weight: 600; padding: 1px 7px; margin-left: 6px;
  border-radius: 999px; border: 1px solid currentColor; opacity: 0.85; vertical-align: 1px; }
.pm-badge.ok { color: var(--dsw-alias-brand-primary, #c99); }
.pm-badge.warn { color: var(--dsw-alias-state-warn-primary, #b80); }
.pm-badge.local { color: var(--dsw-alias-state-success-primary, #6a4); }
.pm-btn { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
.pm-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary, #c99); color: var(--dsw-alias-brand-primary, #c99); }
.pm-btn:disabled { opacity: 0.45; cursor: default; }
.pm-btn.primary { background: var(--dsw-alias-brand-primary, #c99); border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 600; }
.pm-row { display: flex; gap: 8px; align-items: center; }
.pm-input { flex: 1; font: inherit; font-size: 13px; padding: 8px 11px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l3, #8884); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
.pm-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary, #c99); }
.pm-note { font-size: 12px; line-height: 1.6; padding: 9px 12px; border-radius: 8px; margin-bottom: 12px;
  border: 1px solid var(--dsw-alias-state-warn-primary, #b80); color: inherit; opacity: 0.92; }
.pm-empty { text-align: center; padding: 16px; font-size: 12px; border-radius: 11px;
  border: 1px dashed var(--dsw-alias-border-l3, #8884); color: var(--dsw-alias-label-tertiary, #888); }
.pm-out { margin-top: 11px; padding: 10px 12px; border-radius: 9px; font-size: 11.5px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-all; max-height: 190px; overflow: auto;
  background: var(--dsw-alias-markdown-code-block, #0002); font-family: ui-monospace, Menlo, monospace; }
.pm-hint { font-size: 11.5px; color: var(--dsw-alias-label-caption, #999); line-height: 1.75; margin-top: 12px; }
.pm-tabs { display: flex; gap: 4px; padding: 0 18px; border-bottom: 1px solid var(--dsw-alias-border-l1, #8882); }
.pm-tab { font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 12px; cursor: pointer;
  border: none; background: transparent; color: var(--dsw-alias-label-tertiary, #888);
  border-bottom: 2px solid transparent; margin-bottom: -1px; }
.pm-tab[data-on="1"] { color: var(--dsw-alias-brand-primary, #c99); border-bottom-color: var(--dsw-alias-brand-primary, #c99); }
.pm-search { width: 100%; font: inherit; font-size: 12.5px; padding: 7px 11px; margin-bottom: 10px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #8883);
  background: var(--dsw-alias-bg-layer-2, transparent); color: inherit; }
.pm-search:focus { outline: none; border-color: var(--dsw-alias-brand-primary, #c99); }
.pm-rt { display: flex; align-items: center; gap: 9px; padding: 6px 10px; border-radius: 7px;
  font-size: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #8881); }
.pm-rt:hover { background: var(--dsw-alias-interactive-bg-hover, #8881); }
.pm-rt .pm-mod { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }
.pm-rt .pm-id { color: var(--dsw-alias-label-caption, #999); font-size: 11px;
  max-width: 33%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.pm-count { color: var(--dsw-alias-label-caption, #999); font-size: 11.5px; margin-bottom: 9px; }
.pm-banner { display: flex; align-items: center; gap: 12px; padding: 10px 13px; border-radius: 9px;
  margin-bottom: 14px; font-size: 12.5px;
  border: 1px solid var(--dsw-alias-brand-primary, #c99); }
`;
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}
async function api(path, body) {
  const response = await fetch(API + path, body === void 0 ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return await response.json();
}
function openPluginManager(settings = {}) {
  if (document.querySelector(".pm-mask") !== null) return;
  const mask = el("div", { class: "pm-mask" });
  const dialog = el("div", { class: "pm-dialog" });
  mask.appendChild(el("style", {}, CSS));
  mask.appendChild(dialog);
  const close = () => {
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
  const closeBtn = el("button", { class: "pm-btn pm-close", type: "button" }, "\u5173\u95ED");
  closeBtn.addEventListener("click", close);
  dialog.appendChild(el(
    "div",
    { class: "pm-head" },
    el(
      "div",
      {},
      el("div", { class: "pm-title" }, "\u63D2\u4EF6\u7BA1\u7406"),
      el("div", { class: "pm-sub" }, "\u7BA1\u7406\u5F53\u524D web profile \u7684\u63D2\u4EF6\u7EC4\u88C5")
    ),
    closeBtn
  ));
  let tab = "installed";
  let snapshot;
  let filter = "";
  let busy = false;
  const tabs = el("div", { class: "pm-tabs" });
  dialog.appendChild(tabs);
  const body = el("div", { class: "pm-body" });
  dialog.appendChild(body);
  const banner = el("div", { class: "pm-banner" });
  banner.style.display = "none";
  const output = el("div", { class: "pm-out" });
  output.style.display = "none";
  const setOutput = (text) => {
    output.style.display = "block";
    output.textContent = text;
    output.scrollTop = output.scrollHeight;
  };
  const showBanner = () => {
    banner.textContent = "\u63D2\u4EF6\u6539\u52A8\u5DF2\u5199\u5165\u3002\u91CD\u542F\u5E94\u7528\uFF08\u6216\u91CD\u65B0\u8FD0\u884C dsh web\uFF09\u540E\u751F\u6548\u3002";
    banner.style.display = "flex";
  };
  const renderTabs = () => {
    const data = snapshot;
    const items = [
      ["installed", `\u5DF2\u5B89\u88C5\uFF08${String(data === void 0 ? 0 : data.installed.length + data.builtin.length)}\uFF09`],
      ["runtime", `\u8FD0\u884C\u4E2D\uFF08${String(data?.runtime.length ?? 0)}\uFF09`],
      ["install", "\u5B89\u88C5\u65B0\u63D2\u4EF6"]
    ];
    tabs.replaceChildren();
    for (const [id, label] of items) {
      const button = el("button", { class: "pm-tab", type: "button", "data-on": id === tab ? "1" : "0" }, label);
      button.addEventListener("click", () => {
        tab = id;
        filter = "";
        render();
      });
      tabs.appendChild(button);
    }
  };
  const renderInstalled = (data) => {
    body.appendChild(banner);
    body.appendChild(el("div", { class: "pm-h" }, `\u9ED8\u8BA4\u7EC4\u5408\u5305\uFF08${String(data.builtin.length)}\uFF09`));
    for (const name of data.builtin) {
      body.appendChild(el("div", { class: "pm-card" }, el(
        "div",
        { class: "pm-main" },
        el("div", { class: "pm-name" }, name, el("span", { class: "pm-badge ok" }, "\u5185\u7F6E")),
        el("div", { class: "pm-meta" }, "\u968F Harness \u4E00\u540C\u5206\u53D1\uFF0C\u8DDF\u968F\u7248\u672C\u5347\u7EA7\uFF0C\u4E0D\u53EF\u5378\u8F7D")
      )));
    }
    body.appendChild(el("div", { class: "pm-h" }, `\u5916\u90E8\u63D2\u4EF6\uFF08${String(data.installed.length)}\uFF09`));
    if (data.installed.length === 0) {
      body.appendChild(el("div", { class: "pm-empty" }, "\u8FD8\u6CA1\u6709\u5B89\u88C5\u5916\u90E8\u63D2\u4EF6"));
    }
    for (const plugin of data.installed) {
      const name = el("div", { class: "pm-name" }, plugin.name);
      if (plugin.isLocal) name.appendChild(el("span", { class: "pm-badge local" }, "\u672C\u5730"));
      name.appendChild(plugin.active ? el("span", { class: "pm-badge ok" }, "\u5DF2\u751F\u6548") : el("span", { class: "pm-badge warn" }, plugin.isBundle ? "\u5F85\u91CD\u542F" : "\u975E\u7EC4\u5408\u5305"));
      const actions = [];
      const openSettings = settings[plugin.name];
      if (openSettings !== void 0) {
        const button = el("button", { class: "pm-btn primary", type: "button" }, "\u8BBE\u7F6E");
        button.addEventListener("click", () => {
          close();
          openSettings();
        });
        actions.push(button);
      }
      const remove = el("button", { class: "pm-btn", type: "button" }, "\u5378\u8F7D");
      remove.addEventListener("click", () => {
        void run("/plugins/remove", { name: plugin.name }, `\u6B63\u5728\u5378\u8F7D ${plugin.name} \u2026`);
      });
      actions.push(remove);
      body.appendChild(el(
        "div",
        { class: "pm-card" },
        el(
          "div",
          { class: "pm-main" },
          name,
          el("div", { class: "pm-meta" }, plugin.isBundle ? plugin.description ?? "\uFF08\u8BE5\u5305\u672A\u63D0\u4F9B\u63CF\u8FF0\uFF09" : "\u8BE5\u5305\u672A\u58F0\u660E dsh.bundle\uFF0C\u4E0D\u4F1A\u8D21\u732E\u914D\u7F6E\u5C42\uFF0C\u53EA\u4F5C\u4E3A\u666E\u901A\u4F9D\u8D56\u5B58\u5728"),
          el("div", { class: "pm-meta" }, `\u6765\u6E90 ${plugin.spec}${plugin.version === void 0 ? "" : ` \xB7 \u7248\u672C ${plugin.version}`}`)
        ),
        el("div", { class: "pm-row" }, ...actions)
      ));
    }
    body.appendChild(output);
  };
  const renderRuntime = (data) => {
    const search = el("input", {
      class: "pm-search",
      type: "text",
      spellcheck: "false",
      placeholder: "\u641C\u7D22\u5305\u540D\u6216\u6761\u76EE id"
    });
    search.value = filter;
    const list = el("div", {});
    const count = el("div", { class: "pm-count" });
    const paint = () => {
      const keyword = filter.trim().toLowerCase();
      const rows = data.runtime.filter((entry) => keyword === "" || entry.module.toLowerCase().includes(keyword) || entry.id.toLowerCase().includes(keyword));
      const active = data.runtime.filter((entry) => entry.phase === "active").length;
      count.textContent = `\u5171 ${String(data.runtime.length)} \u4E2A\u6761\u76EE\uFF0C${String(active)} \u4E2A\u8FD0\u884C\u4E2D` + (keyword === "" ? "" : `\uFF1B\u5339\u914D ${String(rows.length)} \u4E2A`);
      list.replaceChildren();
      if (rows.length === 0) {
        list.appendChild(el("div", { class: "pm-empty" }, "\u6CA1\u6709\u5339\u914D\u7684\u6761\u76EE"));
        return;
      }
      for (const entry of rows) {
        const dot = el("span", { class: "pm-dot" });
        dot.style.background = entry.phase === "active" ? "var(--dsw-alias-state-success-primary, #6a4)" : entry.phase === "failed" ? "var(--dsw-alias-state-error-primary, #d55)" : "var(--dsw-alias-label-caption, #999)";
        dot.title = entry.phase ?? "\u672A\u6302\u8F7D";
        list.appendChild(el(
          "div",
          { class: "pm-rt" },
          dot,
          el("span", { class: "pm-mod" }, entry.module),
          el("span", { class: "pm-id" }, entry.id),
          el(
            "span",
            { class: "pm-badge " + (entry.enabled ? "ok" : "warn") },
            entry.enabled ? entry.phase ?? "\u672A\u6302\u8F7D" : "\u5DF2\u505C\u7528"
          )
        ));
      }
    };
    search.addEventListener("input", () => {
      filter = search.value;
      paint();
    });
    body.appendChild(el("div", { class: "pm-h" }, "Harness \u5F53\u524D\u6302\u8F7D\u7684\u5168\u90E8\u63D2\u4EF6\u6761\u76EE"));
    body.appendChild(search);
    body.appendChild(count);
    body.appendChild(list);
    body.appendChild(el(
      "div",
      { class: "pm-hint" },
      "\u8FD9\u4EFD\u6E05\u5355\u76F4\u63A5\u8BFB\u81EA Loader\uFF0C\u662F\u5F53\u4E0B\u7684\u8FD0\u884C\u72B6\u6001\uFF1B\u5B83\u7531\u914D\u7F6E\u7EC4\u88C5\u51B3\u5B9A\uFF0C\u4E0D\u80FD\u5728\u8FD9\u91CC\u589E\u5220\u3002"
    ));
    paint();
    setTimeout(() => {
      search.focus();
    }, 0);
  };
  const renderInstall = (data) => {
    body.appendChild(banner);
    body.appendChild(el(
      "div",
      { class: "pm-note" },
      "\u63D2\u4EF6\u662F\u7B2C\u4E09\u65B9\u4EE3\u7801\uFF0C\u5B89\u88C5\u540E\u4E0E Harness \u540C\u6743\u9650\u8FD0\u884C\uFF0C\u5E76\u53EF\u80FD\u6267\u884C\u5B89\u88C5\u811A\u672C\u3002\u8BF7\u53EA\u5B89\u88C5\u4F60\u4FE1\u4EFB\u6765\u6E90\u7684\u63D2\u4EF6\u3002"
    ));
    const input = el("input", {
      class: "pm-input",
      type: "text",
      spellcheck: "false",
      placeholder: "npm \u5305\u540D\uFF0C\u6216 github:\u7528\u6237\u540D/\u4ED3\u5E93\u540D\uFF0C\u6216\u672C\u5730\u8DEF\u5F84"
    });
    const install = el("button", { class: "pm-btn primary", type: "button" }, "\u5B89\u88C5");
    const doInstall = () => {
      const spec = input.value.trim();
      if (spec !== "") void run("/plugins/install", { spec }, `\u6B63\u5728\u5B89\u88C5 ${spec} \u2026`);
    };
    install.addEventListener("click", doInstall);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") doInstall();
    });
    const row = el("div", { class: "pm-row" }, input);
    if (data.canPickDirectory === true) {
      const browse = el("button", { class: "pm-btn", type: "button" }, "\u9009\u62E9\u76EE\u5F55\u2026");
      browse.addEventListener("click", () => {
        if (busy) return;
        browse.disabled = true;
        void (async () => {
          try {
            const result = await api("/plugins/pick-directory", {});
            if (result.ok && result.path !== void 0) {
              input.value = result.path;
              input.focus();
            } else if (!result.ok) {
              setOutput(result.output ?? "\u76EE\u5F55\u9009\u62E9\u5931\u8D25");
            }
          } catch (error) {
            setOutput(`\u76EE\u5F55\u9009\u62E9\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
          } finally {
            browse.disabled = false;
          }
        })();
      });
      row.appendChild(browse);
    }
    row.appendChild(install);
    body.appendChild(row);
    body.appendChild(output);
    body.appendChild(el(
      "div",
      { class: "pm-hint" },
      `\u63D2\u4EF6\u5B89\u88C5\u5728 ${data.profileDir}\uFF0C\u4E0E Harness \u81EA\u8EAB\u7684\u7248\u672C\u5347\u7EA7\u4E92\u4E0D\u5F71\u54CD\u3002`,
      el("br", {}),
      "\u627E\u63D2\u4EF6\uFF1AGitHub \u4E0A\u6309 dsh-plugin \u8BDD\u9898\u641C\u7D22\u3002"
    ));
    setTimeout(() => {
      input.focus();
    }, 0);
  };
  const render = () => {
    renderTabs();
    body.replaceChildren();
    const data = snapshot;
    if (data === void 0) {
      body.appendChild(el("div", { class: "pm-empty" }, "\u6B63\u5728\u8BFB\u53D6\u2026"));
      return;
    }
    if (tab === "installed") renderInstalled(data);
    else if (tab === "runtime") renderRuntime(data);
    else renderInstall(data);
  };
  const refresh = async () => {
    try {
      snapshot = await api("/plugins");
    } catch (error) {
      body.replaceChildren(el(
        "div",
        { class: "pm-empty" },
        `\u8BFB\u53D6\u63D2\u4EF6\u5217\u8868\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`
      ));
      return;
    }
    render();
  };
  const run = async (path, payload, title) => {
    if (busy) return;
    busy = true;
    setOutput(title);
    try {
      const result = await api(path, payload);
      setOutput(title + "\n" + result.output + "\n" + (result.ok ? "\u5B8C\u6210\u3002" : "\u5931\u8D25\u3002"));
      if (result.ok) showBanner();
    } catch (error) {
      setOutput(title + "\n\u8BF7\u6C42\u5931\u8D25\uFF1A" + (error instanceof Error ? error.message : String(error)));
    } finally {
      busy = false;
      await refresh();
    }
  };
  document.body.appendChild(mask);
  render();
  void refresh();
}

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
function pluginSettingsRegistry() {
  return globalThis.__dshPluginSettings__ ?? {};
}

// src/client/index.ts
var ICON_PUZZLE = "M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.6 2.6 0 0 1 0 5.2H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.6 2.6 0 0 1 5.2 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z";
function apply(ctx) {
  ensureVerticalFooter();
  ctx.inject?.(["slots"], (scoped) => {
    scoped.slots.inject("sidebar.footer.action", () => scoped.slots.register({
      name: "sidebar.footer.action",
      id: "plugin-manager-entry",
      order: 100,
      label: () => "\u63D2\u4EF6"
    }, function PluginEntry(props) {
      return entryRow("\u63D2\u4EF6", ICON_PUZZLE, props.wide !== false, () => {
        openPluginManager(pluginSettingsRegistry());
      });
    }));
  });
}

		return module.exports;
	}
});
