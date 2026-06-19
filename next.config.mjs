import { validateEnvOrThrow } from './lib/env-validate.mjs'

// Validate environment variables at build time
try {
  validateEnvOrThrow()
} catch (error) {
  console.error('❌ Environment validation failed:', error.message)
  // In production builds, we might want to fail the build
  // In development, we'll continue but warn
  if (process.env.NODE_ENV === 'production') {
    throw error
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
      },
    ],
  },
  // Use webpack explicitly since we have custom webpack config
  webpack: (config, { isServer, dev }) => {
    // Handle ES modules that need to be transpiled
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }

    // Optimize for dev mode
    if (dev) {
      // Reduce rebuilds by ignoring certain files
      config.watchOptions = {
        ...config.watchOptions,
        // Reduce file watching on Windows
        poll: process.platform === 'win32' ? 1000 : false,
        aggregateTimeout: 300,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
        ],
      };

      // Optimize module resolution
      config.resolve.symlinks = false;
    }

    return config;
  },
  transpilePackages: ['function-plot', 'mathlive'],
  // Explicitly use webpack to avoid Turbopack conflict
  experimental: {
    webpackBuildWorker: true,
  },
  async redirects() {
    return [
      {
        source: '/planckcode/learn',
        destination: '/planckcode',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
