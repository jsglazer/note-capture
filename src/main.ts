import { MarkdownView, Modal, Notice, Plugin, Setting, normalizePath } from 'obsidian';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';

import { DEFAULT_SETTINGS, NoteCapSettings, NoteCapSettingTab } from './settings';
import { parseLine } from './parser';
import { buildBullet } from './formatter';
import { isNested } from './nesting';
import { SpellChecker } from './spellcheck';

/** Modal prompting for the page prefix each time capture is turned on. */
class PrefixModal extends Modal {
	private value: string;
	private readonly onSubmit: (prefix: string) => void;
	private readonly onCancel: () => void;

	constructor(
		app: import('obsidian').App,
		currentPrefix: string,
		onSubmit: (prefix: string) => void,
		onCancel: () => void,
	) {
		super(app);
		this.value = currentPrefix;
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'Note Capture — Page prefix' });
		contentEl.createEl('p', {
			text: 'Text inserted before the page number. Example: "Smith, " → (Smith, 123). Leave blank for none.',
			cls: 'setting-item-description',
		});

		let inputEl: HTMLInputElement | undefined;

		new Setting(contentEl).setName('Prefix').addText((t) => {
			t.setValue(this.value)
				.setPlaceholder('e.g. Smith, ')
				.onChange((v) => {
					this.value = v;
				});
			inputEl = t.inputEl;
			inputEl.style.width = '100%';
		});

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText('OK')
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.value);
					}),
			)
			.addButton((b) =>
				b.setButtonText('Cancel').onClick(() => {
					this.close();
					this.onCancel();
				}),
			);

		// Focus input; wire Enter key to confirm.
		window.setTimeout(() => {
			if (!inputEl) return;
			inputEl.focus();
			inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					this.close();
					this.onSubmit(this.value);
				}
			});
		}, 50);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** True if the raw line is already a formatted Markdown bullet (- text or \t- text). */
function isAlreadyBullet(raw: string): boolean {
	const s = raw.trimStart();
	return s.startsWith('- ') || s.startsWith('* ');
}

export default class NoteCapPlugin extends Plugin {
	settings: NoteCapSettings;
	private spell = new SpellChecker();
	private lastPage: string | null = null;
	private ribbonIconEl: HTMLElement | null = null;
	private intervalHandle: number | null = null;

	// Interval-mode: track cursor + line across ticks to detect "user paused".
	private prevTickLine = -1;
	private prevTickCh = -1;
	private prevTickRaw = '\x00';

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
			if (loaded) console.log('Note Capture: loaded en_US Hunspell dictionary.');
		}

		// Ribbon icon — shows active/inactive state.
		this.ribbonIconEl = this.addRibbonIcon('book-open', 'Note Capture', () => this.toggleCapture());
		this.updateRibbonIcon();

		// Command: toggle capture on/off.
		this.addCommand({
			id: 'toggle-capture',
			name: 'Toggle capture on/off',
			callback: () => this.toggleCapture(),
		});

		// Keypress mode: intercept Enter at highest priority.
		this.registerEditorExtension(
			Prec.highest(keymap.of([{ key: 'Enter', run: () => this.handleEnter() }])),
		);

		this.restartInterval();
		this.addSettingTab(new NoteCapSettingTab(this.app, this));
	}

	onunload() {
		this.stopInterval();
	}

	// ---- Public helpers called from settings tab --------------------------------

	updateRibbonIcon() {
		if (!this.ribbonIconEl) return;
		const on = this.settings.captureEnabled;
		this.ribbonIconEl.setAttribute('aria-label', `Note Capture (${on ? 'on' : 'off'})`);
		this.ribbonIconEl.style.opacity = on ? '1' : '0.4';
	}

	restartInterval() {
		this.stopInterval();
		if (this.settings.activationMode === 'interval' && this.settings.captureEnabled) {
			// Use this.registerInterval so Obsidian tracks it for cleanup on unload.
			this.intervalHandle = this.registerInterval(
				window.setInterval(() => this.intervalTick(), this.settings.intervalMs),
			);
			this.resetIntervalTracking();
		}
	}

	// ---- Private ---------------------------------------------------------------

	private stopInterval() {
		if (this.intervalHandle !== null) {
			window.clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}
	}

	private resetIntervalTracking() {
		this.prevTickLine = -1;
		this.prevTickCh = -1;
		this.prevTickRaw = '\x00';
	}

	private toggleCapture() {
		if (this.settings.captureEnabled) {
			// Turning OFF.
			this.settings.captureEnabled = false;
			this.saveSettings();
			this.updateRibbonIcon();
			this.stopInterval();
			new Notice('Note Capture disabled');
		} else {
			// Turning ON: ask for prefix first.
			new PrefixModal(
				this.app,
				this.settings.pagePrefix,
				async (prefix) => {
					this.settings.pagePrefix = prefix;
					this.settings.captureEnabled = true;
					await this.saveSettings();
					this.updateRibbonIcon();
					this.restartInterval();
					new Notice('Note Capture enabled');
				},
				() => {
					// User cancelled — leave capture off.
				},
			).open();
		}
	}

	/**
	 * Interval mode: transform the CURRENT line after the user pauses typing.
	 *
	 * On each tick, compare the cursor position and line content against the previous
	 * tick. If both are unchanged, the user has been idle for at least one full interval
	 * period — commit the line. This means: type your note, stop typing, and the plugin
	 * formats it automatically without pressing Enter.
	 */
	private intervalTick() {
		if (!this.settings.captureEnabled) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const editor = view.editor;
		const cursor = editor.getCursor();
		const raw = editor.getLine(cursor.line);

		const cursorStable = cursor.line === this.prevTickLine && cursor.ch === this.prevTickCh;
		const lineStable = raw === this.prevTickRaw;

		// Update tracking BEFORE potentially transforming (transform moves cursor).
		this.prevTickLine = cursor.line;
		this.prevTickCh = cursor.ch;
		this.prevTickRaw = raw;

		// Only act when cursor AND line are both unchanged since the last tick.
		if (!cursorStable || !lineStable) return;

		// Skip empty lines and already-formatted bullets.
		if (raw.trim().length === 0) return;

		if (this.transformLine(editor, cursor.line, raw)) {
			// Reset tracking after a successful transform so the new empty line is fresh.
			this.resetIntervalTracking();
		}
	}

	/** Called on Enter in keypress mode. Returns true to consume the event. */
	private handleEnter(): boolean {
		if (!this.settings.captureEnabled) return false;
		if (this.settings.activationMode !== 'keypress') return false;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return false;
		const editor = view.editor;
		const cursor = editor.getCursor();
		const raw = editor.getLine(cursor.line);

		return this.transformLine(editor, cursor.line, raw);
	}

	private transformLine(editor: import('obsidian').Editor, lineNo: number, raw: string): boolean {
		// Never re-process an already-formatted bullet.
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
			if (this.settings.correctionMode === 'autocorrect') {
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
			this.settings.subBulletIndent,
			this.settings.pagePrefix,
		);

		editor.replaceRange(bullet + '\n', { line: lineNo, ch: 0 }, { line: lineNo, ch: raw.length });
		editor.setCursor({ line: lineNo + 1, ch: 0 });

		this.lastPage = page;

		if (flags.length > 0) {
			const list = flags
				.map((f) => (f.suggestion ? `${f.word} → ${f.suggestion}` : `${f.word} (?)`))
				.join(', ');
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
