import { App, PluginSettingTab, Setting } from "obsidian";
import type NoteCapPlugin from "./main";

export type CorrectionMode = "autocorrect" | "flag";
export type ActivationMode = "keypress" | "interval";

export interface NoteCapSettings {
  /** Whether the plugin is actively transforming lines. */
  captureEnabled: boolean;
  /** How the plugin triggers: on Enter keypress, or on a periodic interval scan. */
  activationMode: ActivationMode;
  /** Polling interval in ms when activationMode === "interval". */
  intervalMs: number;
  /** When true, parse "325Here is a note" with no delimiter required. */
  emptyDelimiter: boolean;
  /** Delimiter that separates the page number from the note text, e.g. "|". */
  delimiter: string;
  /** What to do with misspellings: fix them inline, or just flag them. */
  correctionMode: CorrectionMode;
  /** Reuse the last page when a new line has no page number and no delimiter. */
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
  captureEnabled: true,
  activationMode: "keypress",
  intervalMs: 2000,
  emptyDelimiter: false,
  delimiter: "|",
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

    containerEl.createEl("h2", { text: "Note Capture" });
    containerEl.createEl("p", {
      text:
        "Type a page number, a delimiter, then your note, and press Enter. " +
        'Note Capture turns it into "- your note (page)". ' +
        "Indent the line (Tab or Space) before typing to create a sub-bullet.",
      cls: "setting-item-description",
    });

    // ---- Activation ----------------------------------------------------------
    containerEl.createEl("h3", { text: "Activation" });

    new Setting(containerEl)
      .setName("Enable capture")
      .setDesc("Turn Note Capture on or off without disabling the plugin. Also toggled via the ribbon icon and the command palette.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.captureEnabled)
          .onChange(async (v) => {
            this.plugin.settings.captureEnabled = v;
            await this.plugin.saveSettings();
            this.plugin.updateRibbonIcon();
          })
      );

    new Setting(containerEl)
      .setName("Activation mode")
      .setDesc(
        '"Keypress" transforms a line when you press Enter. ' +
          '"Interval" scans the active line on a timer (useful when Enter is consumed by another plugin).'
      )
      .addDropdown((d) =>
        d
          .addOption("keypress", "Keypress (Enter)")
          .addOption("interval", "Interval (timer)")
          .setValue(this.plugin.settings.activationMode)
          .onChange(async (v) => {
            this.plugin.settings.activationMode = v as ActivationMode;
            await this.plugin.saveSettings();
            this.plugin.restartInterval();
            this.display(); // re-render to show/hide interval setting
          })
      );

    if (this.plugin.settings.activationMode === "interval") {
      new Setting(containerEl)
        .setName("Interval (ms)")
        .setDesc("How often to scan the current line when using interval mode.")
        .addText((t) =>
          t
            .setValue(String(this.plugin.settings.intervalMs))
            .onChange(async (v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 200) {
                this.plugin.settings.intervalMs = n;
                await this.plugin.saveSettings();
                this.plugin.restartInterval();
              }
            })
        );
    }

    // ---- Input ---------------------------------------------------------------
    containerEl.createEl("h3", { text: "Input" });

    new Setting(containerEl)
      .setName("No-delimiter mode")
      .setDesc(
        'Parse the page number directly adjacent to the text, e.g. "325Here is a note" → "- Here is a note (325)". ' +
          "When on, the Delimiter setting is ignored."
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.emptyDelimiter)
          .onChange(async (v) => {
            this.plugin.settings.emptyDelimiter = v;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (!this.plugin.settings.emptyDelimiter) {
      new Setting(containerEl)
        .setName("Delimiter")
        .setDesc('Separates the page number from the text. Example with "|": 42 | the author argues X')
        .addText((t) =>
          t
            .setValue(this.plugin.settings.delimiter)
            .onChange(async (v) => {
              this.plugin.settings.delimiter = v || "|";
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Sticky page")
      .setDesc(
        "When on, lines with no page number AND no delimiter reuse the last used page — " +
          'just type "next point" and it nests under the current page.'
      )
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
      .setName("Sub-bullet indent")
      .setDesc(
        'Whitespace prepended to nested lines in the output. Use "tab" for a tab or spaces.'
      )
      .addText((t) =>
        t
          .setValue(
            this.plugin.settings.subBulletIndent === "\t"
              ? "tab"
              : this.plugin.settings.subBulletIndent
          )
          .onChange(async (v) => {
            this.plugin.settings.subBulletIndent = v === "tab" ? "\t" : v;
            await this.plugin.saveSettings();
          })
      );

    // ---- Spell check ---------------------------------------------------------
    containerEl.createEl("h3", { text: "Spell check" });

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
      .setDesc(
        "Auto-correct fixes misspellings inline. Flag leaves them and shows a notice instead."
      )
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
  }
}
