window.__ModuleLoader__.load({
	id: "dsh-plugin-skin-studio",
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
var import_react = require("react");

// src/config.ts
var DEFAULT_CONFIG = {
  enabled: true,
  accent: "#d3aa61",
  bgDark: "#171817",
  bgLight: "#f6f5f1",
  image: "",
  videoId: "",
  videoName: "",
  imageOpacity: 0.5,
  imageBlur: 0,
  transparency: 0.8,
  wash: 0.58
};
var PRESETS = [
  { id: "amber", name: "\u6696\u7802", patch: { accent: "#d3aa61", bgDark: "#171817", bgLight: "#f6f5f1" } },
  { id: "jade", name: "\u9752\u7AF9", patch: { accent: "#6fae8f", bgDark: "#141816", bgLight: "#f2f5f3" } },
  { id: "ink", name: "\u58A8\u84DD", patch: { accent: "#7aa2d6", bgDark: "#141619", bgLight: "#f1f3f6" } },
  { id: "rose", name: "\u7EDB\u6885", patch: { accent: "#c98089", bgDark: "#191516", bgLight: "#f7f2f3" } },
  { id: "slate", name: "\u7D20\u77F3", patch: { accent: "#9aa0a6", bgDark: "#161718", bgLight: "#f4f4f5" } }
];
var BACKGROUND_LEVELS = [
  { id: "soft", name: "\u6DE1\u96C5", patch: { imageOpacity: 0.4, wash: 0.62, transparency: 0.5 } },
  { id: "medium", name: "\u9002\u4E2D", patch: { imageOpacity: 0.68, wash: 0.4, transparency: 0.75 } },
  { id: "clear", name: "\u6E05\u6670", patch: { imageOpacity: 1, wash: 0.12, transparency: 1 } }
];
function normalizeConfig(raw) {
  const input = typeof raw === "object" && raw !== null ? raw : {};
  const clamp = (value, min, max, fallback) => {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
  };
  const color = (value, fallback) => typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : fallback;
  return {
    enabled: input.enabled !== false,
    accent: color(input.accent, DEFAULT_CONFIG.accent),
    bgDark: color(input.bgDark, DEFAULT_CONFIG.bgDark),
    bgLight: color(input.bgLight, DEFAULT_CONFIG.bgLight),
    // 背景图只接受 data URI：外链会把用户的界面暴露给第三方站点
    image: typeof input.image === "string" && input.image.startsWith("data:image/") ? input.image : "",
    // id 由本插件生成，限定字符集，免得被拿去当 IndexedDB 的任意键用
    videoId: typeof input.videoId === "string" && /^[a-z0-9-]{1,64}$/i.test(input.videoId) ? input.videoId : "",
    videoName: typeof input.videoName === "string" ? input.videoName.slice(0, 120) : "",
    imageOpacity: clamp(input.imageOpacity, 0, 1, DEFAULT_CONFIG.imageOpacity),
    imageBlur: clamp(input.imageBlur, 0, 40, DEFAULT_CONFIG.imageBlur),
    transparency: clamp(input.transparency, 0, 1, DEFAULT_CONFIG.transparency),
    wash: clamp(input.wash, 0, 1, DEFAULT_CONFIG.wash)
  };
}

// src/video-store.ts
var DB_NAME = "dsh-skin-studio";
var DB_VERSION = 1;
var STORE = "background";
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("\u65E0\u6CD5\u6253\u5F00\u672C\u5730\u6570\u636E\u5E93"));
    };
  });
}
async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("\u672C\u5730\u6570\u636E\u5E93\u8BFB\u5199\u5931\u8D25"));
      };
    });
  } finally {
    db.close();
  }
}
async function putVideo(id, blob) {
  await withStore("readwrite", (store) => store.put(blob, id));
}
async function getVideo(id) {
  const value = await withStore("readonly", (store) => store.get(id));
  return value instanceof Blob ? value : void 0;
}
async function pruneVideos(keepId) {
  const keys = await withStore("readonly", (store) => store.getAllKeys());
  for (const key of keys) {
    if (String(key) === keepId) continue;
    await withStore("readwrite", (store) => store.delete(key));
  }
}

// src/runtime.ts
var STYLE_ID = "skin-studio-css";
var ART_ID = "skin-studio-art";
var VIDEO_ID = "skin-studio-video";
var DARK_ATTR = "data-ds-dark-theme";
function ensureStyle(css) {
  let style = document.getElementById(STYLE_ID);
  if (style === null) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
function ensureArtLayer() {
  if (document.getElementById(ART_ID) !== null) return;
  const art = document.createElement("div");
  art.id = ART_ID;
  for (const className of ["skin-backdrop", "skin-canvas"]) {
    const layer = document.createElement("div");
    layer.className = className;
    art.appendChild(layer);
  }
  const video = document.createElement("video");
  video.id = VIDEO_ID;
  video.className = "skin-video";
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("disableRemotePlayback", "");
  art.appendChild(video);
  const wash = document.createElement("div");
  wash.className = "skin-wash";
  art.appendChild(wash);
  document.body.appendChild(art);
}
function isDark() {
  return document.body.hasAttribute(DARK_ATTR);
}
function washColor(config, dark) {
  const hex = (dark ? config.bgDark : config.bgLight).replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${config.wash.toFixed(3)})`;
}
function createSkinRuntime(css) {
  let current;
  let observer;
  let objectUrl;
  let loadedVideoId = "";
  const releaseUrl = () => {
    if (objectUrl !== void 0) URL.revokeObjectURL(objectUrl);
    objectUrl = void 0;
  };
  const videoElement = () => document.getElementById(VIDEO_ID);
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const syncVideo = (config) => {
    const video = videoElement();
    if (video === null) return;
    if (config.videoId === "") {
      loadedVideoId = "";
      video.removeAttribute("src");
      video.load();
      releaseUrl();
      return;
    }
    if (config.videoId === loadedVideoId) return;
    loadedVideoId = config.videoId;
    void getVideo(config.videoId).then((blob) => {
      if (blob === void 0 || loadedVideoId !== config.videoId) return;
      releaseUrl();
      objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
      if (reduceMotion()) return;
      void video.play().catch(() => {
      });
    }).catch((error) => {
      console.warn("skin-studio: \u80CC\u666F\u89C6\u9891\u52A0\u8F7D\u5931\u8D25", error);
    });
  };
  const handleVisibility = () => {
    const video = videoElement();
    if (video === null || video.getAttribute("src") === null) return;
    if (document.hidden) video.pause();
    else if (!reduceMotion()) void video.play().catch(() => {
    });
  };
  const paint = () => {
    if (current === void 0) return;
    const root = document.documentElement;
    const dark = isDark();
    root.dataset.skinMode = dark ? "dark" : "light";
    const style = root.style;
    style.setProperty("--skin-accent", current.accent);
    style.setProperty("--skin-bg", dark ? current.bgDark : current.bgLight);
    style.setProperty("--skin-image", current.image === "" ? "none" : `url("${current.image}")`);
    style.setProperty("--skin-image-opacity", String(current.imageOpacity));
    style.setProperty("--skin-image-blur", `${String(current.imageBlur)}px`);
    style.setProperty("--skin-transparency", String(current.transparency));
    style.setProperty("--skin-wash", washColor(current, dark));
    style.setProperty("--skin-backdrop-opacity", current.image === "" ? "0" : "0.18");
    root.dataset.skinBg = current.videoId !== "" ? "video" : current.image === "" ? "none" : "image";
    syncVideo(current);
  };
  return {
    apply(config) {
      current = config;
      if (!config.enabled) {
        this.dispose();
        current = config;
        return;
      }
      ensureStyle(css);
      ensureArtLayer();
      document.documentElement.classList.add("skin-studio");
      paint();
      observer ??= new MutationObserver(paint);
      observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTR] });
      document.addEventListener("visibilitychange", handleVisibility);
    },
    dispose() {
      observer?.disconnect();
      observer = void 0;
      current = void 0;
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseUrl();
      loadedVideoId = "";
      document.getElementById(ART_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      const root = document.documentElement;
      root.classList.remove("skin-studio");
      delete root.dataset.skinMode;
      delete root.dataset.skinBg;
      for (const name of [
        "--skin-accent",
        "--skin-bg",
        "--skin-image",
        "--skin-image-opacity",
        "--skin-image-blur",
        "--skin-transparency",
        "--skin-wash",
        "--skin-backdrop-opacity"
      ]) {
        root.style.removeProperty(name);
      }
    }
  };
}
async function imageToDataUri(file, maxEdge = 1920, quality = 0.72) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("\u65E0\u6CD5\u521B\u5EFA\u753B\u5E03\u4E0A\u4E0B\u6587");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

// src/panel.ts
var MAX_VIDEO_BYTES = 200 * 1024 * 1024;
var CSS = `
.ss-panel { font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-primary, inherit); }
.ss-panel h3 { font-size: 12px; font-weight: 650; margin: 0 0 10px; color: var(--dsw-alias-label-tertiary, inherit); }
.ss-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.ss-row > label { flex: 0 0 84px; color: var(--dsw-alias-label-secondary, inherit); }
.ss-row > .ss-ctl { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
.ss-val { flex: 0 0 42px; text-align: right; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, inherit); font-size: 12px; }
.ss-panel input[type=range] { flex: 1; accent-color: var(--skin-accent, #d3aa61); min-width: 0; }
.ss-panel input[type=color] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #8883);
  border-radius: 6px; background: none; cursor: pointer; }
.ss-btn { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); background: transparent; color: inherit; }
.ss-btn:hover { border-color: var(--skin-accent, #d3aa61); color: var(--skin-accent, #d3aa61); }
.ss-btn.primary { background: var(--skin-accent, #d3aa61); border-color: transparent; color: #201a10; font-weight: 600; }
.ss-btn.primary:hover { opacity: 0.88; color: #201a10; }
.ss-presets { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
.ss-preset { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #8883); border-radius: 999px; font-size: 12px; background: transparent; color: inherit; }
.ss-preset:hover { border-color: var(--skin-accent, #d3aa61); }
.ss-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.ss-thumb { position: relative; overflow: hidden; width: 100%; height: 84px; border-radius: 9px;
  background-size: cover; background-position: center;
  border: 1px solid var(--dsw-alias-border-l2, #8883); margin-bottom: 10px; }
.ss-thumb-video { display: none; width: 100%; height: 100%; object-fit: cover; }
.ss-thumb.has-video .ss-thumb-video { display: block; }
.ss-thumb-name { display: none; position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 8px;
  font-size: 11px; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,0.55));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ss-thumb.has-video .ss-thumb-name { display: block; }
.ss-actions { display: flex; gap: 8px; align-items: center; margin-top: 16px; }
.ss-hint { color: var(--dsw-alias-label-caption, inherit); font-size: 11.5px; margin-left: auto; }
.ss-switch { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.ss-level-label { flex: 0 0 84px; color: var(--dsw-alias-label-secondary, inherit); }
`;
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}
function createSkinPanel(options) {
  let config = { ...options.initial };
  const root = el("div", { class: "ss-panel" });
  root.appendChild(el("style", {}, CSS));
  const preview = () => {
    options.onPreview(config);
  };
  const set = (key, value) => {
    config = { ...config, [key]: value };
    preview();
  };
  const enabled = el("input", { type: "checkbox", id: "ss-enabled" });
  enabled.checked = config.enabled;
  enabled.addEventListener("change", () => {
    set("enabled", enabled.checked);
  });
  root.appendChild(el(
    "div",
    { class: "ss-switch" },
    enabled,
    el("label", { for: "ss-enabled" }, "\u542F\u7528\u76AE\u80A4\uFF08\u5173\u95ED\u540E\u6062\u590D Harness \u539F\u751F\u5916\u89C2\uFF09")
  ));
  root.appendChild(el("h3", {}, "\u914D\u8272\u9884\u8BBE"));
  const presets = el("div", { class: "ss-presets" });
  for (const preset of PRESETS) {
    const dot = el("span", { class: "ss-dot" });
    dot.style.background = preset.patch.accent ?? DEFAULT_CONFIG.accent;
    const button = el("button", { class: "ss-preset", type: "button" }, dot, preset.name);
    button.addEventListener("click", () => {
      config = { ...config, ...preset.patch };
      syncInputs();
      preview();
    });
    presets.appendChild(button);
  }
  root.appendChild(presets);
  root.appendChild(el("h3", {}, "\u989C\u8272"));
  const accent = el("input", { type: "color" });
  const bgDark = el("input", { type: "color" });
  const bgLight = el("input", { type: "color" });
  accent.addEventListener("input", () => {
    set("accent", accent.value);
  });
  bgDark.addEventListener("input", () => {
    set("bgDark", bgDark.value);
  });
  bgLight.addEventListener("input", () => {
    set("bgLight", bgLight.value);
  });
  root.appendChild(el(
    "div",
    { class: "ss-row" },
    el("label", {}, "\u5F3A\u8C03\u8272"),
    el("div", { class: "ss-ctl" }, accent, el("span", { class: "ss-hint" }, "\u6309\u94AE\u3001\u94FE\u63A5\u4E0E\u9009\u4E2D\u6001"))
  ));
  root.appendChild(el(
    "div",
    { class: "ss-row" },
    el("label", {}, "\u5E95\u8272"),
    el("div", { class: "ss-ctl" }, bgDark, el("span", {}, "\u6697\u8272"), bgLight, el("span", {}, "\u6D45\u8272"))
  ));
  root.appendChild(el("h3", {}, "\u80CC\u666F"));
  const thumb = el("div", { class: "ss-thumb" });
  const thumbVideo = el("video", {});
  thumbVideo.className = "ss-thumb-video";
  thumbVideo.muted = true;
  thumbVideo.defaultMuted = true;
  thumbVideo.loop = true;
  thumbVideo.autoplay = true;
  thumbVideo.playsInline = true;
  const thumbName = el("div", { class: "ss-thumb-name" });
  thumb.append(thumbVideo, thumbName);
  root.appendChild(thumb);
  let thumbVideoId = "";
  let thumbUrl;
  const syncThumb = () => {
    const hasVideo = config.videoId !== "";
    thumb.classList.toggle("has-video", hasVideo);
    thumb.style.backgroundImage = hasVideo || config.image === "" ? "none" : `url("${config.image}")`;
    thumbName.textContent = config.videoName === "" ? "\u80CC\u666F\u89C6\u9891" : config.videoName;
    if (!hasVideo) {
      thumbVideoId = "";
      thumbVideo.removeAttribute("src");
      thumbVideo.load();
      if (thumbUrl !== void 0) {
        URL.revokeObjectURL(thumbUrl);
        thumbUrl = void 0;
      }
      return;
    }
    if (thumbVideoId === config.videoId) return;
    thumbVideoId = config.videoId;
    void getVideo(config.videoId).then((blob) => {
      if (blob === void 0 || thumbVideoId !== config.videoId) return;
      if (thumbUrl !== void 0) URL.revokeObjectURL(thumbUrl);
      thumbUrl = URL.createObjectURL(blob);
      thumbVideo.src = thumbUrl;
      void thumbVideo.play().catch(() => {
      });
    }).catch(() => {
      status.textContent = "\u9884\u89C8\u52A0\u8F7D\u5931\u8D25";
    });
  };
  const file = el("input", {
    type: "file",
    accept: "image/*,video/mp4,video/webm",
    hidden: "hidden"
  });
  const pick = el("button", { class: "ss-btn", type: "button" }, "\u9009\u62E9\u56FE\u7247\u6216\u89C6\u9891\u2026");
  const clear = el("button", { class: "ss-btn", type: "button" }, "\u6E05\u9664");
  const status = el("span", { class: "ss-hint" }, "");
  pick.addEventListener("click", () => {
    file.click();
  });
  const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const takeVideo = (chosen) => {
    if (chosen.size > MAX_VIDEO_BYTES) {
      status.textContent = `\u89C6\u9891 ${megabytes(chosen.size)}\uFF0C\u8D85\u8FC7\u4E0A\u9650 ${megabytes(MAX_VIDEO_BYTES)}`;
      return;
    }
    status.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    const id = `bg-${String(Date.now())}`;
    void putVideo(id, chosen).then(() => {
      config = { ...config, videoId: id, videoName: chosen.name, image: "" };
      syncInputs();
      preview();
      status.textContent = `\u5DF2\u4FDD\u5B58 ${megabytes(chosen.size)}`;
      void pruneVideos(id);
    }).catch((error) => {
      status.textContent = `\u4FDD\u5B58\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`;
    });
  };
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    if (chosen === void 0) return;
    file.value = "";
    if (chosen.type.startsWith("video/")) {
      takeVideo(chosen);
      return;
    }
    status.textContent = "\u5904\u7406\u4E2D\u2026";
    void imageToDataUri(chosen).then((uri) => {
      config = { ...config, image: uri, videoId: "", videoName: "" };
      syncInputs();
      preview();
      void pruneVideos("");
      status.textContent = `\u5DF2\u538B\u7F29\u81F3 ${Math.round(uri.length / 1024)} KB`;
    }).catch((error) => {
      status.textContent = `\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`;
    });
  });
  clear.addEventListener("click", () => {
    config = { ...config, image: "", videoId: "", videoName: "" };
    syncInputs();
    preview();
    void pruneVideos("");
    status.textContent = "";
  });
  root.appendChild(el(
    "div",
    { class: "ss-row" },
    el("div", { class: "ss-ctl" }, pick, clear, status, file)
  ));
  const slider = (label, key, min, max, step, format) => {
    const input = el("input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step)
    });
    const value = el("span", { class: "ss-val" });
    const update = () => {
      value.textContent = format(Number(input.value));
    };
    input.addEventListener("input", () => {
      set(key, Number(input.value));
      update();
    });
    root.appendChild(el(
      "div",
      { class: "ss-row" },
      el("label", {}, label),
      el("div", { class: "ss-ctl" }, input, value)
    ));
    input.sync = update;
    return input;
  };
  const levels = el("div", { class: "ss-presets" });
  levels.appendChild(el("span", { class: "ss-level-label" }, "\u5F3A\u5EA6"));
  for (const level of BACKGROUND_LEVELS) {
    const button = el("button", { class: "ss-preset", type: "button" }, level.name);
    button.addEventListener("click", () => {
      config = { ...config, ...level.patch };
      syncInputs();
      preview();
    });
    levels.appendChild(button);
  }
  root.appendChild(levels);
  const percent = (value) => `${String(Math.round(value * 100))}%`;
  const imageOpacity = slider("\u80CC\u666F\u6D53\u5EA6", "imageOpacity", 0, 1, 0.01, percent);
  const imageBlur = slider("\u80CC\u666F\u6A21\u7CCA", "imageBlur", 0, 40, 1, (v) => `${String(Math.round(v))}px`);
  const wash = slider("\u8499\u7248\u5F3A\u5EA6", "wash", 0, 1, 0.01, percent);
  const transparency = slider("\u754C\u9762\u900F\u660E", "transparency", 0, 1, 0.01, percent);
  const save2 = el("button", { class: "ss-btn primary", type: "button" }, "\u4FDD\u5B58");
  const reset = el("button", { class: "ss-btn", type: "button" }, "\u6062\u590D\u9ED8\u8BA4");
  const saveHint = el("span", { class: "ss-hint" }, "\u6539\u52A8\u5373\u65F6\u9884\u89C8\uFF0C\u4FDD\u5B58\u540E\u5BF9\u6240\u6709\u7A97\u53E3\u751F\u6548");
  save2.addEventListener("click", () => {
    save2.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    void Promise.resolve(options.onSave(config)).then(() => {
      save2.textContent = "\u5DF2\u4FDD\u5B58";
      setTimeout(() => {
        save2.textContent = "\u4FDD\u5B58";
      }, 1600);
    }).catch(() => {
      save2.textContent = "\u4FDD\u5B58\u5931\u8D25";
    });
  });
  reset.addEventListener("click", () => {
    config = { ...DEFAULT_CONFIG };
    syncInputs();
    preview();
  });
  root.appendChild(el("div", { class: "ss-actions" }, save2, reset, saveHint));
  function syncInputs() {
    enabled.checked = config.enabled;
    accent.value = config.accent;
    bgDark.value = config.bgDark;
    bgLight.value = config.bgLight;
    syncThumb();
    for (const [input, value] of [
      [imageOpacity, config.imageOpacity],
      [imageBlur, config.imageBlur],
      [wash, config.wash],
      [transparency, config.transparency]
    ]) {
      input.value = String(value);
      input.sync?.();
    }
  }
  syncInputs();
  return root;
}

// src/manager.ts
var API = "/_dsh-skin-studio/api";
var CSS2 = `
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
function el2(tag, attrs = {}, ...children) {
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
  const mask = el2("div", { class: "pm-mask" });
  const dialog = el2("div", { class: "pm-dialog" });
  mask.appendChild(el2("style", {}, CSS2));
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
  const closeBtn = el2("button", { class: "pm-btn pm-close", type: "button" }, "\u5173\u95ED");
  closeBtn.addEventListener("click", close);
  dialog.appendChild(el2(
    "div",
    { class: "pm-head" },
    el2(
      "div",
      {},
      el2("div", { class: "pm-title" }, "\u63D2\u4EF6\u7BA1\u7406"),
      el2("div", { class: "pm-sub" }, "\u7BA1\u7406\u5F53\u524D web profile \u7684\u63D2\u4EF6\u7EC4\u88C5")
    ),
    closeBtn
  ));
  let tab = "installed";
  let snapshot;
  let filter = "";
  let busy = false;
  const tabs = el2("div", { class: "pm-tabs" });
  dialog.appendChild(tabs);
  const body = el2("div", { class: "pm-body" });
  dialog.appendChild(body);
  const banner = el2("div", { class: "pm-banner" });
  banner.style.display = "none";
  const output = el2("div", { class: "pm-out" });
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
      const button = el2("button", { class: "pm-tab", type: "button", "data-on": id === tab ? "1" : "0" }, label);
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
    body.appendChild(el2("div", { class: "pm-h" }, `\u9ED8\u8BA4\u7EC4\u5408\u5305\uFF08${String(data.builtin.length)}\uFF09`));
    for (const name of data.builtin) {
      body.appendChild(el2("div", { class: "pm-card" }, el2(
        "div",
        { class: "pm-main" },
        el2("div", { class: "pm-name" }, name, el2("span", { class: "pm-badge ok" }, "\u5185\u7F6E")),
        el2("div", { class: "pm-meta" }, "\u968F Harness \u4E00\u540C\u5206\u53D1\uFF0C\u8DDF\u968F\u7248\u672C\u5347\u7EA7\uFF0C\u4E0D\u53EF\u5378\u8F7D")
      )));
    }
    body.appendChild(el2("div", { class: "pm-h" }, `\u5916\u90E8\u63D2\u4EF6\uFF08${String(data.installed.length)}\uFF09`));
    if (data.installed.length === 0) {
      body.appendChild(el2("div", { class: "pm-empty" }, "\u8FD8\u6CA1\u6709\u5B89\u88C5\u5916\u90E8\u63D2\u4EF6"));
    }
    for (const plugin of data.installed) {
      const name = el2("div", { class: "pm-name" }, plugin.name);
      if (plugin.isLocal) name.appendChild(el2("span", { class: "pm-badge local" }, "\u672C\u5730"));
      name.appendChild(plugin.active ? el2("span", { class: "pm-badge ok" }, "\u5DF2\u751F\u6548") : el2("span", { class: "pm-badge warn" }, plugin.isBundle ? "\u5F85\u91CD\u542F" : "\u975E\u7EC4\u5408\u5305"));
      const actions = [];
      const openSettings = settings[plugin.name];
      if (openSettings !== void 0) {
        const button = el2("button", { class: "pm-btn primary", type: "button" }, "\u8BBE\u7F6E");
        button.addEventListener("click", () => {
          close();
          openSettings();
        });
        actions.push(button);
      }
      const remove = el2("button", { class: "pm-btn", type: "button" }, "\u5378\u8F7D");
      remove.addEventListener("click", () => {
        void run("/plugins/remove", { name: plugin.name }, `\u6B63\u5728\u5378\u8F7D ${plugin.name} \u2026`);
      });
      actions.push(remove);
      body.appendChild(el2(
        "div",
        { class: "pm-card" },
        el2(
          "div",
          { class: "pm-main" },
          name,
          el2("div", { class: "pm-meta" }, plugin.isBundle ? plugin.description ?? "\uFF08\u8BE5\u5305\u672A\u63D0\u4F9B\u63CF\u8FF0\uFF09" : "\u8BE5\u5305\u672A\u58F0\u660E dsh.bundle\uFF0C\u4E0D\u4F1A\u8D21\u732E\u914D\u7F6E\u5C42\uFF0C\u53EA\u4F5C\u4E3A\u666E\u901A\u4F9D\u8D56\u5B58\u5728"),
          el2("div", { class: "pm-meta" }, `\u6765\u6E90 ${plugin.spec}${plugin.version === void 0 ? "" : ` \xB7 \u7248\u672C ${plugin.version}`}`)
        ),
        el2("div", { class: "pm-row" }, ...actions)
      ));
    }
    body.appendChild(output);
  };
  const renderRuntime = (data) => {
    const search = el2("input", {
      class: "pm-search",
      type: "text",
      spellcheck: "false",
      placeholder: "\u641C\u7D22\u5305\u540D\u6216\u6761\u76EE id"
    });
    search.value = filter;
    const list = el2("div", {});
    const count = el2("div", { class: "pm-count" });
    const paint = () => {
      const keyword = filter.trim().toLowerCase();
      const rows = data.runtime.filter((entry) => keyword === "" || entry.module.toLowerCase().includes(keyword) || entry.id.toLowerCase().includes(keyword));
      const active = data.runtime.filter((entry) => entry.phase === "active").length;
      count.textContent = `\u5171 ${String(data.runtime.length)} \u4E2A\u6761\u76EE\uFF0C${String(active)} \u4E2A\u8FD0\u884C\u4E2D` + (keyword === "" ? "" : `\uFF1B\u5339\u914D ${String(rows.length)} \u4E2A`);
      list.replaceChildren();
      if (rows.length === 0) {
        list.appendChild(el2("div", { class: "pm-empty" }, "\u6CA1\u6709\u5339\u914D\u7684\u6761\u76EE"));
        return;
      }
      for (const entry of rows) {
        const dot = el2("span", { class: "pm-dot" });
        dot.style.background = entry.phase === "active" ? "var(--dsw-alias-state-success-primary, #6a4)" : entry.phase === "failed" ? "var(--dsw-alias-state-error-primary, #d55)" : "var(--dsw-alias-label-caption, #999)";
        dot.title = entry.phase ?? "\u672A\u6302\u8F7D";
        list.appendChild(el2(
          "div",
          { class: "pm-rt" },
          dot,
          el2("span", { class: "pm-mod" }, entry.module),
          el2("span", { class: "pm-id" }, entry.id),
          el2(
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
    body.appendChild(el2("div", { class: "pm-h" }, "Harness \u5F53\u524D\u6302\u8F7D\u7684\u5168\u90E8\u63D2\u4EF6\u6761\u76EE"));
    body.appendChild(search);
    body.appendChild(count);
    body.appendChild(list);
    body.appendChild(el2(
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
    body.appendChild(el2(
      "div",
      { class: "pm-note" },
      "\u63D2\u4EF6\u662F\u7B2C\u4E09\u65B9\u4EE3\u7801\uFF0C\u5B89\u88C5\u540E\u4E0E Harness \u540C\u6743\u9650\u8FD0\u884C\uFF0C\u5E76\u53EF\u80FD\u6267\u884C\u5B89\u88C5\u811A\u672C\u3002\u8BF7\u53EA\u5B89\u88C5\u4F60\u4FE1\u4EFB\u6765\u6E90\u7684\u63D2\u4EF6\u3002"
    ));
    const input = el2("input", {
      class: "pm-input",
      type: "text",
      spellcheck: "false",
      placeholder: "npm \u5305\u540D\uFF0C\u6216 github:\u7528\u6237\u540D/\u4ED3\u5E93\u540D\uFF0C\u6216\u672C\u5730\u8DEF\u5F84"
    });
    const install = el2("button", { class: "pm-btn primary", type: "button" }, "\u5B89\u88C5");
    const doInstall = () => {
      const spec = input.value.trim();
      if (spec !== "") void run("/plugins/install", { spec }, `\u6B63\u5728\u5B89\u88C5 ${spec} \u2026`);
    };
    install.addEventListener("click", doInstall);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") doInstall();
    });
    const row = el2("div", { class: "pm-row" }, input);
    if (data.canPickDirectory === true) {
      const browse = el2("button", { class: "pm-btn", type: "button" }, "\u9009\u62E9\u76EE\u5F55\u2026");
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
    body.appendChild(el2(
      "div",
      { class: "pm-hint" },
      `\u63D2\u4EF6\u5B89\u88C5\u5728 ${data.profileDir}\uFF0C\u4E0E Harness \u81EA\u8EAB\u7684\u7248\u672C\u5347\u7EA7\u4E92\u4E0D\u5F71\u54CD\u3002`,
      el2("br", {}),
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
      body.appendChild(el2("div", { class: "pm-empty" }, "\u6B63\u5728\u8BFB\u53D6\u2026"));
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
      body.replaceChildren(el2(
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

// src/skin.css
var skin_default = `/*
 * Skin Studio \u2014\u2014 DeepSeek Harness Web UI \u76AE\u80A4\u3002
 *
 * \u7ED3\u6784\u53C2\u8003 codex-skin-studio\uFF1A\u9875\u9762\u6700\u5E95\u5C42\u653E\u4E00\u4E2A\u56FA\u5B9A\u7684\u300C\u753B\u5E03\u5C42\u300D\u627F\u8F7D\u80CC\u666F\u56FE\uFF0C
 * \u754C\u9762\u4E0A\u6240\u6709\u8868\u9762\u6539\u6210\u534A\u900F\u660E\uFF0C\u80CC\u666F\u56FE\u4FBF\u4ECE\u4E0B\u9762\u900F\u4E0A\u6765\uFF1B\u900F\u5149\u5F3A\u5EA6\u7531 wash \u8499\u7248
 * \u4E0E\u5404\u8868\u9762\u7684 alpha \u63A7\u5236\u3002
 *
 * \u6362\u80A4\u53EA\u6539\u53D8\u91CF\uFF0C\u4E0D\u78B0 dsh \u7684\u4EFB\u4F55\u7ED3\u6784\u9009\u62E9\u5668\u6216\u7C7B\u540D\uFF1A
 *   --dsw-static-*  \u662F dsh \u7684\u8272\u677F
 *   --dsw-alias-*   \u662F dsh \u7684\u8BED\u4E49\u5C42\uFF0878 \u4E2A\uFF09
 * \u56E0\u6B64 dsh \u5347\u7EA7\u6362\u4E86\u7EC4\u4EF6\u5B9E\u73B0\uFF0C\u76AE\u80A4\u4F9D\u7136\u6709\u6548\u3002
 *
 * \u6240\u6709\u53EF\u8C03\u9879\u90FD\u4EE5 --skin-* \u53D8\u91CF\u66B4\u9732\uFF0C\u7531\u63D2\u4EF6\u5728\u8FD0\u884C\u65F6\u6309\u7528\u6237\u8BBE\u7F6E\u5199\u5230 :root \u4E0A\u3002
 */

/* \u2500\u2500 \u53EF\u8C03\u53D8\u91CF\u7684\u9ED8\u8BA4\u503C\uFF08\u6697\u8272\uFF09 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u63D2\u4EF6\u4F1A\u628A dsh \u7684\u660E\u6697\u72B6\u6001\u955C\u50CF\u5230 html[data-skin-mode] \u4E0A\uFF1B\u57FA\u8272\u4E00\u7FFB\u8F6C\uFF0C
   \u4E0B\u9762\u6240\u6709 color-mix \u516C\u5F0F\u5728\u6D45\u8272\u4E0B\u540C\u6837\u6210\u7ACB\uFF0C\u4E0D\u9700\u8981\u5199\u4E24\u5957\u3002 */
:root {
  /* \u5E95\u8272\u4E0E\u5F3A\u8C03\u8272 */
  --skin-bg: #171817;
  --skin-text: #f3f2ed;
  --skin-muted: #aaa9a2;
  --skin-accent: #d3aa61;
  --skin-accent-ink: #201a10;

  /* \u80CC\u666F\u56FE\uFF1Anone \u8868\u793A\u7EAF\u8272\u5E95 */
  --skin-image: none;
  --skin-image-opacity: 0.5;
  --skin-image-blur: 0px;
  --skin-image-scale: 1;
  --skin-position-x: 50%;
  --skin-position-y: 50%;
  /* \u4E3B\u56FE\u4E0B\u9762\u518D\u57AB\u4E00\u5C42\u653E\u5927\u6A21\u7CCA\u7684\u540C\u56FE\uFF0C\u8FB9\u7F18\u4E0D\u4F1A\u9732\u51FA\u786C\u8FB9 */
  --skin-backdrop-opacity: 0.18;
  --skin-backdrop-blur: 24px;

  /*
   * \u5BBF\u4E3B\u7A97\u53E3\u628A\u7CFB\u7EDF\u63A7\u4EF6\uFF08macOS \u4EA4\u901A\u706F\uFF09\u6D6E\u5728\u9875\u9762\u5DE6\u4E0A\u89D2\u65F6\uFF0C\u8FD9\u91CC\u586B\u63A7\u4EF6\u6761\u7684\u9AD8\u5EA6\uFF0C
   * dsh \u7684\u4FA7\u680F\u636E\u6B64\u5411\u4E0B\u8BA9\u51FA\u4E00\u6BB5\uFF0Clogo \u5C31\u4E0D\u4F1A\u88AB\u6309\u94AE\u538B\u4F4F\u3002\u7EAF\u6D4F\u89C8\u5668\u4E0B\u4E3A 0\u3002
   */
  --skin-window-controls: 0px;

  /* \u5BBF\u4E3B\uFF08\u684C\u9762\u58F3\uFF09\u5728\u5DE6\u4FA7\u5360\u4E86\u4E00\u6761\u56FE\u6807\u680F\u65F6\uFF0C\u628A\u753B\u5E03\u6309\u6574\u7A97\u5750\u6807\u5916\u6269\u8FD9\u4E48\u591A\uFF0C
     \u58F3\u90A3\u6761\u680F\u5C31\u80FD\u753B\u51FA\u540C\u4E00\u5F20\u56FE\u7684\u5DE6\u4FA7\u5207\u7247\uFF0C\u4E24\u8FB9\u63A5\u6210\u4E00\u6574\u5F20\u3002\u7EAF\u6D4F\u89C8\u5668\u4E0B\u4E3A 0\u3002 */
  --skin-inset-left: 0px;

  /* \u8499\u7248\uFF1A\u76D6\u5728\u80CC\u666F\u56FE\u4E4B\u4E0A\u3001\u754C\u9762\u4E4B\u4E0B\uFF0C\u538B\u4F4E\u80CC\u666F\u56FE\u5BF9\u53EF\u8BFB\u6027\u7684\u5E72\u6270 */
  --skin-wash: rgba(23, 24, 23, 0.58);

  /* \u8868\u9762\u900F\u660E\u5EA6\uFF1A0 = \u5B8C\u5168\u4E0D\u900F\uFF08\u770B\u4E0D\u89C1\u80CC\u666F\u56FE\uFF09\uFF0C1 = \u6700\u900F\u3002
     \u5404\u8868\u9762\u6309\u300C\u627F\u8F7D\u6587\u5B57\u7684\u591A\u5C11\u300D\u5206\u914D\u53EF\u8BA9\u51FA\u7684\u5E45\u5EA6\uFF1A\u4FA7\u680F\u548C\u4E3B\u9762\u677F\u8BA9\u5F97\u591A\uFF0C
     \u8F93\u5165\u6846\u3001\u60AC\u6D6E\u5361\u8FD9\u4E9B\u8D34\u7740\u6587\u5B57\u7684\u8BA9\u5F97\u5C11\u3002\u62C9\u6EE1\u65F6\u80CC\u666F\u56FE\u80FD\u770B\u6E05\uFF0C
     \u518D\u5F80\u4E0A\u8D70\u6587\u5B57\u5C31\u538B\u4E0D\u4F4F\u56FE\u4E86\uFF0C\u6240\u4EE5\u5E45\u5EA6\u5199\u6B7B\u5728\u8FD9\u91CC\u3001\u4E0D\u518D\u5F00\u653E\u3002 */
  --skin-transparency: 0.8;

  /* \u5706\u89D2\u4E0E\u52A8\u6548 */
  --skin-radius: 13px;
  --skin-control-radius: 8px;
  --skin-duration: 160ms;
  --skin-easing: cubic-bezier(0.16, 1, 0.3, 1);
}

html[data-skin-mode="light"] {
  --skin-bg: #f6f5f1;
  --skin-text: #201f1c;
  --skin-muted: #6f6d64;
  --skin-accent: #a8763a;
  --skin-accent-ink: #fffaf0;
  --skin-wash: rgba(246, 245, 241, 0.6);
}

/* \u2500\u2500 \u753B\u5E03\u5C42 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u56FA\u5B9A\u5728\u89C6\u53E3\u3001z-index -1\uFF1Bbody \u9700\u8981 isolation \u5EFA\u7ACB\u5C42\u53E0\u4E0A\u4E0B\u6587\uFF0C
   \u5426\u5219 -1 \u4F1A\u88AB body \u81EA\u8EAB\u80CC\u666F\u76D6\u4F4F\u3002 */
html.skin-studio,
html.skin-studio body {
  background-color: var(--skin-bg) !important;
}

html.skin-studio body {
  position: relative;
  isolation: isolate;
}

#skin-studio-art {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background-color: var(--skin-bg);
}

#skin-studio-art > .skin-backdrop,
#skin-studio-art > .skin-canvas {
  position: absolute;
  pointer-events: none;
  background-image: var(--skin-image);
  background-position: var(--skin-position-x) var(--skin-position-y);
  background-repeat: no-repeat;
}

/* \u57AB\u5E95\u7684\u653E\u5927\u6A21\u7CCA\u5C42\uFF1A\u5411\u5916\u6EA2\u51FA 5% \u5E76\u8F7B\u5FAE\u653E\u5927\uFF0C\u56DB\u5468\u4E0D\u4F1A\u51FA\u73B0\u786C\u8FB9 */
#skin-studio-art > .skin-backdrop {
  inset: -5%;
  left: calc(-5% - var(--skin-inset-left));
  background-size: cover;
  opacity: var(--skin-backdrop-opacity);
  filter: blur(var(--skin-backdrop-blur));
  transform: scale(1.06);
}

#skin-studio-art > .skin-canvas {
  inset: 0;
  left: calc(-1 * var(--skin-inset-left));
  z-index: 1;
  background-size: cover;
  opacity: var(--skin-image-opacity);
  filter: blur(var(--skin-image-blur));
  transform: scale(var(--skin-image-scale));
  transition: opacity var(--skin-duration) linear;
}

/*
 * \u89C6\u9891\u5C42\uFF1A\u4F4D\u7F6E\u4E0E .skin-canvas \u5B8C\u5168\u4E00\u81F4\uFF0C\u6D53\u5EA6\u3001\u6A21\u7CCA\u3001\u7F29\u653E\u5171\u7528\u540C\u4E00\u7EC4\u53D8\u91CF\uFF0C
 * \u6240\u4EE5\u56FE\u6362\u6210\u89C6\u9891\u540E\u89C2\u611F\u662F\u8FDE\u7EED\u7684\u3002
 *
 * \u4E0D\u8BBE width/height\uFF1A\u56DB\u8FB9\u90FD\u5B9A\u4E86\u4F4D\uFF0C\u76D2\u5B50\u5C3A\u5BF8\u7531\u5B9A\u4F4D\u51B3\u5B9A\uFF0Cobject-fit: cover
 * \u8D1F\u8D23\u628A\u753B\u9762\u88C1\u5230\u94FA\u6EE1\u2014\u2014\u5199\u6B7B width:100% \u53CD\u800C\u4F1A\u7834\u574F\u8FD9\u4E2A\u5173\u7CFB\u3002
 * \u89C6\u9891\u5929\u7136\u94FA\u6EE1\uFF0C\u4E5F\u5C31\u4E0D\u9700\u8981 .skin-backdrop \u90A3\u5C42\u9632\u786C\u8FB9\u7684\u57AB\u5E95\u6A21\u7CCA\u3002
 */
#skin-studio-art > .skin-video {
  position: absolute;
  inset: 0;
  left: calc(-1 * var(--skin-inset-left));
  z-index: 1;
  display: none;
  object-fit: cover;
  opacity: var(--skin-image-opacity);
  filter: blur(var(--skin-image-blur));
  transform: scale(var(--skin-image-scale));
  transition: opacity var(--skin-duration) linear;
}

html[data-skin-bg='video'] #skin-studio-art > .skin-video { display: block; }
html[data-skin-bg='video'] #skin-studio-art > .skin-backdrop,
html[data-skin-bg='video'] #skin-studio-art > .skin-canvas { display: none; }

/* \u8499\u7248\u76D6\u5728\u56FE\u4E4B\u4E0A\uFF0C\u754C\u9762\u4E4B\u4E0B */
#skin-studio-art > .skin-wash {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: var(--skin-wash);
}

/* \u2500\u2500 \u628A dsh \u7684\u8272\u677F\u6362\u6210\u672C\u76AE\u80A4\u7684\u5F3A\u8C03\u8272 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u53D1\u9001\u6309\u94AE\u7B49\u54C1\u724C\u5143\u7D20\u53D6\u81EA deepseek-400\uFF0C\u6574\u6761\u8272\u9636\u4E00\u8D77\u6362\uFF0C\u6DF1\u6D45\u5173\u7CFB\u4E0D\u4E71\u3002 */
body,
body[data-ds-dark-theme] {
  --dsw-static-deepseek-50: color-mix(in srgb, var(--skin-accent) 18%, white);
  --dsw-static-deepseek-100: color-mix(in srgb, var(--skin-accent) 28%, white);
  --dsw-static-deepseek-200: color-mix(in srgb, var(--skin-accent) 42%, white);
  --dsw-static-deepseek-300: color-mix(in srgb, var(--skin-accent) 62%, white);
  --dsw-static-deepseek-400: var(--skin-accent);
  --dsw-static-deepseek-450: color-mix(in srgb, var(--skin-accent) 94%, black);
  --dsw-static-deepseek-500: color-mix(in srgb, var(--skin-accent) 84%, black);
  --dsw-static-deepseek-600: color-mix(in srgb, var(--skin-accent) 70%, black);
  --dsw-static-deepseek-700-delete: color-mix(in srgb, var(--skin-accent) 54%, black);
  --dsw-static-deepseek-800: color-mix(in srgb, var(--skin-accent) 26%, var(--skin-bg));
  --dsw-static-deepseek-900: color-mix(in srgb, var(--skin-accent) 16%, var(--skin-bg));
}

/* \u2500\u2500 \u8BED\u4E49\u5C42 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u8868\u9762\u5168\u90E8\u5E26 alpha\uFF0C\u80CC\u666F\u56FE\u624D\u900F\u5F97\u4E0A\u6765\uFF1B--skin-transparency \u8D8A\u5927\u8D8A\u900F\u3002
   \u9009\u62E9\u5668\u540C\u65F6\u5217\u51FA body \u4E0E body[data-ds-dark-theme]\uFF1Adsh \u81EA\u5DF1\u7684\u6697\u8272\u89C4\u5219\u7528\u7684\u662F
   \u540E\u8005\uFF08\u7279\u5F02\u6027 0,1,1\uFF09\uFF0C\u53EA\u5199 body \u4F1A\u5728\u6697\u8272\u4E0B\u88AB\u5B83\u538B\u8FC7\u3002 */
body,
body[data-ds-dark-theme] {
  --dsw-alias-bg-base: transparent;
  --dsw-alias-bg-layer-1: color-mix(in srgb, var(--skin-bg) calc(100% - var(--skin-transparency) * 55%), transparent);
  --dsw-alias-bg-layer-2: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 5%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 45%), transparent);
  --dsw-alias-bg-layer-3: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 9%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 32%), transparent);
  --dsw-alias-bg-overlay: color-mix(in srgb, var(--skin-text) 14%, var(--skin-bg));
  --dsw-alias-bg-skeleton: color-mix(in srgb, var(--skin-text) 6%, var(--skin-bg));
  --dsw-alias-bg-multi-select: color-mix(in srgb, var(--skin-accent) 16%, transparent);
  --dsw-alias-bg-module-platform: color-mix(in srgb, var(--skin-bg) calc(100% - var(--skin-transparency) * 50%), transparent);
  --dsw-alias-bg-mask-1: color-mix(in srgb, var(--skin-bg) 72%, transparent);
  --dsw-alias-bg-mask-2: color-mix(in srgb, var(--skin-bg) 58%, transparent);
  --dsw-alias-bg-mask-3: color-mix(in srgb, var(--skin-bg) 40%, transparent);
  --dsw-alias-bg-mask-drop: color-mix(in srgb, var(--skin-accent) 14%, transparent);

  /* \u7EC4\u4EF6\u7EA7\u53D8\u91CF\uFF1Adsh \u7684\u4FA7\u680F\u3001\u8F93\u5165\u6846\u3001\u6C14\u6CE1\u7B49\u4E0D\u8D70 alias \u5C42\uFF0C\u5355\u72EC\u7ED9\u5B83\u4EEC\u540C\u4E00\u5957\u5904\u7406\u3002
     \u627F\u8F7D\u6587\u5B57\u8D8A\u591A\u7684\u8868\u9762\u8D8A\u5B9E\uFF1A\u4FA7\u680F\u4E0E\u8F93\u5165\u6846\u53EA\u8BA9\u51FA\u4E00\u70B9\uFF0C\u80CC\u666F\u56FE\u624D\u4E0D\u4F1A\u76D6\u8FC7\u5185\u5BB9\u3002 */
  --dsw-specific-sidebar-fill: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 3%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 72%), transparent);
  --dsw-specific-input-major: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 6%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 22%), transparent);
  --dsw-specific-login-input: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 5%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 24%), transparent);
  --dsw-specific-selector: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 7%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 24%), transparent);
  --dsw-specific-tip: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 7%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 26%), transparent);
  --dsw-hovercard-bg: color-mix(in srgb, color-mix(in srgb, var(--skin-text) 8%, var(--skin-bg)) calc(100% - var(--skin-transparency) * 20%), transparent);
  /* \u7528\u6237\u6D88\u606F\u6C14\u6CE1\u4E0E\u4FA7\u680F\u9009\u4E2D\u9879\u8D70\u5F3A\u8C03\u8272\uFF0C\u76AE\u80A4\u7684\u4E3B\u8272\u624D\u7ACB\u5F97\u4F4F */
  --dsw-specific-bubble: color-mix(in srgb, var(--skin-accent) 14%, var(--skin-bg));
  --dsw-specific-bubble-highlight: color-mix(in srgb, var(--skin-accent) 26%, var(--skin-bg));
  --dsw-specific-sidebar-nav-item-active: color-mix(in srgb, var(--skin-accent) 16%, transparent);
  --dsw-specific-sidebar-nav-item-active-accent: color-mix(in srgb, var(--skin-accent) 24%, transparent);
  --dsw-specific-sidebar-nav-item-hover: color-mix(in srgb, var(--skin-text) 7%, transparent);

  --dsw-alias-label-primary: var(--skin-text);
  --dsw-alias-label-primary-bluish: var(--skin-text);
  --dsw-alias-label-primary-dimmed: color-mix(in srgb, var(--skin-text) 62%, transparent);
  --dsw-alias-label-primary-foreground: var(--skin-text);
  --dsw-alias-label-primary-inverted: var(--skin-accent-ink);
  --dsw-alias-label-secondary: color-mix(in srgb, var(--skin-text) 78%, var(--skin-bg));
  --dsw-alias-label-tertiary: var(--skin-muted);
  --dsw-alias-label-caption: color-mix(in srgb, var(--skin-muted) 82%, var(--skin-bg));
  --dsw-alias-label-dimmed: color-mix(in srgb, var(--skin-muted) 64%, var(--skin-bg));

  --dsw-alias-brand-primary: var(--skin-accent);
  --dsw-alias-brand-primary-invert: var(--skin-accent-ink);
  --dsw-alias-brand-text: var(--skin-accent);
  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--skin-accent);

  --dsw-alias-border-l1: color-mix(in srgb, var(--skin-text) 7%, transparent);
  --dsw-alias-border-l2: color-mix(in srgb, var(--skin-text) 12%, transparent);
  --dsw-alias-border-l2-darkmode-thin: color-mix(in srgb, var(--skin-text) 10%, transparent);
  --dsw-alias-border-l3: color-mix(in srgb, var(--skin-text) 18%, transparent);
  --dsw-alias-border-l4: color-mix(in srgb, var(--skin-text) 26%, transparent);
  --dsw-alias-border-inverted: color-mix(in srgb, var(--skin-accent-ink) 20%, transparent);
  --dsw-alias-border-inverted2: color-mix(in srgb, var(--skin-accent-ink) 32%, transparent);

  --dsw-alias-button-primary-fill: var(--skin-accent);
  --dsw-alias-button-primary-hover: color-mix(in srgb, var(--skin-accent) 80%, white);
  --dsw-alias-button-primary-dimmed: color-mix(in srgb, var(--skin-accent) 42%, transparent);
  --dsw-alias-button-contrast-fill: var(--skin-text);
  --dsw-alias-button-elevated-fill: color-mix(in srgb, var(--skin-text) 9%, var(--skin-bg));
  --dsw-alias-button-floating-fill: color-mix(in srgb, var(--skin-text) 5%, var(--skin-bg));
  --dsw-alias-button-floating-hover: color-mix(in srgb, var(--skin-text) 11%, var(--skin-bg));
  --dsw-alias-button-ghost-active-fill: color-mix(in srgb, var(--skin-accent) 16%, transparent);
  --dsw-alias-button-ghost-active-hover: color-mix(in srgb, var(--skin-accent) 22%, transparent);
  --dsw-alias-button-ghost-active-border: color-mix(in srgb, var(--skin-accent) 45%, transparent);
  --dsw-alias-button-info-fill: var(--skin-accent);
  --dsw-alias-button-info-hover: color-mix(in srgb, var(--skin-accent) 84%, black);
  --dsw-alias-button-tool-bar-fill: color-mix(in srgb, var(--skin-text) 6%, transparent);
  --dsw-alias-button-tool-bar-fill-invisible: transparent;
  --dsw-alias-button-tool-bar-hover: color-mix(in srgb, var(--skin-text) 10%, transparent);

  --dsw-alias-interactive-bg-hover: color-mix(in srgb, var(--skin-text) 7%, transparent);
  --dsw-alias-interactive-bg-hover-solid: color-mix(in srgb, var(--skin-text) 9%, var(--skin-bg));
  --dsw-alias-interactive-bg-hover-accent: color-mix(in srgb, var(--skin-accent) 18%, transparent);
  --dsw-alias-interactive-bg-hover-danger: rgba(229, 115, 90, 0.16);
  --dsw-alias-interactive-bg-active: color-mix(in srgb, var(--skin-accent) 16%, transparent);

  --dsw-alias-markdown-inline-code: color-mix(in srgb, var(--skin-text) 9%, var(--skin-bg));
  --dsw-alias-markdown-code-block: color-mix(in srgb, var(--skin-bg) 88%, transparent);
  --dsw-alias-markdown-code-block-banner: color-mix(in srgb, var(--skin-text) 6%, var(--skin-bg));
  --dsw-alias-markdown-code-segment-selected: color-mix(in srgb, var(--skin-accent) 18%, transparent);
  --dsw-alias-markdown-code-segment-unselected: transparent;
  --dsw-alias-markdown-citation: var(--skin-accent);
  --dsw-alias-markdown-tag: color-mix(in srgb, var(--skin-accent) 16%, transparent);
  --dsw-alias-markdown-placeholder: var(--skin-muted);

  --dsw-alias-state-error-primary: #e5735a;
  --dsw-alias-state-error-secondary: rgba(229, 115, 90, 0.16);
  --dsw-alias-state-success-primary: #7fb87a;
  --dsw-alias-state-success-secondary: rgba(127, 184, 122, 0.16);
  --dsw-alias-state-success-tertiary: rgba(127, 184, 122, 0.1);
  --dsw-alias-state-warn-primary: #d9a441;
  --dsw-alias-state-warn-secondary: rgba(217, 164, 65, 0.16);
  --dsw-alias-state-warn-tertiary: rgba(217, 164, 65, 0.1);
  --dsw-alias-state-warn-label: #d9a441;
  --dsw-alias-state-business-primary: var(--skin-accent);
  --dsw-alias-state-business-tertiary: color-mix(in srgb, var(--skin-accent) 14%, transparent);

  --dsw-alias-tooltip-bg: color-mix(in srgb, var(--skin-text) 14%, var(--skin-bg));
  --dsw-alias-toast-bg: color-mix(in srgb, var(--skin-text) 9%, var(--skin-bg));

  --dsw-alias-scrollbar-bg-l1: color-mix(in srgb, var(--skin-accent) 22%, transparent);
  --dsw-alias-scrollbar-bg-l2: color-mix(in srgb, var(--skin-accent) 22%, transparent);
  --dsw-alias-scrollbar-hover-l1: color-mix(in srgb, var(--skin-accent) 40%, transparent);
  --dsw-alias-scrollbar-hover-l2: color-mix(in srgb, var(--skin-accent) 40%, transparent);
  --dsh-scrollbar-thumb: color-mix(in srgb, var(--skin-accent) 24%, transparent);
  --dsh-scrollbar-thumb-hover: color-mix(in srgb, var(--skin-accent) 42%, transparent);
}

/*
 * \u7ED9\u7CFB\u7EDF\u7A97\u53E3\u63A7\u4EF6\u8BA9\u4F4D\u3002
 *
 * \u9009\u62E9\u5668\u7528 dsh \u4FA7\u680F\u90A3\u4E2A CSS Modules \u7C7B\uFF08\u54C8\u5E0C\u524D\u7F00\u4F1A\u53D8\uFF0C\`sidebarCol\` \u540E\u7F00\u7A33\u5B9A\uFF09\u3002
 * \u8FD9\u662F\u672C\u6587\u4EF6\u552F\u4E00\u4E00\u5904\u7ED3\u6784\u9009\u62E9\u5668\uFF1A\u5339\u914D\u4E0D\u4E0A\u65F6\u53EA\u662F\u4E0D\u8BA9\u4F4D\uFF0C\u754C\u9762\u4E0D\u4F1A\u574F\u3002
 */
[class*="sidebarCol"] {
  padding-top: var(--skin-window-controls);
}

/*
 * \u4FA7\u680F\u5E95\u8272\u53BB\u91CD\u3002
 *
 * dsh \u5728\u4FA7\u680F\u5217\u548C\u5B83\u5185\u90E8\u7684\u5BB9\u5668\u4E0A\u90FD\u586B\u4E86 --dsw-specific-sidebar-fill\uFF0C\u540C\u4E00\u4E2A
 * \u534A\u900F\u660E\u8272\u53E0\u4E86\u4E24\u5C42\uFF0C\u5B9E\u9645\u4E0D\u900F\u660E\u5EA6\u662F 1-(1-a)\xB2\u2014\u2014a \u53D6 0.58 \u65F6\u662F 0.82\uFF0C\u80CC\u666F\u56FE
 * \u51E0\u4E4E\u900F\u4E0D\u4E0A\u6765\uFF0C\u8868\u73B0\u4E3A\u4FA7\u680F\u662F\u5757\u6B7B\u677F\u7684\u7EAF\u8272\uFF08\u5B9E\u6D4B\u786E\u8BA4\uFF09\u3002
 *
 * \u5728\u5217\u5185\u90E8\u628A\u8FD9\u4E2A\u53D8\u91CF\u6E05\u6389\uFF0C\u53EA\u7531\u6700\u5916\u5C42\u753B\u4E00\u6B21\u3002\u9009\u62E9\u5668\u5339\u914D\u4E0D\u4E0A\u65F6\u9000\u56DE\u539F\u6765\u7684
 * \u4E24\u5C42\u53E0\u52A0\uFF0C\u53EA\u662F\u504F\u5B9E\u4E00\u70B9\uFF0C\u754C\u9762\u4E0D\u4F1A\u574F\u3002
 */
[class*="sidebarCol"] > * {
  --dsw-specific-sidebar-fill: transparent;
}

/* \u2500\u2500 \u89C2\u611F\u7EC6\u8282 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
html.skin-studio * {
  scrollbar-width: thin;
  scrollbar-color: var(--dsh-scrollbar-thumb, transparent) transparent;
}

html.skin-studio ::selection {
  background: color-mix(in srgb, var(--skin-accent) 24%, transparent);
}
`;

// src/client/index.ts
var STORAGE_KEY = "dsh-skin-studio.config";
var ICON_PUZZLE = "M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.6 2.6 0 0 1 0 5.2H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.6 2.6 0 0 1 5.2 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z";
var ICON_REMOTE = "M4 5.5h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM7 18.5h4M9 14.5v4M17.5 9.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 16 20v-9a1.5 1.5 0 0 1 1.5-1.5zM19 18.8h.01";
var ICON_PALETTE = "M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 10.9C22 6 17.5 2 12 2zm-5.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5 2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z";
function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? { ...DEFAULT_CONFIG } : normalizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function save(config) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn("skin-studio: \u914D\u7F6E\u4FDD\u5B58\u5931\u8D25", error);
  }
}
function openSkinPanel(runtime) {
  if (document.querySelector(".skin-dialog-mask") !== null) return;
  const mask = document.createElement("div");
  mask.className = "skin-dialog-mask";
  Object.assign(mask.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.32)",
    backdropFilter: "blur(2px)"
  });
  const dialog = document.createElement("div");
  Object.assign(dialog.style, {
    width: "min(620px, calc(100vw - 64px))",
    maxHeight: "min(80vh, 780px)",
    display: "flex",
    flexDirection: "column",
    borderRadius: "14px",
    overflow: "hidden",
    background: "var(--dsw-alias-bg-layer-1, #fff)",
    color: "var(--dsw-alias-label-primary, #111)",
    border: "1px solid var(--dsw-alias-border-l2, #8883)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.3)"
  });
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
  const head = document.createElement("div");
  Object.assign(head.style, {
    display: "flex",
    alignItems: "center",
    padding: "15px 18px",
    borderBottom: "1px solid var(--dsw-alias-border-l1, #8882)"
  });
  const title = document.createElement("div");
  title.textContent = "\u76AE\u80A4\u7BA1\u7406";
  Object.assign(title.style, { fontSize: "15px", fontWeight: "650" });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "\u5173\u95ED";
  Object.assign(closeBtn.style, {
    marginLeft: "auto",
    font: "inherit",
    fontSize: "12px",
    padding: "5px 12px",
    borderRadius: "7px",
    cursor: "pointer",
    background: "transparent",
    color: "inherit",
    border: "1px solid var(--dsw-alias-border-l2, #8883)"
  });
  closeBtn.addEventListener("click", close);
  head.append(title, closeBtn);
  const scroll = document.createElement("div");
  Object.assign(scroll.style, { padding: "16px 18px 20px", overflowY: "auto" });
  scroll.appendChild(createSkinPanel({
    initial: load(),
    onPreview: (config) => {
      runtime.apply(config);
    },
    onSave: (config) => {
      save(config);
    }
  }));
  dialog.append(head, scroll);
  mask.appendChild(dialog);
  document.body.appendChild(mask);
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
function desktopBridge() {
  return globalThis.dshDesktop;
}
function createFooterEntries(runtime) {
  return function FooterEntries(props) {
    const wide = props.wide !== false;
    const desktop = desktopBridge();
    return (0, import_react.createElement)(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          width: wide ? "100%" : "auto",
          minWidth: "0",
          alignItems: wide ? "stretch" : "center"
        }
      },
      entryRow("\u63D2\u4EF6", ICON_PUZZLE, wide, () => {
        openPluginManager({ "dsh-plugin-skin-studio": () => {
          openSkinPanel(runtime);
        } });
      }),
      entryRow("\u76AE\u80A4", ICON_PALETTE, wide, () => {
        openSkinPanel(runtime);
      }),
      // 远程控制是桌面壳的能力（要跑进程、存加密凭据），浏览器里做不了；
      // 拿不到壳注入的通道时这一项不出现，插件在纯浏览器下照样可用。
      desktop?.openRemoteControl === void 0 ? null : entryRow("\u8FDC\u7A0B\u63A7\u5236", ICON_REMOTE, wide, () => {
        desktop.openRemoteControl?.();
      })
    );
  };
}
function apply(ctx) {
  const runtime = createSkinRuntime(skin_default);
  runtime.apply(load());
  ctx.effect?.(() => () => {
    runtime.dispose();
  }, "skin-studio: \u76AE\u80A4");
  ctx.inject?.(["slots"], (scoped) => {
    scoped.slots.inject("sidebar.footer.action", () => scoped.slots.register({
      name: "sidebar.footer.action",
      id: "skin-studio-entries",
      order: 100,
      label: () => "\u63D2\u4EF6\u4E0E\u76AE\u80A4"
    }, createFooterEntries(runtime)));
  });
}

		return module.exports;
	}
});
