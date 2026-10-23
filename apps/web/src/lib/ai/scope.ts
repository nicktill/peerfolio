/**
 * A free first pass over the newest question, before any model is called. It catches only the blatant misuse
 * (counting to a thousand, coding puzzles, prompt-injection phrases, pasted gibberish); everything arguable goes
 * on to the model, whose prompt carries the fuller scope rule. Pure, so every pattern can be tested.
 */

export type OffTopic = "count" | "code" | "injection" | "junk"

export const DECLINE = "I can only help with Peerfolio: your portfolio, markets and investing, and your leagues. Ask me about one of those."

const LANGUAGES = "python|javascript|typescript|java|c\\+\\+|c#|rust|golang|ruby|php|swift|kotlin|react|bash"

const PATTERNS: [OffTopic, RegExp][] = [
  [
    "count",
    new RegExp(
      [
        // "count to 1000", "count from 1 up to 500"
        String.raw`\bcount\b.{0,25}\b(to|up to|until|through|from)\b.{0,15}\d{2,}`,
        // "say hello 500 times", "repeat this 1000x"
        String.raw`\b(repeat|say|type|write|print|spell)\b.{0,50}\b\d{3,}\s*(times|x)\b`,
        // "list the first 100 primes"
        String.raw`\b(first|next)\s+\d{2,}\s+(prime|fibonacci|digit|number|word|letter|square)`,
        // "write the alphabet 50 times", "recite pi to 200 digits"
        String.raw`\b(recite|print|write out)\b.{0,20}\b(pi|the alphabet)\b`,
      ].join("|"),
      "i",
    ),
  ],
  [
    "code",
    new RegExp(
      [
        String.raw`\b(two[\s-]?sum|three[\s-]?sum|leetcode|hackerrank|codeforces|fizz[\s-]?buzz|reverse (a |the )?(linked list|string|array)|binary search tree|merge sort|quick ?sort|dynamic programming|time complexity|fibonacci (sequence|function|number))\b`,
        String.raw`\b(write|code|implement|build|create|give me|generate|debug|fix)\b.{0,30}\b(function|program|script|algorithm|regex|class|snippet|code)\b`,
        String.raw`\b(${LANGUAGES})\b.{0,20}\b(function|script|program|code|snippet)\b`,
        String.raw`\b(write|code|implement|give me)\b.{0,15}\b(in|using|with)\s+(${LANGUAGES})\b`,
        String.raw`\bsolve (this|the) (algorithm|coding|leetcode|puzzle|riddle)`,
      ].join("|"),
      "i",
    ),
  ],
  [
    "injection",
    new RegExp(
      [
        String.raw`\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(previous|prior|above|earlier|all|your|the|system)\b.{0,25}\b(instructions?|prompts?|rules|guidelines|restrictions|limits)\b`,
        String.raw`\b(reveal|show|print|repeat|leak|output)\b.{0,25}\b(system prompt|your (system )?(prompt|instructions)|initial prompt)\b`,
        String.raw`\bjailbreak\b|\bdeveloper mode\b|\bdo anything now\b|\byou are now\b.{0,40}\b(unrestricted|unfiltered|dan)\b`,
        String.raw`\bpretend (you have|there are) no (rules|restrictions|limits)\b`,
      ].join("|"),
      "i",
    ),
  ],
]

/** Why the newest question should not reach the model, or null when it should. */
export function offTopicReason(text: string): OffTopic | null {
  const t = text.trim()
  // The same few characters over and over is a way to burn tokens, not a question.
  if (/([\s\S]{1,8}?)\1{24,}/.test(t)) return "junk"
  for (const [reason, pattern] of PATTERNS) if (pattern.test(t)) return reason
  return null
}
