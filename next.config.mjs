import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Exclude CLI tools and other non-runtime packages from the server bundle.
    // "netlify" (1.1 GB) and "supabase" (84 MB) are CLI tools that were
    // accidentally placed in dependencies; they are never imported at runtime.
    outputFileTracingExcludes: {
      '*': [
        'node_modules/netlify/**',
        'node_modules/supabase/**',
      ],
    },
  },
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;
