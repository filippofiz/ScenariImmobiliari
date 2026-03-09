/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    serverComponentsExternalPackages: ['pdf-parse', 'pdf-lib'],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
}

module.exports = nextConfig
