import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output shrinks the server trace; Sharp is still traced unless excluded.
  // Netlify build strips Sharp via scripts/strip-sharp-from-traces.js + netlify-plugin-slim-handler.
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': ['node_modules/sharp/**', 'node_modules/@img/**'],
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;
