import { App, PluginSettingTab, Setting } from 'obsidian';
import type NoteCapPlugin from './main';
import type { DelimiterMode } from './parser';
import {
	isNoteToolbarAvailable,
	itemDisplayName,
	listHighlightableItems,
	listToolbars,
} from './toolbarHighlight';

export type { DelimiterMode };
export type CorrectionMode = 'autocorrect' | 'flag';
export type ActivationMode = 'keypress' | 'interval';

/** One color override plus whether it's actually applied (an unchecked color is ignored). */
export interface ColorOption {
	enabled: boolean;
	color: string;
}

/** Foreground (text) + background color pair for one theme (light or dark). */
export interface ToolbarHighlightThemeColors {
	fg: ColorOption;
	bg: ColorOption;
}

export interface ToolbarHighlightFormat {
	light: ToolbarHighlightThemeColors;
	dark: ToolbarHighlightThemeColors;
}

function colorOption(enabled: boolean, color: string): ColorOption {
	return { enabled, color };
}

export interface NoteCapSettings {
	/** Whether the plugin is actively transforming lines. */
	captureEnabled: boolean;
	/** How the plugin triggers: on Enter keypress, or on a periodic interval scan. */
	activationMode: ActivationMode;
	/** Polling interval in ms when activationMode === "interval". */
	intervalMs: number;
	/**
	 * Controls whether a delimiter is required between the page number and note text.
	 *   "required" — "84/note"         (page + delimiter + text)
	 *   "optional" — "84/note" or "84note" (delimiter optional)
	 *   "none"     — "84note"          (no delimiter; page directly adjacent to text)
	 */
	delimiterMode: DelimiterMode;
	/** Delimiter separating page from text (ignored when delimiterMode === "none"). */
	delimiter: string;
	/** What to do with misspellings: fix them inline, or just flag them. */
	correctionMode: CorrectionMode;
	/** Reuse the last page when a line has only the delimiter (e.g. "/note"). */
	stickyPage: boolean;
	/** Template for the appended page reference; ${page} is substituted. */
	pageTemplate: string;
	/** Run the local spell checker on each committed line. */
	spellcheckEnabled: boolean;
	/** Indent prepended to a sub-bullet line in the output. */
	subBulletIndent: string;
	/** Text prepended before the page number in the reference. e.g. "Smith, " → (Smith, 42). */
	pagePrefix: string;
	/** Log capture decisions to the developer console (Ctrl/Cmd-Shift-I). */
	debugLogging: boolean;
	/**
	 * Last page seen, persisted so "sticky" (e.g. "/note") survives a reload.
	 * Internal state, not exposed in the settings UI.
	 */
	stickyLastPage: string | null;

	/**
	 * Note Toolbar (https://github.com/chrisgurney/obsidian-note-toolbar) integration:
	 * highlight one toolbar item while capture is active. Empty uuid = not configured.
	 */
	toolbarHighlightToolbarUuid: string;
	toolbarHighlightItemUuid: string;
	toolbarHighlightFormat: ToolbarHighlightFormat;

	// ---- Reserved for v1.1+ (optional on-demand Claude API grammar/fact-check) ----
	llmEnabled: boolean;
	llmApiKey: string;
	llmModel: string;
}

export const DEFAULT_SETTINGS: NoteCapSettings = {
	captureEnabled: true,
	activationMode: 'keypress',
	intervalMs: 2000,
	delimiterMode: 'required',
	delimiter: '/',
	correctionMode: 'flag',
	stickyPage: true,
	pageTemplate: '(${page})',
	spellcheckEnabled: true,
	subBulletIndent: '\t',
	pagePrefix: '',
	debugLogging: false,
	stickyLastPage: null,
	toolbarHighlightToolbarUuid: '',
	toolbarHighlightItemUuid: '',
	toolbarHighlightFormat: {
		light: {
			fg: colorOption(false, ''),
			bg: colorOption(true, '#c8e6c9'),
		},
		dark: {
			fg: colorOption(false, ''),
			bg: colorOption(true, '#2e5d33'),
		},
	},
	llmEnabled: false,
	llmApiKey: '',
	llmModel: 'claude-haiku-4-5-20251001',
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

		// Source / issues link.
		const linkRow = containerEl.createEl('p', { cls: 'note-capture-repo-link' });
		linkRow.createEl('a', {
			text: 'GitHub repository',
			href: 'https://github.com/jsglazer/note-capture',
		});
		linkRow.appendText(` — v${this.plugin.manifest.version}`);

		containerEl.createEl('p', {
			text:
				'Type a page number, a delimiter, then your note, and press Enter. ' +
				'Note Capture turns it into "- your note (page)". ' +
				'Indent the line (Tab or Space) before typing to create a sub-bullet.',
			cls: 'setting-item-description',
		});

		// ---- Activation ----------------------------------------------------------
		new Setting(containerEl).setName('Activation').setHeading();

		new Setting(containerEl)
			.setName('Enable capture')
			.setDesc(
				'Turn Note Capture on or off without disabling the plugin. ' +
					'Also toggled via the ribbon icon and the command palette.',
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.captureEnabled).onChange(async (v) => {
					this.plugin.settings.captureEnabled = v;
					await this.plugin.saveSettings();
					this.plugin.updateRibbonIcon();
				}),
			);

		new Setting(containerEl)
			.setName('Activation mode')
			.setDesc(
				'"Keypress" transforms a line when you press Enter. ' +
					'"Interval" transforms a line you have typed on once you pause, ' +
					'or as soon as you move off it (including by pressing Enter). ' +
					'Lines you have not typed on are never touched.',
			)
			.addDropdown((d) =>
				d
					.addOption('keypress', 'Keypress (Enter)')
					.addOption('interval', 'Interval (timer)')
					.setValue(this.plugin.settings.activationMode)
					.onChange(async (v) => {
						this.plugin.settings.activationMode = v as ActivationMode;
						await this.plugin.saveSettings();
						this.plugin.restartInterval();
						// Re-render to show/hide the interval field. display() is the
						// established re-render idiom for settings tabs.
						// eslint-disable-next-line @typescript-eslint/no-deprecated
						this.display();
					}),
			);

		if (this.plugin.settings.activationMode === 'interval') {
			new Setting(containerEl)
				.setName('Interval (ms)')
				.setDesc('How often to scan when using interval mode. Minimum 200 ms.')
				.addText((t) =>
					t.setValue(String(this.plugin.settings.intervalMs)).onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!isNaN(n) && n >= 200) {
							this.plugin.settings.intervalMs = n;
							await this.plugin.saveSettings();
							this.plugin.restartInterval();
						}
					}),
				);
		}

		// ---- Input ---------------------------------------------------------------
		new Setting(containerEl).setName('Input').setHeading();

		new Setting(containerEl)
			.setName('Delimiter mode')
			.setDesc(
				'"Required": delimiter must be present (84/note). ' +
					'"Optional": both 84/note and 84note work. ' +
					'"None": no delimiter — page directly adjacent to text (84note only).',
			)
			.addDropdown((d) =>
				d
					.addOption('required', 'Required (84/note)')
					.addOption('optional', 'Optional (84/note or 84note)')
					.addOption('none', 'None (84note only)')
					.setValue(this.plugin.settings.delimiterMode)
					.onChange(async (v) => {
						this.plugin.settings.delimiterMode = v as DelimiterMode;
						await this.plugin.saveSettings();
						// Re-render to show/hide the delimiter field. display() is the
						// established re-render idiom for settings tabs.
						// eslint-disable-next-line @typescript-eslint/no-deprecated
						this.display();
					}),
			);

		if (this.plugin.settings.delimiterMode !== 'none') {
			new Setting(containerEl)
				.setName('Delimiter')
				.setDesc(
					'Separates the page number from the text. Default: /  ' +
						'Example: 42/the author argues X',
				)
				.addText((t) =>
					t.setValue(this.plugin.settings.delimiter).onChange(async (v) => {
						this.plugin.settings.delimiter = v || '/';
						await this.plugin.saveSettings();
					}),
				);
		}

		new Setting(containerEl)
			.setName('Sticky page')
			.setDesc(
				'When on, typing just the delimiter + text (e.g. "/note") reuses the last page. ' +
					'Only available when delimiter mode is Required or Optional.',
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.stickyPage).onChange(async (v) => {
					this.plugin.settings.stickyPage = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Page reference format')
			.setDesc('How the page is appended. Use ${page} as a placeholder. Default: (${page})')
			.addText((t) =>
				t.setValue(this.plugin.settings.pageTemplate).onChange(async (v) => {
					this.plugin.settings.pageTemplate = v || '(${page})';
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Sub-bullet indent')
			.setDesc('Whitespace prepended to nested lines in the output. Use "tab" for a tab or spaces.')
			.addText((t) =>
				t
					.setValue(
						this.plugin.settings.subBulletIndent === '\t'
							? 'tab'
							: this.plugin.settings.subBulletIndent,
					)
					.onChange(async (v) => {
						this.plugin.settings.subBulletIndent = v === 'tab' ? '\t' : v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Page prefix')
			.setDesc(
				'Text inserted before the page number in the reference. ' +
					'Example: "Smith, " → (Smith, 123). Leave blank for none. ' +
					'Also prompted each time capture is turned on.',
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.pagePrefix)
					.setPlaceholder('e.g. Smith, ')
					.onChange(async (v) => {
						this.plugin.settings.pagePrefix = v;
						await this.plugin.saveSettings();
					}),
			);

		// ---- Spell check ---------------------------------------------------------
		new Setting(containerEl).setName('Spell check').setHeading();

		new Setting(containerEl)
			.setName('Spell check')
			.setDesc('Check each committed line with the local spell checker.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.spellcheckEnabled).onChange(async (v) => {
					this.plugin.settings.spellcheckEnabled = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Correction mode')
			.setDesc(
				'Auto-correct fixes misspellings inline. Flag leaves them and shows a notice instead.',
			)
			.addDropdown((d) =>
				d
					.addOption('autocorrect', 'Auto-correct inline')
					.addOption('flag', 'Flag for review')
					.setValue(this.plugin.settings.correctionMode)
					.onChange(async (v) => {
						this.plugin.settings.correctionMode = v as CorrectionMode;
						await this.plugin.saveSettings();
					}),
			);

		// ---- Note Toolbar highlight -----------------------------------------------
		this.displayToolbarHighlightSection(containerEl);

		// ---- Diagnostics ---------------------------------------------------------
		new Setting(containerEl).setName('Diagnostics').setHeading();

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc(
				'Log every capture decision to the developer console ' +
					'(Cmd/Ctrl-Shift-I). Use this to see why a line was or was not transformed.',
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.debugLogging).onChange(async (v) => {
					this.plugin.settings.debugLogging = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Sticky page')
			.setDesc(
				this.plugin.settings.stickyLastPage === null
					? 'No page remembered yet — type a line with a page number first.'
					: `Remembered page: ${this.plugin.settings.stickyLastPage}`,
			)
			.addButton((b) =>
				b.setButtonText('Clear').onClick(async () => {
					this.plugin.settings.stickyLastPage = null;
					await this.plugin.saveSettings();
					// display() is the established re-render idiom for settings tabs.
					// eslint-disable-next-line @typescript-eslint/no-deprecated
					this.display();
				}),
			);
	}

	/**
	 * Highlights one Note Toolbar (https://github.com/chrisgurney/obsidian-note-toolbar) item
	 * while capture is active. Reads that plugin's toolbars directly — there is no public API
	 * for this — so the dropdowns simply disappear if it is not installed or enabled.
	 */
	private displayToolbarHighlightSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Note Toolbar highlight').setHeading();

		if (!isNoteToolbarAvailable(this.app)) {
			containerEl.createEl('p', {
				text:
					'Install and enable the Note Toolbar plugin to highlight one of its items ' +
					'while capture is active.',
				cls: 'setting-item-description',
			});
			return;
		}

		const toolbars = listToolbars(this.app);
		const toolbarUuid = this.plugin.settings.toolbarHighlightToolbarUuid;

		new Setting(containerEl)
			.setName('Toolbar')
			.setDesc('Toolbar containing the item to highlight while capture is active.')
			.addDropdown((d) => {
				d.addOption('', '— None (disabled) —');
				for (const t of toolbars) d.addOption(t.uuid, t.name);
				d.setValue(toolbarUuid).onChange(async (v) => {
					this.plugin.settings.toolbarHighlightToolbarUuid = v;
					this.plugin.settings.toolbarHighlightItemUuid = '';
					await this.plugin.saveSettings();
					this.plugin.refreshToolbarHighlight();
					// Re-render so the Item dropdown reflects the newly chosen toolbar.
					// eslint-disable-next-line @typescript-eslint/no-deprecated
					this.display();
				});
			});

		if (toolbarUuid) {
			const items = listHighlightableItems(this.app, toolbarUuid);
			new Setting(containerEl)
				.setName('Item')
				.setDesc('Item within that toolbar to highlight.')
				.addDropdown((d) => {
					d.addOption('', '— None —');
					for (const i of items) d.addOption(i.uuid, itemDisplayName(i));
					d.setValue(this.plugin.settings.toolbarHighlightItemUuid).onChange(async (v) => {
						this.plugin.settings.toolbarHighlightItemUuid = v;
						await this.plugin.saveSettings();
						this.plugin.refreshToolbarHighlight();
					});
				});

			if (items.length === 0) {
				containerEl.createEl('p', {
					text: 'That toolbar has no items that can be highlighted.',
					cls: 'setting-item-description',
				});
			}
		}

		containerEl.createEl('p', {
			text:
				'Colors applied to the highlighted item while capture is active ' +
				'(installed, enabled, and turned on). Light and dark match the current Obsidian theme.',
			cls: 'setting-item-description',
		});

		this.renderColorRow(
			containerEl,
			'Light theme — background',
			this.plugin.settings.toolbarHighlightFormat.light.bg,
			(next) => (this.plugin.settings.toolbarHighlightFormat.light.bg = next),
		);
		this.renderColorRow(
			containerEl,
			'Light theme — text',
			this.plugin.settings.toolbarHighlightFormat.light.fg,
			(next) => (this.plugin.settings.toolbarHighlightFormat.light.fg = next),
		);
		this.renderColorRow(
			containerEl,
			'Dark theme — background',
			this.plugin.settings.toolbarHighlightFormat.dark.bg,
			(next) => (this.plugin.settings.toolbarHighlightFormat.dark.bg = next),
		);
		this.renderColorRow(
			containerEl,
			'Dark theme — text',
			this.plugin.settings.toolbarHighlightFormat.dark.fg,
			(next) => (this.plugin.settings.toolbarHighlightFormat.dark.fg = next),
		);
	}

	/** One "enable + color" row shared by the four light/dark, background/text combinations. */
	private renderColorRow(
		containerEl: HTMLElement,
		name: string,
		option: ColorOption,
		apply: (next: ColorOption) => void,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc('Off leaves this to Note Toolbar/theme defaults.')
			.addToggle((t) =>
				t.setValue(option.enabled).onChange(async (v) => {
					apply({ ...option, enabled: v });
					await this.plugin.saveSettings();
					this.plugin.refreshToolbarHighlight();
				}),
			)
			.addColorPicker((c) =>
				c.setValue(option.color || '#000000').onChange(async (v) => {
					apply({ ...option, color: v });
					await this.plugin.saveSettings();
					this.plugin.refreshToolbarHighlight();
				}),
			);
	}
}
