# Note Capture

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/note-capture?logo=github)](https://github.com/jsglazer/note-capture/releases) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jsglazer/note-capture/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai) [![Gemini Flash Antigravity](https://img.shields.io/badge/Gemini%20Flash-Antigravity-4f86f7?logo=google-gemini&logoColor=white)](https://github.com/google-gemini) [![CI](https://github.com/jsglazer/note-capture/actions/workflows/ci.yml/badge.svg)](https://github.com/jsglazer/note-capture/actions/workflows/ci.yml) [![CodeQL](https://github.com/jsglazer/note-capture/actions/workflows/codeql.yml/badge.svg)](https://github.com/jsglazer/note-capture/actions/workflows/codeql.yml) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/jsglazer/note-capture/badge)](https://scorecard.dev/viewer/?uri=github.com/jsglazer/note-capture)

Rapidly capture typed reading notes in Obsidian. Type a **page number**, a **delimiter**, and your **note**, then press **Enter** — Note Capture formats it into a Markdown bullet with the page appended.

Works on **macOS and iOS** (single plugin, `isDesktopOnly: false`).

## Usage

Type directly in any note:

```
42 / the author argues X
```

Press Enter and it becomes:

```
- the author argues X (42)
```

- **Sticky page** — start a line with just the delimiter to reuse the last page:
  ```
  42 / first point       ->   - first point (42)
  / second point         ->   - second point (42)
  43 / new section       ->   - new section (43)
  ```
  The remembered page survives a reload, so sticky keeps working after you restart Obsidian. If no page is remembered yet, Note Capture tells you instead of silently ignoring the line.
- **Roman numerals** — `xiv / on the preface` → `- on the preface (xiv)`. Only well-formed numerals count, so ordinary words built from those letters ("civil", "did") are left alone.
- **Sub-bullets** — indent the line (using Tab or Space) before typing to make the next note nest as a sub-bullet.
- **Page prefix** — set a prefix (prompted each time you turn capture on, or in settings) to get `- the author argues X (Smith, 42)`.
- **Spell check** — each committed line is checked locally. Choose **auto-correct** (fixes inline) or **flag** (shows a notice) in settings.
- **Note Toolbar highlight** — optionally highlight an item in a [Note Toolbar](https://github.com/chrisgurney/obsidian-note-toolbar) toolbar (e.g. a "Note" button) with a custom color whenever capture is installed, enabled, and turned on — a quick visual reminder that capture is live.

### Activation modes

| Mode                   | When a line is formatted                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Keypress** (default) | On Enter. Lines that aren't capture entries pass Enter straight through.                                                      |
| **Interval**           | Without pressing Enter: as soon as you move off a line you typed on, or after you pause on it for one interval (2 s default). |

Interval mode only ever acts on lines you have typed on in the current session, so parking the cursor in existing prose never rewrites it.

## Settings

| Setting               | Default     | Notes                                                    |
| --------------------- | ----------- | -------------------------------------------------------- |
| Activation mode       | keypress    | `keypress` or `interval`                                 |
| Interval              | 2000 ms     | Interval mode only; minimum 200 ms                       |
| Delimiter mode        | required    | `required` (`84/note`), `optional`, or `none` (`84note`) |
| Delimiter             | `/`         | Separates page from text                                 |
| Sticky page           | on          | Reuse last page when omitted                             |
| Page reference format | `(${page})` | `${page}` placeholder                                    |
| Sub-bullet indent     | tab         | `tab` or literal spaces                                  |
| Page prefix           | none        | e.g. `Smith, ` → `(Smith, 42)`                           |
| Spell check           | on          | Local, offline                                           |
| Correction mode       | flag        | `auto-correct` or `flag`                                 |
| Debug logging         | off         | Traces every capture decision to the developer console   |
| Note Toolbar highlight | off        | Pick a toolbar + item, and light/dark colors to apply while capture is active. Requires the Note Toolbar plugin |

## Troubleshooting

If a line isn't being formatted:

- Run **Note Capture: Show capture status** from the command palette — it reports whether capture is on, the activation mode, the delimiter and delimiter mode, and the remembered sticky page.
- Turn on **Settings → Diagnostics → Debug logging**, then open the developer console (Cmd/Ctrl-Shift-I). Every decision is logged, including why a line was skipped.
- **Settings → Diagnostics** also shows the remembered sticky page, with a **Clear** button.

## Full dictionary (optional)

Out of the box, spell check uses a built-in common-misspellings list. To enable full Hunspell spell checking, drop `en_US.aff` and `en_US.dic` into the plugin folder (`<vault>/.obsidian/plugins/note-capture/`). Note Capture loads them automatically via `nspell`.

## Roadmap

- **v1.1+** — optional, on-demand grammar + factual review via the Claude API.

## Develop

```bash
npm install
npm run build   # type-check + produce main.js
npm test        # vitest
npm run lint
```

Copy `main.js`, `manifest.json` (and any dictionary files) into a test vault's `.obsidian/plugins/note-capture/` and enable the plugin.
