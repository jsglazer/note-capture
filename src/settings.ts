import { App, PluginSettingTab, Setting } from "obsidian";
import type NoteCapPlugin from "./main";

export type CorrectionMode = "autocorrect" | "flag";

export interface NoteCapSettings {
  /** Delimiter that separates the page number from the note text, e.g. "|". */
  delimiter: string;
  /** Time window (ms) within which a following Enter nests the line as a sub-bullet. */
  subBulletWindowMs: number;
  /** What to do with misspellings: fix them inline, or just flag them. */
  correctionMode: CorrectionMode;
  /** Reuse the last page number when a line omits it. */
  stickyPage: boolean;
  /** Template for the appended page reference; ${page} is substituted. */
  pageTemplate: string;
  /** Run the local spell checker on each committed line. */
  spellcheckEnabled: boolean;
  /** Indent prepended to a sub-bullet line. */
  subBulletIndent: string;

  // ---- Reserved for v1.1+ (optional on-demand Claude API grammar/fact-check) ----
  llmEnabled: boolean;
  llmApiKey: string;
  llmModel: string;
}

export const DEFAULT_SETTINGS: NoteCapSettings = {
  delimiter: "|",
  subBulletWindowMs: 1500,
  correctionMode: "flag",
  stickyPage: true,
  pageTemplate: "(${page})",
  spellcheckEnabled: true,
  subBulletIndent: "\t",
  llmEnabled: false,
  llmApiKey: "",
  llmModel: "claude-haiku-4-5-20251001",
};

export class NoteCapSettingTab extends PluginSettingTab {
  plugin: NoteCapPlugin;

  constructor(app: App, plugin: NoteCapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "NoteCap" });
    containerEl.createEl("p", {
      text: "Type a page number, a delimiter, then your note, and press Enter. " +
        'NoteCap turns it into "- your note (page)".',
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Delimiter")
      .setDesc('Separates the page number from the text. Example with "|": 42 | the author argues X')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.delimiter)
          .onChange(async (v) => {
            this.plugin.settings.delimiter = v.trim() || "|";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sub-bullet window (ms)")
      .setDesc(
        "If you press Enter again within this many milliseconds, the next line nests as a " +
          "sub-bullet. A longer pause starts a new top-level bullet."
      )
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.subBulletWindowMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0) {
              this.plugin.settings.subBulletWindowMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Sticky page")
      .setDesc("Reuse the last page number when a line starts with just the delimiter (no number).")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.stickyPage)
          .onChange(async (v) => {
            this.plugin.settings.stickyPage = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Page reference format")
      .setDesc('How the page is appended. Use ${page} as a placeholder. Default: (${page})')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.pageTemplate)
          .onChange(async (v) => {
            this.plugin.settings.pageTemplate = v || "(${page})";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Spell check")
      .setDesc("Check each committed line with the local spell checker.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.spellcheckEnabled)
          .onChange(async (v) => {
            this.plugin.settings.spellcheckEnabled = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Correction mode")
      .setDesc("Auto-correct fixes misspellings inline. Flag leaves them and shows a notice instead.")
      .addDropdown((d) =>
        d
          .addOption("autocorrect", "Auto-correct inline")
          .addOption("flag", "Flag for review")
          .setValue(this.plugin.settings.correctionMode)
          .onChange(async (v) => {
            this.plugin.settings.correctionMode = v as CorrectionMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sub-bullet indent")
      .setDesc('Whitespace prepended to a nested line. Use "tab" for a tab or e.g. "  " for spaces.')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.subBulletIndent === "\t" ? "tab" : this.plugin.settings.subBulletIndent)
          .onChange(async (v) => {
            this.plugin.settings.subBulletIndent = v === "tab" ? "\t" : v;
            await this.plugin.saveSettings();
          })
      );
  }
}
