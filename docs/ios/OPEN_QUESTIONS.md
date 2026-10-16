# Open questions for the owner

1. **Palette.** The signed-in web app uses the cool grey-blue "5C" system (accent `#3867a1`), not the warm off-white / emerald in `globals.css :root`. The iOS app follows what signed-in users see. Confirm, or say if emerald is wanted.
2. **Bundle id.** `org.peerfolio.app` is a placeholder in `project.yml` (and `APPLE_BUNDLE_ID` on the server must match it exactly). Which id and team?
3. **Native Plaid Link.** Build it now (Plaid iOS SDK, universal link, link-token variant, `brokerageLinkingEnabled` gating) or ship v1 view-only with "link on the web"?
4. **App Review access.** Provide a reviewer Apple ID, or add a reviewer-only login? The dev-login is intentionally impossible in production.
5. **Apple token revocation on deletion** (required before submission): okay to store an encrypted Apple refresh token, and who creates the Sign in with Apple key (`.p8`)?
6. **Same person, two sign-ins.** A verified email links Apple and Google to one account. Apple's private relay address is a different email, so "Hide My Email" creates a separate account. Acceptable, or add an in-app "link accounts" flow?
7. **Sports fantasy.** The brief says to gate it. There is no sports backend or data provider in the repo (the only mention is the league emoji list). Is it planned, and for which data source?
8. **Push notifications.** None exist. Wanted for league invites, order fills and finished leagues? Needs APNs key, a device-token table and a sender.
9. **Assistant history** is not persisted in the app (the web keeps it in the browser). Store locally, or server-side?
10. **Rate limiting.** There is none in the repo; the new mobile endpoints inherit that. Add a limiter (IP and user) before launch?
11. **Mobile token lifetimes** (15 min access, 30 day refresh) and `MOBILE_AUTH_SECRET` rotation policy. Rotating the secret signs everyone out of access tokens only; refresh tokens survive because they are database-backed.
12. **App name and branding** in the store: "Peerfolio" with the existing logo and favicon-as-icon. A dedicated app icon design would be better.
13. **Currency / locale.** All figures are USD and `en_US` like the web.
