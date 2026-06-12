export interface ParsedLine {
  /** Page number as typed, or null when the line started with just the delimiter (sticky reuse). */
  page: string | null;
  /** The note text after the delimiter. */
  text: string;
}

/**
 * Parse a raw editor line into a NoteCap entry.
 *
 * Recognised forms (delimiter shown as "|"):
 *   "42 | the author argues X"  -> { page: "42", text: "the author argues X" }
 *   "| another point"           -> { page: null,  text: "another point" }   (sticky reuse)
 *
 * Returns null when the line is not a NoteCap entry (no delimiter, or a non-numeric
 * left-hand side such as ordinary prose containing a "|"). Callers should let a normal
 * Enter happen in that case.
 */
export function parseLine(raw: string, delimiter: string): ParsedLine | null {
  if (!delimiter) return null;

  const idx = raw.indexOf(delimiter);
  if (idx === -1) return null;

  const left = raw.slice(0, idx).trim();
  const text = raw.slice(idx + delimiter.length).trim();

  // Empty left side -> sticky page reuse.
  if (left.length === 0) {
    return { page: null, text };
  }

  // Otherwise the left side must be a page number, else this isn't a NoteCap line.
  if (/^\d+$/.test(left)) {
    return { page: left, text };
  }

  return null;
}
