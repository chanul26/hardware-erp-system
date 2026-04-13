/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence Next.js 14 warnings about Prisma's Node.js module usage
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

module.exports = nextConfig;
