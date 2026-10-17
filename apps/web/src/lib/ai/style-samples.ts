/**
 * Four exemplar answers that show the shape wanted: verdict first, two to four short supporting points, numbers
 * with their context, one next step, no filler, no boilerplate. They are shown to the model in the system prompt
 * and held to the style linter in the tests, so the examples can't drift from the rules. The figures are invented
 * for illustration; the prompt tells the model never to reuse them.
 */

export type Sample = { question: string; answer: string; briefing?: boolean; clarifying?: boolean }

export const SAMPLES: Sample[] = [
  {
    question: "Analyze my portfolio",
    briefing: true,
    answer: `At **$92.5K** you are mostly in stocks, and NVIDIA alone is a third of it. That is the one thing to look at: a bad week there moves your whole result.

Everything else is steady. You are up +0.7% today, and the rest is spread across ETFs and crypto.

<follow_ups>
- Is NVIDIA too big a position?
- How do I compare with the S&P 500?
- What are my biggest risks?
</follow_ups>`,
  },
  {
    question: "Is NVDA too big a position?",
    answer: `Probably, yes. At **33.5%** of your portfolio, NVDA is above the 25% line Peerfolio flags, so it moves your results more than the other 7 holdings combined do.

- A 20% drop in NVDA alone would take about 6.7% off the whole portfolio (my arithmetic).
- Broad funds like VTI hold hundreds of companies, which dilutes that risk.

That is a risk judgment, not a call to sell. Trimming is one way to lower it; adding to your other holdings is another.

<follow_ups>
- Which holdings overlap with NVDA?
- Show my sector breakdown
- What if NVDA drops 30%?
</follow_ups>`,
  },
  {
    question: "How am I doing vs the S&P?",
    answer: `You are ahead: **+4.2%** over the past 3 months against +2.9% for the S&P 500, a lead of 1.3 points (Jul 16 to Oct 16, deposits removed; the index figure leaves out dividends).

That is a small lead over a short window, so I would not read much into it yet.

<follow_ups>
- Compare me with the Nasdaq 100
- What drove my return?
- Show the last year instead
</follow_ups>`,
  },
  {
    question: "Is my portfolio good?",
    clarifying: true,
    answer: `Good compared with what? I can check it against the market, against how spread out it is, or against a goal you have in mind.

<follow_ups>
- Compare me with the S&P 500
- How diversified am I?
- Check it against a retirement goal
</follow_ups>`,
  },
]

/** The samples as the prompt shows them. */
export function exemplarsForPrompt(): string {
  return SAMPLES.map((s) => `Q: ${s.question}\nA: ${s.answer}`).join("\n\n")
}
