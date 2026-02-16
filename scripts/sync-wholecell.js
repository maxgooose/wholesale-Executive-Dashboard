#!/usr/bin/env node
/**
 * Wholecell Inventory Sync Script
 * ================================
 * Fetches all inventory from Wholecell API and uploads to Vercel Blob Storage.
 * Designed to run in GitHub Actions on a cron schedule.
 *
 * Required env vars:
 *   WHOLECELL_APP_ID       - Wholecell API app ID
 *   WHOLECELL_APP_SECRET   - Wholecell API app secret
 *   BLOB_READ_WRITE_TOKEN  - Vercel Blob read/write token
 *
 * Usage:
 *   node scripts/sync-wholecell.js
 */

const { put, list, del } = require('@vercel/blob');

// ── Config ──────────────────────────────────────────────────────────────
const APP_ID = process.env.WHOLECELL_APP_ID;
const APP_SECRET = process.env.WHOLECELL_APP_SECRET;
const API_BASE = 'https://api.wholecell.io/api/v1/inventories';
const RATE_LIMIT_MS = 500; // 2 requests/sec
const MAX_RETRIES = 3;

// ── Auth ────────────────────────────────────────────────────────────────
function getAuthHeader() {
  const encoded = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
  return `Basic ${encoded}`;
}

// ── Fetch helpers ───────────────────────────────────────────────────────
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(page = 1, retries = 0) {
  const url = page > 1 ? `${API_BASE}?page=${page}` : API_BASE;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(),
        'X-App-Id': APP_ID,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (retries < MAX_RETRIES) {
      console.warn(`  Retry ${retries + 1}/${MAX_RETRIES} for page ${page}: ${error.message}`);
      await sleep(2000 * (retries + 1));
      return fetchPage(page, retries + 1);
    }
    throw error;
  }
}

// ── Main sync ───────────────────────────────────────────────────────────
async function syncInventory() {
  console.log('=== Wholecell Inventory Sync ===');
  console.log(`Time: ${new Date().toISOString()}`);

  if (!APP_ID || !APP_SECRET) {
    throw new Error('Missing WHOLECELL_APP_ID or WHOLECELL_APP_SECRET');
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Missing BLOB_READ_WRITE_TOKEN');
  }

  // 1. Fetch first page to get total count
  console.log('\nFetching page 1...');
  const firstPage = await fetchPage(1);

  if (!firstPage || !firstPage.data) {
    throw new Error('Invalid response from Wholecell API');
  }

  const totalPages = firstPage.pages || 1;
  const allItems = [...firstPage.data];
  console.log(`Total pages: ${totalPages} (${allItems.length} items on page 1)`);

  // 2. Fetch remaining pages
  const startTime = Date.now();
  let failedPages = 0;

  for (let page = 2; page <= totalPages; page++) {
    try {
      const result = await fetchPage(page);
      if (result && result.data) {
        allItems.push(...result.data);
      }
    } catch (error) {
      console.error(`  FAILED page ${page}: ${error.message}`);
      failedPages++;
    }

    // Progress logging every 100 pages
    if (page % 100 === 0 || page === totalPages) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const percent = ((page / totalPages) * 100).toFixed(1);
      console.log(`  Page ${page}/${totalPages} (${percent}%) - ${allItems.length} items - ${elapsed}s elapsed`);
    }

    // Rate limit
    if (page < totalPages) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  const fetchDuration = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\nFetch complete: ${allItems.length} items in ${fetchDuration}s (${failedPages} failed pages)`);

  // 3. Build the cache payload
  const payload = {
    metadata: {
      timestamp: new Date().toISOString(),
      totalItems: allItems.length,
      totalPages,
      failedPages,
      fetchDurationSeconds: parseInt(fetchDuration),
      source: 'wholecell-api',
    },
    items: allItems,
  };

  // 4. Upload to Vercel Blob
  console.log('\nUploading to Vercel Blob Storage...');
  const jsonStr = JSON.stringify(payload);
  const sizeMB = (Buffer.byteLength(jsonStr) / (1024 * 1024)).toFixed(1);
  console.log(`Payload size: ${sizeMB} MB`);

  const blob = await put('inventory/latest.json', jsonStr, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });

  console.log(`Uploaded to: ${blob.url}`);

  // 5. Clean up old blobs (keep only the latest)
  const { blobs } = await list({ prefix: 'inventory/' });
  const oldBlobs = blobs.filter((b) => b.pathname !== 'inventory/latest.json');
  for (const old of oldBlobs) {
    await del(old.url);
    console.log(`Cleaned up old blob: ${old.pathname}`);
  }

  // 6. Summary
  console.log('\n=== Sync Complete ===');
  console.log(`Items: ${allItems.length}`);
  console.log(`Size: ${sizeMB} MB`);
  console.log(`Duration: ${fetchDuration}s`);
  console.log(`Failed pages: ${failedPages}`);
  console.log(`Blob URL: ${blob.url}`);

  return {
    success: true,
    items: allItems.length,
    duration: parseInt(fetchDuration),
    failedPages,
    blobUrl: blob.url,
  };
}

// ── Run ─────────────────────────────────────────────────────────────────
syncInventory()
  .then((result) => {
    console.log('\nSync succeeded:', result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nSync FAILED:', error.message);
    process.exit(1);
  });
