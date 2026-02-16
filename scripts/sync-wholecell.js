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

// Config
const APP_ID = process.env.WHOLECELL_APP_ID;
const APP_SECRET = process.env.WHOLECELL_APP_SECRET;
const API_BASE = 'https://api.wholecell.io/api/v1/inventories';
const RATE_LIMIT_MS = 1000;
const MAX_RETRIES = 5;
const ALLOWED_LOCATIONS = ['Ready Room', 'Processing'];
const LOCAL_OUTPUT = path.join(__dirname, '..', 'data', 'available-inventory.json');
const CHECKPOINT_FILE = path.join(__dirname, '..', 'data', '.sync-checkpoint.json');
const LOCAL_ONLY = process.argv.includes('--local-only');
const RESUME = process.argv.includes('--resume');

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

async function fetchPage(page = 1, retries = 0) {
  const url = `${API_BASE}?status=Available&page=${page}`;

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
  console.log('=== Wholecell Inventory Sync (Available Only) ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Mode: ${LOCAL_ONLY ? 'LOCAL ONLY' : 'Full (Blob + Local)'}`);
  console.log(`Locations: ${ALLOWED_LOCATIONS.join(', ')}\n`);

  if (!APP_ID || !APP_SECRET) throw new Error('Missing WHOLECELL_APP_ID or WHOLECELL_APP_SECRET');

  // Check for resume
  let checkpoint = RESUME ? loadCheckpoint() : null;
  let allItems = checkpoint?.items || [];
  let startPage = checkpoint ? checkpoint.lastPage + 1 : 1;
  let totalPages = checkpoint?.totalPages || null;

  // Fetch first page if not resuming
  if (!checkpoint) {
    console.log('Fetching page 1 (status=Available)...');
    const firstPage = await fetchPage(1);
    if (!firstPage || !firstPage.data) throw new Error('Invalid response from Wholecell API on page 1');
    totalPages = firstPage.pages || 1;
    allItems = [...firstPage.data];
    console.log(`Total pages: ${totalPages} (~${totalPages * 100} available items)`);
    console.log(`Estimated time: ~${Math.ceil(totalPages * RATE_LIMIT_MS / 1000)}s\n`);
    startPage = 2;
    saveCheckpoint(allItems, 1, totalPages);
  }

  const startTime = Date.now();
  let failedPages = 0;

  for (let page = startPage; page <= totalPages; page++) {
    await sleep(RATE_LIMIT_MS);
    const result = await fetchPage(page);
    if (result && result.data) {
      allItems.push(...result.data);
    } else {
      failedPages++;
    }

    // Checkpoint + progress every 25 pages
    if (page % 25 === 0 || page === totalPages) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const percent = ((page / totalPages) * 100).toFixed(1);
      console.log(`  Page ${page}/${totalPages} (${percent}%) — ${allItems.length} items — ${elapsed}s`);
      saveCheckpoint(allItems, page, totalPages);
    }
  }

  const fetchDuration = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\nFetch complete: ${allItems.length} items in ${fetchDuration}s (${failedPages} skipped pages)`);

  // Filter to allowed locations
  const filtered = allItems.filter(item => ALLOWED_LOCATIONS.includes(item.location?.name));
  const locationBreakdown = {};
  filtered.forEach(item => {
    const loc = item.location.name;
    locationBreakdown[loc] = (locationBreakdown[loc] || 0) + 1;
  });

  console.log(`\nFiltered: ${filtered.length} items`);
  console.log('Breakdown:', locationBreakdown);

  // Build payload
  const payload = {
    metadata: {
      timestamp: new Date().toISOString(),
      totalItems: filtered.length,
      totalAvailable: allItems.length,
      totalPages,
      failedPages,
      fetchDurationSeconds: parseInt(fetchDuration),
      locations: ALLOWED_LOCATIONS,
      locationBreakdown,
      source: 'wholecell-api',
    },
    count: filtered.length,
    data: filtered,
  };

  // Save local JSON
  const dataDir = path.dirname(LOCAL_OUTPUT);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(LOCAL_OUTPUT, JSON.stringify(payload));
  const sizeMB = (fs.statSync(LOCAL_OUTPUT).size / (1024 * 1024)).toFixed(1);
  console.log(`\nSaved: ${LOCAL_OUTPUT} (${sizeMB} MB)`);

  // Clean checkpoint
  try { fs.unlinkSync(CHECKPOINT_FILE); } catch {}

  // Upload to Vercel Blob
  if (!LOCAL_ONLY && process.env.BLOB_READ_WRITE_TOKEN) {
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

  console.log('\n=== Sync Complete ===');
  console.log(`Items: ${filtered.length} (${Object.entries(locationBreakdown).map(([k,v])=>`${k}: ${v}`).join(', ')})`);
  console.log(`Duration: ${fetchDuration}s | Failed pages: ${failedPages}`);

  return { success: true, items: filtered.length, duration: parseInt(fetchDuration), failedPages };
}

syncInventory()
  .then(r => { console.log('\nSync succeeded:', r); process.exit(0); })
  .catch(e => { console.error('\nSync FAILED:', e.message, e.stack); process.exit(1); });
