import { MarkdownView, Modal, Notice, Plugin, Setting, normalizePath } from 'obsidian';
// @codemirror/* are provided by Obsidian at runtime and externalized by esbuild,
// so they are intentionally not project dependencies.
// eslint-disable-next-line import/no-extraneous-dependencies
import { keymap } from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Prec } from '@codemirror/state';

import { DEFAULT_SETTINGS, NoteCapSettings, NoteCapSettingTab } from './settings';
import { parseLine, splitBulletPrefix, isAlreadyFormatted } from './parser';
import { buildBullet, formatPage } from './formatter';
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
		contentEl.createEl('h3', { text: 'Note Capture — page prefix' });
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
			inputEl.addClass('note-capture-prefix-input');
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

export default class NoteCapPlugin extends Plugin {
	settings!: NoteCapSettings;
	private spell = new SpellChecker();
	private lastPage: string | null = null;
	private ribbonIconEl: HTMLElement | null = null;
	private intervalHandle: number | null = null;

	// Interval-mode: track cursor + line across ticks to detect "user paused".
	private prevTickLine = -1;
	private prevTickCh = -1;
	private prevTickRaw = '\x00';

	/**
	 * Interval-mode: lines the user has actually typed on, mapped to the text they
	 * left there. Only these lines are ever eligible for transformation, so parking
	 * the cursor in pre-existing prose can never rewrite it. The snapshot is checked
	 * against the live line before committing, so a line that shifted (or changed
	 * behind our back) is dropped instead of mis-transformed.
	 */
	private editedLines = new Map<number, string>();
	private editedPath: string | null = null;

	/** Throttle for the "no page yet" notice so interval mode can't spam it. */
	private lastNoPageNotice = 0;

	async onload() {
		await this.loadSettings();
		this.lastPage = this.settings.stickyLastPage;

		// Load Hunspell dictionary if available.
		const dir = this.manifest.dir;
		if (dir) {
			// Dictionary load is best-effort; spellcheck silently no-ops if absent.
			await this.spell.init(async (rel) => {
				const p = normalizePath(`${dir}/${rel}`);
				if (await this.app.vault.adapter.exists(p)) {
					return this.app.vault.adapter.read(p);
				}
				return null;
			});
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

		// Command: report current state — the quickest way to see why nothing happened.
		this.addCommand({
			id: 'show-status',
			name: 'Show capture status',
			callback: () => {
				new Notice(`Note Capture v${this.manifest.version}\n${this.statusLine()}`, 8000);
			},
		});

		// Keypress mode: intercept Enter at highest priority.
		this.registerEditorExtension(
			Prec.highest(keymap.of([{ key: 'Enter', run: () => this.handleEnter() }])),
		);

		// Interval mode acts only on lines the user has typed on — track them here.
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, info) => {
				this.noteEdit(editor, info.file?.path ?? null);
			}),
		);

		this.restartInterval();
		this.addSettingTab(new NoteCapSettingTab(this.app, this));

		this.debug(`loaded v${this.manifest.version}`, this.statusLine());
	}

	/** Human-readable snapshot of the settings that decide whether a line is captured. */
	private statusLine(): string {
		const s = this.settings;
		return (
			`capture: ${s.captureEnabled ? 'on' : 'off'} · mode: ${s.activationMode}` +
			(s.activationMode === 'interval' ? ` (${s.intervalMs} ms)` : '') +
			` · delimiter: "${s.delimiter}" (${s.delimiterMode})` +
			` · sticky page: ${s.stickyPage ? (this.lastPage ?? 'none yet') : 'off'}`
		);
	}

	onunload() {
		this.stopInterval();
	}

	/**
	 * Verbose tracing. Off unless the user turns on Debug logging in settings, so this
	 * is opt-in diagnostics rather than the unconditional console noise the Obsidian
	 * guidelines warn about.
	 */
	private debug(...args: unknown[]) {
		if (!this.settings.debugLogging) return;
		// eslint-disable-next-line obsidianmd/rule-custom-message
		console.log('Note Capture:', ...args);
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
		this.editedLines.clear();
		this.editedPath = null;
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

	/**
	 * Record that the user typed on a line, so interval mode may act on it later.
	 * Switching files clears the record — line numbers are only meaningful per file.
	 */
	private noteEdit(editor: import('obsidian').Editor, path: string | null) {
		if (!this.settings.captureEnabled) return;
		if (this.settings.activationMode !== 'interval') return;

		if (path !== this.editedPath) {
			this.editedPath = path;
			this.editedLines.clear();
		}

		const line = editor.getCursor().line;
		this.editedLines.set(line, editor.getLine(line));

		// Bound the map; a capture session only ever needs the last handful of lines.
		if (this.editedLines.size > 50) {
			const oldest = this.editedLines.keys().next();
			if (!oldest.done) this.editedLines.delete(oldest.value);
		}
	}

	private toggleCapture() {
		if (this.settings.captureEnabled) {
			// Turning OFF.
			this.settings.captureEnabled = false;
			void this.saveSettings();
			this.updateRibbonIcon();
			this.stopInterval();
			new Notice('Note Capture disabled');
		} else {
			// Turning ON: ask for prefix first.
			new PrefixModal(
				this.app,
				this.settings.pagePrefix,
				(prefix) => {
					void (async () => {
						this.settings.pagePrefix = prefix;
						this.settings.captureEnabled = true;
						await this.saveSettings();
						this.updateRibbonIcon();
						this.restartInterval();
						new Notice('Note Capture enabled');
					})();
				},
				() => {
					// User cancelled — leave capture off.
				},
			).open();
		}
	}

	/**
	 * Interval mode: commit lines the user has typed on.
	 *
	 * Two triggers, both restricted to lines recorded by `noteEdit` — a line the user
	 * has never typed on is never touched, so parking the cursor in existing prose is
	 * always safe:
	 *
	 *   1. **Left behind.** The cursor is no longer on a line the user typed on. This is
	 *      the ordinary "typed the note and pressed Enter" case, which the previous
	 *      cursor-stability model missed entirely: it only ever looked at the current
	 *      line, so the finished line above was left untransformed forever.
	 *   2. **Paused.** The cursor is still on the typed-on line and neither it nor the
	 *      cursor moved for a full interval — type your note, stop, it formats.
	 */
	private intervalTick() {
		if (!this.settings.captureEnabled) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const editor = view.editor;
		const cursor = editor.getCursor();
		const path = view.file?.path ?? null;

		if (path !== this.editedPath) {
			// Active file changed without an edit — the recorded line numbers are stale.
			this.editedPath = path;
			this.editedLines.clear();
			this.resetIntervalTracking();
			return;
		}

		// --- 1. Lines the cursor has moved away from -------------------------------
		for (const [lineNo, snapshot] of [...this.editedLines]) {
			if (lineNo === cursor.line) continue;
			this.editedLines.delete(lineNo);

			// Guard against line-number drift: only commit if the text is still what
			// the user left there.
			if (lineNo >= editor.lineCount()) continue;
			if (editor.getLine(lineNo) !== snapshot) {
				this.debug('skipped line', lineNo, '— content changed since it was typed');
				continue;
			}
			if (snapshot.trim().length === 0) continue;

			this.debug('committing left-behind line', lineNo, JSON.stringify(snapshot));
			this.transformLine(editor, lineNo, snapshot, { insertNewline: false });
		}

		// --- 2. The line the cursor is parked on -----------------------------------
		const raw = editor.getLine(cursor.line);
		const cursorStable = cursor.line === this.prevTickLine && cursor.ch === this.prevTickCh;
		const lineStable = raw === this.prevTickRaw;

		// Update tracking BEFORE potentially transforming (transform moves cursor).
		this.prevTickLine = cursor.line;
		this.prevTickCh = cursor.ch;
		this.prevTickRaw = raw;

		if (!cursorStable || !lineStable) return;
		if (raw.trim().length === 0) return;
		// Never act on a line the user has not typed on in this session.
		if (!this.editedLines.has(cursor.line)) return;

		this.debug('committing paused line', cursor.line, JSON.stringify(raw));
		if (this.transformLine(editor, cursor.line, raw, { insertNewline: true })) {
			this.editedLines.delete(cursor.line);
			// Reset tracking after a successful transform so the new empty line is fresh.
			this.resetIntervalTracking();
		}
	}

	/**
	 * Tell the user why a sticky line ("/note") did nothing. `lastPage` is empty after
	 * every reload until a line carries a real page number, and the old code just
	 * returned false — which presented as "sticky is broken".
	 */
	private noPageNotice() {
		this.debug('skip — sticky line but no page remembered yet');
		const now = Date.now();
		if (now - this.lastNoPageNotice < 5000) return;
		this.lastNoPageNotice = now;
		new Notice('Note Capture: no page remembered yet — type a line with a page number first.');
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

		return this.transformLine(editor, cursor.line, raw, { insertNewline: true });
	}

	private transformLine(
		editor: import('obsidian').Editor,
		lineNo: number,
		raw: string,
		opts: { insertNewline: boolean },
	): boolean {
		// Never re-process an already-formatted bullet.
		if (isAlreadyFormatted(raw, this.settings.pageTemplate)) {
			this.debug('skip — already formatted:', JSON.stringify(raw));
			return false;
		}

		const split = splitBulletPrefix(raw);
		const parsed = parseLine(split.content, this.settings.delimiter, this.settings.delimiterMode);
		if (!parsed) {
			this.debug(
				'skip — not a capture line:',
				JSON.stringify(raw),
				`(delimiter "${this.settings.delimiter}", mode ${this.settings.delimiterMode})`,
			);
			return false;
		}

		// Resolve page via sticky.
		let page = parsed.page;
		if (page === null) {
			if (this.settings.stickyPage && this.lastPage !== null) {
				page = this.lastPage;
			} else {
				// Previously a silent no-op — the reported "sticky fails". Say so.
				this.noPageNotice();
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

		// Nesting: decide whether this is a sub-bullet.
		const nested = isNested(raw);

		let bullet: string;
		if (split.bulletPrefix) {
			// If it already had a bullet prefix, we preserve it.
			const ref = formatPage(this.settings.pageTemplate, page, this.settings.pagePrefix);
			bullet = `${split.indent}${split.bulletPrefix}${text} ${ref}`;
		} else {
			bullet = buildBullet(
				text,
				page,
				this.settings.pageTemplate,
				nested,
				this.settings.subBulletIndent,
				this.settings.pagePrefix,
			);
		}

		if (opts.insertNewline) {
			// Keypress mode (Enter consumed) and pause-commit: open the next line.
			editor.replaceRange(bullet + '\n', { line: lineNo, ch: 0 }, { line: lineNo, ch: raw.length });
			editor.setCursor({ line: lineNo + 1, ch: 0 });
		} else {
			// Committing a line the cursor already left — rewrite in place and leave
			// the cursor exactly where the user put it.
			editor.replaceRange(bullet, { line: lineNo, ch: 0 }, { line: lineNo, ch: raw.length });
		}

		this.lastPage = page;
		if (this.settings.stickyLastPage !== page) {
			this.settings.stickyLastPage = page;
			void this.saveSettings();
		}
		this.debug('transformed →', JSON.stringify(bullet));

		if (flags.length > 0) {
			const list = flags
				.map((f) => (f.suggestion ? `${f.word} → ${f.suggestion}` : `${f.word} (?)`))
				.join(', ');
			new Notice(`Note Capture — possible misspellings: ${list}`);
		}

		return true;
	}

	async loadSettings() {
		const stored = (await this.loadData()) as Partial<NoteCapSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
