# Peerfolio for iOS

Native SwiftUI app (iOS 17+, Swift Concurrency, Observation, Swift Charts) for the same backend as the website.

```
apps/ios/
  PeerfolioKit/      Swift package, Foundation only: models, API client, token refresh, NDJSON parser, markdown blocks.
                     Builds and tests on Linux and macOS (`swift test`).
  Peerfolio/         the app target: design system, screens, previews, fonts, assets
  PeerfolioTests/    app-level unit tests (Xcode only)
  project.yml        XcodeGen spec (the .xcodeproj is generated, not committed)
```

Docs: `docs/ios/` (API inventory, design tokens, screens, compliance, open questions, STATUS).

## First run on a Mac (about 10 minutes)

1. `brew install xcodegen` and install Xcode 16 or newer.
2. Run the web app against a database, with the mobile env vars (see below): from the repo root `docker compose up -d`, then in `apps/web`
   `npm run db:migrate && npm run db:seed && npm run dev`. The migration `0027_mobile_auth` creates the new tables.
3. `cd apps/ios && xcodegen generate && open Peerfolio.xcodeproj`
4. In `project.yml` (or Xcode): set `DEVELOPMENT_TEAM`, confirm the bundle id `org.peerfolio.app`, and for Google sign-in set `GOOGLE_IOS_CLIENT_ID` and
   `GOOGLE_IOS_REVERSED_CLIENT_ID` (Google Cloud Console > OAuth client of type iOS). Then regenerate.
5. Enable *Sign in with Apple* for the bundle id in the Apple developer portal.
6. Pick an iPhone simulator and Run. Debug builds talk to `http://localhost:3000`; Release builds to `https://www.peerfolio.org` (change
   `PEERFOLIO_BASE_URL` in `project.yml`). On a real device use your Mac's LAN address.
7. Open the SwiftUI previews (every screen has light and dark previews with mock data) and run tests with Cmd-U.

Simulator note: Sign in with Apple needs an Apple ID signed into the simulator. For local development without OAuth, the backend's dev-login does not
apply to the app; use a real Apple or Google account against your local server, whose env vars must include the matching client ids.

## Server environment (apps/web, all optional until you ship the app)

| Variable | Purpose |
|---|---|
| `MOBILE_AUTH_SECRET` | 32+ chars; signs access tokens. Without it the mobile endpoints answer 503 and bearer tokens are ignored. |
| `APPLE_BUNDLE_ID` | audience of Apple ID tokens; comma-separate to allow several |
| `GOOGLE_IOS_CLIENT_ID` | audience of Google ID tokens from the app (`GOOGLE_CLIENT_ID` is also accepted) |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Sign in with Apple key; with `APPLE_BUNDLE_ID` enables token revocation on account deletion |
| `APP_REVIEW_EMAIL`, `APP_REVIEW_CODE`, `APP_REVIEW_SEED_DEMO` | App Review sign-in (off unless both of the first two are set); see COMPLIANCE.md |
| `MOBILE_ACCESS_TTL_SECONDS`, `MOBILE_REFRESH_TTL_SECONDS` | optional, defaults 900 and 2592000 |

## Linux checks (what runs without Xcode)

```
cd apps/ios/PeerfolioKit && swift test        # 29 tests: decoding, token refresh, NDJSON, markdown, mock data
```
`Peerfolio/Preview/MockData.swift` is symlinked into the package tests so the preview data cannot drift from the models.
SwiftUI files can only be syntax-checked off a Mac (`swiftc -parse`); they have never been compiled. See `docs/ios/STATUS.md`.

## Conventions

- All colours, type and motion come from `DesignSystem/` and mirror `docs/ios/design-tokens.json`; do not hard-code values in screens.
- Models in `PeerfolioKit` mirror the real JSON (verified against the route handlers). Add a model change and a decoding test together.
- Network access goes through `APIClient`; screens never build requests.
- Never log tokens. Never store them outside the Keychain.
