# Note Capture — Project Log

Version: 1.0.1
Created: 2026-06-12
Repository: https://github.com/jsglazer/note-capture
Formerly: NoteCap (renamed 2026-06-12)

No `UpdateXX.md` file existed for this project, so per the Dev workflow rules all activity is
logged here.

---

## 2026-06-12 — v1.0.0: initial design + build

### User prompt
> which model is best for interviewing me to design a new tool?
> @/Users/josh/VaultDEV/NoteCap.md  (Interview me to create a new tool... rapid typed-note entry)

### Interview (decisions)
Conducted via plan mode. Full notes saved to `/Users/josh/VaultDEV/NoteCap.md`.

| Topic | Decision |
|---|---|
| Architecture | Obsidian plugin, `isDesktopOnly: false` → macOS + iOS from one codebase |
| Capture surface | Inline in active editor; transform line in place on Enter |
| Input syntax | Leading page number + delimiter, e.g. `42 \| text` (delimiter `\|`, configurable) |
| Sticky page | `\| text` (no number) reuses the last page; a new number changes it |
| Sub-bullets | Timing window — quick Enter nests; pause = new top-level bullet |
| Checking (v1) | Local spelling only (offline, mobile-safe) |
| Checking (later) | Optional on-demand Claude API grammar + fact-check (v1.1+) |
| Correction mode | Setting: auto-correct inline OR flag-for-review |
| Output | `- text (42)`, nested `\t- text (42)`; page in parentheses |

### Build
- Scaffolded standard Obsidian plugin (manifest/package/tsconfig/esbuild/versions).
- Source modules: `parser.ts`, `formatter.ts`, `nesting.ts`, `spellcheck.ts` (nspell +
  common-misspellings fallback), `settings.ts`, `main.ts` (CM6 Enter keymap).
- `npm install` + `npm run build` → clean `main.js` (17 KB, nspell bundled).
- Smoke test (`~/.claude/scripts/notecap-smoke.ts`): 11/11 passed — parse, sticky, format,
  nesting, autocorrect, flagging.

### Note
- Mid-build, a background agent moved the project from `/Users/josh/Dev/NoteCap` to
  `/Users/josh/Dev/Obsidian/NoteCap` (matching the `Dev/Obsidian/[project]` convention).
  Files were consolidated into the new path; old path removed.

### Issue / Fix summary
| # | Issue | Fix |
|---|---|---|
| 1 | Cross-platform requirement (macOS + iOS) without two native builds | Built as an Obsidian plugin (`isDesktopOnly: false`) — one TS codebase covers both |
| 2 | True offline grammar is weak | Scoped v1 to local spelling; deferred grammar + facts to an optional Claude API call |
| 3 | Bundling a full Hunspell dictionary bloats the build | nspell loads `en_US.aff/.dic` from the plugin folder at runtime; ships with a common-misspellings fallback |
| 4 | Distinguishing sub-bullets from top-level lines | Timing-window heuristic (`nesting.ts`), configurable `subBulletWindowMs` |
| 5 | Avoid hijacking Enter on ordinary prose | `parseLine` returns null unless the line is `<number\|empty> + delimiter`; handler passes Enter through otherwise |
| 6 | Project scaffolded at wrong path | Background agent moved it to `Dev/Obsidian/NoteCap`; paths consolidated |

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
| # | Issue | Fix |
|---|---|---|
| 1 | Project renamed to note-capture | Updated manifest id/name, package name, README, log filename, remote URL, user-facing strings |
| 2 | Git remote still pointed at old NoteCap repo | `git remote set-url origin .../note-capture.git` |
| 3 | Config change requires version bump | Bumped 1.0.0 → 1.0.1 across manifest/package/versions.json/Dev file |

Closed: 2026-06-12
