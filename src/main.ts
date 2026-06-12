import { MarkdownView, Notice, Plugin, normalizePath } from "obsidian";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

import { DEFAULT_SETTINGS, NoteCapSettings, NoteCapSettingTab } from "./settings";
import { parseLine } from "./parser";
import { buildBullet } from "./formatter";
import { isNested } from "./nesting";
import { SpellChecker } from "./spellcheck";

export default class NoteCapPlugin extends Plugin {
  settings: NoteCapSettings;
  private spell = new SpellChecker();
  private lastPage: string | null = null;
  private ribbonIconEl: HTMLElement | null = null;
  private intervalHandle: number | null = null;
  /** Tracks the last line text seen in interval mode to avoid re-processing. */
  private lastIntervalLine = "";

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
      this.settings.captureEnabled ? "book-open" : "book",
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

    // Keypress mode: intercept Enter.
    this.registerEditorExtension(
      Prec.highest(keymap.of([{ key: "Enter", run: () => this.handleLine() }]))
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
    // Visually dim the icon when disabled.
    this.ribbonIconEl.style.opacity = on ? "1" : "0.4";
  }

  restartInterval() {
    this.clearInterval();
    if (
      this.settings.activationMode === "interval" &&
      this.settings.captureEnabled
    ) {
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
   * Interval mode: scan the active line. We commit a line only when it looks like
   * a Note Capture entry AND the cursor has moved away from it (i.e. the line text
   * hasn't changed since the last tick — the user has pressed Enter and moved on).
   * This avoids partially-typed lines being transformed mid-entry.
   */
  private intervalTick() {
    if (!this.settings.captureEnabled) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;
    const cursor = editor.getCursor();
    const lineNo = cursor.line;
    // Only process the line ABOVE the cursor (the one just committed by Enter).
    if (lineNo === 0) return;
    const prevLineNo = lineNo - 1;
    const raw = editor.getLine(prevLineNo);
    if (raw === this.lastIntervalLine) return; // already processed or unchanged
    this.lastIntervalLine = raw;
    this.transformLine(editor, prevLineNo, raw);
  }

  /** Called on Enter in keypress mode. Returns true to consume the event. */
  private handleLine(): boolean {
    if (!this.settings.captureEnabled) return false;
    if (this.settings.activationMode !== "keypress") return false;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    const editor = view.editor;
    const cursor = editor.getCursor();
    const lineNo = cursor.line;
    const raw = editor.getLine(lineNo);

    return this.transformLine(editor, lineNo, raw);
  }

  private transformLine(
    editor: import("obsidian").Editor,
    lineNo: number,
    raw: string
  ): boolean {
    const delim = this.settings.emptyDelimiter ? "" : this.settings.delimiter;
    const parsed = parseLine(raw, delim, this.settings.stickyPage);
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

    // Nesting: indent on the raw line signals sub-bullet.
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
