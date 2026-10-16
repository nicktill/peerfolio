# App Store compliance checklist

Status: Done = implemented in this branch. Owner = needs an action only the account holder can do. Not legal advice.

## Sign-in and accounts
- [x] **Sign in with Apple (4.8).** The app offers Google, a third-party login, so it must also offer an equivalent privacy-preserving option. Apple is the primary button; `AuthenticationServices` with a nonce, ID token verified server-side.
- [ ] Owner: enable the *Sign in with Apple* capability for `org.peerfolio.app` in the Apple developer portal (the entitlement is already in `project.yml`).
- [x] **In-app account deletion (5.1.1(v)).** Settings > Delete account (type DELETE to confirm) calls `DELETE /api/me`, which revokes Plaid items, hands leagues to another member, deletes the user row and cascades to everything, including mobile sessions and identities.
- [ ] **Apple token revocation on deletion.** Apple expects apps that use Sign in with Apple to revoke the user's token when the account is deleted (REST `auth/revoke`). Not done: it needs an Apple client secret (Team ID, Key ID, `.p8`) and the one-time authorization code from sign-in. Plan: send `authorizationCode` with the exchange, store the refresh token encrypted, revoke inside `DELETE /api/me`. Until then the delete screen tells people they can remove the app under Apple Account settings. Treat as required before submission.
- [x] Google sign-in uses the iOS OAuth client and a nonce; no client secret in the app.
- [ ] Owner: **demo account for App Review.** Review cannot use your Google/Apple identity. Provide a reviewer Apple ID, or add a reviewer-only sign-in path; the web has a dev-login for seeded users (`dev-login.ts`), which is deliberately off in production. Decide which (open question 4).

## Financial-app positioning (3.1.x, 5.x, 1.x)
- [x] Positioned as **tracking and education**, not advice or brokerage: sign-in, portfolio, settings and trade sheet carry "not investment advice" and "virtual cash only" copy; the assistant is read-only and never trades or moves money (its server prompt says so).
- [x] **No real-money transactions** in the app: no deposits, purchases or brokerage orders. Fantasy trades are simulated against delayed prices.
- [x] **Virtual credits only.** Fantasy cash is play money, cannot be bought, sold or cashed out, and there are no prizes. Keep it that way: any purchasable credits, prizes or wagering would trigger gambling rules (5.3) and in-app purchase rules (3.1.1). No IAP is implemented.
- [ ] Owner: App Store Connect **category** Finance; **age rating** questionnaire (simulated trading is not gambling, no contests with real prizes; answer accordingly); mention that data is delayed and sourced from third parties.
- [ ] Owner: because the app displays brokerage-linked balances (Plaid) and market data, confirm provider terms allow display in a native app (Plaid production access, Finnhub / Alpaca / Tiingo licences; `apps/web/.env.example` already notes the free-tier limits).
- [ ] Owner: financial-services apps should be submitted by the legal entity that runs the service (2.5.x / 5.x "regulated services"). Peerfolio gives no advice and holds no funds, but check this with the account type you enrol under.

## Privacy
- [ ] Owner: **privacy nutrition label** in App Store Connect. Data collected and linked to identity: email, name, profile photo URL (sign-in); financial info (account balances, holdings, transaction-derived history from Plaid or manual entry); user content (league names, assistant messages); identifiers (user id). Used for app functionality, not tracking. The assistant sends portfolio context to OpenAI (the server's provider): disclose third-party processing.
- [x] No tracking, no ads SDKs, no analytics SDKs in the app. `NSPrivacyTracking` should be false. Owner: add a `PrivacyInfo.xcprivacy` (required-reason APIs: `UserDefaults` for the theme preference is used) before submission; Xcode can generate it from the dependency report.
- [x] Privacy policy and terms are linked in Settings (`/privacy`, `/terms` on the site). Owner: put the same privacy URL in App Store Connect and confirm the policy covers the app, Apple sign-in and the assistant's use of a model provider.
- [x] Tokens are stored in the Keychain (`AfterFirstUnlockThisDeviceOnly`), never in `UserDefaults`; access tokens last 15 minutes; refresh tokens rotate and are hashed server-side.
- [x] No secrets in the app or repo. `GIDClientID` is a public identifier; the Google client secret and `MOBILE_AUTH_SECRET` stay on the server.

## Quality and policy
- [x] iOS 17+, Swift Concurrency, Dynamic Type, VoiceOver labels on figures and rows, reduced-motion respected, dark mode, sign in screen works signed-out, no private APIs (note: `PFTextFieldStyle` uses the `_body` requirement of `TextFieldStyle`, which is widely used but underscored; swap for a `ViewModifier` if review objects).
- [x] Links to external content (articles, web-only pages) open in `SFSafariViewController`.
- [ ] Owner: screenshots (6.7" and 6.1"), support URL, marketing text; an app icon is included (the site favicon, opaque 1024px).
- [ ] Owner: *Account deletion* URL for the store listing can point at Settings instructions or the web settings page.
- [ ] Owner: 2.1 completeness: Plaid Link is not in the app yet, so reviewers see "link on the web" copy. That is acceptable but mention it in review notes.
