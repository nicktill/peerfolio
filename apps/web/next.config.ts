import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
