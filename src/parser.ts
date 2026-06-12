export type DelimiterMode = "required" | "optional" | "none";

export interface ParsedLine {
  /** Page number as typed, or null when delimiter-sticky reuse applies. */
  page: string | null;
  /** The note text. */
  text: string;
}

/** Matches Arabic digits or roman numerals (upper or lower case). */
const PAGE_RE = /^(\d+|[ivxlcdmIVXLCDM]+)$/;

/**
 * Try to parse a line that MUST contain the delimiter.
 *   "42/note"  -> { page: "42",  text: "note" }
 *   "xiv/note" -> { page: "xiv", text: "note" }
 *   "/note"    -> { page: null,  text: "note" }  (delimiter-sticky)
 */
function parseWithDelimiter(trimmed: string, delimiter: string): ParsedLine | null {
  const idx = trimmed.indexOf(delimiter);
  if (idx === -1) return null;

  const left = trimmed.slice(0, idx).trim();
  const text = trimmed.slice(idx + delimiter.length).trim();
  if (text.length === 0) return null;

  if (left.length === 0) return { page: null, text };

  if (PAGE_RE.test(left)) return { page: left, text };

  return null; // left side is not a valid page number
}

/**
 * Try to parse a line where the page number is directly adjacent (no delimiter).
 *   "42Note here"  -> { page: "42",  text: "Note here" }
 *   "xivNote here" -> { page: "xiv", text: "Note here" }
 *   "Note here"    -> null  (no leading page number)
 */
function parseWithoutDelimiter(trimmed: string): ParsedLine | null {
  const m = trimmed.match(/^(\d+|[ivxlcdmIVXLCDM]+)([\s\S]+)/);
  if (!m) return null;
  const text = m[2].trim();
  if (text.length === 0) return null;
  return { page: m[1], text };
}

/**
 * Parse a raw editor line into a Note Capture entry.
 *
 * delimiterMode controls which forms are accepted:
 *   "required" — line MUST contain the delimiter: "42/note" or "/note" (sticky)
 *   "none"     — no delimiter: "42note" (page directly adjacent); no sticky possible
 *   "optional" — both forms work: "42/note", "/note", "42note"
 *
 * Returns null when the line is not a Note Capture entry. Callers use this to let
 * a normal Enter happen instead.
 *
 * Note: bare text lines with no page number and no delimiter are NEVER matched,
 * preventing accidental re-formatting of existing prose and bullets.
 */
export function parseLine(
  raw: string,
  delimiter: string,
  delimiterMode: DelimiterMode
): ParsedLine | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  switch (delimiterMode) {
    case "required":
      return parseWithDelimiter(trimmed, delimiter);

    case "none":
      return parseWithoutDelimiter(trimmed);

    case "optional": {
      // Delimiter path takes priority when the delimiter is present.
      if (trimmed.includes(delimiter)) {
        const withDelim = parseWithDelimiter(trimmed, delimiter);
        if (withDelim !== null) return withDelim;
      }
      return parseWithoutDelimiter(trimmed);
    }
  }
}
