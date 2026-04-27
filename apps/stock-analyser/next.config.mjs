/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@transformotion/api-client'],
  typescript: {
    // Pre-existing v0 type errors (React 19 LegacyRef incompatibilities in
    // shadcn/ui generated components). ignoreBuildErrors was present in the
    // original v0 next.config.mjs — do not remove until these are fixed.
    ignoreBuildErrors: true,
  },
}

export default nextConfig
