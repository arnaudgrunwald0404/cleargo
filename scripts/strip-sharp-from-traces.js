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
const { execSync } = require('child_process');

const nextDir = path.join(process.cwd(), '.next');

if (!fs.existsSync(nextDir)) {
  console.error('[strip-sharp] .next directory not found — skipping');
  process.exit(0);
}

// Find all *.nft.json files under .next/
const nftFiles = execSync(`find ${nextDir} -name "*.nft.json"`, { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .filter(Boolean);

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

console.log(`[strip-sharp] Done. Total entries removed: ${totalRemoved}`);
