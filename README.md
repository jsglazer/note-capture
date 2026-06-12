# Note Capture

Rapidly capture typed reading notes in Obsidian. Type a **page number**, a **delimiter**,
and your **note**, then press **Enter** — Note Capture formats it into a Markdown bullet with
the page appended.

Works on **macOS and iOS** (single plugin, `isDesktopOnly: false`).

## Usage

Type directly in any note:

```
42 | the author argues X
```

Press Enter and it becomes:

```
- the author argues X (42)
```

- **Sticky page** — start a line with just the delimiter to reuse the last page:
  ```
  42 | first point
  | second point        ->   - second point (42)
  43 | new section       ->   - new section (43)
  ```
- **Sub-bullets by timing** — press Enter again *quickly* (within the configurable window)
  and the next line nests as a sub-bullet; pause longer for a new top-level bullet.
- **Spell check** — each committed line is checked locally. Choose **auto-correct** (fixes
  inline) or **flag** (shows a notice) in settings.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Delimiter | `\|` | Separates page from text |
| Sub-bullet window (ms) | `1500` | Quick-follow window for nesting |
| Sticky page | on | Reuse last page when omitted |
| Page reference format | `(${page})` | `${page}` placeholder |
| Spell check | on | Local, offline |
| Correction mode | flag | `auto-correct` or `flag` |
| Sub-bullet indent | tab | `tab` or literal spaces |

## Full dictionary (optional)

Out of the box, spell check uses a built-in common-misspellings list. To enable full
Hunspell spell checking, drop `en_US.aff` and `en_US.dic` into the plugin folder
(`<vault>/.obsidian/plugins/note-capture/`). NoteCap loads them automatically via `nspell`.

## Roadmap

- **v1.1+** — optional, on-demand grammar + factual review via the Claude API.

## Develop

```bash
npm install
npm run build   # produces main.js
```

Copy `main.js`, `manifest.json` (and any dictionary files) into a test vault's
`.obsidian/plugins/note-capture/` and enable the plugin.
