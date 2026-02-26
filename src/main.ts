import { Plugin, Component, TFile, setIcon, App } from "obsidian";

interface BasesEntry {
  file: TFile;
  frontmatter: Record<string, unknown>;
  note: { icon: string; data: Record<string, unknown> };
  app: { vault: { getAbstractFileByPath: (p: string) => unknown; getFiles: () => TFile[]; getResourcePath: (f: TFile) => string } };
}

interface PropertyOption { type: "property"; key: string; label: string; }
interface SliderOption    { type: "slider"; key: string; label: string; min: number; max: number; step: number; }
type ViewOption = PropertyOption | SliderOption;

const HIDDEN_ALWAYS = new Set(["title", "aliases", "cssclasses", "cssclass"]);

class FeedView extends Component {
  private obsApp: App;
  private controller: Record<string, unknown>;
  private containerEl: HTMLElement;

  constructor(app: App, controller: unknown, containerEl: HTMLElement) {
    super();
    this.obsApp = app;
    this.controller = controller as Record<string, unknown>;
    this.containerEl = containerEl;
  }

  onload()        { this.containerEl.addClass("bfv-root"); this.render(); }
  onDataUpdated() { this.render(); }
  onResize()      {}
  getEphemeralState()            { return {}; }
  setEphemeralState(_s: unknown) {}
  getViewActions()               { return []; }
  onunload()                     { this.containerEl.empty(); }
  getQuery(): unknown            { return this.controller.query ?? null; }
  saveQuery(): void              { (this.controller.saveQuery as (() => void) | undefined)?.(); }
  getVisibleProperties(): string[] { return []; }
  togglePropertyVisibility(_p: unknown): void { this.render(); }

  private getViewConfig(): Record<string, unknown> | null {
    if (typeof this.controller.getViewConfig === "function") {
      try { return (this.controller.getViewConfig as () => Record<string, unknown>)(); }
      catch { return null; }
    }
    return null;
  }

  // Sort spec — vc.sort: [{property, direction}]
  // Bases does NOT pre-sort the Map for custom views, so we sort client-side
  getSort(): { prop: string; dir: "asc" | "desc" }[] {
    const raw = this.getViewConfig()?.sort;
    if (!Array.isArray(raw)) return [];
    return (raw as Record<string, unknown>[])
      .map(o => ({
        prop: typeof o.property === "string" ? o.property.replace(/^note\./, "") : "",
        dir: typeof o.direction === "string" && o.direction.toUpperCase() === "DESC" ? "desc" as const : "asc" as const,
      }))
      .filter(s => s.prop !== "");
  }

  // Limit — 0 means "show all" (not zero results)
  getLimit(): number | null {
    const l = this.getViewConfig()?.limit;
    return typeof l === "number" && l > 0 ? l : null;
  }

  private getCoverProp(): string {
    const data = this.getViewConfig()?.data as Record<string, unknown> | undefined;
    const raw = data?.coverProp;
    if (typeof raw === "string") return raw.replace(/^note\./, "");
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const id = (typeof o.propertyId === "string" ? o.propertyId : null) ?? (typeof o.id === "string" ? o.id : null) ?? "";
      return id.replace(/^note\./, "");
    }
    return "";
  }

  private getThumbSize(): number {
    const raw = (this.getViewConfig()?.data as Record<string, unknown> | undefined)?.thumbSize;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") { const n = parseFloat(raw); if (!isNaN(n)) return n; }
    return 48;
  }

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

    const limit  = this.getLimit();
    const vc     = this.getViewConfig();
    const list   = this.containerEl.createDiv("bfv-list");

    // Group by
    const groupByRaw = vc?.groupBy as Record<string, unknown> | null | undefined;
    const groupProp  = groupByRaw?.property ? String(groupByRaw.property).replace(/^note\./, "") : null;
    const groupDir   = groupByRaw?.direction && String(groupByRaw.direction).toUpperCase() === "DESC" ? "desc" : "asc";

    if (groupProp) {
      const buckets = new Map<string, BasesEntry[]>();
      for (const entry of entries) {
        const raw   = getEntryProp(entry, groupProp);
        const label = raw == null ? "—"
          : Array.isArray(raw) ? raw.map(v => String(v).replace(/^\[\[|\]\]$/g, "")).join(", ")
          : String(raw).replace(/^\[\[|\]\]$/g, "");
        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label)!.push(entry);
      }
      const sortedKeys = Array.from(buckets.keys()).sort((a, b) =>
        groupDir === "desc" ? b.localeCompare(a, undefined, { numeric: true }) : a.localeCompare(b, undefined, { numeric: true })
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

  private renderRow(list: HTMLElement, entry: BasesEntry) {
    const row = list.createDiv("bfv-row");
    row.style.setProperty("--bfv-thumb-size", `${this.getThumbSize()}px`);
    const coverProp = this.getCoverProp();
    this.renderThumb(row.createDiv("bfv-thumb"), entry, coverProp);
    const content = row.createDiv("bfv-content");
    const titleEl = content.createDiv("bfv-title");
    titleEl.setText(entry.file.basename);
    titleEl.addEventListener("click", () => this.obsApp.workspace.openLinkText(entry.file.path, "", false));
    const fm = entry.frontmatter ?? {};
    for (const [key, val] of Object.entries(fm)) {
      if (coverProp && key === coverProp) continue;
      if (HIDDEN_ALWAYS.has(key.toLowerCase())) continue;
      if (val == null || val === "") continue;
      this.renderProp(content, key, val);
    }
  }

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
  private renderProp(parent: HTMLElement, key: string, val: unknown) {
    const row = parent.createDiv("bfv-prop");
    row.createSpan({ cls: "bfv-prop-key", text: key });
    row.createSpan({ cls: "bfv-prop-sep", text: ": " });
    if (Array.isArray(val)) {
      const flat = val.map(v => String(v).replace(/^\[\[|\]\]$/g, "")).filter(Boolean);
      if (flat.length > 1) {
        const wrap = row.createSpan("bfv-tags");
        flat.forEach(t => wrap.createSpan({ cls: "bfv-tag", text: t }));
        return;
      }
      row.createSpan({ cls: "bfv-prop-val", text: flat.join(", ") });
      return;
    }
    row.createSpan({ cls: "bfv-prop-val", text: String(val).replace(/^\[\[|\]\]$/g, "") });
  }
  private resolveVaultImage(name: string, app: BasesEntry["app"]): TFile | null {
    let f = app.vault.getAbstractFileByPath(name);
    if (!f) f = app.vault.getFiles().find(x => x.name === name || x.basename === name) ?? null;
    return f instanceof TFile && ["png","jpg","jpeg","gif","webp","svg","bmp","avif"].includes(f.extension.toLowerCase()) ? f : null;
  }
}

function getEntryProp(entry: BasesEntry, prop: string): unknown {
  switch (prop) {
    case "file.name": case "name":       return entry.file.name;
    case "file.basename": case "basename": return entry.file.basename;
    case "file.path":  return entry.file.path;
    case "file.ext":   return entry.file.extension;
    case "file.size":  return (entry.file.stat as Record<string,unknown>)?.size  ?? 0;
    case "file.mtime": return (entry.file.stat as Record<string,unknown>)?.mtime ?? 0;
    case "file.ctime": return (entry.file.stat as Record<string,unknown>)?.ctime ?? 0;
  }
  const fm = entry.frontmatter ?? {};
  if (prop in fm) return fm[prop];
  const lower = prop.toLowerCase();
  for (const [k, v] of Object.entries(fm)) { if (k.toLowerCase() === lower) return v; }
  return undefined;
}

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

export default class FeedViewPlugin extends Plugin {
  onload() {
    // @ts-ignore
    this.registerBasesView("feed", {
      icon: "layout-list",
      label: "Feed",
      factory: (controller: unknown, containerEl: HTMLElement) =>
        new FeedView(this.app, controller, containerEl),
      options: (): ViewOption[] => [
        { type: "property", key: "coverProp", label: "Image property" },
        { type: "slider",   key: "thumbSize", label: "Image size", min: 32, max: 120, step: 4 },
      ],
    });
  }
  onunload() {}
}
