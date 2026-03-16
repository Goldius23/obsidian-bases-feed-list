/**
 * Bases Feed View — v1.0.0
 *
 * Adds a "Feed" view type to Obsidian Bases: a scrollable vertical list showing
 * a thumbnail/icon on the left and note title + properties on the right.
 *
 * Features
 * ─────────
 * • Image thumbnails from any frontmatter property (wikilink, URL, or Lucide icon)
 * • Falls back to the note's own icon when no image is set
 * • Configurable image property + size slider in the "Configure view" panel
 * • Full Sort integration (reads vc.sort, sorts client-side)
 * • Full Filter integration (Bases handles filtering; view just re-renders)
 * • Full Group by integration (buckets entries by property, renders group headers)
 * • Full Properties panel integration (shows/hides props, respects order)
 * • Clickable wikilinks in property values
 * • Limit support
 *
 * Requires Obsidian 1.10.0+ (Bases API)
 */

import { Plugin, Component, TFile, setIcon, App } from "obsidian";

// ── Bases entry shape (discovered via runtime inspection) ──────────────────

interface BasesEntry {
  file: TFile;
  frontmatter: Record<string, unknown>;
  note: { icon: string; data: Record<string, unknown> };
  app: {
    vault: {
      getAbstractFileByPath: (p: string) => unknown;
      getFiles: () => TFile[];
      getResourcePath: (f: TFile) => string;
    };
  };
}

// ── ViewOption types (not exported in older obsidian typings) ──────────────

interface PropertyOption {
  type: "property";
  key: string;
  label: string;
}

interface SliderOption {
  type: "slider";
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

type ViewOption = PropertyOption | SliderOption;

// Frontmatter keys that are never shown as property rows
const HIDDEN_ALWAYS = new Set(["title", "aliases", "cssclasses", "cssclass"]);

// ── Feed View ──────────────────────────────────────────────────────────────

class FeedView extends Component {
  /** App instance passed explicitly — Component does not provide this.app */
  private obsApp: App;
  private controller: Record<string, unknown>;
  private containerEl: HTMLElement;

  constructor(app: App, controller: unknown, containerEl: HTMLElement) {
    super();
    this.obsApp = app;
    this.controller = controller as Record<string, unknown>;
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
  getSort(): { prop: string; dir: "asc" | "desc" }[] {
    const vc = this.getViewConfig();
    const raw = vc?.sort;
    if (!Array.isArray(raw)) return [];
    return (raw as Record<string, unknown>[])
      .map(o => ({
        prop: typeof o.property === "string"
          ? stripNamespace(o.property)
          : "",
        dir: typeof o.direction === "string" && o.direction.toUpperCase() === "DESC"
          ? "desc" as const
          : "asc" as const,
      }))
      .filter(s => s.prop !== "");
  }

  /** Result limit — 0 or absent means no limit */
  getLimit(): number | null {
    const vc = this.getViewConfig();
    const l = vc?.limit;
    return typeof l === "number" && l > 0 ? l : null;
  }

  getQuery(): unknown { return this.controller.query ?? null; }
  saveQuery(): void   { (this.controller.saveQuery as (() => void) | undefined)?.(); }

  /**
   * Visible properties list — stored as vc.order: ["note.X", "formula.Y", …]
   * Bases recreates the view on every Properties panel toggle (unload/load cycle),
   * so we always read fresh from viewConfig rather than tracking local state.
   */
  getVisibleProperties(): string[] {
    const vc = this.getViewConfig();
    return Array.isArray(vc?.order) ? vc.order as string[] : [];
  }

  /** Bases calls this on toggle but immediately destroys + recreates the view */
  togglePropertyVisibility(_prop: unknown): void { this.render(); }

  onResize() {}
  getEphemeralState()          { return {}; }
  setEphemeralState(_s: unknown) {}
  getViewActions()             { return []; }
  onunload()                   { this.containerEl.empty(); }

  // ── Config helpers ────────────────────────────────────────────────────────

  private getViewConfig(): Record<string, unknown> | null {
    if (typeof this.controller.getViewConfig === "function") {
      try { return (this.controller.getViewConfig as () => Record<string, unknown>)(); }
      catch { return null; }
    }
    return null;
  }

  /**
   * Image property key — saved by the Configure view panel into vc.data.coverProp.
   * Value may be a plain string ("Cover", "note.Cover") or a property object.
   */
  private getCoverProp(): string {
    const data = this.getViewConfig()?.data as Record<string, unknown> | undefined;
    const raw = data?.coverProp;
    if (typeof raw === "string") return stripNamespace(raw);
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const id = (typeof o.propertyId === "string" ? o.propertyId : null)
              ?? (typeof o.id       === "string" ? o.id       : null)
              ?? (typeof o.name     === "string" ? o.name     : null)
              ?? "";
      return stripNamespace(id);
    }
    return "";
  }

  /** Thumbnail pixel size — saved into vc.data.thumbSize by the slider */
  private getThumbSize(): number {
    const data = this.getViewConfig()?.data as Record<string, unknown> | undefined;
    const raw = data?.thumbSize;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const n = parseFloat(raw);
      if (!isNaN(n)) return n;
    }
    return 48;
  }

  // ── Core render ───────────────────────────────────────────────────────────

  private render() {
    const results = this.controller.results as Map<TFile, BasesEntry> | undefined;
    this.containerEl.empty();
    this.containerEl.addClass("bfv-root");

    if (!results || results.size === 0) {
      const empty = this.containerEl.createDiv("bfv-empty");
      setIcon(empty.createSpan(), "inbox");
      empty.createSpan({ text: " No results" });
      return;
    }

    // Client-side sort (Bases doesn't sort the Map for custom views)
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
    const vc    = this.getViewConfig();
    const list  = this.containerEl.createDiv("bfv-list");

    // Group by
    const groupByRaw = vc?.groupBy as Record<string, unknown> | null | undefined;
    const groupProp  = groupByRaw?.property ? stripNamespace(String(groupByRaw.property)) : null;
    const groupDir   = groupByRaw?.direction && String(groupByRaw.direction).toUpperCase() === "DESC" ? "desc" : "asc";

    if (groupProp) {
      const buckets = new Map<string, BasesEntry[]>();
      for (const entry of entries) {
        const raw   = getEntryProp(entry, groupProp);
        const label = raw == null ? "—"
          : Array.isArray(raw) ? raw.map(v => stripWikilinks(String(v))).join(", ")
          : stripWikilinks(String(raw));
        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label)!.push(entry);
      }
      const sortedKeys = Array.from(buckets.keys()).sort((a, b) =>
        groupDir === "desc" ? b.localeCompare(a, undefined, { numeric: true })
                            : a.localeCompare(b, undefined, { numeric: true })
      );
      let count = 0;
      for (const key of sortedKeys) {
        if (limit !== null && count >= limit) break;
        const header = list.createDiv("bfv-group-header");
        header.createSpan({ cls: "bfv-group-label", text: key });
        header.createSpan({ cls: "bfv-group-count", text: String(buckets.get(key)!.length) });
        for (const entry of buckets.get(key)!) {
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

  private renderRow(list: HTMLElement, entry: BasesEntry) {
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

    // Property rows — respecting Properties panel order and visibility
    const orderedKeys = this.getVisibleProperties(); // ["note.X", "formula.Y", "file.Z"]

    if (orderedKeys.length > 0) {
      for (const rawKey of orderedKeys) {
        const stripped = stripNamespace(rawKey);
        let val: unknown;

        if (rawKey.startsWith("formula.")) {
          val = getFormulaValue(entry, stripped);
        } else if (rawKey.startsWith("file.")) {
          val = getEntryProp(entry, rawKey);
        } else {
          const fm = entry.frontmatter ?? {};
          val = fm[stripped] ?? fm[rawKey];
          if (coverProp && stripped === coverProp) continue;
          if (HIDDEN_ALWAYS.has(stripped.toLowerCase())) continue;
        }

        if (val == null || val === "") continue;
        this.renderProp(content, stripped, val);
      }
    } else {
      // No Properties filter — show all frontmatter props
      const fm = entry.frontmatter ?? {};
      for (const [key, val] of Object.entries(fm)) {
        if (coverProp && key === coverProp) continue;
        if (HIDDEN_ALWAYS.has(key.toLowerCase())) continue;
        if (val == null || val === "") continue;
        this.renderProp(content, key, val);
      }
    }
  }

  // ── Thumbnail ─────────────────────────────────────────────────────────────

  private renderThumb(parent: HTMLElement, entry: BasesEntry, coverProp: string) {
    const raw = coverProp ? entry.frontmatter?.[coverProp] : undefined;
    if (raw) {
      const str = String(raw).trim();
      const wikiMatch = str.match(/^\[\[([^\]|]+)/);
      if (wikiMatch) {
        const imgFile = this.resolveVaultImage(wikiMatch[1], entry.app);
        if (imgFile) {
          const img = parent.createEl("img", { cls: "bfv-img" });
          img.src = entry.app.vault.getResourcePath(imgFile);
          img.addEventListener("error", () => { img.remove(); this.fallbackIcon(parent, entry); });
          return;
        }
      }
      if (str.startsWith("http://") || str.startsWith("https://")) {
        const img = parent.createEl("img", { cls: "bfv-img" });
        img.src = str;
        img.addEventListener("error", () => { img.remove(); this.fallbackIcon(parent, entry); });
        return;
      }
      this.renderLucide(parent, str);
      return;
    }
    this.fallbackIcon(parent, entry);
  }

  private fallbackIcon(parent: HTMLElement, entry: BasesEntry) {
    this.renderLucide(parent, (entry.note?.icon ?? "file-text").replace(/^lucide-/, ""));
  }

  private renderLucide(parent: HTMLElement, iconName: string) {
    const wrap = parent.createDiv("bfv-icon");
    try { setIcon(wrap, iconName); } catch { setIcon(wrap, "file-text"); }
  }

  private resolveVaultImage(name: string, app: BasesEntry["app"]): TFile | null {
    let f = app.vault.getAbstractFileByPath(name);
    if (!f) f = app.vault.getFiles().find(x => x.name === name || x.basename === name) ?? null;
    return f instanceof TFile && isImageExt(f.extension) ? f : null;
  }

  // ── Property row ──────────────────────────────────────────────────────────

  private renderProp(parent: HTMLElement, key: string, val: unknown) {
    const row = parent.createDiv("bfv-prop");
    row.createSpan({ cls: "bfv-prop-key", text: key });
    row.createSpan({ cls: "bfv-prop-sep", text: ": " });
    const valSpan = row.createSpan("bfv-prop-val");

    if (Array.isArray(val)) {
      const items = val.map(v => typeof v === "string" ? v : String(v)).filter(Boolean);
      if (items.length > 1) {
        const wrap = row.createSpan("bfv-tags");
        items.forEach(t => this.renderValueInline(wrap, t, true));
        return;
      }
      items.forEach(t => this.renderValueInline(valSpan, t, false));
      return;
    }
    this.renderValueInline(valSpan, String(val), false);
  }

  /**
   * Renders a raw string value.
   * [[wikilinks]] become clickable spans; plain text renders as-is.
   */
  private renderValueInline(parent: HTMLElement, raw: string, asTag: boolean) {
    const wikiRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let last = 0, hasLinks = false;
    let match: RegExpExecArray | null;
    const frag = document.createDocumentFragment();

    while ((match = wikiRe.exec(raw)) !== null) {
      hasLinks = true;
      if (match.index > last) frag.appendChild(document.createTextNode(raw.slice(last, match.index)));
      const target = match[1].trim();
      const label  = (match[2] ?? match[1]).trim();
      const link   = document.createElement("span");
      link.className   = "bfv-link";
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
      if (asTag) { parent.createSpan({ cls: "bfv-tag", text }); return; }
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
}

// ── Module-level helpers ───────────────────────────────────────────────────

/** Strip Bases namespace prefix: "note.X" → "X", "file.X" → "X" etc. */
function stripNamespace(s: string): string {
  return s.replace(/^(note|formula|implicit|file)\./, "");
}

function stripWikilinks(s: string): string {
  return s.replace(/^\[\[|\]\]$/g, "");
}

/** Read a built-in file property or a frontmatter key from an entry */
function getEntryProp(entry: BasesEntry, prop: string): unknown {
  switch (prop) {
    case "file.name":
    case "name":        return entry.file.name;
    case "file.basename":
    case "basename":    return entry.file.basename;
    case "file.path":   return entry.file.path;
    case "file.ext":    return entry.file.extension;
    case "file.size":   return (entry.file.stat as Record<string,unknown>)?.size  ?? 0;
    case "file.mtime":  return (entry.file.stat as Record<string,unknown>)?.mtime ?? 0;
    case "file.ctime":  return (entry.file.stat as Record<string,unknown>)?.ctime ?? 0;
  }
  const fm = entry.frontmatter ?? {};
  if (prop in fm) return fm[prop];
  const lower = prop.toLowerCase();
  for (const [k, v] of Object.entries(fm)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

/**
 * Read a computed formula value from an entry using the Bases runtime API.
 *
 * entry.formulaResults.getFormulaValue(name) is the official path.
 * Falls back to formula.getValue(entry).toString() if needed.
 */
function getFormulaValue(entry: BasesEntry, name: string): string | undefined {
  const e = entry as unknown as Record<string, unknown>;
  const fr = e.formulaResults as Record<string, unknown> | undefined;

  // Primary: entry.formulaResults.getFormulaValue(name)
  if (fr && typeof fr.getFormulaValue === "function") {
    try {
      const tv = (fr.getFormulaValue as Function)(name);
      if (tv != null) {
        const str = typeof tv.toString === "function" ? tv.toString() : String(tv);
        if (str !== "null" && str !== "undefined") return str;
      }
    } catch {}
  }

  // Fallback: find formula object by name and call getValue(entry)
  const formulas = fr?.formulas as Record<string, unknown> | undefined;
  if (formulas) {
    const fo = (formulas[name] ??
      Object.entries(formulas).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
    ) as Record<string, unknown> | undefined;

    if (fo && typeof fo.getValue === "function") {
      try {
        const tv = (fo.getValue as Function)(entry) as Record<string, unknown>;
        if (tv != null) {
          const str = typeof tv.toString === "function" ? (tv.toString as Function)() : String(tv);
          if (str !== "null" && str !== "undefined") return str;
        }
      } catch {}
    }
  }

  return undefined;
}

/** Stable sort comparison — handles numbers, ISO dates, arrays, and strings */
function compareValues(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const ad = typeof a === "string" ? Date.parse(a) : NaN;
  const bd = typeof b === "string" ? Date.parse(b) : NaN;
  if (!isNaN(ad) && !isNaN(bd)) return ad - bd;
  if (Array.isArray(a)) return compareValues(a[0], Array.isArray(b) ? b[0] : b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function isImageExt(ext: string): boolean {
  return ["png","jpg","jpeg","gif","webp","svg","bmp","avif"].includes(ext.toLowerCase());
}

// ── Plugin ─────────────────────────────────────────────────────────────────

export default class FeedViewPlugin extends Plugin {
  onload() {
    // registerBasesView is available in Obsidian ≥ 1.10.0
    // @ts-ignore
    this.registerBasesView("feed", {
      icon:    "layout-list",
      label:   "Feed",
      factory: (controller: unknown, containerEl: HTMLElement) =>
        new FeedView(this.app, controller, containerEl),

      /**
       * Configure view panel options.
       * Bases renders these as UI controls and saves values into vc.data.<key>.
       */
      options: (): ViewOption[] => [
        {
          type:  "property",
          key:   "coverProp",
          label: "Image property",
        },
        {
          type:  "slider",
          key:   "thumbSize",
          label: "Image size",
          min:   32,
          max:   120,
          step:  4,
        },
      ],
    });
  }
  onunload() {}
}
