import type { NextConfig } from "next";

/**
 * Brokerage linking only shows once Plaid is in production. In sandbox, Link
 * offers fake test banks, which a real visitor would take for the real thing.
 * `ENABLE_PLAID_SANDBOX=true` turns it on for local development.
 */
const plaidLinking = process.env.PLAID_ENV === "production" || process.env.ENABLE_PLAID_SANDBOX === "true";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PLAID_LINKING: plaidLinking ? "1" : "",
    // Stamps each deploy so an open app can tell when a newer one exists (see components/version-watcher.tsx).
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
  // Add this to ignore ESLint warnings during builds
  eslint: {
    ignoreDuringBuilds: true, // This will stop warnings from blocking deployment
  },
  // Preview login needs SQL and the migration journal at runtime. Schema snapshots
  // are only used by drizzle-kit to generate migrations, so don't bundle them.
  outputFileTracingIncludes: {
    "/api/auth/*": ["./drizzle/*.sql", "./drizzle/meta/_journal.json"],
  },
  // The pre-launch waitlist is gone; old links land on the homepage instead.
  async redirects() {
    return [{ source: "/waitlist", destination: "/", permanent: true }];
  },
};

export default nextConfig;
