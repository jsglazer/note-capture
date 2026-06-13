/**
 * Decide whether the committed line should become a sub-bullet.
 *
 * New algorithm (replaces timing-window):
 * A line nests as a sub-bullet when the raw text typed by the user begins with at
 * least one whitespace character (tab or space) BEFORE the Note Capture syntax.
 * That is, the user presses Enter, then Tab (or Space), and then starts typing —
 * the indent signals intent to nest.
 *
 * Example:
 *   "\t42 | sub point"   -> nested  (user indented)
 *   "42 | top level"     -> top-level
 *   "\t| sticky sub"     -> nested
 */
export function isNested(raw: string): boolean {
	return raw.length > 0 && (raw[0] === '\t' || raw[0] === ' ');
}
