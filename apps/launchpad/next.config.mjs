/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: [
    '@transformotion/auth-client',
    '@transformotion/runtime-config',
  ],
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
