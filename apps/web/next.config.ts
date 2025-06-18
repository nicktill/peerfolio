import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
