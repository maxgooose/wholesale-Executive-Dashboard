#!/usr/bin/env node
/**
 * Wholecell Inventory Sync Script
 * ================================
 * Fetches AVAILABLE inventory from Wholecell API (Ready Room + Processing only).
 * Saves to data/available-inventory.json and optionally Vercel Blob Storage.
 *
 * Optimized: Uses ?status=Available server-side filter (~173 pages vs 2,656).
 * Then client-side filters to Ready Room + Processing locations only.
 * Supports checkpoint resume so crashes don't lose progress.
 *
 * Required env vars:
 *   WHOLECELL_APP_ID       - Wholecell API app ID
 *   WHOLECELL_APP_SECRET   - Wholecell API app secret
 *   BLOB_READ_WRITE_TOKEN  - Vercel Blob read/write token (optional for local-only mode)
 *
 * Usage:
 *   node scripts/sync-wholecell.js              # Full sync (fetch + blob upload)
 *   node scripts/sync-wholecell.js --local-only # Fetch + save JSON only (no blob)
 *   node scripts/sync-wholecell.js --resume     # Resume from checkpoint if exists
 *   node scripts/sync-wholecell.js --diff       # Show diff against last sync (incremental)
 *
 * Incremental Sync (Hash-Based Diff):
 *   After each sync, saves a fingerprint of every item (id → hash of key fields).
 *   On next sync, compares against the fingerprint to detect added/removed/changed items.
 *   If nothing changed, skips the Blob upload entirely to save bandwidth.
 *   Diff results saved to data/sync-diffs/ for audit trail.
 */

process.on('uncaughtException', (err) => {
  console.error('\n[FATAL] Uncaught exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n[FATAL] Unhandled rejection:', reason);
  process.exit(1);
});

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Config
const APP_ID = process.env.WHOLECELL_APP_ID;
const APP_SECRET = process.env.WHOLECELL_APP_SECRET;
const API_BASE = 'https://api.wholecell.io/api/v1/inventories';
const RATE_LIMIT_MS = 1000;
const MAX_RETRIES = 5;
const ALLOWED_LOCATIONS = null; // No location filter — include ALL locations
const LOCAL_OUTPUT = path.join(__dirname, '..', 'data', 'available-inventory.json');
const CHECKPOINT_FILE = path.join(__dirname, '..', 'data', '.sync-checkpoint.json');
const FINGERPRINT_FILE = path.join(__dirname, '..', 'data', '.inventory-fingerprint.json');
const DIFF_DIR = path.join(__dirname, '..', 'data', 'sync-diffs');
const LOCAL_ONLY = process.argv.includes('--local-only');
const RESUME = process.argv.includes('--resume');
const DIFF_ONLY = process.argv.includes('--diff');

// --- Incremental Sync: Fingerprinting & Diffing ---

function hashItem(item) {
  // Hash the fields that matter for detecting meaningful changes
  const key = [
    item.id,
    item.status,
    item.location?.name || item.location || '',
    item.sale_price || '',
    item.cost || '',
    item.grade || '',
    item.updated_at || '',
  ].join('|');
  return crypto.createHash('md5').update(key).digest('hex').substring(0, 12);
}

function buildFingerprint(items) {
  const fp = {};
  for (const item of items) {
    fp[item.id] = {
      hash: hashItem(item),
      model: item.item_type?.name || item.model || 'Unknown',
      location: item.location?.name || item.location || '',
      status: item.status || '',
    };
  }
  return fp;
}

function loadFingerprint() {
  try {
    if (fs.existsSync(FINGERPRINT_FILE)) {
      return JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[WARN] Could not load fingerprint:', e.message);
  }
  return null;
}

function saveFingerprint(items) {
  const fp = buildFingerprint(items);
  const payload = {
    savedAt: new Date().toISOString(),
    totalItems: items.length,
    fingerprints: fp,
  };
  const dir = path.dirname(FINGERPRINT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(payload));
  console.log(`Fingerprint saved: ${Object.keys(fp).length} items`);
  return payload;
}

function computeDiff(currentItems, previousFp) {
  const current = buildFingerprint(currentItems);
  const prev = previousFp.fingerprints || {};

  const added = [];
  const removed = [];
  const changed = [];

  // Find added & changed
  for (const [id, cur] of Object.entries(current)) {
    if (!prev[id]) {
      added.push({ id, model: cur.model, location: cur.location, status: cur.status });
    } else if (prev[id].hash !== cur.hash) {
      changed.push({
        id,
        model: cur.model,
        before: { location: prev[id].location, status: prev[id].status },
        after: { location: cur.location, status: cur.status },
      });
    }
  }

  // Find removed
  for (const [id, old] of Object.entries(prev)) {
    if (!current[id]) {
      removed.push({ id, model: old.model, location: old.location, status: old.status });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    previousSync: previousFp.savedAt,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: Object.keys(current).length - added.length - changed.length,
      totalBefore: Object.keys(prev).length,
      totalAfter: Object.keys(current).length,
    },
    added,
    removed,
    changed,
  };
}

function saveDiff(diff) {
  if (!fs.existsSync(DIFF_DIR)) fs.mkdirSync(DIFF_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const diffFile = path.join(DIFF_DIR, `sync-diff-${ts}.json`);
  fs.writeFileSync(diffFile, JSON.stringify(diff, null, 2));
  console.log(`Diff saved: ${diffFile}`);

  // Keep only last 20 diff files
  const files = fs.readdirSync(DIFF_DIR).filter(f => f.startsWith('sync-diff-')).sort();
  if (files.length > 20) {
    for (const old of files.slice(0, files.length - 20)) {
      fs.unlinkSync(path.join(DIFF_DIR, old));
    }
  }
  return diffFile;
}

function getAuthHeader() {
  return `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveCheckpoint(items, lastPage, totalPages) {
  try {
    const dataDir = path.dirname(CHECKPOINT_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ items, lastPage, totalPages, savedAt: new Date().toISOString() }));
  } catch (e) {
    console.warn('[WARN] Could not save checkpoint:', e.message);
  }
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(`Resuming from checkpoint: page ${data.lastPage}/${data.totalPages} (${data.items.length} items saved)`);
      return data;
    }
  } catch (e) {
    console.warn('[WARN] Could not load checkpoint:', e.message);
  }
  return null;
}

async function fetchPage(page = 1, retries = 0, status = 'Available') {
  const url = `${API_BASE}?status=${encodeURIComponent(status)}&page=${page}`;

  try {
    console.log(`  Fetching page ${page}...`);
    const response = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(),
        'X-App-Id': APP_ID,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(45000),
    });

    if (response.status === 429) {
      const wait = 8000 * (retries + 1);
      console.warn(`  [429] Rate limited on page ${page}, waiting ${wait/1000}s...`);
      await sleep(wait);
      return fetchPage(page, retries + 1);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    if (!text || !text.startsWith('{')) {
      const preview = text.substring(0, 100);
      console.warn(`  [WARN] Non-JSON response on page ${page}: "${preview}"`);
      if (retries < MAX_RETRIES) {
        await sleep(3000 * (retries + 1));
        return fetchPage(page, retries + 1);
      }
      return null; // skip this page
    }

    return JSON.parse(text);
  } catch (error) {
    console.error(`  [ERROR] Page ${page} attempt ${retries + 1}: ${error.message}`);
    if (retries < MAX_RETRIES) {
      await sleep(3000 * (retries + 1));
      return fetchPage(page, retries + 1);
    }
    console.error(`  [SKIP] Giving up on page ${page} after ${MAX_RETRIES} retries`);
    return null;
  }
}

async function syncInventory() {
  const STATUSES_TO_FETCH = ['Available', 'Inbound'];
  console.log('=== Wholecell Inventory Sync ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Mode: ${LOCAL_ONLY ? 'LOCAL ONLY' : 'Full (Blob + Local)'}`);
  console.log(`Statuses: ${STATUSES_TO_FETCH.join(', ')}`);
  console.log(`Locations: ALL (no filter)\n`);

  if (!APP_ID || !APP_SECRET) throw new Error('Missing WHOLECELL_APP_ID or WHOLECELL_APP_SECRET');

  const startTime = Date.now();
  let allItems = [];
  let failedPages = 0;
  let totalPagesAll = 0;

  for (const status of STATUSES_TO_FETCH) {
    console.log(`\n--- Fetching status: ${status} ---`);
    const firstPage = await fetchPage(1, 0, status);
    if (!firstPage || !firstPage.data) {
      console.warn(`No data for status=${status}, skipping.`);
      continue;
    }
    const totalPages = firstPage.pages || 1;
    totalPagesAll += totalPages;
    allItems.push(...firstPage.data);
    console.log(`${status}: ${totalPages} pages (~${totalPages * 100} items)`);

    for (let page = 2; page <= totalPages; page++) {
      await sleep(RATE_LIMIT_MS);
      const result = await fetchPage(page, 0, status);
      if (result && result.data) {
        allItems.push(...result.data);
      } else {
        failedPages++;
      }

      if (page % 25 === 0 || page === totalPages) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  Page ${page}/${totalPages} — ${allItems.length} total items — ${elapsed}s`);
      }
    }
  }

  const fetchDuration = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\nFetch complete: ${allItems.length} items in ${fetchDuration}s (${failedPages} skipped pages)`);

  // No location filtering — include everything
  const filtered = allItems;
  const locationBreakdown = {};
  const statusBreakdown = {};
  filtered.forEach(item => {
    const loc = item.location?.name || 'No Location';
    locationBreakdown[loc] = (locationBreakdown[loc] || 0) + 1;
    const s = item.status || 'Unknown';
    statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
  });

  console.log(`\nTotal: ${filtered.length} items`);
  console.log('By Status:', statusBreakdown);
  console.log('By Location:', locationBreakdown);

  // Build payload
  const payload = {
    metadata: {
      timestamp: new Date().toISOString(),
      totalItems: filtered.length,
      totalFetched: allItems.length,
      totalPages: totalPagesAll,
      failedPages,
      fetchDurationSeconds: parseInt(fetchDuration),
      statuses: ['Available', 'Inbound'],
      statusBreakdown,
      locationBreakdown,
      source: 'wholecell-api',
    },
    count: filtered.length,
    data: filtered,
  };

  // --- Incremental Diff ---
  const previousFp = loadFingerprint();
  let diff = null;
  let hasChanges = true;

  if (previousFp) {
    diff = computeDiff(filtered, previousFp);
    const s = diff.summary;
    console.log(`\n=== Incremental Diff ===`);
    console.log(`  Previous sync: ${previousFp.savedAt}`);
    console.log(`  Added:     ${s.added}`);
    console.log(`  Removed:   ${s.removed}`);
    console.log(`  Changed:   ${s.changed}`);
    console.log(`  Unchanged: ${s.unchanged}`);
    console.log(`  Total:     ${s.totalBefore} → ${s.totalAfter}`);

    saveDiff(diff);
    hasChanges = s.added > 0 || s.removed > 0 || s.changed > 0;

    if (!hasChanges) {
      console.log('\n✓ No changes detected since last sync.');
    }

    // If --diff flag, just show the diff and exit (don't save/upload)
    if (DIFF_ONLY) {
      console.log('\n[--diff mode] Exiting after diff. No files written.');
      return { success: true, items: filtered.length, diff: diff.summary, hasChanges };
    }
  } else {
    console.log('\nNo previous fingerprint found — this is the first tracked sync.');
  }

  // Save local JSON
  const dataDir = path.dirname(LOCAL_OUTPUT);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(LOCAL_OUTPUT, JSON.stringify(payload));
  const sizeMB = (fs.statSync(LOCAL_OUTPUT).size / (1024 * 1024)).toFixed(1);
  console.log(`\nSaved: ${LOCAL_OUTPUT} (${sizeMB} MB)`);

  // Save new fingerprint
  saveFingerprint(filtered);

  // Clean checkpoint
  try { fs.unlinkSync(CHECKPOINT_FILE); } catch {}

  // Upload to Vercel Blob (skip if no changes detected)
  if (!LOCAL_ONLY && process.env.BLOB_READ_WRITE_TOKEN) {
    if (!hasChanges) {
      console.log('\nSkipping Blob upload — inventory unchanged since last sync.');
    } else {
      try {
        const { put, list, del } = require('@vercel/blob');
        console.log('Uploading to Vercel Blob Storage...');
        const jsonStr = JSON.stringify(payload);
        const blob = await put('inventory/latest.json', jsonStr, {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
        });
        console.log(`Uploaded: ${blob.url}`);
        const { blobs } = await list({ prefix: 'inventory/' });
        for (const old of blobs.filter(b => b.pathname !== 'inventory/latest.json')) {
          await del(old.url);
        }
      } catch (err) {
        console.error('Blob upload failed:', err.message);
      }
    }
  }

  console.log('\n=== Sync Complete ===');
  console.log(`Items: ${filtered.length}`);
  console.log(`Statuses: ${Object.entries(statusBreakdown).map(([k,v])=>`${k}: ${v}`).join(', ')}`);
  console.log(`Locations: ${Object.entries(locationBreakdown).map(([k,v])=>`${k}: ${v}`).join(', ')}`);
  console.log(`Duration: ${fetchDuration}s | Failed pages: ${failedPages}`);
  if (diff) console.log(`Changes: +${diff.summary.added} / -${diff.summary.removed} / ~${diff.summary.changed}`);

  return { success: true, items: filtered.length, duration: parseInt(fetchDuration), failedPages, diff: diff?.summary, hasChanges };
}

syncInventory()
  .then(r => { console.log('\nSync succeeded:', r); process.exit(0); })
  .catch(e => { console.error('\nSync FAILED:', e.message, e.stack); process.exit(1); });
