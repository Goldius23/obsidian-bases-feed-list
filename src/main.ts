import { Plugin, Component, TFile, setIcon, App } from "obsidian";

interface BasesEntry {
  file: TFile;
  frontmatter: Record<string, unknown>;
  note: { icon: string; data: Record<string, unknown> };
  app: { vault: { getAbstractFileByPath: (p: string) => unknown; getFiles: () => TFile[]; getResourcePath: (f: TFile) => string } };
}

const HIDDEN_ALWAYS = new Set(["title", "aliases", "cssclasses", "cssclass"]);

class FeedView extends Component {
  private obsApp: App;
  private controller: Record<string, unknown>;
  private containerEl: HTMLElement;
  private coverProp = "Cover";

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

  onDataUpdated() { this.render(); }
  onResize() {}
  getEphemeralState() { return {}; }
  setEphemeralState(_s: unknown) {}
  getViewActions() { return []; }
  onunload() { this.containerEl.empty(); }

  getLimit(): number | null {
    const vc = this.getViewConfig();
    const l = vc?.limit;
    return typeof l === "number" && l > 0 ? l : null;
  }

  getQuery(): unknown { return this.controller.query ?? null; }
  saveQuery(): void { (this.controller.saveQuery as (() => void) | undefined)?.(); }
  getVisibleProperties(): string[] { return []; }
  togglePropertyVisibility(_p: unknown): void { this.render(); }

  private getViewConfig(): Record<string, unknown> | null {
    if (typeof this.controller.getViewConfig === "function") {
      try { return (this.controller.getViewConfig as () => Record<string, unknown>)(); }
      catch { return null; }
    }
    return null;
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

    const limit = this.getLimit();
    let count = 0;
    const list = this.containerEl.createDiv("bfv-list");
    for (const [, entry] of results) {
      if (limit !== null && count >= limit) break;
      this.renderRow(list, entry);
      count++;
    }
  }

  private renderRow(list: HTMLElement, entry: BasesEntry) {
    const row = list.createDiv("bfv-row");
    this.renderThumb(row.createDiv("bfv-thumb"), entry);
    const content = row.createDiv("bfv-content");
    const titleEl = content.createDiv("bfv-title");
    titleEl.setText(entry.file.basename);
    titleEl.addEventListener("click", () => {
      this.obsApp.workspace.openLinkText(entry.file.path, "", false);
    });
    const fm = entry.frontmatter ?? {};
    for (const [key, val] of Object.entries(fm)) {
      if (key === this.coverProp) continue;
      if (HIDDEN_ALWAYS.has(key.toLowerCase())) continue;
      if (val == null || val === "") continue;
      this.renderProp(content, key, val);
    }
  }

  private renderThumb(parent: HTMLElement, entry: BasesEntry) {
    const raw = entry.frontmatter?.[this.coverProp];
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

export default class FeedViewPlugin extends Plugin {
  onload() {
    // @ts-ignore
    this.registerBasesView("feed", {
      icon: "layout-list",
      label: "Feed",
      factory: (controller: unknown, containerEl: HTMLElement) =>
        new FeedView(this.app, controller, containerEl),
    });
  }
  onunload() {}
}
