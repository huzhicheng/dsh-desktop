window.__ModuleLoader__.load({
	id: "dsh-plugin-remote-control",
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

// src/client/index.ts
var ICON_REMOTE = "M4 5.5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM7 18.5h4M9 14.5v4M17.5 9.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 16 20v-9a1.5 1.5 0 0 1 1.5-1.5zM19 18.8h.01";
function desktopBridge() {
  return globalThis.dshDesktop;
}
function apply(ctx) {
  ensureVerticalFooter();
  ctx.inject?.(["slots"], (scoped) => {
    scoped.slots.inject("sidebar.footer.action", () => scoped.slots.register({
      name: "sidebar.footer.action",
      id: "remote-control-entry",
      order: 120,
      label: () => "\u8FDC\u7A0B\u63A7\u5236"
    }, function RemoteEntry(props) {
      const desktop = desktopBridge();
      if (desktop?.openRemoteControl === void 0) return null;
      return entryRow("\u8FDC\u7A0B\u63A7\u5236", ICON_REMOTE, props.wide !== false, () => {
        desktop.openRemoteControl?.();
      });
    }));
  });
}

		return module.exports;
	}
});
