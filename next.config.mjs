import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  // The app does not use next/image. Disabling the image optimizer stops Next.js
  // from bundling Sharp (the @img/sharp-libvips-linux-x64 binary is ~40 MB on
  // Netlify's build environment, which is what pushes the server handler over
  // the 250 MB unzipped function size limit).
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
