/**
 * strip-sharp-from-traces.js
 *
 * Removes Sharp / @img entries from every Next.js NFT (node file trace) JSON
 * file produced by `next build`.
 *
 * WHY: Next.js unconditionally traces Sharp into next-server.js.nft.json
 * because the image optimizer *can* use it. ClearGO does not use next/image
 * (images.unoptimized = true), so Sharp is never called at runtime.
 * On Netlify's Linux x64 builders, @img/sharp-libvips-linux-x64 is ~35–40 MB —
 * the single reason the server handler exceeds the 250 MB unzipped limit.
 * Stripping the entries from the trace files stops @netlify/plugin-nextjs from
 * bundling them.
 *
 * SAFETY: Next.js always loads Sharp via a try/catch optional require, so a
 * missing Sharp binary is handled gracefully. With `images.unoptimized = true`
 * the optimizer is never invoked in the first place.
 *
 * Usage: run automatically at the end of the Netlify build command (see netlify.toml).
 */

const fs = require('fs');
const path = require('path');

const nextDir = path.join(process.cwd(), '.next');

/** Recursively collect all *.nft.json files (cross-platform; no shell find). */
function findNftFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findNftFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.nft.json')) {
      results.push(full);
    }
  }
  return results;
}

if (!fs.existsSync(nextDir)) {
  console.error('[strip-sharp] .next directory not found — skipping');
  process.exit(0);
}

const nftFiles = findNftFiles(nextDir);
let totalRemoved = 0;

for (const filePath of nftFiles) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.files)) continue;

    const before = data.files.length;
    data.files = data.files.filter(
      (f) => !f.includes('/sharp') && !f.includes('/@img/')
    );
    const removed = before - data.files.length;

    if (removed > 0) {
      fs.writeFileSync(filePath, JSON.stringify(data));
      totalRemoved += removed;
      const rel = path.relative(process.cwd(), filePath);
      console.log(`[strip-sharp] ${rel}: removed ${removed} sharp/@img entries`);
    }
  } catch (err) {
    console.warn(`[strip-sharp] Could not process ${filePath}: ${err.message}`);
  }
}

console.log(`[strip-sharp] Done. Processed ${nftFiles.length} trace file(s). Removed ${totalRemoved} entries.`);

/**
 * Second pass: delete route_client-reference-manifest.js files from .next/server/app.
 *
 * Every route.js entry gets one of these carrying the app's ENTIRE client-module map
 * (~640 KB each; 250+ API routes ≈ 160 MB — two thirds of the Netlify server handler, which
 * is what pushed it past AWS Lambda's 250 MB cap and started failing production deploys with
 * "Invalid AWS Lambda parameters"). Route handlers render no client components, run no SSR,
 * and use no server actions; Next's tryLoadClientReferenceManifest (load-components.js)
 * explicitly tolerates a missing file by returning undefined. Page manifests
 * (page_client-reference-manifest.js) are kept — pages genuinely need theirs.
 *
 * This MUST happen here, in the build command, not in a plugin's onPostBuild:
 * @netlify/plugin-nextjs assembles the handler and Functions bundling zips it BEFORE
 * onPostBuild fires (verified in the PR #75 deploy-preview log, where the slim-handler
 * plugin removed the files after "Functions bundling completed" — correct size, no effect).
 *
 * Verified 2026-09-11 by running `next start` with all route manifests deleted: route
 * handlers and pages both behave identically.
 */
// output: 'standalone' means the build produces TWO server/app trees, each with its own full
// set of manifests — .next/server/app AND .next/standalone/.next/server/app. The Netlify
// handler is assembled from the standalone tree (proven by the PR #75 second preview, where
// stripping only the outer tree logged success and the handler still carried all 256 files) —
// so both trees must be cleaned.
const serverAppDirs = [
  path.join(nextDir, 'server', 'app'),
  path.join(nextDir, 'standalone', '.next', 'server', 'app'),
];
let manifestCount = 0;
let manifestBytes = 0;

function stripRouteManifests(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stripRouteManifests(full);
    } else if (entry.isFile() && entry.name === 'route_client-reference-manifest.js') {
      manifestBytes += fs.statSync(full).size;
      manifestCount += 1;
      fs.rmSync(full);
    }
  }
}
for (const dir of serverAppDirs) stripRouteManifests(dir);

// Also drop any trace entries pointing at the now-deleted files, so nothing downstream
// trips over a traced-but-missing path.
let traceEntriesRemoved = 0;
for (const filePath of nftFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(data.files)) continue;
    const before = data.files.length;
    data.files = data.files.filter((f) => !f.includes('route_client-reference-manifest.js'));
    if (data.files.length !== before) {
      fs.writeFileSync(filePath, JSON.stringify(data));
      traceEntriesRemoved += before - data.files.length;
    }
  } catch {
    // already warned about unreadable traces in the first pass
  }
}

console.log(
  `[strip-route-manifests] Deleted ${manifestCount} route_client-reference-manifest.js files ` +
    `(${(manifestBytes / 1024 / 1024).toFixed(1)} MB) and ${traceEntriesRemoved} trace entries.`
);
