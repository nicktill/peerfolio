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
- `app-background.tsx` renders the chosen one and a **Background lab** panel (bottom right): pick a design and an up/down day. The panel shows in local dev and on Vercel previews, or anywhere with `?lab=1`.
- Favourites so far: Topographic, Market mood (with blinking cells), Glyph field (dark), Horizon, Atmosphere, Order book.
- Still to do: pick one, wire real data (daily change → mood, real returns → Horizon ridges), remove the lab.
- Design reference prompt: `docs/design/ui-style-prompt.md`.

## See the demo
Preview for this branch, behind your Vercel login:
https://peerfolio-git-feat-background-lab-nicktills-projects.vercel.app/dev-login
Sign in as `nick` (fake demo data) and use the lab panel.

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
