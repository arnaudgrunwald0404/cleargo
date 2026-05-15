/**
 * netlify-plugin-slim-handler
 *
 * Local Netlify plugin that runs AFTER @netlify/plugin-nextjs in onPostBuild.
 * It directly removes Sharp / @img Linux binaries from the handler directory
 * that the Next.js plugin has already assembled — bypassing the unreliable
 * approach of modifying input NFT trace files.
 *
 * WHY: @img/sharp-libvips-linux-x64 is ~35-40 MB on Netlify's Linux x64 build
 * environment. ClearGO never uses next/image (images.unoptimized = true), so
 * Sharp is never called at runtime. Removing the binaries after the handler is
 * assembled keeps the function well under Netlify's 250 MB unzipped limit.
 *
 * Handler location (as of @netlify/plugin-nextjs v5):
 *   .netlify/functions-internal/___netlify-server-handler/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** Returns the total size (bytes) of a directory tree, or 0 if it doesn't exist. */
function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    const result = execSync(`du -sb "${dir}" 2>/dev/null || du -sk "${dir}" 2>/dev/null`, {
      encoding: 'utf-8',
    }).trim();
    const bytes = parseInt(result.split(/\s+/)[0], 10);
    // `du -sk` returns KB; `du -sb` returns bytes — detect which by magnitude
    return isNaN(bytes) ? 0 : bytes;
  } catch {
    return 0;
  }
}

/** Format bytes as MB for logging. */
function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/** Remove a directory tree if it exists, logging the result. */
function removeIfExists(dir, label) {
  if (!fs.existsSync(dir)) {
    console.log(`[slim-handler] ${label}: not found, skipping`);
    return 0;
  }
  const size = dirSize(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[slim-handler] Removed ${label} (${mb(size)})`);
  return size;
}

module.exports = {
  onPostBuild: async ({ utils }) => {
    // Candidate handler locations (plugin version may vary):
    const handlerCandidates = [
      path.join(process.cwd(), '.netlify', 'functions-internal', '___netlify-server-handler'),
      path.join(process.cwd(), '.netlify', 'functions', '___netlify-server-handler'),
    ];

    const handlerDir = handlerCandidates.find((d) => fs.existsSync(d));

    if (!handlerDir) {
      console.log('[slim-handler] Handler directory not found — nothing to trim.');
      console.log('[slim-handler] Searched:', handlerCandidates.join(', '));
      return;
    }

    console.log('[slim-handler] Handler directory:', handlerDir);

    const nodeModules = path.join(handlerDir, 'node_modules');
    const sizeBefore = dirSize(handlerDir);
    console.log(`[slim-handler] Handler size before: ${mb(sizeBefore)}`);

    // Log top-20 largest packages for diagnostics
    try {
      const topPackages = execSync(
        `du -sh "${nodeModules}"/*/ 2>/dev/null | sort -rh | head -20`,
        { encoding: 'utf-8' }
      ).trim();
      console.log('[slim-handler] Top packages by size:\n' + topPackages);
    } catch {
      // non-fatal
    }

    // --- Remove Sharp and @img ---
    let removed = 0;
    removed += removeIfExists(path.join(nodeModules, 'sharp'), 'sharp');
    const imgDir = path.join(nodeModules, '@img');
    if (fs.existsSync(imgDir)) {
      // Remove all sub-packages (sharp-linux-x64, sharp-libvips-linux-x64, etc.)
      const imgPkgs = fs.readdirSync(imgDir);
      for (const pkg of imgPkgs) {
        removed += removeIfExists(path.join(imgDir, pkg), `@img/${pkg}`);
      }
      // Remove now-empty @img dir
      try { fs.rmdirSync(imgDir); } catch { /* already gone or not empty */ }
    } else {
      console.log('[slim-handler] @img: not found, skipping');
    }

    const sizeAfter = dirSize(handlerDir);
    console.log(`[slim-handler] Handler size after:  ${mb(sizeAfter)}`);
    console.log(`[slim-handler] Saved: ${mb(removed)} (${mb(sizeBefore)} → ${mb(sizeAfter)})`);

    if (sizeAfter > 250 * 1024 * 1024) {
      console.warn(
        `[slim-handler] WARNING: handler is still ${mb(sizeAfter)} — over the 250 MB Netlify limit!`
      );
    } else {
      console.log('[slim-handler] Handler is within Netlify 250 MB limit.');
    }
  },
};
