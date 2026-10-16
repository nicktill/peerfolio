# Design tokens and how they map to SwiftUI

Machine-readable copy: [`design-tokens.json`](./design-tokens.json). Swift: `apps/ios/Peerfolio/DesignSystem/`.

## Which palette

The brief mentioned a warm off-white / emerald palette. That palette is in `apps/web/src/app/globals.css` `:root`, but it only styles
the public pages. **The signed-in web app overrides everything under `.peerfolio-app`** in `apps/web/src/app/peerfolio-5c.css` ("5C"):
a cool grey-blue system with an ink-blue accent. The iOS app is the signed-in app, so it follows 5C, and takes only the chart series
and viz surface from `globals.css`. If the owner wants the emerald look instead, change the values in `Theme.swift` and the JSON; nothing
else depends on them. (Open question 1.)

| Token | Light | Dark | SwiftUI |
|---|---|---|---|
| bg (page) | `#eceff2` | `#0d0f11` | `Theme.bg` |
| panel | `#f9fafb` | `#14171a` | `Theme.panel` |
| raise (pressed, "you" row) | `#edf0f4` | `#1e2226` | `Theme.raise` |
| hair (panel border) | `#d6dce3` | `#2a3036` | `Theme.hair` |
| hair2 (row rule) | `#e5e9ee` | `#22272b` | `Theme.hair2` |
| line (input border) | `#b4bfcb` | `#3b434b` | `Theme.line` |
| fg / fg2 / fg3 | `#202a34` `#4a5967` `#5b6b7c` | `#f0f2f4` `#b4bcc5` `#939ca7` | `Theme.fg`, `fg2`, `fg3` |
| accent | `#3867a1` | `#98b8e7` | `Theme.accent` |
| gain | `#286549` | `#94c8af` | `Theme.gain` |
| loss | `#a65048` | `#e6a39d` | `Theme.loss` |
| ink / inkFg (primary button) | `#25364b` / `#f9fafb` | `#edf2f8` / `#14181d` | `Theme.ink`, `inkFg` |
| medals 1/2/3 | `#8a6500 #4f5d6d #8a5426` | `#e0b544 #c3d0de #d39b6c` | `Theme.medal(for:)` |
| series 1-7 | `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #7c5cd6` | `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9b7cf0` | `Theme.seriesColor(i)` |

Colours are dynamic: `Color(light:dark:)` wraps a `UIColor` trait-collection provider, so they follow the system appearance and the in-app
Theme picker (System / Light / Dark, `@AppStorage("appearance")` -> `preferredColorScheme`) with no per-view code.

Rules carried over from the web: series colours are assigned in order and never cycled; direction of money is never colour alone (`Delta`
always draws a sign and an arrow, and a spoken label).

## Shape and spacing

Panel radius 14, control radius 9, chip 4, league tile 12, panel inset 16 on phones (web 18 on desktop, 16 below 860px), page gap 16,
row min-height 56, panel head 46. Panels are flat: 1pt `hair` border, no shadow (`Panel`). Rows are separated by `hair2` (`DataRow`, `RowDivider`).
The "you" row uses `raise` plus a 2pt accent rail; the top three standings add a medal-coloured rank numeral, a ring on the avatar and a faint wash.

## Type

| Role | Web | SwiftUI |
|---|---|---|
| Page title | Newsreader 400, 36/42 (28/32 mobile), -0.025em | `PFFont.pageTitle` (30) |
| Hero figure | Newsreader 400, 46-60, -0.035em, tabular | `PFFont.heroFigure` (48) |
| Stat | Hanken 500 20/28 | `PFFont.stat` |
| Body | Hanken 400 14/20 | `PFFont.body` / `bodyMedium` |
| Row subtitle | IBM Plex Mono 11/16 | `PFFont.rowSubtitle` |
| Eyebrow | Plex Mono 500 10.5, +0.09em, uppercase, preceded by a 2pt x 9pt glowing accent tick | `.eyebrow()` and `PanelHeader` |
| Tab label | Hanken 500 11 | `PFFont.tab` |

Fonts ship in `apps/ios/Peerfolio/Resources/Fonts/` (OFL-licensed Latin subsets converted from the `@fontsource` packages the web already
trusts: Hanken Grotesk 400/500/600, Newsreader 400 + italic, IBM Plex Mono 400/500) and are registered through `UIAppFonts` in `project.yml`.
Newsreader's PostScript name is `Newsreader16pt16pt-Regular` (static optical-size instance). `PFFont` uses `Font.custom(..., relativeTo:)` so sizes
follow Dynamic Type, and falls back to the system serif / mono if a file is missing. Note: the web's display font in `layout.tsx` (Bricolage
Grotesque) is overridden to Newsreader inside the app (`--font-display: var(--serif)`), so it is not bundled.

## Motion

One curve everywhere: `cubic-bezier(0.22, 1, 0.36, 1)` (`Motion.ease`), durations 120 / 200 / 320 / 500 ms. Ports of the web primitives:
`.reveal(i)` (rise 12pt, 40ms stagger, cap 6), `.swapIn(on:)` for content that changes in place, `PressStyle` (97%), `RowPressStyle`
(raise on press), chart line draw-in, skeleton pulse, `LiveDot`. All of it checks `accessibilityReduceMotion`.

## Native additions

Haptics (`Haptics`): selection on tab, range and picker changes and on chart scrubbing; light impact on pull-to-refresh and reactions; success /
warning / error notifications for trade filled / queued / failed and sign-in. Native `TabView`, sheets with detents, pull to refresh, swipe-back,
`ShareLink` for invite codes, `SFSafariViewController` for articles, Dynamic Type, VoiceOver labels on figures, system Sign in with Apple button.
The tab bar is styled to the web's mobile bar (page background, hairline, 11pt medium labels, muted until selected).
