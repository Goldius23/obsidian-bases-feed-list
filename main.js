var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// home/claude/bfv-v1/src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FeedViewPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var HIDDEN_ALWAYS = /* @__PURE__ */ new Set(["title", "aliases", "cssclasses", "cssclass"]);
var FeedView = class extends import_obsidian.Component {
  constructor(app, controller, containerEl) {
    super();
    /** App instance passed explicitly — Component does not provide this.app */
    __publicField(this, "obsApp");
    __publicField(this, "controller");
    __publicField(this, "containerEl");
    this.obsApp = app;
    this.controller = controller;
    this.containerEl = containerEl;
  }
  onload() {
    this.containerEl.addClass("bfv-root");
    this.render();
  }
  onDataUpdated() {
    this.render();
  }
  // ── Bases toolbar API ─────────────────────────────────────────────────────
  /**
   * Sort spec — stored as vc.sort: [{property, direction}]
   * Bases does NOT pre-sort the Map for custom views, so we sort client-side.
   */
  getSort() {
    const vc = this.getViewConfig();
    const raw = vc == null ? void 0 : vc.sort;
    if (!Array.isArray(raw)) return [];
    return raw.map((o) => ({
      prop: typeof o.property === "string" ? stripNamespace(o.property) : "",
      dir: typeof o.direction === "string" && o.direction.toUpperCase() === "DESC" ? "desc" : "asc"
    })).filter((s) => s.prop !== "");
  }
  /** Result limit — 0 or absent means no limit */
  getLimit() {
    const vc = this.getViewConfig();
    const l = vc == null ? void 0 : vc.limit;
    return typeof l === "number" && l > 0 ? l : null;
  }
  getQuery() {
    var _a;
    return (_a = this.controller.query) != null ? _a : null;
  }
  saveQuery() {
    var _a, _b;
    (_b = (_a = this.controller).saveQuery) == null ? void 0 : _b.call(_a);
  }
  /**
   * Visible properties list — stored as vc.order: ["note.X", "formula.Y", …]
   * Bases recreates the view on every Properties panel toggle (unload/load cycle),
   * so we always read fresh from viewConfig rather than tracking local state.
   */
  getVisibleProperties() {
    const vc = this.getViewConfig();
    return Array.isArray(vc == null ? void 0 : vc.order) ? vc.order : [];
  }
  /** Bases calls this on toggle but immediately destroys + recreates the view */
  togglePropertyVisibility(_prop) {
    this.render();
  }
  onResize() {
  }
  getEphemeralState() {
    return {};
  }
  setEphemeralState(_s) {
  }
  getViewActions() {
    return [];
  }
  onunload() {
    this.containerEl.empty();
  }
  // ── Config helpers ────────────────────────────────────────────────────────
  getViewConfig() {
    if (typeof this.controller.getViewConfig === "function") {
      try {
        return this.controller.getViewConfig();
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  /**
   * Image property key — saved by the Configure view panel into vc.data.coverProp.
   * Value may be a plain string ("Cover", "note.Cover") or a property object.
   */
  getCoverProp() {
    var _a, _b, _c, _d;
    const data = (_a = this.getViewConfig()) == null ? void 0 : _a.data;
    const raw = data == null ? void 0 : data.coverProp;
    if (typeof raw === "string") return stripNamespace(raw);
    if (raw && typeof raw === "object") {
      const o = raw;
      const id = (_d = (_c = (_b = typeof o.propertyId === "string" ? o.propertyId : null) != null ? _b : typeof o.id === "string" ? o.id : null) != null ? _c : typeof o.name === "string" ? o.name : null) != null ? _d : "";
      return stripNamespace(id);
    }
    return "";
  }
  /** Thumbnail pixel size — saved into vc.data.thumbSize by the slider */
  getThumbSize() {
    var _a;
    const data = (_a = this.getViewConfig()) == null ? void 0 : _a.data;
    const raw = data == null ? void 0 : data.thumbSize;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const n = parseFloat(raw);
      if (!isNaN(n)) return n;
    }
    return 48;
  }
  // ── Core render ───────────────────────────────────────────────────────────
  render() {
    const results = this.controller.results;
    this.containerEl.empty();
    this.containerEl.addClass("bfv-root");
    if (!results || results.size === 0) {
      const empty = this.containerEl.createDiv("bfv-empty");
      (0, import_obsidian.setIcon)(empty.createSpan(), "inbox");
      empty.createSpan({ text: " No results" });
      return;
    }
    let entries = Array.from(results.values());
    const sortSpec = this.getSort();
    if (sortSpec.length > 0) {
      entries.sort((a, b) => {
        for (const { prop, dir } of sortSpec) {
          const cmp = compareValues(getEntryProp(a, prop), getEntryProp(b, prop));
          if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }
    const limit = this.getLimit();
    const vc = this.getViewConfig();
    const list = this.containerEl.createDiv("bfv-list");
    const groupByRaw = vc == null ? void 0 : vc.groupBy;
    const groupProp = (groupByRaw == null ? void 0 : groupByRaw.property) ? stripNamespace(String(groupByRaw.property)) : null;
    const groupDir = (groupByRaw == null ? void 0 : groupByRaw.direction) && String(groupByRaw.direction).toUpperCase() === "DESC" ? "desc" : "asc";
    if (groupProp) {
      const buckets = /* @__PURE__ */ new Map();
      for (const entry of entries) {
        const raw = getEntryProp(entry, groupProp);
        const label = raw == null ? "\u2014" : Array.isArray(raw) ? raw.map((v) => stripWikilinks(String(v))).join(", ") : stripWikilinks(String(raw));
        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label).push(entry);
      }
      const sortedKeys = Array.from(buckets.keys()).sort(
        (a, b) => groupDir === "desc" ? b.localeCompare(a, void 0, { numeric: true }) : a.localeCompare(b, void 0, { numeric: true })
      );
      let count = 0;
      for (const key of sortedKeys) {
        if (limit !== null && count >= limit) break;
        const header = list.createDiv("bfv-group-header");
        header.createSpan({ cls: "bfv-group-label", text: key });
        header.createSpan({ cls: "bfv-group-count", text: String(buckets.get(key).length) });
        for (const entry of buckets.get(key)) {
          if (limit !== null && count >= limit) break;
          this.renderRow(list, entry);
          count++;
        }
      }
    } else {
      let count = 0;
      for (const entry of entries) {
        if (limit !== null && count >= limit) break;
        this.renderRow(list, entry);
        count++;
      }
    }
  }
  // ── Row ───────────────────────────────────────────────────────────────────
  renderRow(list, entry) {
    var _a, _b, _c;
    const row = list.createDiv("bfv-row");
    row.style.setProperty("--bfv-thumb-size", `${this.getThumbSize()}px`);
    const coverProp = this.getCoverProp();
    this.renderThumb(row.createDiv("bfv-thumb"), entry, coverProp);
    const content = row.createDiv("bfv-content");
    const titleEl = content.createDiv("bfv-title");
    titleEl.setText(entry.file.basename);
    titleEl.addEventListener("click", () => {
      this.obsApp.workspace.openLinkText(entry.file.path, "", false);
    });
    const orderedKeys = this.getVisibleProperties();
    if (orderedKeys.length > 0) {
      for (const rawKey of orderedKeys) {
        const stripped = stripNamespace(rawKey);
        let val;
        if (rawKey.startsWith("formula.")) {
          val = getFormulaValue(entry, stripped);
        } else if (rawKey.startsWith("file.")) {
          val = getEntryProp(entry, rawKey);
        } else {
          const fm = (_a = entry.frontmatter) != null ? _a : {};
          val = (_b = fm[stripped]) != null ? _b : fm[rawKey];
          if (coverProp && stripped === coverProp) continue;
          if (HIDDEN_ALWAYS.has(stripped.toLowerCase())) continue;
        }
        if (val == null || val === "") continue;
        this.renderProp(content, stripped, val);
      }
    } else {
      const fm = (_c = entry.frontmatter) != null ? _c : {};
      for (const [key, val] of Object.entries(fm)) {
        if (coverProp && key === coverProp) continue;
        if (HIDDEN_ALWAYS.has(key.toLowerCase())) continue;
        if (val == null || val === "") continue;
        this.renderProp(content, key, val);
      }
    }
  }
  // ── Thumbnail ─────────────────────────────────────────────────────────────
  renderThumb(parent, entry, coverProp) {
    var _a;
    const raw = coverProp ? (_a = entry.frontmatter) == null ? void 0 : _a[coverProp] : void 0;
    if (raw) {
      const str = String(raw).trim();
      const wikiMatch = str.match(/^\[\[([^\]|]+)/);
      if (wikiMatch) {
        const imgFile = this.resolveVaultImage(wikiMatch[1], entry.app);
        if (imgFile) {
          const img = parent.createEl("img", { cls: "bfv-img" });
          img.src = entry.app.vault.getResourcePath(imgFile);
          img.addEventListener("error", () => {
            img.remove();
            this.fallbackIcon(parent, entry);
          });
          return;
        }
      }
      if (str.startsWith("http://") || str.startsWith("https://")) {
        const img = parent.createEl("img", { cls: "bfv-img" });
        img.src = str;
        img.addEventListener("error", () => {
          img.remove();
          this.fallbackIcon(parent, entry);
        });
        return;
      }
      this.renderLucide(parent, str);
      return;
    }
    this.fallbackIcon(parent, entry);
  }
  /**
   * Icon fallback priority (when no cover image is configured or resolved):
   *   1. Frontmatter "icon" property — if present and non-empty
   *   2. Note's system icon (entry.note.icon, set via Obsidian icon picker)
   *   3. Generic "file-text"
   */
  fallbackIcon(parent, entry) {
    var _a, _b;
    const fm = (_a = entry.frontmatter) != null ? _a : {};
    const fmIconKey = Object.keys(fm).find((k) => k.toLowerCase() === "icon");
    const fmIcon = fmIconKey ? fm[fmIconKey] : void 0;
    if (fmIcon && typeof fmIcon === "string" && fmIcon.trim() !== "") {
      this.renderLucide(parent, fmIcon.trim().replace(/^lucide-/, ""));
      return;
    }
    const noteIcon = (_b = entry.note) == null ? void 0 : _b.icon;
    if (noteIcon && noteIcon.trim() !== "") {
      this.renderLucide(parent, noteIcon.replace(/^lucide-/, ""));
      return;
    }
    this.renderLucide(parent, "file-text");
  }
  renderLucide(parent, iconName) {
    const wrap = parent.createDiv("bfv-icon");
    try {
      (0, import_obsidian.setIcon)(wrap, iconName);
    } catch (e) {
      (0, import_obsidian.setIcon)(wrap, "file-text");
    }
  }
  resolveVaultImage(name, app) {
    var _a;
    let f = app.vault.getAbstractFileByPath(name);
    if (!f) f = (_a = app.vault.getFiles().find((x) => x.name === name || x.basename === name)) != null ? _a : null;
    return f instanceof import_obsidian.TFile && isImageExt(f.extension) ? f : null;
  }
  // ── Property row ──────────────────────────────────────────────────────────
  renderProp(parent, key, val) {
    const row = parent.createDiv("bfv-prop");
    row.createSpan({ cls: "bfv-prop-key", text: key });
    row.createSpan({ cls: "bfv-prop-sep", text: ": " });
    const valSpan = row.createSpan("bfv-prop-val");
    if (Array.isArray(val)) {
      const items = val.map((v) => typeof v === "string" ? v : String(v)).filter(Boolean);
      if (items.length > 1) {
        const wrap = row.createSpan("bfv-tags");
        items.forEach((t) => this.renderValueInline(wrap, t, true));
        return;
      }
      items.forEach((t) => this.renderValueInline(valSpan, t, false));
      return;
    }
    this.renderValueInline(valSpan, String(val), false);
  }
  /**
   * Renders a raw string value.
   * [[wikilinks]] become clickable spans; plain text renders as-is.
   */
  renderValueInline(parent, raw, asTag) {
    var _a;
    const wikiRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let last = 0, hasLinks = false;
    let match;
    const frag = document.createDocumentFragment();
    while ((match = wikiRe.exec(raw)) !== null) {
      hasLinks = true;
      if (match.index > last) frag.appendChild(document.createTextNode(raw.slice(last, match.index)));
      const target = match[1].trim();
      const label = ((_a = match[2]) != null ? _a : match[1]).trim();
      const link = document.createElement("span");
      link.className = "bfv-link";
      link.textContent = label;
      link.addEventListener("click", (e) => {
        e.stopPropagation();
        this.obsApp.workspace.openLinkText(target, "", false);
      });
      frag.appendChild(link);
      last = match.index + match[0].length;
    }
    if (!hasLinks) {
      const text = stripWikilinks(raw);
      if (asTag) {
        parent.createSpan({ cls: "bfv-tag", text });
        return;
      }
      parent.appendText(text);
      return;
    }
    if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
    if (asTag) {
      parent.createSpan({ cls: "bfv-tag" }).appendChild(frag);
    } else {
      parent.appendChild(frag);
    }
  }
};
function stripNamespace(s) {
  return s.replace(/^(note|formula|implicit|file)\./, "");
}
function stripWikilinks(s) {
  return s.replace(/^\[\[|\]\]$/g, "");
}
function getEntryProp(entry, prop) {
  var _a, _b, _c, _d, _e, _f, _g;
  switch (prop) {
    case "file.name":
    case "name":
      return entry.file.name;
    case "file.basename":
    case "basename":
      return entry.file.basename;
    case "file.path":
      return entry.file.path;
    case "file.ext":
      return entry.file.extension;
    case "file.size":
      return (_b = (_a = entry.file.stat) == null ? void 0 : _a.size) != null ? _b : 0;
    case "file.mtime":
      return (_d = (_c = entry.file.stat) == null ? void 0 : _c.mtime) != null ? _d : 0;
    case "file.ctime":
      return (_f = (_e = entry.file.stat) == null ? void 0 : _e.ctime) != null ? _f : 0;
  }
  const fm = (_g = entry.frontmatter) != null ? _g : {};
  if (prop in fm) return fm[prop];
  const lower = prop.toLowerCase();
  for (const [k, v] of Object.entries(fm)) {
    if (k.toLowerCase() === lower) return v;
  }
  return void 0;
}
function getFormulaValue(entry, name) {
  var _a, _b;
  const e = entry;
  const fr = e.formulaResults;
  if (fr && typeof fr.getFormulaValue === "function") {
    try {
      const tv = fr.getFormulaValue(name);
      if (tv != null) {
        const str = typeof tv.toString === "function" ? tv.toString() : String(tv);
        if (str !== "null" && str !== "undefined") return str;
      }
    } catch (e2) {
    }
  }
  const formulas = fr == null ? void 0 : fr.formulas;
  if (formulas) {
    const fo = (_b = formulas[name]) != null ? _b : (_a = Object.entries(formulas).find(([k]) => k.toLowerCase() === name.toLowerCase())) == null ? void 0 : _a[1];
    if (fo && typeof fo.getValue === "function") {
      try {
        const tv = fo.getValue(entry);
        if (tv != null) {
          const str = typeof tv.toString === "function" ? tv.toString() : String(tv);
          if (str !== "null" && str !== "undefined") return str;
        }
      } catch (e2) {
      }
    }
  }
  return void 0;
}
function compareValues(a, b) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const ad = typeof a === "string" ? Date.parse(a) : NaN;
  const bd = typeof b === "string" ? Date.parse(b) : NaN;
  if (!isNaN(ad) && !isNaN(bd)) return ad - bd;
  if (Array.isArray(a)) return compareValues(a[0], Array.isArray(b) ? b[0] : b);
  return String(a).localeCompare(String(b), void 0, { numeric: true, sensitivity: "base" });
}
function isImageExt(ext) {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext.toLowerCase());
}
var FeedViewPlugin = class extends import_obsidian.Plugin {
  onload() {
    this.registerBasesView("feed", {
      icon: "layout-list",
      label: "Feed",
      factory: (controller, containerEl) => new FeedView(this.app, controller, containerEl),
      /**
       * Configure view panel options.
       * Bases renders these as UI controls and saves values into vc.data.<key>.
       */
      options: () => [
        {
          type: "property",
          key: "coverProp",
          label: "Image property"
        },
        {
          type: "slider",
          key: "thumbSize",
          label: "Image size",
          min: 32,
          max: 120,
          step: 4
        }
      ]
    });
  }
  onunload() {
  }
};