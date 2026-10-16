# iOS app status

Branch `feat/ios-app` (pushed). This file is the resume point: read "Next steps" first. Docs: API.md, DESIGN_TOKENS.md (+ design-tokens.json),
SCREENS.md, COMPLIANCE.md, OPEN_QUESTIONS.md, and `apps/ios/README.md` for the Mac setup.

## Done and verified here (Linux, Swift 6.0.3 toolchain, Node 22)

- **Backend, additive** (`apps/web`):
  - Bearer-token auth inside `getCurrentUserId` (`src/lib/mobile-bearer.ts`); the cookie path is untouched.
  - Apple and Google ID-token exchange (`/api/mobile/auth/{token,refresh,logout}`), rotating hashed refresh tokens with reuse detection.
  - **Apple token revocation on account deletion** (code exchange at sign-in, encrypted storage, revoke inside `DELETE /api/me`, best effort).
  - **Rate limiting** for the mobile routes (Postgres fixed windows by hashed address, fails open).
  - **App Review sign-in** `/api/mobile/auth/review` (404 unless env-enabled, one email, constant-time compare, 5 per 5 minutes, optional demo seeding).
  - **Push groundwork**: `POST/DELETE /api/mobile/devices` and a `device_tokens` table. No sender.
  - `/api/v1/*` rewrite with `X-Peerfolio-Api-Version`; env vars in `.env.example`.
  - **Migration is `0026_mobile_auth`** (journal idx 26, snapshot `0026_snapshot.json`), renumbered because `feat/sports-picks` takes `0025`. It creates `auth_identities`, `mobile_refresh_tokens`, `device_tokens`, `rate_limits`. If the other branch merges first nothing collides; if this one does, the other must renumber (or regenerate its snapshot). Generated with drizzle-kit, not hand-written.
  - `upsertUser` in `auth.ts` is exported and `DELETE /api/me` gained one `revokeAppleTokens(userId)` call; those are the only edits to existing logic.
  - Web: **966/966 tests pass** (21 new in `mobile-auth-core.test.ts` and `mobile-extras.test.ts`), `npm run check-types` clean, ESLint clean on every file this branch touches. `npm run lint` over the whole app still reports 3 `react/no-unescaped-entities` warnings that exist on the base branch.
- **PeerfolioKit** (`apps/ios/PeerfolioKit`): models mirroring the real responses, `APIClient` with single-flight refresh, Keychain store, NDJSON parser, markdown blocks, formatting, and the **Wealth Lab engine** ported from the web (outputs cross-checked against `engine.ts` on the same inputs). `swift test`: **38 tests pass**. The sources also build clean with `-swift-version 6` (strict concurrency).
- **Palette**: `Theme.swift` and `design-tokens.json` use the signed-in web app's cool grey-blue "5C" system in light and dark (verified against `peerfolio-5c.css`). No screen contains a literal colour; everything goes through `Theme`.

## Written but NEVER compiled (needs Xcode)

All SwiftUI in `apps/ios/Peerfolio/` (~3.5k lines): design system, sign-in (+ review sheet), Portfolio (Swift Charts), Leagues + Board, Fantasy with trade sheet,
News, Assistant, Wealth Lab, Settings, previews. Only `swiftc -parse` passes, and I did a line-by-line review for memberwise inits, `@MainActor` isolation
(the `App` struct is now `@MainActor`), Charts calls and result-builder rules. Remaining doubts to check first when you build: `GIDSignIn.signIn(...nonce:)` signature in
your GoogleSignIn version, `TextFieldStyle._body`, Charts `annotation(overflowResolution:)`, and whether `PeerfolioApp`'s `@State` initializer compiles under your Xcode's isolation rules.
Also unverified: XcodeGen output, font registration, entitlements, visual fidelity versus the web, haptics, animations, Dynamic Type, VoiceOver.
Not exercised against a live database: the `/api/mobile/*` route handlers, the drizzle stores and the rate-limit upsert (the policies are unit tested with in-memory stores).
Apple's revoke and token endpoints are tested against a fake `fetch`, never the real Apple service. `next build` was not run.

## Stubbed / not built

Plaid Link (web only), manual account and position editing, public trader profiles, benchmark overlay, push sender and the app's remote-notification registration,
widgets, saved assistant history, offline cache, Sports fantasy (hidden by `Features.sportsEnabled`), rate limiting outside the mobile routes.

## Next steps (priority order)

1. On a Mac: `brew install xcodegen`, `cd apps/ios && xcodegen generate`, set the team, build, fix compile errors, run every preview and compare with the web at phone width in light and dark (README has the steps).
2. Server env: `MOBILE_AUTH_SECRET`, `APPLE_BUNDLE_ID`, `GOOGLE_IOS_CLIENT_ID`; run migration 0026; sign in end to end with Apple and Google; shorten `MOBILE_ACCESS_TTL_SECONDS` to 60 to watch refresh.
3. Create the Sign in with Apple key, set `APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY`, delete a test account and confirm the Apple connection disappears from the device's Sign in with Apple list.
4. Decide review-account seeding (OPEN_QUESTIONS 4), set `APP_REVIEW_*` for the review period, test the "Have a review code?" path against that server.
5. Answer OPEN_QUESTIONS.md; do the COMPLIANCE.md owner items (privacy manifest and nutrition label, screenshots, age rating).
6. Polish against the web: skeleton shapes, chart axes, empty states, iPad layout; then benchmark overlay, Plaid Link, trader profiles, saved assistant history.
7. Push: request notification permission and register tokens via `/api/mobile/devices`, build the APNs sender, choose the events.
8. CI: `swift test` for `apps/ios/PeerfolioKit` and `xcodebuild test` for the app.

## Local copies

A git bundle of the branch is at `/home/user/peerfolio/ios-backups/feat-ios-app.bundle` (restore with `git clone feat-ios-app.bundle -b feat/ios-app`).
The Linux checks used the Swift 6.0.3 toolchain from the official `swift:6.0-noble` image (any Swift 5.10+ toolchain runs `swift test`).
