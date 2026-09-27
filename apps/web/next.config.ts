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
  // The pre-launch waitlist is gone; old links land on the homepage instead.
  async redirects() {
    return [{ source: "/waitlist", destination: "/", permanent: true }];
  },
};

export default nextConfig;
