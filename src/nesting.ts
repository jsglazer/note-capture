/**
 * Decide whether the line being committed should nest as a sub-bullet.
 *
 * The line nests when the gap since the previous committed line is shorter than the
 * configured window — i.e. the follow-on text was entered quickly. The very first line
 * (lastEnterTime === 0) is always top-level.
 */
export function isNested(now: number, lastEnterTime: number, windowMs: number): boolean {
  if (lastEnterTime <= 0) return false;
  return now - lastEnterTime < windowMs;
}
