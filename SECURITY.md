# Security Policy

## Supported versions

Only the latest released version of Note Capture receives fixes. Please update to
the newest release before reporting an issue.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue:

- Use GitHub's **"Report a vulnerability"** button (Security tab → Privately report
  a vulnerability): <https://github.com/jsglazer/note-capture/security/advisories/new>
- or open a regular issue **without** sensitive details and ask for a private channel.

Please include reproduction steps and the plugin version (see `manifest.json`). We aim
to acknowledge reports within 14 days and to release a fix in a subsequent version.

## Scope & threat model

Note Capture runs inside Obsidian. It watches typed input in the editor, parses a
page number / delimiter / text pattern, and rewrites the line into a formatted
Markdown bullet.

- The plugin makes **no network requests**, adds no telemetry, and stores no secrets
  — its only state is the formatting options in plugin settings.
- The text it processes is the user's own note input, edited in place through the
  Obsidian editor API.
