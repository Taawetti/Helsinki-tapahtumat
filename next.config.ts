import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hel.fi' },
      { protocol: 'https', hostname: '**.hel.ninja' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.linkedevents.fi' },
    ],
  },
  // Force both ESM import('leaflet') and CJS require('leaflet') inside
  // leaflet.markercluster to share the same module instance. Without this,
  // the two import paths see different objects and markerClusterGroup is never
  // visible on the L namespace we import.
  turbopack: {
    resolveAlias: {
      'leaflet': 'leaflet/dist/leaflet-src.js',
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string>),
        'leaflet': path.resolve(process.cwd(), 'node_modules/leaflet/dist/leaflet-src.js'),
      }
    }
    return config
  },
}

export default nextConfig
