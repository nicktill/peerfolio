import { splitFollowUps } from "./followups.ts"

/**
 * A linter for the shape of an answer, used by the unit tests on sample replies and by the prompt evals on real
 * ones. It checks what makes an answer easy to scan, not whether it is right: short, verdict-first, little bold,
 * no walls of text, no headings or emoji, no boilerplate, and follow-ups to carry the depth.
 */

export type StyleOptions = {
  /** Word limit for the answer text (the follow-up trailer does not count). */
  maxWords?: number
  /** A briefing for a broad ask, held to a tighter limit. */
  briefing?: boolean
  /** The answer is a clarifying question: no length floor, one question mark at most. */
  clarifying?: boolean
}

export const LIMITS = { words: 110, briefingWords: 70, bold: 3, paragraphWords: 55, bullets: 5, sentenceWords: 38 } as const

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u
const BOILERPLATE = /\b(as an ai|i am not a financial advisor|i'm not a financial advisor|not financial advice|this is not investment advice|consult a (licensed )?(financial )?(advisor|professional)|i hope this helps|great question|certainly!|let me know if)\b/i
const FILLER_OPEN = /^(sure|certainly|of course|absolutely|great|okay|ok)[,!. ]/i

export function lintAnswer(raw: string, opts: StyleOptions = {}): string[] {
  const { body, followUps } = splitFollowUps(raw)
  const problems: string[] = []
  const limit = opts.maxWords ?? (opts.briefing ? LIMITS.briefingWords : LIMITS.words)

  const words = wordCount(body)
  if (words === 0) problems.push("empty answer")
  if (words > limit) problems.push(`too long: ${words} words (limit ${limit})`)

  const bold = (body.match(/\*\*[^*\n]+\*\*/g) ?? []).length
  if (bold > LIMITS.bold) problems.push(`too much bold: ${bold} (limit ${LIMITS.bold})`)
  if (/^\s*\*\*[^*]+\*\*\s*$/m.test(body)) problems.push("a bold line used as a heading")

  if (/^\s{0,3}#{1,6}\s/m.test(body)) problems.push("uses a heading")
  if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/m.test(body)) problems.push("uses a horizontal rule")
  if (EMOJI.test(body)) problems.push("uses emoji")
  if (BOILERPLATE.test(body)) problems.push("boilerplate disclaimer or filler")
  if (FILLER_OPEN.test(body.trim())) problems.push("opens with filler instead of the answer")

  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim() && !/^\s*([-*]|\d+[.)])\s/.test(p) && !p.includes("|"))
  for (const p of paragraphs) if (wordCount(p) > LIMITS.paragraphWords) problems.push(`a paragraph of ${wordCount(p)} words (limit ${LIMITS.paragraphWords})`)

  const bullets = (body.match(/^\s*([-*•]|\d+[.)])\s/gm) ?? []).length
  if (bullets > LIMITS.bullets) problems.push(`${bullets} bullets (limit ${LIMITS.bullets})`)

  const longSentence = body
    .replace(/\|[^\n]*\n?/g, "")
    .split(/(?<=[.!?])\s+/)
    .find((s) => wordCount(s) > LIMITS.sentenceWords)
  if (longSentence) problems.push(`a ${wordCount(longSentence)}-word sentence`)

  if (opts.clarifying) {
    if ((body.match(/\?/g) ?? []).length > 2) problems.push("asks more than one question")
  }
  if (followUps.length < 2 || followUps.length > 3) problems.push(`${followUps.length} follow-ups (want 2-3)`)
  if (followUps.some((q) => q.length > 60)) problems.push("a follow-up over 60 characters")
  return problems
}
