import { Plugin } from "obsidian";

export default class FeedViewPlugin extends Plugin {
  onload() {
    // registerBasesView will be called here once the view is implemented
    console.log("[FeedView] plugin loaded");
  }
  onunload() {}
}
