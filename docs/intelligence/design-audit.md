# Design audit

Sources: `apps/web/src/app/peerfolio-5c.css` (the "5C" system), `globals.css`, `components/assistant/assistant.css`, `components/dashboard/{benchmark-compare,replay-control}.css`, `components/wealth/wealth.css`. This is a read of the CSS, not a rendered review; screenshots were not re-taken for this document.

## Existing language (5C)

| Aspect | What exists |
|---|---|
| Color tokens | `--bg --panel --raise --hair --hair2 --line --fg --fg2 --fg3 --pf-accent (+ --accent-a rgb triplet) --gain --loss --ink`; dark theme redefines the same names. A parallel HSL set (`--background`, `--primary`, ...) serves shadcn-style components. |
| Shape | `--r: 14px` panels, `--r-s: 9px` controls, 4px chips. Flat: hairline borders, no shadow (`.pf-panel`, `.surface`). |
| Type roles | `--serif` (Newsreader) for display figures (`.pf-hero-fig`, `.pf-display`); `--sans` (Hanken Grotesk) for UI; `--mono` (IBM Plex Mono) for tags, tickers and metadata (`.pf-tag`, `.pf-chip`, `.pf-t2`). Tabular lining numerals on numbers. |
| Motion | `--ease: cubic-bezier(0.22,1,0.36,1)`, durations `--d-1..4` (120-500 ms). Keyframes `pf-enter`, `pf-fade`, `pf-draw`, `pf-ring`, `pf-pulse`. Transform/opacity only; reduced-motion block neutralizes them. |
| Focus | `--pf-ring` two-step ring, used on every control. |

## How each new surface relates

| Surface | Reuses | Deliberately extends |
|---|---|---|
| Assistant window and launcher | 5C color tokens (`--panel`, `--fg*`, `--hair`), `--serif`/`--mono`, theme switch (light/dark follow tokens) | **The only glass material in the app**: translucent panel, `backdrop-filter` blur 26 px, lit conic-gradient edge while busy, a violet second light (`--ai-violet`) used as glow only, never as a fill. Scoped to `.pf-ai*` / `.pf-xr*`. Has an `@supports not backdrop-filter` fallback (near-opaque panel). |
| Orb | Accent tokens | Pure-CSS sphere (`orb.tsx`: glow, spin, core spans; keyframes `pf-float`, `pf-jelly`, `pf-orb-turn`, `pf-orb-breathe`). `phase` changes pace/brightness only. |
| X-Ray report | Hairline cards, mono labels, gain/loss tokens, serif figures | Report cards inside the glass window; staggered reveal. |
| Benchmark chips | `--raise`, `--hair`, `--pf-ring`, sans 11.5 px | Per-benchmark `--bm` color mixed into border/halo when selected (`.pf-bm-chip.is-on`). Choice persisted in `localStorage` (`pf-benchmark`). |
| Replay control | shadcn HSL `--border` for the track, 5C focus ring | Hairline 2 px scrubber, 12 px thumb; playback via `requestAnimationFrame`. |
| Wealth Lab | 5C tokens throughout | Custom range sliders (`.wl-range`) with an accent-filled track; own chart component. |

## Motion principles in use

- **Springs for window morphs**: `assistant.tsx` uses `motion/react` springs (launcher: stiffness 420 / damping 34; window: 380 / 36 / mass 0.9). CSS `.is-morph` transitions (0.4 s, the 5C ease) handle geometry changes.
- **CSS-only orb and edge light** (the edge animates a registered `@property --pf-angle` rather than rotating a large overlay).
- **Shimmer** on in-progress text (`pf-sheen`, `pf-sweep` on suggestion chips).
- **Reduced motion**: `MotionConfig reducedMotion="user"` for springs; a dedicated `@media (prefers-reduced-motion: reduce)` block in `assistant.css` stops orb, shimmer, edge, caret and morph transitions. Replay/wealth: inherits the global 5C neutralization; **not individually verified** for `requestAnimationFrame` playback in replay.

## Known visual limitations

- The glass treatment is intentionally inconsistent with the flat 5C panels; it will read as a different product layer if more surfaces adopt it.
- `backdrop-filter` blur over a full-page layer costs GPU on low-end devices; not profiled.
- Assistant window position/size persist in `localStorage` (`GEO_KEY`); docking is not built (see roadmap).
- Two accent systems coexist (5C tokens and the shadcn HSL set); the replay control uses the latter.
- No formal color-contrast audit was run on the violet glow, glass text on busy backgrounds, or the benchmark chip colors.
- Mobile: the assistant becomes a bottom sheet (`@media (max-width: 720px)`, `.is-sheet`); checked at one phone width only, if at all (not recorded).
