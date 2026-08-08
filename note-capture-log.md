# Note Capture — Project Log

Version: 1.0.1 Created: 2026-06-12 Repository: https://github.com/jsglazer/note-capture Formerly: NoteCap (renamed 2026-06-12)

No `UpdateNN.md` file existed for this project, so per the Dev workflow rules all activity is logged here.

---

## 2026-06-12 — v1.0.0: initial design + build

### User prompt

> which model is best for interviewing me to design a new tool?
> @/Users/josh/VaultDEV/NoteCap.md (Interview me to create a new tool... rapid typed-note entry)

### Interview (decisions)

Conducted via plan mode. Full notes saved to `/Users/josh/VaultDEV/NoteCap.md`.

| Topic            | Decision                                                                          |
| ---------------- | --------------------------------------------------------------------------------- |
| Architecture     | Obsidian plugin, `isDesktopOnly: false` → macOS + iOS from one codebase           |
| Capture surface  | Inline in active editor; transform line in place on Enter                         |
| Input syntax     | Leading page number + delimiter, e.g. `42 \| text` (delimiter `\|`, configurable) |
| Sticky page      | `\| text` (no number) reuses the last page; a new number changes it               |
| Sub-bullets      | Timing window — quick Enter nests; pause = new top-level bullet                   |
| Checking (v1)    | Local spelling only (offline, mobile-safe)                                        |
| Checking (later) | Optional on-demand Claude API grammar + fact-check (v1.1+)                        |
| Correction mode  | Setting: auto-correct inline OR flag-for-review                                   |
| Output           | `- text (42)`, nested `\t- text (42)`; page in parentheses                        |

### Build

- Scaffolded standard Obsidian plugin (manifest/package/tsconfig/esbuild/versions).
- Source modules: `parser.ts`, `formatter.ts`, `nesting.ts`, `spellcheck.ts` (nspell + common-misspellings fallback), `settings.ts`, `main.ts` (CM6 Enter keymap).
- `npm install` + `npm run build` → clean `main.js` (17 KB, nspell bundled).
- Smoke test (`~/.claude/scripts/notecap-smoke.ts`): 11/11 passed — parse, sticky, format, nesting, autocorrect, flagging.

### Note

- Mid-build, a background agent moved the project from `/Users/josh/Dev/NoteCap` to `/Users/josh/Dev/Obsidian/NoteCap` (matching the `Dev/Obsidian/[project]` convention). Files were consolidated into the new path; old path removed.

### Issue / Fix summary

| #   | Issue                                                              | Fix                                                                                                               |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Cross-platform requirement (macOS + iOS) without two native builds | Built as an Obsidian plugin (`isDesktopOnly: false`) — one TS codebase covers both                                |
| 2   | True offline grammar is weak                                       | Scoped v1 to local spelling; deferred grammar + facts to an optional Claude API call                              |
| 3   | Bundling a full Hunspell dictionary bloats the build               | nspell loads `en_US.aff/.dic` from the plugin folder at runtime; ships with a common-misspellings fallback        |
| 4   | Distinguishing sub-bullets from top-level lines                    | Timing-window heuristic (`nesting.ts`), configurable `subBulletWindowMs`                                          |
| 5   | Avoid hijacking Enter on ordinary prose                            | `parseLine` returns null unless the line is `<number\|empty> + delimiter`; handler passes Enter through otherwise |
| 6   | Project scaffolded at wrong path                                   | Background agent moved it to `Dev/Obsidian/NoteCap`; paths consolidated                                           |

Closed: 2026-06-12

---

## 2026-06-12 — v1.0.1: rename NoteCap → note-capture

### User prompt

> Project Updates — Project renamed to note-capture
> `/Users/josh/Dev/Obsidian/note-capture`, Dev file `note-capture Dev.md`,
> repo `https://github.com/jsglazer/note-capture`, changed to public

### Changes

- Local dir, vault Dev file, and GitHub repo were already renamed externally (repo now **public**).
- Reconciled project internals to the new name:
  - `manifest.json`: id `notecap` → `note-capture`, name `NoteCap` → `Note Capture`.
  - `package.json` name → `note-capture`; version bumped to **1.0.1** (manifest + versions.json too).
  - Git remote re-pointed to `note-capture.git`.
  - Log file `NoteCap-log.md` → `note-capture-log.md`; README title + plugin-folder paths updated.
  - User-facing strings (settings header, Notice, console logs, dictionary-path comment) → "Note Capture".
  - Internal TS symbol names (`NoteCapPlugin`, etc.) left as-is (non-user-facing, avoids churn).
- Rebuilt (`main.js` now reports id `note-capture`); smoke test 11/11 still pass.

### Issue / Fix summary

| #   | Issue                                        | Fix                                                                                           |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Project renamed to note-capture              | Updated manifest id/name, package name, README, log filename, remote URL, user-facing strings |
| 2   | Git remote still pointed at old NoteCap repo | `git remote set-url origin .../note-capture.git`                                              |
| 3   | Config change requires version bump          | Bumped 1.0.0 → 1.0.1 across manifest/package/versions.json/Dev file                           |

Closed: 2026-06-12

---

## 2026-08-08 — v1.0.7: Note Toolbar item highlight (report + implementation)

No open `UpdateNNN.md` existed for this work (`Update004.md` was already Status: Built for a different set of items), so per the Dev workflow's fallback rule this session is logged here.

### User prompt (report)

> Is it possible to add a feature to this plugin that would conditionally change the backcolor
> of the `Note` item in `TB_Main` Note Toolbar (obsidian-note-toolbar)? REPORT ONLY, do not
> build anything.

### Report findings

Inspected the installed Note Toolbar plugin (v1.34.13, `main.js`) and the user's actual `TB_Main` toolbar config (`~/Dev/config/Obsidian/plugins/note-toolbar/data.json`, symlinked from `~/VaultDEV/.obsidian/plugins/note-toolbar/data.json`):

- Confirmed `TB_Main`'s "Note" item calls `note-capture:toggle-capture` — this plugin's own toggle command.
- Note Toolbar has no public plugin API for third-party styling (no `app.plugins.plugins['note-toolbar'].api`, no per-item `class`/`style` field, no built-in toggle-active highlighting for commands).
- Found a stable, undocumented hook: Note Toolbar renders each toolbar item's `linkAttr` entries onto the live DOM element as `data-toolbar-link-attr-*` attributes, and renders each toolbar's container with `id` = the toolbar's uuid and each item as `<li data-index="N">` matching its index in `toolbar.items`. Both survive renaming/moving the item.
- Recommended Approach A: note-capture toggles a body/element state on capture change and ships CSS/JS to color the matched item; Approach B (CSS-only, keyed off the ribbon icon's `aria-label`) offered as a zero-code alternative but not pursued.

### User prompt (implement)

> Implement A. Add 2 config options to the note-capture settings: 1. Select Toolbar & item —
> dropdown to pick from available Note Toolbars and the related available items that should
> get the conditional formatting. 2. Select format — formatting applied when note-capture is
> ACTIVE (installed + plugin activated + capture enabled), see md-annotation for formatting
> example.

### Implementation

- **`src/toolbarHighlight.ts`** (new). Reads Note Toolbar's plugin instance/settings directly (no public API exists) via minimal, defensive shape interfaces — a shape mismatch degrades to "highlight doesn't apply", never a crash. Exports `isNoteToolbarAvailable`, `listToolbars`, `listHighlightableItems` (filters out separators/breaks/spreaders/groups and label-less icon-less items, since Note Toolbar itself renders nothing for those), `itemDisplayName`, and the `ToolbarHighlighter` class. `ToolbarHighlighter.refresh(active)` locates the live element via `.cg-note-toolbar-container` whose `id` equals the configured toolbar uuid, then `li[data-index="N"]` where `N` is the configured item's live index in `toolbar.items` — looked up by uuid every call, so edits to the toolbar in Note Toolbar do not require re-selecting anything in Note Capture unless the item itself is deleted. Colors are applied as inline styles (user-configurable, so static CSS cannot hold them) and are cleared first on every call, then re-applied only if `active` is true and at least one color is enabled for the current light/dark theme.
- **`src/settings.ts`**. New `ToolbarHighlightFormat` type (`ColorOption` = `{enabled, color}`, one pair per light/dark × background/text — mirrors md-annotation's Fr/Bg-per-theme model). New settings tab section "Note Toolbar highlight": Toolbar dropdown (re-renders the tab on change so the Item dropdown reflects the new toolbar and resets the stale item selection), Item dropdown, and four enable+color-picker rows (light bg, light fg, dark bg, dark fg). The whole section collapses to an explanatory line if Note Toolbar is not installed/enabled.
- **`src/main.ts`**. Instantiates `ToolbarHighlighter` in `onload`; `updateRibbonIcon()` (the existing single choke point for every capture on/off transition) now also calls `refreshToolbarHighlight()`. Registered on `active-leaf-change`, `layout-change`, `file-open`, and `css-change` (theme switch) with a 50 ms delay before refreshing, since Note Toolbar re-renders its DOM per leaf/file/mode and plugin event-handler order across two separate plugins is not guaranteed. `onunload` clears any applied highlight.
- **`styles.css`**. `.note-capture-toolbar-highlight` adds a 120 ms background/text-color transition; the colors themselves are inline (see above).
- **`eslint.config.mjs`**. Added "Note Toolbar" to the sentence-case rule's brand allowlist and an ignore-regex for the "— None —" placeholder dropdown options.
- **`test/toolbarHighlight.test.ts`** (new). 11 tests covering `isNoteToolbarAvailable`, `listToolbars` (including malformed-shape tolerance and the untitled-toolbar fallback), `listHighlightableItems` (separator/group/label-less exclusion), and `itemDisplayName`'s fallback chain. `ToolbarHighlighter` itself is not unit-tested — it needs a live DOM (`activeDocument`) that the project's Node-based Vitest environment does not provide — so its DOM-matching logic was verified by static analysis against Note Toolbar's actual installed `main.js` rather than by execution.

### Verification

- `npm run lint` — clean (0 errors, 0 warnings)
- `npm run build` — `tsc -noEmit` clean, build succeeds
- `npm test` — **42/42 pass** (was 31; +11 for `toolbarHighlight.test.ts`)
- **Not verified interactively**: actually opening Obsidian and confirming the "Note" button's background changes when Toolbar=TB_Main / Item=Note is selected and capture is toggled. The DOM contract (`data-index`, container `id` = toolbar uuid) was confirmed by reading Note Toolbar's installed `main.js`, not by driving the running app.

### Issue / Fix summary

| # | Issue | Fix |
|---|---|---|
| 1 | No way to color a Note Toolbar item based on capture state; Note Toolbar has no public styling API | `src/toolbarHighlight.ts` reads Note Toolbar's settings directly and targets the live element via container `id` (toolbar uuid) + `data-index` (item's array index) |
| 2 | Settings needed a way to pick which toolbar/item to highlight without hardcoding uuids | Toolbar/Item dropdowns in settings, populated live from Note Toolbar's own settings, re-rendered on toolbar change |
| 3 | Colors are user-configurable, so they cannot live in static CSS | Applied as inline styles from `toolbarHighlightFormat` (light/dark × bg/fg), set/cleared by `ToolbarHighlighter` |
| 4 | Highlight needed to survive note switches, pane switches, and theme changes | Refreshed on `active-leaf-change`, `layout-change`, `file-open`, `css-change`, plus every capture toggle |
| 5 | Two new UI strings failed the `obsidianmd/ui/sentence-case` lint rule | Added "Note Toolbar" as a recognized brand and an ignore-regex for "— None —" placeholders |
| 6 | `toolbars.forEach((t) => d.addOption(...))` tripped `no-misused-promises` (dropdown builder's chainable return read as a discarded promise) | Switched to a plain `for...of` loop |

### Session summary (as presented)

Implemented Approach A from the earlier report: two new settings sections in **Note Capture → Settings → Note Toolbar highlight**.

- **Toolbar / Item dropdowns** — pick any Note Toolbar toolbar and any item within it, populated live from Note Toolbar's own settings. Separators, groups, and label-less/icon-less items are filtered out since Note Toolbar itself renders nothing for those.
- **Highlight format** — four independent enable+color rows (light background, light text, dark background, dark text), mirroring md-annotation's per-theme Fr/Bg color-pair model. Applied only while capture is installed, enabled, and turned on.

Note Toolbar has no public API for this, so `src/toolbarHighlight.ts` reads its settings directly and locates the live element by the toolbar container's `id` (which Note Toolbar sets to the toolbar's uuid) and the item's index in `toolbar.items` (rendered as `<li data-index="N">`) — not by label or position guesses, so renaming or moving the item doesn't break it. Colors are applied as inline styles since they're user-configurable. The highlight refreshes on every capture toggle plus note/pane/theme changes, and clears on unload.

**Verified:** lint clean, `tsc` clean, 42/42 tests pass (11 new, covering the toolbar-discovery logic). **Not verified:** I did not open Obsidian to click through this interactively — the DOM hooks were confirmed by reading Note Toolbar's actual installed code, not by exercising the running app. Please set Toolbar → TB_Main, Item → Note, and toggle capture to confirm the button's background actually changes, especially after any future Note Toolbar update.

Bumped to **v1.0.7** (manifest, package.json, versions.json, Dev file). Committed and pushed to `main`.

Closed: 2026-08-08
