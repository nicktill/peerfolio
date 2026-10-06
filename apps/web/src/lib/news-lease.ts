import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@web/db"

/** A committed lease, not a held DB connection while a provider responds. */
export async function claimNewsLease(name: string, minIntervalSeconds: number, ttlSeconds: number): Promise<string | null> {
  const rows = await db.execute<{ token: string }>(sql`
    INSERT INTO news_job_leases (name, attempted_at, expires_at)
    VALUES (${name}, now(), now() + make_interval(secs => ${ttlSeconds}::double precision))
    ON CONFLICT (name) DO UPDATE SET attempted_at = now(), expires_at = excluded.expires_at
    WHERE news_job_leases.expires_at <= now()
      AND news_job_leases.attempted_at <= now() - make_interval(secs => ${minIntervalSeconds}::double precision)
    RETURNING attempted_at::text AS token
  `)
  return rows[0]?.token ?? null
}

/** The token prevents an expired worker from releasing its replacement. */
export async function releaseNewsLease(name: string, token: string) {
  await db.execute(sql`update news_job_leases set expires_at = now() where name = ${name} and attempted_at = ${token}::timestamptz`)
}
