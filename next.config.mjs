import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output: Next.js traces only files that are actually imported and
  // produces a self-contained .next/standalone server. Because the image
  // optimizer is disabled (images.unoptimized: true), Sharp is never called and
  // never appears in the trace — eliminating the need for post-build stripping
  // scripts to stay under Netlify's 250 MB unzipped function size limit.
  output: 'standalone',
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
