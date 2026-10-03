/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@repo/contracts", "@repo/trpc"],
};

export default nextConfig;
