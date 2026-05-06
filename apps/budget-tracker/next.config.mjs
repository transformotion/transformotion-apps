/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/budget-tracker',
  images: { unoptimized: true },
  transpilePackages: [
    '@transformotion/api-client',
    '@transformotion/budget-domain',
    '@transformotion/auth-client',
    '@transformotion/runtime-config',
  ],
  typescript: {
    // Pre-existing v0 type errors (React 19 LegacyRef incompatibilities in
    // shadcn/ui generated components). Do not remove until these are fixed.
    ignoreBuildErrors: true,
  },
}

export default nextConfig
