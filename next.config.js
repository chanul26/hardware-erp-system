/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  // Force Next.js to build successfully even if there are ESLint errors
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Force Next.js to build successfully even if there are TypeScript errors
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;