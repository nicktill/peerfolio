# In-product AI assistants: patterns worth borrowing

Notes from how the best chat-in-product assistants behave (Honeycomb Query Assistant and Canvas, ChatGPT and
Claude artifacts and canvas, Perplexity, GitHub Copilot Chat, Notion AI, Intercom Fin). These are written from
working knowledge of those products, not from fresh browsing, so treat the names as pointers rather than quotes.
Each pattern ends with what we did in Peerfolio.

## 1. Answer first, short by default

Perplexity and Claude lead with the conclusion and keep the default answer to a paragraph or a few bullets;
depth is something you ask for. The failure mode we had: "Analyze my portfolio" produced a report, so people
asked one or two things and left.

Peerfolio: the system prompt demands the verdict in the first sentence, under about 100 words by default, and a
60-word briefing for broad asks. The model reads a digest of the X-Ray (`lib/ai/xray-digest.ts`), not the whole
report, so it has nothing to dump. Requests low verbosity from models that support it.

## 2. Suggested follow-ups carry the depth

Perplexity's "Related", ChatGPT's suggestion chips and Copilot's follow-up buttons turn a short answer into a
guided drill-down. The user never faces a blank box after an answer.

Peerfolio: every answer ends with two or three questions in a `<follow_ups>` trailer. The app lifts it out of the
text (even mid-stream) and draws tappable chips. They are written for the current page and the answer just given.

## 3. Page-aware context, and showing that it is

Copilot-in-product assistants (GitHub, Notion, Intercom) know which page or object is open and say so, usually as
a chip near the input ("Asking about: Q3 board deck"). Ambiguity ("this", "here") resolves to what is on screen.

Peerfolio: the client reports the page, the open league, the selected chart range and the benchmark overlaid.
The server never trusts it: league ids are checked against the person's memberships before the model hears the
name, and range and benchmark are whitelisted. A `get_current_view` tool returns a summary of exactly what the
person is looking at. The composer shows a context chip ("Portfolio · 3M"). When a question is vague and the
screen does not settle it, the assistant asks one short clarifying question and offers options as chips.

## 4. Few tools, summarized results

Honeycomb's assistant works because the model emits a small structured thing (a query) and the product does the
heavy lifting. Long tool menus and raw data dumps make models ramble and cost tokens.

Peerfolio: one "look at my screen" tool covers most questions. The X-Ray tool returns a digest (top five
holdings, top three flags, headline numbers). Standings are trimmed to the top of the table plus the person's own
row. `get_my_leagues` was folded into the standings tool.

## 5. Generative UI cards, few and purposeful

ChatGPT and Claude render rich objects (charts, tables, artifacts) inline, but the best ones are single, legible
and tied to the question. Dashboards-in-a-chat-bubble feel like noise.

Peerfolio: the X-Ray is now one headline number, one stacked allocation bar with at most five labelled slices,
and a "Details" disclosure holding everything else. A reply carries at most two cards. Cards use the app's design
tokens, so light and dark both work.

## 6. Progressive disclosure

Claude artifacts collapse; Copilot hides diffs until asked; Honeycomb shows the query, with the results one click
away. Detail on demand keeps the first view calm.

Peerfolio: X-Ray details (stats, flags with threshold meters, concentration, sectors, positions, risk) sit behind
one toggle. Repeated cards fold to a single line.

## 7. Streaming that reads like typing

ChatGPT and Claude render Markdown as it arrives without flicker, and pace the text instead of dumping network
bursts. A visible Stop, then Copy and Regenerate once finished.

Peerfolio: a small Markdown parser produces a data tree (never HTML), and unfinished syntax (open code fence,
half a link) is closed for display while streaming. Text is revealed a few characters a frame, catching up
quickly when behind, and instantly for reduced motion. Stop keeps what was written and marks it "Stopped".

## 8. Links, citations and sources

Perplexity's numbered citations and Claude's source chips make claims checkable. Links must be obviously
clickable and safe.

Peerfolio: every URL or `[label](url)` is a blue underlined link. Web links open in a new tab with
`rel="noopener noreferrer"`; app links go through `next/link`; `javascript:`, `data:` and unknown app paths are
shown as plain text. The prompt tells the model to link only addresses a tool or web search gave it.
Not done: numbered citation chips for web search results (the API result here carries no structured sources).

## 9. Editable and pinned outputs

ChatGPT canvas and Claude artifacts let you keep and edit an output. Peerfolio already lets you save an X-Ray
report in the browser. Not done in this branch: pinning a card to the dashboard, or editing a Wealth Lab scenario
in place from the chat.

## 10. Honest failure

Good assistants say what they could not see, keep partial text on a stopped or failed answer, and offer a retry.

Peerfolio: tool limits are reported plainly, failed answers keep their partial text with "Try again", and a
network error never leaves an empty bubble.
