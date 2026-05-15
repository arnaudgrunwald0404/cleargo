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
 * assembled keeps the function under Netlify/AWS Lambda package limits.
 *
 * Handler location (as of @netlify/plugin-nextjs v5):
 *   .netlify/functions-internal/___netlify-server-handler/
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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

function walkFiles(dir, predicate, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, files);
    } else if (predicate(fullPath, entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function compactClientReferenceManifests(handlerDir) {
  const appServerDir = path.join(handlerDir, '.next', 'server', 'app');
  const manifestFiles = walkFiles(
    appServerDir,
    (_filePath, fileName) => fileName.endsWith('_client-reference-manifest.js')
  );

  let compacted = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const filePath of manifestFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    bytesBefore += Buffer.byteLength(source);

    const match = source.match(
      /^globalThis\.__RSC_MANIFEST=\(globalThis\.__RSC_MANIFEST\|\|\{\}\);globalThis\.__RSC_MANIFEST\[("(?:\\.|[^"])+")\]=(.+);?$/
    );
    if (!match) {
      bytesAfter += Buffer.byteLength(source);
      console.log(`[slim-handler] Could not compact ${path.relative(handlerDir, filePath)}`);
      continue;
    }

    const routeKey = match[1];
    const manifestJson = match[2];
    const compressed = zlib.gzipSync(manifestJson, { level: 9 }).toString('base64');
    const compactSource = [
      'const z=require("zlib");',
      'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});',
      `globalThis.__RSC_MANIFEST[${routeKey}]=JSON.parse(z.gunzipSync(Buffer.from("${compressed}","base64")).toString("utf8"));`,
      '',
    ].join('');

    fs.writeFileSync(filePath, compactSource);
    bytesAfter += Buffer.byteLength(compactSource);
    compacted += 1;
  }

  if (manifestFiles.length === 0) {
    console.log('[slim-handler] No client reference manifests found to compact.');
    return 0;
  }

  const saved = bytesBefore - bytesAfter;
  console.log(
    `[slim-handler] Compacted ${compacted}/${manifestFiles.length} client reference manifests: ` +
      `${mb(bytesBefore)} → ${mb(bytesAfter)} (saved ${mb(saved)})`
  );
  return saved;
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

    // --- Remove native image packages and build-only artifacts ---
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

    // Next has already emitted JavaScript for the server handler. TypeScript is
    // a build-time dependency here and only adds package weight to the Lambda.
    removed += removeIfExists(path.join(nodeModules, 'typescript'), 'typescript');

    // Local editor/debug files can be picked up because the handler includes
    // the assembled directory recursively.
    removed += removeIfExists(path.join(handlerDir, '.cursor'), '.cursor');

    // Next.js 16 can emit one large client reference manifest per app route.
    // Keeping the files present but gzip-wrapping their JSON payload trims the
    // Lambda package while preserving the require-time manifest side effect.
    removed += compactClientReferenceManifests(handlerDir);

    const sizeAfter = dirSize(handlerDir);
    console.log(`[slim-handler] Handler size after:  ${mb(sizeAfter)}`);
    console.log(`[slim-handler] Saved: ${mb(removed)} (${mb(sizeBefore)} → ${mb(sizeAfter)})`);

    if (sizeAfter > 200 * 1024 * 1024) {
      console.warn(
        `[slim-handler] WARNING: handler is still ${mb(sizeAfter)} — close to Lambda package limits.`
      );
    } else {
      console.log('[slim-handler] Handler has package-size headroom.');
    }
  },
};
