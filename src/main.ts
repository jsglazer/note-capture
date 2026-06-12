import { MarkdownView, Notice, Plugin, normalizePath } from "obsidian";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

import { DEFAULT_SETTINGS, NoteCapSettings, NoteCapSettingTab } from "./settings";
import { parseLine } from "./parser";
import { buildBullet } from "./formatter";
import { isNested } from "./nesting";
import { SpellChecker } from "./spellcheck";

interface CaptureState {
  lastEnterTime: number;
  lastPage: string | null;
}

export default class NoteCapPlugin extends Plugin {
  settings: NoteCapSettings;
  private spell = new SpellChecker();
  private state: CaptureState = { lastEnterTime: 0, lastPage: null };

  async onload() {
    await this.loadSettings();

    // Load a Hunspell dictionary from the plugin folder if the user dropped one in.
    const dir = this.manifest.dir;
    if (dir) {
      const loaded = await this.spell.init(async (rel) => {
        const p = normalizePath(`${dir}/${rel}`);
        if (await this.app.vault.adapter.exists(p)) {
          return this.app.vault.adapter.read(p);
        }
        return null;
      });
      if (loaded) console.log("NoteCap: loaded en_US Hunspell dictionary.");
    }

    // Intercept Enter at highest precedence; we only handle NoteCap-shaped lines and
    // otherwise let the default newline behaviour run.
    this.registerEditorExtension(
      Prec.highest(keymap.of([{ key: "Enter", run: () => this.handleEnter() }]))
    );

    this.addSettingTab(new NoteCapSettingTab(this.app, this));
  }

  /** Returns true if NoteCap consumed the Enter (line transformed); false to pass through. */
  private handleEnter(): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;

    const editor = view.editor;
    const cursor = editor.getCursor();
    const lineNo = cursor.line;
    const raw = editor.getLine(lineNo);

    const parsed = parseLine(raw, this.settings.delimiter);
    if (!parsed) return false;

    // Resolve the page, applying the sticky-page rule when the number is omitted.
    let page = parsed.page;
    if (page === null) {
      if (this.settings.stickyPage && this.state.lastPage !== null) {
        page = this.state.lastPage;
      } else {
        return false; // no page to use — treat as an ordinary line
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

    // Decide nesting from how quickly this line followed the previous one.
    const now = Date.now();
    const nested = isNested(now, this.state.lastEnterTime, this.settings.subBulletWindowMs);

    const bullet = buildBullet(
      text,
      page,
      this.settings.pageTemplate,
      nested,
      this.settings.subBulletIndent
    );

    // Replace the whole current line with the bullet, add a newline, move to the next line.
    editor.replaceRange(
      bullet + "\n",
      { line: lineNo, ch: 0 },
      { line: lineNo, ch: raw.length }
    );
    editor.setCursor({ line: lineNo + 1, ch: 0 });

    this.state.lastEnterTime = now;
    this.state.lastPage = page;

    if (flags.length > 0) {
      const list = flags
        .map((f) => (f.suggestion ? `${f.word} → ${f.suggestion}` : `${f.word} (?)`))
        .join(", ");
      new Notice(`NoteCap — possible misspellings: ${list}`);
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
