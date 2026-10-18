# Peerfolio web app

This workspace contains the Next.js application. See the [root README](../../README.md)
for local setup and development commands.

## Main entry points

- `src/app/page.tsx` — public landing page.
- `src/app/(app)/` — signed-in dashboard, leagues, board, news, and settings.
- `src/app/api/` — route handlers.
- `src/lib/auth.ts` — NextAuth configuration and server session lookup.
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handler.
- `src/components/providers.tsx` — client session, theme, and application providers.
- `src/db/` — Drizzle schema and database client.

From the repository root, use `npm run dev --workspace=@repo/web` to run this
workspace and `npm test --workspace=@repo/web` to run its regression suite.
