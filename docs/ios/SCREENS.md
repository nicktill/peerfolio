# Screen map and navigation

The web's mobile tab bar has five columns (Portfolio, Leagues, Fantasy, Board, News) with the assistant as a floating launcher. The app keeps the
same order and swaps Board for a first-class Assistant tab, as requested. Board and Wealth Lab are reachable later from Leagues / Portfolio.

```
RootView
 |- LaunchView                      (restoring session, checks GET /me)
 |- SignInView                      Apple (primary), Google
 `- MainTabs (native TabView, 5 tabs)
     |- Portfolio    NavigationStack
     |    `- hero panel (net worth, today, all time, range picker, scrubbable chart, stats)
     |       allocation, holdings (top 6, expand), accounts, league pills, reconnect banner
     |       Wealth Lab row -> WealthLabView (scenarios chart, assumptions, target maths; also opened prefilled from the assistant's link)
     |       toolbar avatar -> SettingsView (sheet) -> DeleteAccountView (sheet)
     |- Leagues      NavigationStack
     |    |- My leagues | Board segmented control
     |    |    `- Board: range and All/Following pickers, verified traders, follow button
     |    |- list  (+ menu: Join with a code, Create a league -> sheets)
     |    `- LeagueDetailView  range picker, standings (tap row: holdings + reactions), invite (ShareLink), sharing toggle, leave
     |- Fantasy      NavigationStack
     |    |- Stocks | Sports segmented control  (Sports hidden: Features.sportsEnabled = false)
     |    |- list of fantasy leagues (+ join / create sheets)
     |    `- FantasyLeagueView  summary + cash, orders (cancel), picks, standings, activity, invite
     |         `- TradeSheet  ticker search, live quote, buy $ / sell shares or all, queued-for-open result
     |- News         headline recap (day or week), markets, sectors, fear and greed, earnings, headlines -> in-app Safari
     `- Assistant    NDJSON chat: markdown, tappable links, X-Ray / market / movers / earnings / benchmark cards, suggestion chips
```

State lives in per-screen `@Observable` view models (`Loadable<T>`: idle, loading, loaded, failed). The first load shows skeletons; refreshes keep
what is on screen. Every screen has previews with `Mock` data (light and dark), and `Mock` is decoded by the real models and unit-tested on Linux.

Assistant context: when you switch to the Assistant tab the page you came from (`portfolio`, `leagues`, `fantasy`, `news`) is sent as
`context.page`, which the backend uses to interpret "my portfolio" style questions.

Deliberately not in v1: account and position editing (manual accounts), Plaid Link, public trader profiles, benchmark overlay on the
chart, push notifications, widgets, iPad-specific layouts (it runs, with the phone layout), offline cache, saved assistant history.
