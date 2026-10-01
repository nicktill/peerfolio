# Background lab: handoff notes

Branch: `feat/background-lab`. It was first developed on `feat/sweet-brahmagupta-dassn1`, an auto-generated name; both branches hold the same commits.

## What this is
Design exploration for the signed-in app's background, plus landing-page polish.
- Candidates live in `apps/web/src/components/backgrounds/`:
  - `grid-field`: "Alive grid" and "Market mood"
  - `topo-field`: Topographic
  - `depth-field`: Order book
  - `glyph-field`: Glyph field
  - `horizon-field`: Horizon
  - `atmosphere-field`: Atmosphere
  - `orbit-field`: Orbit
  - `spine-field`: Spine
- **Settings → Background** lets each viewer pick their own background. The choices are Classic (today's dots, the default), Alive grid, Market mood, Topographic, Order book, Glyph field, Horizon and Orbit.
- There is also an **Interactive** switch. When it's off, the designs keep their slow motion but ignore the cursor.
- The choice is saved in the browser (`lib/background-pref.ts`).
- `app-background.tsx` lazy-loads only the chosen design, so the others never download. Classic is plain CSS.
- Atmosphere and Spine were dropped.
- Favourites so far: Topographic, Market mood (with blinking cells), Glyph field (dark), Horizon, Atmosphere, Order book.
- Still to do: wire real data in (daily change → mood, real returns → Horizon ridges, league → Orbit).
- Status: parked. It's kept on this branch to revisit later and is not merged.
- Design reference prompt: `docs/design/ui-style-prompt.md`.

## See the demo
Preview for this branch, behind your Vercel login:
https://peerfolio-git-feat-background-lab-nicktills-projects.vercel.app/dev-login
Sign in as `nick` (fake demo data), then go to Settings → Background.

How it is isolated from production:
- **Database:** a separate Neon project, `peerfolio-preview-demo` (id `young-bonus-91729396`), seeded with fake users. Production data was never copied into it.
- **Vercel variables:** `DATABASE_URL` and `ENABLE_DEV_LOGIN=true` are set for this branch's previews only.
- **Login guard:** the dev login is allowed only on preview or local builds (`apps/web/src/lib/dev-login.ts`, unit tested). A production deployment always refuses it.
- **Note:** other branches' previews still use the production database.

To tear it down: delete those two branch-scoped Vercel variables and the Neon project.

## Run locally
```bash
docker compose up -d
cd apps/web && cp .env.example .env.local   # set ENCRYPTION_KEY, NEXTAUTH_SECRET
npm install && npm run db:migrate && npm run db:seed && npm run dev
# then open localhost:3000/dev-login
```
