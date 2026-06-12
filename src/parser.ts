export interface ParsedLine {
  /** Page number as typed, or null when sticky reuse applies. */
  page: string | null;
  /** The note text (after delimiter, or after the leading page digits). */
  text: string;
  /** True when the line had no page number AND no delimiter (bare sticky line). */
  bareSticky: boolean;
}

/** Matches Arabic digits or roman numerals (upper or lower case). */
const PAGE_RE = /^(\d+|[ivxlcdmIVXLCDM]+)\s*/;

/**
 * Parse a raw editor line into a Note Capture entry.
 *
 * Recognised forms (delimiter shown as "|", empty-delimiter as ""):
 *
 *   With delimiter:
 *     "42 | text"      -> { page: "42",  text: "text", bareSticky: false }
 *     "xiv | text"     -> { page: "xiv", text: "text", bareSticky: false }
 *     "| text"         -> { page: null,  text: "text", bareSticky: false }  (delimiter-sticky)
 *     "text"           -> { page: null,  text: "text", bareSticky: true  }  (bare-sticky, if stickyPage on)
 *
 *   Without delimiter (emptyDelimiter=true):
 *     "325Here is a note" -> { page: "325", text: "Here is a note", bareSticky: false }
 *     "xivHere is a note" -> { page: "xiv", text: "Here is a note", bareSticky: false }
 *     "Here is a note"    -> { page: null,  text: "Here is a note", bareSticky: true  }  (bare-sticky)
 *
 * Returns null when the line cannot be interpreted as a Note Capture entry.
 */
export function parseLine(
  raw: string,
  delimiter: string,
  stickyPage: boolean
): ParsedLine | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // ---- No-delimiter mode ---------------------------------------------------
  if (delimiter === "") {
    const m = trimmed.match(PAGE_RE);
    if (m) {
      const page = m[1];
      const text = trimmed.slice(m[0].length).trim();
      if (text.length === 0) return null; // just a page number, nothing to note
      return { page, text, bareSticky: false };
    }
    // No leading page — bare-sticky line (handled by caller based on stickyPage setting).
    if (!stickyPage) return null;
    return { page: null, text: trimmed, bareSticky: true };
  }

  // ---- Delimiter mode -------------------------------------------------------
  const idx = trimmed.indexOf(delimiter);
  if (idx !== -1) {
    const left = trimmed.slice(0, idx).trim();
    const text = trimmed.slice(idx + delimiter.length).trim();

    if (left.length === 0) {
      // "| text" — delimiter-sticky
      return { page: null, text, bareSticky: false };
    }

    const m = left.match(/^(\d+|[ivxlcdmIVXLCDM]+)$/);
    if (m) {
      return { page: m[1], text, bareSticky: false };
    }

    // Left side is neither empty nor a page number — not a Note Capture line.
    return null;
  }

  // No delimiter found — bare-sticky (no delimiter, no page).
  if (!stickyPage) return null;
  return { page: null, text: trimmed, bareSticky: true };
}
