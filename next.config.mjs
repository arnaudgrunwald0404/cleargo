import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly set the workspace root to silence the multiple lockfiles warning
  // This tells Next.js that the root is the current directory (cleargo)
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
