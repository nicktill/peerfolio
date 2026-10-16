# Running and testing the assistant locally

All commands run from the repo root unless noted.

## Automated checks

```bash
npm ci
npm run lint --workspace=@repo/web          # eslint, zero warnings allowed
npm run check-types --workspace=@repo/web   # tsc --noEmit
npm test --workspace=@repo/web              # node --test over src/**/*.test.ts (no database needed)
# only the assistant tests:
cd apps/web && node --test --experimental-strip-types "src/lib/ai/*.test.ts"
```

New pure logic and its tests: `markdown.ts` (Markdown and link handling), `followups.ts`, `reveal.ts` (typing
pace), `prompt.ts` (system prompt and page context), `xray-digest.ts`, plus additions to `chat-state`, `visuals`,
`xray-view` and `limits` tests.

## The real assistant (needs an OpenAI key)

```bash
docker compose up -d                          # Postgres on :5433
cp apps/web/.env.example apps/web/.env       # then set NEXTAUTH_SECRET and OPENAI_API_KEY
npm run db:reset --workspace=@repo/web        # migrate and seed five demo portfolios
npm run dev --workspace=@repo/web             # http://localhost:3000
```

Open `http://localhost:3000/dev-login`, sign in as a seeded user, and press Cmd/Ctrl + / (or "Ask anything").
Things to try:

- Portfolio page: "Analyze my portfolio". Expect a compact X-Ray card (value, today, one allocation bar,
  "Details" toggle), a briefing of about 60 words and three follow-up chips.
- Change the chart range or the benchmark, then ask "how do I compare?". The composer chip shows the range.
- A league page: "Why am I ranked here?". The answer should name that league. A made-up league id is ignored.
- Ask something vague ("is that good?"): expect one short clarifying question with options as chips.
- Ask for a table or a link ("list my top 3 holdings in a table, and link me to my leagues"): tables render,
  `[leagues](/leagues)` navigates in place, a web link opens a new tab.
- Stop mid-answer (the square button): the text stays and says "Stopped"; Regenerate reruns it. Copy puts the
  answer text on the clipboard.
- Toggle light and dark with the theme switch.

## Prompt evals (needs an OpenAI key, no database)

Thirteen scripted prompts run the real system prompt and tool schemas against the real model, with canned tool
results. They check the first tool called, answer length (60-word briefing, about 100 words otherwise), bold,
headings, filler, follow-ups, invented links, advice boundaries, and warn on figures that are not in the tool data.

```bash
OPENAI_API_KEY=sk-... npm run eval:assistant --workspace=@repo/web
npm run eval:assistant --workspace=@repo/web -- --only=vague --verbose   # one case, print the answer
```

Without a key it prints "skipping" and exits 0. A run costs a few cents. The same shape rules are unit-tested on
the exemplar answers in `src/lib/ai/style-lint.test.ts`.

## Before and after

`docs/assistant/compare/` holds side-by-side screenshots (origin/main on the left, this branch on the right) of six
scenarios in light, dark and phone width: analyze my portfolio, a position-size question, vs the S&P, a vague
question, a reply with links, and a four-turn conversation with a chart card. The answer text is canned
(no model call): the "before" uses the plain-text voice the old prompt produces, the "after" uses the new prompt's
exemplar answers. So the screenshots compare the interface and typography, not the model's real wording.

## Without an OpenAI key (UI only)

A dev-only harness page mounts the assistant with no sign-in. A script mocks the API with canned answers and takes
screenshots in light, dark and phone width (Playwright and Chromium must be installed; do not run
`playwright install` if your machine already has browsers).

```bash
npm i --no-save playwright --workspace=@repo/web   # only if playwright is not already resolvable
npm run dev --workspace=@repo/web -- -p 3111
# in another terminal
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node apps/web/scripts/assistant-visual-check.mjs
# screenshots land in /tmp/assistant-shots (override with SHOTS_DIR)
```

The page is `/preview/assistant-harness`; it 404s in production builds.

## Known limits

- The prompt and tool behavior can only be judged with a real model. Unit tests cover the plumbing, not taste.
- `text.verbosity` is sent only to `gpt-5*` models. If the API rejects it for your model, remove the line in
  `src/app/api/assistant/route.ts`.
- There is no per-stock page in the app, so "which stock" context comes from the question and `get_quotes`.
