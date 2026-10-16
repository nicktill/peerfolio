# iOS app status

Branch: `feat/ios-app`. Last updated: see `git log`. This file is the resume point: read "Next steps" first.

## Done
- Backend (additive): bearer-token auth in `getCurrentUserId` (`apps/web/src/lib/mobile-bearer.ts`), token exchange for Apple and Google ID tokens (`/api/mobile/auth/{token,refresh,logout}`), rotating refresh tokens in new tables `auth_identities` and `mobile_refresh_tokens` (migration `0025_mobile_auth.sql`), `/api/v1/*` rewrite with `X-Peerfolio-Api-Version` header. 14 new unit tests pass; typecheck passes; the full suite passed before (945) and is re-run before the final commit.
- Lint: `npm run lint` fails on 4 warnings that exist on the base branch, none in files this branch touches.

## Not done yet
Everything under `docs/ios/*` other than this file, and all Swift code (`apps/ios`). See Next steps.

## Next steps (priority order)
1. `docs/ios/API.md`, `DESIGN_TOKENS.md` (+ `design-tokens.json`), `SCREENS.md`, `COMPLIANCE.md`, `OPEN_QUESTIONS.md`.
2. `apps/ios/PeerfolioKit` Swift package (Foundation only): Codable models, API client, token refresh actor, NDJSON parser, tests.
3. `apps/ios/Peerfolio` SwiftUI app + `project.yml` (xcodegen): design system, Portfolio, Leagues, Fantasy, News, Assistant, previews.
4. README for the Mac steps.

## Unverified without Xcode
Nothing SwiftUI has been compiled. The route handlers for `/api/mobile/auth/*` and the DB store are typechecked but not exercised against a database.
