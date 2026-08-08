import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import {
	isNoteToolbarAvailable,
	itemDisplayName,
	listHighlightableItems,
	listToolbars,
} from '../src/toolbarHighlight';

/**
 * Note Toolbar exposes no public API, so this module reads its plugin instance and
 * settings shape directly (see toolbarHighlight.ts for why). These tests fake that
 * shape rather than the real plugin, to pin down how our reader tolerates it.
 */
function fakeApp(noteToolbarPlugin?: unknown): App {
	const plugins: Record<string, unknown> = {};
	if (noteToolbarPlugin !== undefined) plugins['note-toolbar'] = noteToolbarPlugin;

	return {
		plugins: {
			enabledPlugins: new Set(noteToolbarPlugin !== undefined ? ['note-toolbar'] : []),
			plugins,
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

const toolbarFixture = {
	uuid: 'tbar-1',
	name: 'TB_Main',
	items: [
		{ uuid: 'item-1', label: 'Note', tooltip: '', icon: '', linkAttr: { type: 'command' } },
		{
			uuid: 'item-2',
			label: '',
			tooltip: 'Annotate',
			icon: 'lucide-highlighter',
			linkAttr: { type: 'command' },
		},
		{ uuid: 'item-3', label: '', tooltip: '', icon: '', linkAttr: { type: 'separator' } },
		{ uuid: 'item-4', label: '', tooltip: '', icon: '', linkAttr: { type: 'group' } },
		{ uuid: 'item-5', label: '', tooltip: '', icon: '', linkAttr: { type: 'command' } },
	],
};

describe('isNoteToolbarAvailable', () => {
	it('is false when the plugin is not installed', () => {
		expect(isNoteToolbarAvailable(fakeApp())).toBe(false);
	});

	it('is false when installed but disabled', () => {
		const app = fakeApp({ settings: { toolbars: [] } });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(app as any).plugins.enabledPlugins = new Set();
		expect(isNoteToolbarAvailable(app)).toBe(false);
	});

	it('is true when installed and enabled', () => {
		expect(isNoteToolbarAvailable(fakeApp({ settings: { toolbars: [] } }))).toBe(true);
	});
});

describe('listToolbars', () => {
	it('returns an empty list when Note Toolbar is unavailable', () => {
		expect(listToolbars(fakeApp())).toEqual([]);
	});

	it('lists toolbars by uuid and name', () => {
		const app = fakeApp({ settings: { toolbars: [toolbarFixture] } });
		expect(listToolbars(app)).toEqual([{ uuid: 'tbar-1', name: 'TB_Main' }]);
	});

	it('falls back to a placeholder name for an unnamed toolbar', () => {
		const app = fakeApp({ settings: { toolbars: [{ uuid: 'tbar-2', name: '', items: [] }] } });
		expect(listToolbars(app)).toEqual([{ uuid: 'tbar-2', name: '(untitled toolbar)' }]);
	});

	it('tolerates a malformed settings shape instead of throwing', () => {
		expect(listToolbars(fakeApp({ settings: {} }))).toEqual([]);
		expect(listToolbars(fakeApp({}))).toEqual([]);
	});
});

describe('listHighlightableItems', () => {
	it('excludes separators, groups, and unknown toolbars', () => {
		const app = fakeApp({ settings: { toolbars: [toolbarFixture] } });
		const items = listHighlightableItems(app, 'tbar-1');
		expect(items.map((i) => i.uuid)).toEqual(['item-1', 'item-2']);
	});

	it('excludes items with neither a label nor an icon', () => {
		// item-5 is type "command" but has no label/icon, so it renders as nothing in
		// Note Toolbar and would have no element to highlight.
		const app = fakeApp({ settings: { toolbars: [toolbarFixture] } });
		expect(listHighlightableItems(app, 'tbar-1').some((i) => i.uuid === 'item-5')).toBe(false);
	});

	it('returns an empty list for an unknown toolbar uuid', () => {
		const app = fakeApp({ settings: { toolbars: [toolbarFixture] } });
		expect(listHighlightableItems(app, 'does-not-exist')).toEqual([]);
	});
});

describe('itemDisplayName', () => {
	it('prefers label, then tooltip, then icon, then a placeholder', () => {
		expect(itemDisplayName({ uuid: '1', label: 'Note', tooltip: 'T', icon: 'i' })).toBe('Note');
		expect(itemDisplayName({ uuid: '1', label: '', tooltip: 'Annotate', icon: 'i' })).toBe(
			'Annotate',
		);
		expect(itemDisplayName({ uuid: '1', label: '', tooltip: '', icon: 'lucide-glasses' })).toBe(
			'lucide-glasses',
		);
		expect(itemDisplayName({ uuid: '1', label: '', tooltip: '', icon: '' })).toBe(
			'(untitled item)',
		);
	});
});
