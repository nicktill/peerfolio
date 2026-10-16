/**
 * The assistant ends an answer with two or three questions worth asking next, in a trailer the app turns into
 * tappable suggestions:
 *
 *   <follow_ups>
 *   - Which holding is driving the risk?
 *   - How does this compare with the S&P 500?
 *   </follow_ups>
 *
 * The trailer is never shown as text, even while it is still being written, and is left out of the history sent
 * back to the model. Pure, so the streaming edge cases can be tested.
 */

export const FOLLOW_UP_TAG = "<follow_ups>"
const CLOSE_TAG = "</follow_ups>"
const MAX_FOLLOW_UPS = 3
const MAX_LENGTH = 90

export type Split = { body: string; followUps: string[] }

/** The longest tail of `text` that is the start of the opening tag ("…<follow_u"), which must stay hidden until it resolves. */
function partialOpenTag(text: string): number {
  const max = Math.min(FOLLOW_UP_TAG.length - 1, text.length)
  for (let n = max; n > 0; n--) if (FOLLOW_UP_TAG.startsWith(text.slice(text.length - n))) return n
  return 0
}

export function splitFollowUps(text: string): Split {
  const open = text.indexOf(FOLLOW_UP_TAG)
  if (open === -1) {
    const partial = partialOpenTag(text)
    return { body: (partial ? text.slice(0, text.length - partial) : text).trimEnd(), followUps: [] }
  }
  const close = text.indexOf(CLOSE_TAG, open)
  const inner = text.slice(open + FOLLOW_UP_TAG.length, close === -1 ? undefined : close)
  // While the trailer is still arriving only finished lines count, so a half-written question never flashes up.
  const complete = close === -1 ? inner.slice(0, inner.lastIndexOf("\n") + 1) : inner
  const followUps: string[] = []
  for (const raw of complete.split("\n")) {
    const q = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["“]|["”]$/g, "")
      .trim()
    if (q && q.length <= MAX_LENGTH && !q.includes("<") && !followUps.includes(q)) followUps.push(q)
    if (followUps.length === MAX_FOLLOW_UPS) break
  }
  return { body: text.slice(0, open).trimEnd(), followUps }
}

/** What goes back to the model as history: the answer without its suggestions. */
export const withoutFollowUps = (text: string) => splitFollowUps(text).body
