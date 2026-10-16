# Open questions for the owner

1. **Palette (decided, confirm).** The app uses the cool grey-blue "5C" system the signed-in web app uses (accent `#3867a1`, dark accent `#98b8e7`), not the warm off-white / emerald in `globals.css :root`, which only styles public pages. Tokens: `design-tokens.json`, `Theme.swift`.
2. **Bundle id.** `org.peerfolio.app` is a placeholder in `project.yml`; `APPLE_BUNDLE_ID` on the server must match it exactly. Which id and team?
3. **Native Plaid Link.** Build it (Plaid iOS SDK, universal link, link-token variant, `brokerageLinkingEnabled` gating) or ship v1 view-only with "link on the web"?
4. **App Review account seeding.** The review sign-in exists (COMPLIANCE.md). Should it start empty, or seed demo data (`APP_REVIEW_SEED_DEMO`), which writes demo people and leagues into the database it runs against? Use a staging database for review builds if you want the seeded experience.
5. **Apple revocation key.** Built, but someone must create the Sign in with Apple key (`.p8`) and set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. Also confirm `ENCRYPTION_KEY` is set wherever deletion runs, since the Apple token is stored encrypted with it.
6. **Same person, two sign-ins.** A verified email links Apple and Google to one account. Apple's private relay address is a different email, so "Hide My Email" creates a separate account. Acceptable, or add an in-app "link accounts" flow?
7. **Sports fantasy.** Gated off. There is no sports backend or data provider in the repo (the only mention is the league emoji list; a `feat/sports-picks` branch exists). Hook the Sports segment to it when that lands.
8. **Push notifications.** Groundwork exists: `POST/DELETE /api/mobile/devices` stores APNs tokens (`device_tokens`). Still needed: the app registering for remote notifications (entitlement, permission prompt, `UIApplicationDelegateAdaptor`), an APNs key and a sender, and decisions on which events notify (league invites, order fills, finished leagues).
9. **Assistant history** is not persisted in the app (the web keeps it in the browser). Store locally, or server-side?
10. **Rate limiting.** Added for the mobile endpoints only (Postgres fixed windows, by hashed IP: token 20/min, refresh and logout 60/min, review 5 per 5 min, devices 30/min). The rest of the API still has none. Behind Vercel the first `x-forwarded-for` hop is the client; confirm that holds for your deployment.
11. **Mobile token lifetimes** (15 min access, 30 day refresh). Rotating `MOBILE_AUTH_SECRET` invalidates access tokens only; refresh tokens survive because they are database-backed.
12. **Migration numbering.** This branch's migration is `0026_mobile_auth` because `feat/sports-picks` takes `0025`. If that branch merges second, check that drizzle's journal and snapshots still chain (regenerate the snapshot with `npm run db:generate` if the `prevId` chain complains).
13. **App icon and name.** The site favicon is used as the icon; a dedicated design would be better.
14. **Currency / locale.** All figures are USD and `en_US`, like the web.
