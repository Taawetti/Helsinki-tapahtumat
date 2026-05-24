import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hel.fi' },
      { protocol: 'https', hostname: '**.hel.ninja' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.linkedevents.fi' },
    ],
  },
}

export default nextConfig
