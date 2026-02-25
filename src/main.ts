/**
 * Debug prototype — used to discover the Bases view API shape.
 *
 * Key discoveries:
 * - View must extend Component to satisfy Bases lifecycle (load, unload, onResize etc.)
 * - Data lives in controller.results as a Map<TFile, entry>
 * - onDataUpdated() is called with no arguments; always read from controller.results
 * - Entry shape: { file, frontmatter, note: { icon }, app: { vault } }
 */

import { Plugin, Component } from "obsidian";

class DebugFeedView extends Component {
  private controller: Record<string, unknown>;
  private containerEl: HTMLElement;
  private updateCount = 0;

  constructor(controller: unknown, containerEl: HTMLElement) {
    super();
    this.controller = controller as Record<string, unknown>;
    this.containerEl = containerEl;
  }

  onload() {
    this.containerEl.style.cssText =
      "padding:12px;overflow:auto;height:100%;font-family:monospace;font-size:11px;line-height:1.6";
    this.containerEl.setText("onload() — waiting for onDataUpdated...");
  }

  onDataUpdated() {
    this.updateCount++;
    const results = this.controller.results as Map<unknown, unknown> | undefined;
    this.containerEl.empty();
    const h = this.containerEl.createEl("h4", { text: `Feed debug — update #${this.updateCount}` });
    h.style.color = "var(--text-accent)";

    if (results instanceof Map) {
      this.containerEl.createEl("p", { text: `${results.size} results` });
      let i = 0;
      for (const [file, entry] of results) {
        if (i++ > 2) break;
        const pre = this.containerEl.createEl("pre");
        pre.style.cssText = "font-size:10px;white-space:pre-wrap;word-break:break-all";
        pre.setText(`${(file as Record<string,unknown>).name}\n${JSON.stringify(Object.keys(entry as object))}`);
      }
    }
  }

  onResize() {}
  getEphemeralState() { return {}; }
  setEphemeralState(_s: unknown) {}
  getViewActions() { return []; }
  onunload() { this.containerEl.empty(); }
}

export default class FeedViewPlugin extends Plugin {
  onload() {
    // @ts-ignore
    this.registerBasesView("feed", {
      icon: "layout-list",
      label: "Feed",
      factory: (controller: unknown, containerEl: HTMLElement) =>
        new DebugFeedView(controller, containerEl),
    });
  }
  onunload() {}
}
