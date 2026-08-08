import { App } from 'obsidian';
import type { NoteCapSettings } from './settings';

// Note Toolbar (https://github.com/chrisgurney/obsidian-note-toolbar) has no public API for
// third-party styling, so this reads its plugin instance and settings directly. That's an
// undocumented, unofficial coupling — the shapes below are deliberately minimal (only the
// fields we actually read) and every access is defensive, so a future Note Toolbar release
// that changes its internal shape degrades to "highlight doesn't apply", never a crash.

const SKIP_ITEM_TYPES = new Set(['separator', 'break', 'spreader', 'group']);

export interface ToolbarItemInfo {
	uuid: string;
	label: string;
	tooltip: string;
	icon: string;
}

export interface ToolbarInfo {
	uuid: string;
	name: string;
}

interface NoteToolbarItemShape {
	uuid?: unknown;
	label?: unknown;
	tooltip?: unknown;
	icon?: unknown;
	linkAttr?: { type?: unknown };
}

interface NoteToolbarToolbarShape {
	uuid?: unknown;
	name?: unknown;
	items?: unknown;
}

interface NoteToolbarPluginShape {
	settings?: { toolbars?: unknown };
}

interface AppWithPlugins extends App {
	plugins?: {
		enabledPlugins?: Set<string>;
		plugins?: Record<string, unknown>;
	};
}

function getNoteToolbarPlugin(app: App): NoteToolbarPluginShape | null {
	const registry = (app as AppWithPlugins).plugins;
	if (!registry?.enabledPlugins?.has('note-toolbar')) return null;
	const plugin = registry.plugins?.['note-toolbar'];
	return plugin && typeof plugin === 'object' ? plugin : null;
}

function rawToolbars(app: App): NoteToolbarToolbarShape[] {
	const toolbars = getNoteToolbarPlugin(app)?.settings?.toolbars;
	return Array.isArray(toolbars) ? (toolbars as NoteToolbarToolbarShape[]) : [];
}

function rawItems(toolbar: NoteToolbarToolbarShape): NoteToolbarItemShape[] {
	return Array.isArray(toolbar.items) ? (toolbar.items as NoteToolbarItemShape[]) : [];
}

/** Is the Note Toolbar plugin installed and enabled? */
export function isNoteToolbarAvailable(app: App): boolean {
	return getNoteToolbarPlugin(app) !== null;
}

/** All toolbars defined in Note Toolbar, for the settings dropdown. */
export function listToolbars(app: App): ToolbarInfo[] {
	return rawToolbars(app)
		.filter((t): t is NoteToolbarToolbarShape & { uuid: string } => typeof t.uuid === 'string')
		.map((t) => ({
			uuid: t.uuid,
			name: typeof t.name === 'string' && t.name ? t.name : '(untitled toolbar)',
		}));
}

/** Items in `toolbarUuid` that can visually carry a background/text color highlight. */
export function listHighlightableItems(app: App, toolbarUuid: string): ToolbarItemInfo[] {
	const toolbar = rawToolbars(app).find((t) => t.uuid === toolbarUuid);
	if (!toolbar) return [];
	return rawItems(toolbar)
		.filter((i) => typeof i.uuid === 'string')
		.filter((i) => {
			const type = i.linkAttr?.type;
			return typeof type === 'string' && !SKIP_ITEM_TYPES.has(type);
		})
		.filter(
			(i) => (typeof i.label === 'string' && i.label) || (typeof i.icon === 'string' && i.icon),
		)
		.map((i) => ({
			uuid: i.uuid as string,
			label: typeof i.label === 'string' ? i.label : '',
			tooltip: typeof i.tooltip === 'string' ? i.tooltip : '',
			icon: typeof i.icon === 'string' ? i.icon : '',
		}));
}

export function itemDisplayName(item: ToolbarItemInfo): string {
	return item.label || item.tooltip || item.icon || '(untitled item)';
}

/** CSS class applied to a highlighted toolbar item, so styles can transition and be cleared. */
const HIGHLIGHT_CLASS = 'note-capture-toolbar-highlight';

/**
 * Applies (or clears) a background/text color on one Note Toolbar item's rendered element
 * while capture is active. Note Toolbar renders each toolbar into a container whose DOM `id`
 * equals the toolbar's uuid, with items as `<li data-index="N">` in the same order as
 * `toolbar.items` — so the configured item's live element is found by index, not by any
 * assumption about label/icon/position stability in the settings UI.
 */
export class ToolbarHighlighter {
	constructor(
		private readonly app: App,
		private readonly getSettings: () => NoteCapSettings,
	) {}

	/** Re-applies the highlight for the current settings + capture state. Safe to call often. */
	refresh(active: boolean): void {
		this.clear();
		if (!active) return;

		const settings = this.getSettings();
		const { toolbarHighlightToolbarUuid: toolbarUuid, toolbarHighlightItemUuid: itemUuid } =
			settings;
		if (!toolbarUuid || !itemUuid) return;

		const toolbar = rawToolbars(this.app).find((t) => t.uuid === toolbarUuid);
		if (!toolbar) return;
		const items = rawItems(toolbar);
		const index = items.findIndex((i) => i.uuid === itemUuid);
		if (index === -1) return;

		const isDark = activeDocument.body.classList.contains('theme-dark');
		const theme = isDark
			? settings.toolbarHighlightFormat.dark
			: settings.toolbarHighlightFormat.light;
		if (!theme.bg.enabled && !theme.fg.enabled) return;

		const containers = activeDocument.querySelectorAll<HTMLElement>('.cg-note-toolbar-container');
		containers.forEach((container) => {
			if (container.id !== toolbarUuid) return;
			const li = container.querySelector<HTMLElement>(`li[data-index="${index}"]`);
			const target = li?.firstElementChild;
			if (!(target instanceof HTMLElement)) return;

			target.classList.add(HIGHLIGHT_CLASS);
			if (theme.bg.enabled) target.style.backgroundColor = theme.bg.color;
			if (theme.fg.enabled) target.style.color = theme.fg.color;
		});
	}

	/** Removes any highlight this plugin previously applied, wherever it currently lives. */
	clear(): void {
		activeDocument.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
			el.classList.remove(HIGHLIGHT_CLASS);
			el.style.removeProperty('background-color');
			el.style.removeProperty('color');
		});
	}
}
