import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace files from the monorepo root so the standalone build includes @tanaw/shared.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // The shared package ships TypeScript source in development.
  transpilePackages: ['@tanaw/shared'],
  poweredByHeader: false,
  // Lint runs separately (`npm run lint`), so builds don't fail on the Next-specific lint step.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    // @tanaw/shared uses NodeNext-style ".js" imports that point at ".ts" files.
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
