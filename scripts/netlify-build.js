/**
 * Build script for Netlify when NEXT_DISABLE_NETLIFY_EDGE is set.
 * Temporarily renames src/proxy.ts so Next does not emit Node middleware,
 * avoiding the "Cannot find module './webpack-runtime.js'" error during
 * Edge Functions bundling. Proxy (session refresh, rate limit) is disabled on Netlify.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const proxyPath = path.join(__dirname, '..', 'src', 'proxy.ts');
const disabledPath = path.join(__dirname, '..', 'src', 'proxy.netlify-disabled.ts');
const disableEdge = process.env.NEXT_DISABLE_NETLIFY_EDGE === 'true';

let restored = false;
function restore() {
    if (!restored && disableEdge && fs.existsSync(disabledPath)) {
        fs.renameSync(disabledPath, proxyPath);
        restored = true;
    }
}

try {
    if (disableEdge && fs.existsSync(proxyPath)) {
        fs.renameSync(proxyPath, disabledPath);
    }
    execSync('npx next build --webpack', { stdio: 'inherit', env: process.env });
} finally {
    restore();
}
