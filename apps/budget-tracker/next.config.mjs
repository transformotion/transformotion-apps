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
}

export default nextConfig
