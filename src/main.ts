import { MarkdownView, Notice, Plugin, normalizePath } from "obsidian";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

import { DEFAULT_SETTINGS, NoteCapSettings, NoteCapSettingTab } from "./settings";
import { parseLine } from "./parser";
import { buildBullet } from "./formatter";
import { isNested } from "./nesting";
import { SpellChecker } from "./spellcheck";

/** True if the raw line is already a formatted Markdown bullet (- text or \t- text). */
function isAlreadyBullet(raw: string): boolean {
  const s = raw.trimStart();
  return s.startsWith("- ") || s.startsWith("* ");
}

export default class NoteCapPlugin extends Plugin {
  settings: NoteCapSettings;
  private spell = new SpellChecker();
  private lastPage: string | null = null;
  private ribbonIconEl: HTMLElement | null = null;
  private intervalHandle: number | null = null;
  /** Last raw line text processed (or skipped) in interval mode. */
  private lastIntervalLine = "\x00"; // sentinel so first real line is always checked

  async onload() {
    await this.loadSettings();

    // Load Hunspell dictionary if available.
    const dir = this.manifest.dir;
    if (dir) {
      const loaded = await this.spell.init(async (rel) => {
        const p = normalizePath(`${dir}/${rel}`);
        if (await this.app.vault.adapter.exists(p)) {
          return this.app.vault.adapter.read(p);
        }
        return null;
      });
      if (loaded) console.log("Note Capture: loaded en_US Hunspell dictionary.");
    }

    // Ribbon icon — shows active/inactive state.
    this.ribbonIconEl = this.addRibbonIcon(
      "book-open",
      "Note Capture",
      () => this.toggleCapture()
    );
    this.updateRibbonIcon();

    // Command: toggle capture on/off.
    this.addCommand({
      id: "toggle-capture",
      name: "Toggle capture on/off",
      callback: () => this.toggleCapture(),
    });

    // Keypress mode: intercept Enter at highest priority.
    this.registerEditorExtension(
      Prec.highest(keymap.of([{ key: "Enter", run: () => this.handleEnter() }]))
    );

    this.restartInterval();
    this.addSettingTab(new NoteCapSettingTab(this.app, this));
  }

  onunload() {
    this.clearInterval();
  }

  // ---- Public helpers called from settings tab --------------------------------

  updateRibbonIcon() {
    if (!this.ribbonIconEl) return;
    const on = this.settings.captureEnabled;
    this.ribbonIconEl.setAttribute("aria-label", `Note Capture (${on ? "on" : "off"})`);
    this.ribbonIconEl.style.opacity = on ? "1" : "0.4";
  }

  restartInterval() {
    this.clearInterval();
    if (this.settings.activationMode === "interval" && this.settings.captureEnabled) {
      this.intervalHandle = window.setInterval(
        () => this.intervalTick(),
        this.settings.intervalMs
      );
    }
  }

  // ---- Private ---------------------------------------------------------------

  private toggleCapture() {
    this.settings.captureEnabled = !this.settings.captureEnabled;
    this.saveSettings();
    this.updateRibbonIcon();
    this.restartInterval();
    new Notice(`Note Capture ${this.settings.captureEnabled ? "enabled" : "disabled"}`);
  }

  private clearInterval() {
    if (this.intervalHandle !== null) {
      window.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Interval mode: process the line ABOVE the cursor (the one the user just
   * committed by pressing Enter). Only fires if that line changed since the last
   * tick AND it is not already a formatted bullet.
   */
  private intervalTick() {
    if (!this.settings.captureEnabled) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const cursor = editor.getCursor();
    if (cursor.line === 0) return;

    const prevLineNo = cursor.line - 1;
    const raw = editor.getLine(prevLineNo);

    // Skip if unchanged since last tick (already processed, or user hasn't moved on).
    if (raw === this.lastIntervalLine) return;
    this.lastIntervalLine = raw;

    this.transformLine(editor, prevLineNo, raw);
  }

  /** Called on Enter in keypress mode. Returns true to consume the event. */
  private handleEnter(): boolean {
    if (!this.settings.captureEnabled) return false;
    if (this.settings.activationMode !== "keypress") return false;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    const editor = view.editor;
    const cursor = editor.getCursor();
    const raw = editor.getLine(cursor.line);

    return this.transformLine(editor, cursor.line, raw);
  }

  private transformLine(
    editor: import("obsidian").Editor,
    lineNo: number,
    raw: string
  ): boolean {
    // Safety guard: never re-process an already-formatted bullet.
    if (isAlreadyBullet(raw)) return false;

    const parsed = parseLine(raw, this.settings.delimiter, this.settings.delimiterMode);
    if (!parsed) return false;

    // Resolve page via sticky.
    let page = parsed.page;
    if (page === null) {
      if (this.settings.stickyPage && this.lastPage !== null) {
        page = this.lastPage;
      } else {
        return false;
      }
    }

    let text = parsed.text;
    if (text.length === 0) return false;

    // Spell check.
    const flags: { word: string; suggestion: string | null }[] = [];
    if (this.settings.spellcheckEnabled) {
      const result = this.spell.check(text);
      if (this.settings.correctionMode === "autocorrect") {
        text = result.corrected;
      } else {
        flags.push(...result.flags);
      }
    }

    // Nesting: an indented raw line becomes a sub-bullet.
    const nested = isNested(raw);

    const bullet = buildBullet(
      text,
      page,
      this.settings.pageTemplate,
      nested,
      this.settings.subBulletIndent
    );

    editor.replaceRange(
      bullet + "\n",
      { line: lineNo, ch: 0 },
      { line: lineNo, ch: raw.length }
    );
    editor.setCursor({ line: lineNo + 1, ch: 0 });

    // Update interval guard to the new bullet so subsequent ticks skip it.
    this.lastIntervalLine = bullet;
    this.lastPage = page;

    if (flags.length > 0) {
      const list = flags
        .map((f) => (f.suggestion ? `${f.word} → ${f.suggestion}` : `${f.word} (?)`))
        .join(", ");
      new Notice(`Note Capture — possible misspellings: ${list}`);
    }

    return true;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
