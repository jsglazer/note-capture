import { describe, it, expect, beforeEach } from 'vitest';
import NoteCapPlugin from '../src/main';
import { DEFAULT_SETTINGS, NoteCapSettings } from '../src/settings';

/**
 * Minimal Editor good enough for the plugin's usage: single-line replaceRange,
 * line reads, and a cursor. Backs the orchestration tests the audit called for —
 * `transformLine` and the interval/keypress entry paths previously had no coverage,
 * which is where both reported bugs lived.
 */
class FakeEditor {
	lines: string[];
	cursor = { line: 0, ch: 0 };

	constructor(lines: string[] = ['']) {
		this.lines = lines;
	}

	getLine(n: number): string {
		return this.lines[n];
	}

	lineCount(): number {
		return this.lines.length;
	}

	getCursor() {
		return { ...this.cursor };
	}

	setCursor(pos: { line: number; ch: number }) {
		this.cursor = { ...pos };
	}

	replaceRange(text: string, from: { line: number; ch: number }, to: { line: number; ch: number }) {
		const line = this.lines[from.line];
		const replaced = line.slice(0, from.ch) + text + line.slice(to.ch);
		this.lines.splice(from.line, 1, ...replaced.split('\n'));
	}
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Harness {
	plugin: any;
	editor: FakeEditor;
	/** Type `text` onto `line`, as the user would (fires the edit tracker). */
	type: (line: number, text: string) => void;
	/** Press Enter: split the line at the cursor and track the resulting edit. */
	pressEnter: () => void;
	tick: () => void;
}

function harness(overrides: Partial<NoteCapSettings> = {}, lines: string[] = ['']): Harness {
	const editor = new FakeEditor(lines);
	const plugin = new NoteCapPlugin() as any;

	plugin.settings = { ...DEFAULT_SETTINGS, spellcheckEnabled: false, ...overrides };
	plugin.manifest = { version: 'test' };
	plugin.saveData = async () => {};
	plugin.app = {
		workspace: {
			getActiveViewOfType: () => ({ editor, file: { path: 'note.md' } }),
		},
	};

	const type = (line: number, text: string) => {
		editor.lines[line] = text;
		editor.cursor = { line, ch: text.length };
		plugin.noteEdit(editor, 'note.md');
	};

	const pressEnter = () => {
		const { line, ch } = editor.cursor;
		const current = editor.lines[line];
		editor.lines.splice(line, 1, current.slice(0, ch), current.slice(ch));
		editor.cursor = { line: line + 1, ch: 0 };
		plugin.noteEdit(editor, 'note.md');
	};

	return { plugin, editor, type, pressEnter, tick: () => plugin.intervalTick() };
}

describe('interval mode', () => {
	let h: Harness;

	beforeEach(() => {
		h = harness({ activationMode: 'interval', captureEnabled: true, delimiterMode: 'optional' });
	});

	it('commits a line the user typed and then left with Enter', () => {
		// The reported "plugin is not working": the old tick only ever looked at the
		// CURRENT line, so pressing Enter stranded the finished line above forever.
		h.type(0, '19/bob');
		h.pressEnter();
		h.tick();

		expect(h.editor.lines[0]).toBe('- bob (19)');
		expect(h.editor.lines[1]).toBe('');
		// Committing a left-behind line must not disturb the cursor.
		expect(h.editor.cursor).toEqual({ line: 1, ch: 0 });
	});

	it('handles spaces around the delimiter', () => {
		h.type(0, '19 / bob');
		h.pressEnter();
		h.tick();

		expect(h.editor.lines[0]).toBe('- bob (19)');
	});

	it('commits the current line once the user pauses on it', () => {
		h.type(0, '42/a note');
		h.tick(); // establishes the baseline
		h.tick(); // cursor and text unchanged for a full interval

		expect(h.editor.lines[0]).toBe('- a note (42)');
		expect(h.editor.cursor).toEqual({ line: 1, ch: 0 });
	});

	it('never touches a line the user has not typed on', () => {
		// Parking the cursor in existing prose used to rewrite it after one tick.
		h = harness({ activationMode: 'interval', captureEnabled: true, delimiterMode: 'optional' }, [
			'19/pre-existing prose',
			'',
		]);
		h.editor.cursor = { line: 0, ch: 4 };
		h.tick();
		h.tick();
		h.tick();

		expect(h.editor.lines[0]).toBe('19/pre-existing prose');
	});

	it('drops a tracked line whose text changed after it was typed', () => {
		h.type(0, '19/bob');
		h.pressEnter();
		h.editor.lines[0] = 'something else entirely';
		h.tick();

		expect(h.editor.lines[0]).toBe('something else entirely');
	});

	it('applies the page prefix and indents an indented line', () => {
		h.plugin.settings.pagePrefix = 'Smith, ';
		h.type(0, '\t7/sub point');
		h.pressEnter();
		h.tick();

		expect(h.editor.lines[0]).toBe('\t- sub point (Smith, 7)');
	});
});

describe('sticky page', () => {
	it('reuses the last page and persists it for the next session', () => {
		const h = harness({ activationMode: 'keypress', captureEnabled: true });

		h.editor.lines = ['19/first'];
		h.editor.cursor = { line: 0, ch: 8 };
		expect(h.plugin.handleEnter()).toBe(true);
		expect(h.editor.lines[0]).toBe('- first (19)');
		expect(h.plugin.settings.stickyLastPage).toBe('19');

		h.editor.lines[1] = '/second';
		h.editor.cursor = { line: 1, ch: 7 };
		expect(h.plugin.handleEnter()).toBe(true);
		expect(h.editor.lines[1]).toBe('- second (19)');
	});

	it('is restored from settings on load rather than starting empty', () => {
		const h = harness({ activationMode: 'keypress', captureEnabled: true, stickyLastPage: '77' });
		h.plugin.lastPage = h.plugin.settings.stickyLastPage; // what onload() does

		h.editor.lines = ['/after a reload'];
		h.editor.cursor = { line: 0, ch: 15 };
		expect(h.plugin.handleEnter()).toBe(true);
		expect(h.editor.lines[0]).toBe('- after a reload (77)');
	});

	it('declines the line when no page is known yet', () => {
		const h = harness({ activationMode: 'keypress', captureEnabled: true });
		h.editor.lines = ['/no page yet'];
		h.editor.cursor = { line: 0, ch: 12 };

		expect(h.plugin.handleEnter()).toBe(false);
		expect(h.editor.lines[0]).toBe('/no page yet');
	});
});

describe('keypress mode', () => {
	it('passes Enter through when capture is off', () => {
		const h = harness({ activationMode: 'keypress', captureEnabled: false });
		h.editor.lines = ['19/bob'];
		expect(h.plugin.handleEnter()).toBe(false);
	});

	it('passes Enter through in interval mode', () => {
		const h = harness({ activationMode: 'interval', captureEnabled: true });
		h.editor.lines = ['19/bob'];
		expect(h.plugin.handleEnter()).toBe(false);
	});

	it('leaves an already-formatted bullet alone', () => {
		const h = harness({ activationMode: 'keypress', captureEnabled: true });
		h.editor.lines = ['- an earlier note (19)'];
		h.editor.cursor = { line: 0, ch: 22 };

		expect(h.plugin.handleEnter()).toBe(false);
		expect(h.editor.lines[0]).toBe('- an earlier note (19)');
	});
});
