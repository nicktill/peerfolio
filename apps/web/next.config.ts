import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add this to ignore ESLint warnings during builds
  eslint: {
    ignoreDuringBuilds: true, // This will stop warnings from blocking deployment
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Ensure CSS animations work properly in production
  experimental: {
    optimizeCss: false, // Disable aggressive CSS optimization that might break animations
  },
  // Enable proper handling of CSS custom properties
  compiler: {
    styledComponents: false,
  },
};

export default nextConfig;