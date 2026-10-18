/**
 * Follow-up questions that don't depend on the model: shown when an answer arrives without usable ones (the
 * model left the trailer out or garbled it), so there is always a next step to tap. Per page, and never the
 * question that was just asked.
 */

type Page = "portfolio" | "leagues" | "fantasy" | "sports" | "news" | "board" | "wealth" | "other"

const PORTFOLIO = ["What are my biggest risks?", "How do I compare with the S&P 500?", "What are my largest holdings?", "Which holdings moved most today?"]

const BY_PAGE: Record<Page, string[]> = {
  portfolio: PORTFOLIO,
  other: PORTFOLIO,
  board: PORTFOLIO,
  news: ["Which news matters to my holdings?", "What are today's biggest movers?", "Who reports earnings this week?", "How is the market doing?"],
  leagues: ["How far am I from the leader?", "Who is ahead of me?", "Compare over a longer range", "Analyze my portfolio"],
  fantasy: ["What drove my fantasy returns?", "How does my strategy compare with the leader?", "What changed in the standings?", "Analyze my portfolio"],
  sports: ["What are my open picks?", "How do parlays work?", "Where do I stand in the league?", "What is my max pick?"],
  wealth: ["Make a more conservative scenario", "How much do I need to save to reach $1M?", "What if I invest $500 more a month?", "Analyze my portfolio"],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

export function fallbackFollowUps(page: Page, asked: string, max = 3): string[] {
  const skip = norm(asked)
  return BY_PAGE[page].filter((q) => norm(q) !== skip).slice(0, max)
}
