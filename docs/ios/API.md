# API inventory for the iOS app

Verified against `apps/web/src/app/api/**` on this branch. Base URL `https://www.peerfolio.org`. The app calls
`/api/v1/<path>`, which `next.config.ts` rewrites to `/api/<path>` (same handlers; the response carries
`X-Peerfolio-Api-Version: 1`). Paths below are relative to `/api`.

## Authentication

Every handler that needs a user goes through `getCurrentUserId()` (`apps/web/src/lib/auth.ts`), directly or via
the `withUser` wrapper in `apps/web/src/lib/api.ts`. That function now checks for `Authorization: Bearer <access JWT>`
first and falls back to the next-auth cookie, so **the website behaves exactly as before** and every route below
works for the app without per-route changes. A request that sends a bearer header is judged on the token alone:
a bad or expired token is a `401 {"error":"Not signed in"}` (the app refreshes and retries once), never a silent
fall-through to a cookie.

| Route | Method | Auth | Body | Response |
|---|---|---|---|---|
| `/mobile/auth/token` | POST | none | `{provider:"apple"\|"google", idToken, nonce, fullName?}` | `{accessToken, refreshToken, tokenType:"Bearer", expiresIn, refreshExpiresAt, user:{id,email,name,image,handle}}` |
| `/mobile/auth/refresh` | POST | none | `{refreshToken}` | `{accessToken, refreshToken, tokenType, expiresIn, refreshExpiresAt}`; any failure is `401 {"error":"Please sign in again."}` |
| `/mobile/auth/logout` | POST | none | `{refreshToken}` | `{ok:true}` (idempotent) |
| `/mobile/auth/review` | POST | none | `{email, code}` | same session shape as `/token`; **404 unless `APP_REVIEW_EMAIL` + `APP_REVIEW_CODE` are set**; 401 on a wrong pair |
| `/mobile/devices` | POST | bearer | `{token (hex), environment:"sandbox"\|"production"}` | `{ok}`; stores an APNs token (push groundwork, nothing sends yet) |
| `/mobile/devices` | DELETE | bearer | `{token}` | `{ok}` |

`/token` also accepts `authorizationCode` (Apple): exchanged server-side and stored encrypted so `DELETE /api/me` can revoke Apple's token.
The four unauthenticated routes are rate limited per hashed address (Postgres fixed windows in `rate_limits`): token 20/min, refresh and logout 60/min,
review 5 per 5 minutes; over the limit is `429 {"error","retryAfterSec"}`. A broken limiter fails open.

- Access token: HS256 JWT signed with `MOBILE_AUTH_SECRET`, `iss=peerfolio`, `aud=peerfolio-mobile`, 15 minutes, verified with `jose`.
- Refresh token: opaque `pfr_...`, 30 days, stored only as a SHA-256 hash in `mobile_refresh_tokens`, **single use**. Each refresh
  returns a new pair in the same family. Presenting a used token again revokes the family (theft or replay). The client therefore
  refreshes single-flight.
- ID token exchange verifies signature (Apple / Google JWKS), issuer, audience (`APPLE_BUNDLE_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_CLIENT_ID`),
  expiry and the nonce (raw value or its SHA-256 hex). The user is found by `(provider, sub)` in `auth_identities`, else created or linked by
  verified email via the same `upsertUser` the website uses. Apple hides the email after the first sign-in, hence the identity table.
- Deleting the account cascades to both new tables, so all mobile sessions die with it.
- Apple token revocation on delete is built (needs the Apple key env vars, see COMPLIANCE.md). Rate limiting covers only the mobile routes.

## Errors

JSON `{ "error": string, ...extra }` with 400 validation, 401 not signed in, 403 forbidden, 404, 409 conflict, 422 rule violation,
429 (assistant budget), 502/503 provider trouble. 500 is always the generic `"Something went wrong"`.

## Routes the app uses

Range values: `1W 1M 3M 6M 1Y ALL`. Dates are `YYYY-MM-DD` strings (market or UTC day), instants are ISO-8601 strings. Money is a JSON number.

| Route | Method | Screen | Request | Response (abridged) |
|---|---|---|---|---|
| `/me` | GET | Settings, launch check | | `{user:{id,email,name,image,handle,bio,isPublic}, stats:{snapshotDays,followers}}` |
| `/me` | PATCH | Settings | `{handle?,bio?,isPublic?}` | `{ok}`; 409 handle taken |
| `/me` | DELETE | Settings > Delete account | | `{ok}`; 502 if Plaid cleanup fails (account kept) |
| `/portfolio?range=` | GET | Portfolio | | `{summary, accounts[], archivedAccounts[], items[], allocation[], holdings[], holdingsPending, today?, allTime?, leagues[], history[], performance{percent,days,range,series[]}, hasHistory, firstDate?, isVerified}` |
| `/portfolio/benchmark?symbol=SPY\|QQQ\|VTI&range=` | GET | Portfolio (not yet shown) | | `{symbol,label,basis,reason,comparison?}` always 200 |
| `/portfolio/intraday` | GET | Portfolio (not yet shown) | | `{session, points[]}` |
| `/sync` | POST | Portfolio pull-to-refresh (not yet used) | | `{results,totals}`; 502/503 on trouble |
| `/accounts` | GET/POST | not yet in app | manual accounts | |
| `/accounts/{id}`, `/accounts/{id}/positions...` | PATCH/DELETE/POST | not yet in app | manual accounts and positions | |
| `/leagues` | GET | Leagues | | `{leagues:[{id,name,description,emoji,accent,inviteCode,ownerId,createdAt,role,memberCount}]}` |
| `/leagues` | POST | Create league | `{name,description?,emoji,accent}` | 201 `{league}` |
| `/leagues/{id}?range=` | GET | League detail | | `{league{...,inviteCode,isOwner}, you{shareHoldings}, standings[], range}` |
| `/leagues/{id}` | PATCH | sharing toggle | `{shareHoldings?, name?...}` | `{ok}` |
| `/leagues/join` | POST | Join sheet | `{code}` | `{league{id,name}, alreadyMember}`; 404 bad code, 409 full |
| `/leagues/{id}/leave` | POST | League detail | | `{ok,deleted}`; 409 owner must hand over |
| `/leagues/{id}/react` | POST | Standing row | `{toUserId, emoji}` | `{active}` (toggle). Emoji set: 🔥 🚀 👏 🧊 🤝 😤 |
| `/board?range=&scope=all\|following` | GET | Leagues > Board | public | `{range,scope,minHistoryDays,requiresVerified,traders[]}` |
| `/users/{handle}/follow` | POST/DELETE | Board | | `{isFollowing}` |
| `/users/{handle}` | GET | not yet in app | public | trader profile |
| `/fantasy` | GET | Fantasy list | | `{leagues:[{id,name,emoji,accent,endsAt,isClosed,memberCount,yourReturn,yourRank}]}` |
| `/fantasy` | POST | Create | `{name,emoji,accent,startingCash,maxPositionPct?,endsAt?}` | 201 `{league{id}}` |
| `/fantasy/{id}` | GET | Fantasy league | | `{league, standings[], you{cash,value,percent,rank,positions[],orders[]}, feed[]}` |
| `/fantasy/join` | POST | Join sheet | `{code}` | `{league{id}}` |
| `/fantasy/{id}/trade` | POST | Trade sheet | buy `{side,symbol,kind:"stock",amount}`; sell `{...,shares:number\|"all"}` | 201 filled `{trade,ticker,price,priceAsOf,shares}`; **202 queued** `{queued,why:"closed"\|"no-live-price",orderId,ticker,side}`; 422 rule; 503 no live quotes |
| `/fantasy/{id}/orders/{orderId}` | DELETE | Orders panel | | cancel a pending order |
| `/fantasy/{id}/react` | POST | Standing row | `{toUserId,emoji}` | `{active}` |
| `/market/search?q=` | GET | Trade sheet | | `{results:[{symbol,name}]}` |
| `/market/quote?symbol=` | GET | Trade sheet | | `{symbol,kind,name,price,asOf,live}`; 404 with suggestions |
| `/news` | GET | News | public | `{day?, week?, headlines[]}` |
| `/news/market?part=board\|earnings\|fear-greed` | GET | News | public | `{board?, earnings?, fearGreed?}` (null when a source is down) |
| `/assistant/status` | GET | Assistant | | `{available}` |
| `/assistant` | POST | Assistant | `{messages:[{role,content}], context:{page,entityId?}}` | `application/x-ndjson` stream, see below |

Not for the app: `/auth/*` (next-auth), `/cron/*` (CRON_SECRET), `/admin/*`, `/plaid/*` (see below), `/health`, `/import/parse`.

## Assistant stream

One JSON object per line, in this order of likelihood: `{"type":"status","stage":"reading|analyzing|writing","label"?}`,
`{"type":"text","delta"}` (append), `{"type":"xray","data":{...}}`, `{"type":"visual","data":{"kind":"market|movers|earnings|benchmark",...}}`,
`{"type":"link","label","href"}` (href is a **path on the web app**, e.g. `/wealth?...`), `{"type":"error","message"}`, `{"type":"done"}`.
Errors before streaming (`401`, `413` conversation too long, `429` budget, `503` unavailable) are plain JSON with an `error` string. The client
ignores unknown event types and visual kinds so the server can add more. Up to 12 recent messages are used; the last must be from the user.

## Gaps for mobile (known, deliberate)

- **Plaid Link**: `/plaid/link-token` and `/plaid/exchange` are web-flow only (hosted Link with `PLAID_REDIRECT_URI`). A native Link needs the Plaid iOS SDK, an iOS redirect/universal link registered in Plaid, and a link-token variant. Not built; the app tells people to link on the web. Brokerage linking is also gated by `brokerageLinkingEnabled` / production Plaid.
- **Push notifications**: groundwork only (device-token table and register endpoint). No sender, and the app does not request notification permission yet.
- **Wealth Lab** needs no API: the projection engine is pure maths, ported to `PeerfolioKit` (`Wealth`) and cross-checked against the web's `engine.ts`. It reads `/portfolio` only to prefill the starting value.
- **Sports fantasy**: no backend. The UI is gated by `Features.sportsEnabled`.
- **Pagination / ETags**: none. Payloads are fetched whole; fine at current sizes.
