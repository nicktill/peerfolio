# Before / after

Left: origin/main. Right: feat/assistant-polish. Files are `<scenario>-<light|dark|phone>.png`.

Scenarios: `analyze`, `position`, `vs`, `vague`, `link`, `conversation` (four turns).

Answer text is canned, not model output: "before" is written in the plain-text voice the old prompt produced,
"after" in the new prompt's exemplar voice. The screenshots show the interface, typography and cards.

## Better
- Header is opaque, so page content no longer ghosts through it (visible on main in every shot).
- The X-Ray is a headline value, today's move, one line on the top flag, one allocation bar, and a Details toggle.
  Main shows the full report: stats, three flags, five folds, then three chips and a wall of text.
- Replies are short, verdict-first, with tabular figures, signed gains and losses in the gain/loss colours, and
  at most a few bold terms. Follow-up chips and Copy / Regenerate sit under the answer.
- Links: main shows bare URLs as plain text. Here, addresses seen in tool results or searches are blue links
  (new tab, noopener); app links navigate in place; an address the model wrote from memory is shown dotted and
  not clickable.
- The benchmark card gains the two-line chart above the bars.

## Worse or unverified
- Real answer quality and length depend on the model; run `npm run eval:assistant` with a key.
- Prompt is longer (exemplars), so each request costs somewhat more input; reasoning effort is now `low` for
  everything except greetings, so latency and cost per answer are a little higher than on main.
- Source chips use each site's `/favicon.ico` (a request to the cited site); falls back to a letter.
- Screenshots were taken in Chromium via a mock API; Safari / iOS keyboard behaviour is unverified.
