/**
 * Smooth typing. Text arrives from the network in bursts; drawing each burst whole makes the reply jump.
 * Instead the window reveals the text a few characters per frame, faster the further behind it is, so a
 * steady trickle reads as typing and a big burst catches up in a fraction of a second rather than lagging.
 * Pure, so the pacing can be tested without a browser.
 */

/** Characters per second when only a little is waiting. */
export const BASE_RATE = 85
/** Fraction of the backlog drained per second, so a large backlog never takes long to show. */
export const CATCH_UP = 5

/** How many characters of `text` to show after `dtMs` more time, given `shown` are showing now. */
export function nextRevealed(text: string, shown: number, dtMs: number): number {
  const backlog = text.length - shown
  if (backlog <= 0) return text.length
  const rate = Math.max(BASE_RATE, backlog * CATCH_UP)
  let next = Math.min(text.length, shown + Math.max(1, Math.round((rate * Math.min(dtMs, 100)) / 1000)))
  // Never stop between the two halves of a surrogate pair (an emoji would flash as a broken symbol).
  const code = text.charCodeAt(next - 1)
  if (next < text.length && code >= 0xd800 && code <= 0xdbff) next++
  return next
}
