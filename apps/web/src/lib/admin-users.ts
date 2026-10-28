import { sql } from "drizzle-orm"
import { db } from "@web/db"

export type AdminUserRow = {
  id: string; name: string | null; email: string; handle: string | null; image: string | null; createdAt: string
  referrer: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; landingPath: string | null
  manualAccounts: number; linkedAccounts: number; holdings: number; following: number; followers: number
  leagues: number; fantasy: number; sports: number; aiCalls: number; aiCostUsd: number; linkRequests: number; linkAttempts: number
}

type Raw = Omit<AdminUserRow, "createdAt"> & { createdAt: string | Date }
const iso = (value: string | Date) => new Date(value).toISOString()

/** Newest signups first, with one row of counts each. Counts only: no content from any table is read. */
export async function listAdminUsers(q: string | undefined, limit: number, id?: string): Promise<AdminUserRow[]> {
  const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null
  const rows = await db.execute<Raw>(sql`
    SELECT u.id, u.name, u.email, u.handle, u.image, u.created_at AS "createdAt",
      u.signup_referrer AS "referrer", u.signup_utm_source AS "utmSource", u.signup_utm_medium AS "utmMedium",
      u.signup_utm_campaign AS "utmCampaign", u.signup_landing_path AS "landingPath",
      (SELECT count(*)::int FROM accounts a WHERE a.user_id = u.id AND a.source = 'manual') AS "manualAccounts",
      (SELECT count(*)::int FROM accounts a WHERE a.user_id = u.id AND a.source <> 'manual') AS "linkedAccounts",
      (SELECT count(*)::int FROM holdings h WHERE h.user_id = u.id) AS "holdings",
      (SELECT count(*)::int FROM follows f WHERE f.follower_id = u.id) AS "following",
      (SELECT count(*)::int FROM follows f WHERE f.following_id = u.id) AS "followers",
      (SELECT count(*)::int FROM league_members m WHERE m.user_id = u.id) AS "leagues",
      (SELECT count(*)::int FROM fantasy_members m WHERE m.user_id = u.id) AS "fantasy",
      (SELECT count(*)::int FROM sports_members m WHERE m.user_id = u.id) AS "sports",
      (SELECT count(*)::int FROM ai_usage x WHERE x.user_id = u.id) AS "aiCalls",
      (SELECT coalesce(sum(coalesce(x.cost_usd, x.reserved_usd)), 0)::float FROM ai_usage x WHERE x.user_id = u.id) AS "aiCostUsd",
      (SELECT count(*)::int FROM brokerage_link_requests r WHERE r.user_id = u.id) AS "linkRequests",
      (SELECT count(*)::int FROM production_link_attempts p WHERE p.user_id = u.id) AS "linkAttempts"
    FROM users u
    WHERE (${id ?? null}::uuid IS NULL OR u.id = ${id ?? null}::uuid)
      AND (${like}::text IS NULL OR u.email ILIKE ${like} OR u.name ILIKE ${like} OR u.handle ILIKE ${like})
    ORDER BY u.created_at DESC
    LIMIT ${limit}
  `)
  return [...rows].map((r) => ({ ...r, createdAt: iso(r.createdAt) }))
}

export type TimelineEvent = { at: string; kind: string; text: string }
export type AdminUserDetail = {
  user: AdminUserRow
  accounts: { name: string; source: string; category: string; active: boolean; institution: string | null }[]
  timeline: TimelineEvent[]
}

/** One merged, time-ordered history. Only names, counts and statuses: never prompts, messages or balances. */
export async function adminUserDetail(id: string): Promise<AdminUserDetail | null> {
  const [user] = await listAdminUsers(undefined, 1, id)
  if (!user) return null
  const [events, accounts] = await Promise.all([
    db.execute<{ at: string | Date; kind: string; text: string }>(sql`
      SELECT created_at AS at, 'signup' AS kind, 'Signed up' AS text FROM users WHERE id = ${id}
      UNION ALL SELECT created_at, 'account', replace(action, '_', ' ') || coalesce(': ' || account_name, '') FROM account_events WHERE user_id = ${id}
      UNION ALL SELECT max(h.updated_at), 'holdings', count(*) || ' holdings in ' || coalesce(a.name, 'an account')
        FROM holdings h JOIN accounts a ON a.id = h.account_id WHERE h.user_id = ${id} GROUP BY a.id, a.name
      UNION ALL SELECT f.created_at, 'follow', 'Followed ' || coalesce(t.handle, 'a user') FROM follows f JOIN users t ON t.id = f.following_id WHERE f.follower_id = ${id}
      UNION ALL SELECT f.created_at, 'follow', 'Followed by ' || coalesce(t.handle, 'a user') FROM follows f JOIN users t ON t.id = f.follower_id WHERE f.following_id = ${id}
      UNION ALL SELECT m.joined_at, 'league', 'Joined league ' || l.name || ' (' || m.role || ')' FROM league_members m JOIN leagues l ON l.id = m.league_id WHERE m.user_id = ${id}
      UNION ALL SELECT created_at, 'league', 'Created league ' || name FROM leagues WHERE owner_id = ${id}
      UNION ALL SELECT m.joined_at, 'fantasy', 'Joined fantasy league ' || l.name FROM fantasy_members m JOIN fantasy_leagues l ON l.id = m.league_id WHERE m.user_id = ${id}
      UNION ALL SELECT m.joined_at, 'sports', 'Joined sports league ' || l.name FROM sports_members m JOIN sports_leagues l ON l.id = m.league_id WHERE m.user_id = ${id}
      UNION ALL SELECT created_at, 'ai', 'AI call (' || model || ', $' || round(coalesce(cost_usd, reserved_usd), 4) || ')' FROM ai_usage WHERE user_id = ${id}
      UNION ALL SELECT created_at, 'brokerage', 'Brokerage link request (' || status || ')' FROM brokerage_link_requests WHERE user_id = ${id}
      UNION ALL SELECT created_at, 'brokerage', 'Brokerage link attempt (' || status || ')' FROM production_link_attempts WHERE user_id = ${id}
      UNION ALL SELECT created_at, 'brokerage', 'Linked ' || institution_name || ' (' || status || ')' FROM plaid_items WHERE user_id = ${id}
      UNION ALL SELECT min(created_at), 'snapshot', 'First portfolio snapshot' FROM portfolio_snapshots WHERE user_id = ${id} HAVING count(*) > 0
      UNION ALL SELECT max(created_at), 'snapshot', count(*) || ' portfolio snapshots, latest' FROM portfolio_snapshots WHERE user_id = ${id} HAVING count(*) > 1
      ORDER BY at DESC LIMIT 500
    `),
    db.execute<AdminUserDetail["accounts"][number]>(sql`
      SELECT name, source::text AS source, category::text AS category, is_active AS active, institution_label AS institution
      FROM accounts WHERE user_id = ${id} ORDER BY name
    `),
  ])
  return { user, accounts: [...accounts], timeline: [...events].map((e) => ({ at: iso(e.at), kind: e.kind, text: e.text })) }
}
