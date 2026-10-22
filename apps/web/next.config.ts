import type { NextConfig } from "next";

/**
 * Brokerage linking only shows once Plaid is in production. In sandbox, Link
 * offers fake test banks, which a real visitor would take for the real thing.
 * `ENABLE_PLAID_SANDBOX=true` turns it on for local development.
 */
const plaidLinking = process.env.PLAID_ENV === "production" || process.env.ENABLE_PLAID_SANDBOX === "true";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_PLAID_LINKING: plaidLinking ? "1" : "" },
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
  // Company icons come straight from Parqet's CDN through ours, with no function in between
  // (see lib/ticker-logo.ts). The pattern matches what `tickerLogoSrc` builds; anything else is a 404.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/api/market/logo/:symbol([A-Z][A-Z0-9-]{0,8})", destination: "https://assets.parqet.com/logos/symbol/:symbol" }],
    };
  },
  // Vercel caches an external rewrite only when asked (projects from before April 2026); a day, like Parqet's own header.
  async headers() {
    return [
      {
        source: "/api/market/logo/:symbol*",
        headers: [
          { key: "x-vercel-enable-rewrite-caching", value: "1" },
          { key: "CDN-Cache-Control", value: "max-age=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
