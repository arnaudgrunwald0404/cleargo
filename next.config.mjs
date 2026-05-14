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
    // Exclude packages that are never needed at runtime in the Netlify server
    // handler. Each exclusion reduces the ___netlify-server-handler.zip size.
    outputFileTracingExcludes: {
      '*': [
        // CLI tools (moved to devDeps but belt-and-suspenders)
        'node_modules/netlify/**',
        'node_modules/supabase/**',
        // Build/type-checking tools — zero runtime use
        'node_modules/typescript/**',
        'node_modules/ts-node/**',
        'node_modules/tsx/**',
        'node_modules/ts-jest/**',
        'node_modules/eslint/**',
        'node_modules/@typescript-eslint/**',
        'node_modules/@babel/**',
        'node_modules/babel-*/**',
        // Test tooling
        'node_modules/jest/**',
        'node_modules/jest-*/**',
        'node_modules/@jest/**',
        'node_modules/@testing-library/**',
        'node_modules/@playwright/**',
        'node_modules/playwright-core/**',
        // CSS build tools (processed at build time, not runtime)
        'node_modules/tailwindcss/**',
        'node_modules/@tailwindcss/**',
        'node_modules/postcss/**',
        'node_modules/postcss-*/**',
        'node_modules/lightningcss*/**',
        // Cursor editor config (should never be in a bundle)
        '.cursor/**',
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
