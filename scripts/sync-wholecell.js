#!/usr/bin/env node
/**
 * WholeCell Inventory Sync — Server-Side Delta Sync
 * ==================================================
 * Uses WholeCell's `updated_at_gt` filter to fetch only changed items,
 * then upserts them into Neon PostgreSQL.
 *
 * Modes:
 *   - Delta sync (default): Fetches items updated since last sync.
 *     Runs in ~1-10 seconds. Intended for every-10-minute cron.
 *   - Full reconciliation: Fetches ALL items, upserts everything,
 *     then deletes stale rows. Runs automatically when the last full
 *     reconciliation is older than FULL_RECONCILIATION_INTERVAL_HOURS.
 *     Can be forced with --full flag.
 *
 * Required env vars:
 *   WHOLECELL_APP_ID       — WholeCell API app ID
 *   WHOLECELL_APP_SECRET   — WholeCell API app secret
 *   DATABASE_URL           — Neon PostgreSQL connection string
 *
 * Usage:
 *   node scripts/sync-wholecell.js          # Auto-detect: delta or full
 *   node scripts/sync-wholecell.js --full   # Force full reconciliation
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

const { neon } = require('@neondatabase/serverless');

// --------------- Config ---------------

const APP_ID = process.env.WHOLECELL_APP_ID;
const APP_SECRET = process.env.WHOLECELL_APP_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const API_BASE = 'https://api.wholecell.io/api/v1/inventories';
const RATE_LIMIT_MS = 550;
const MAX_RETRIES = 5;
const BATCH_SIZE = 200;
const STATUSES_TO_FETCH = ['Available', 'Inbound'];
const FULL_RECONCILIATION_INTERVAL_HOURS = 12;
const FORCE_FULL = process.argv.includes('--full');

// --------------- Helpers ---------------

function getAuthHeader() {
  return `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractFields(item) {
  const pv = item.product_variation || {};
  const product = pv.product || {};
  return {
    id: item.id,
    esn: item.esn || null,
    status: item.status || null,
    model: product.model || null,
    manufacturer: product.manufacturer || null,
    capacity: product.capacity || null,
    color: product.color || null,
    grade: pv.grade || null,
    location_name: item.location?.name || null,
    warehouse_name: item.warehouse?.name || null,
    cost_cents: item.total_price_paid || null,
    sale_price_cents: item.sale_price || null,
    wc_created_at: item.created_at || null,
    wc_updated_at: item.updated_at || null,
    raw_data: JSON.stringify(item),
  };
}

// --------------- Database ---------------

let dbInitialized = false;

async function initDb(sql) {
  if (dbInitialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY,
      esn VARCHAR(100),
      status VARCHAR(50),
      model VARCHAR(255),
      manufacturer VARCHAR(100),
      capacity VARCHAR(50),
      color VARCHAR(100),
      grade VARCHAR(50),
      location_name VARCHAR(255),
      warehouse_name VARCHAR(255),
      cost_cents INTEGER,
      sale_price_cents INTEGER,
      wc_created_at TIMESTAMPTZ,
      wc_updated_at TIMESTAMPTZ,
      raw_data JSONB NOT NULL,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inv_status ON inventory(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inv_esn ON inventory(esn)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inv_wc_updated ON inventory(wc_updated_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      last_delta_sync TIMESTAMPTZ,
      last_full_reconciliation TIMESTAMPTZ,
      delta_items_changed INTEGER DEFAULT 0,
      full_total_items INTEGER DEFAULT 0,
      full_items_removed INTEGER DEFAULT 0
    )`;
  await sql`INSERT INTO sync_state (id) VALUES (1) ON CONFLICT DO NOTHING`;
  dbInitialized = true;
  console.log('Database initialized.');
}

async function getSyncState(sql) {
  const rows = await sql`SELECT * FROM sync_state WHERE id = 1`;
  return rows[0] || {};
}

async function upsertBatch(sql, items) {
  if (items.length === 0) return;
  const queries = items.map(item => {
    const f = extractFields(item);
    return sql`
      INSERT INTO inventory (id, esn, status, model, manufacturer, capacity,
        color, grade, location_name, warehouse_name, cost_cents,
        sale_price_cents, wc_created_at, wc_updated_at, raw_data, synced_at)
      VALUES (${f.id}, ${f.esn}, ${f.status}, ${f.model}, ${f.manufacturer},
        ${f.capacity}, ${f.color}, ${f.grade}, ${f.location_name},
        ${f.warehouse_name}, ${f.cost_cents}, ${f.sale_price_cents},
        ${f.wc_created_at}, ${f.wc_updated_at}, ${f.raw_data}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        esn = EXCLUDED.esn,
        status = EXCLUDED.status,
        model = EXCLUDED.model,
        manufacturer = EXCLUDED.manufacturer,
        capacity = EXCLUDED.capacity,
        color = EXCLUDED.color,
        grade = EXCLUDED.grade,
        location_name = EXCLUDED.location_name,
        warehouse_name = EXCLUDED.warehouse_name,
        cost_cents = EXCLUDED.cost_cents,
        sale_price_cents = EXCLUDED.sale_price_cents,
        wc_created_at = EXCLUDED.wc_created_at,
        wc_updated_at = EXCLUDED.wc_updated_at,
        raw_data = EXCLUDED.raw_data,
        synced_at = NOW()
    `;
  });
  await sql.transaction(queries);
}

// --------------- WholeCell API ---------------

async function fetchPage(params, retries = 0) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${API_BASE}?${qs}`;

  try {
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
      console.warn(`  [429] Rate limited, waiting ${wait / 1000}s...`);
      await sleep(wait);
      return fetchPage(params, retries + 1);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    if (!text || !text.startsWith('{')) {
      if (retries < MAX_RETRIES) {
        await sleep(3000 * (retries + 1));
        return fetchPage(params, retries + 1);
      }
      return null;
    }

    return JSON.parse(text);
  } catch (error) {
    console.error(`  [ERROR] attempt ${retries + 1}: ${error.message}`);
    if (retries < MAX_RETRIES) {
      await sleep(3000 * (retries + 1));
      return fetchPage(params, retries + 1);
    }
    console.error(`  [SKIP] Giving up after ${MAX_RETRIES} retries`);
    return null;
  }
}

async function fetchAllPages(extraParams = {}) {
  let allItems = [];
  let failedPages = 0;
  const startTime = Date.now();

  for (const status of STATUSES_TO_FETCH) {
    const params = { status, ...extraParams, page: 1 };
    console.log(`\n--- Fetching status: ${status} ---`);
    const firstPage = await fetchPage(params);
    if (!firstPage || !firstPage.data) {
      console.warn(`  No data for status=${status}, skipping.`);
      continue;
    }

    const totalPages = firstPage.pages || 1;
    allItems.push(...firstPage.data);
    console.log(`  ${totalPages} pages (~${totalPages * 100} items)`);

    for (let page = 2; page <= totalPages; page++) {
      await sleep(RATE_LIMIT_MS);
      const result = await fetchPage({ ...params, page });
      if (result && result.data) {
        allItems.push(...result.data);
      } else {
        failedPages++;
      }

      if (page % 25 === 0 || page === totalPages) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  Page ${page}/${totalPages} — ${allItems.length} total — ${elapsed}s`);
      }
    }
  }

  return { items: allItems, failedPages };
}

// --------------- Delta Sync ---------------

async function deltaSync(sql, since) {
  console.log(`\n=== Delta Sync (since ${since}) ===`);
  const sinceISO = new Date(since).toISOString();

  let allItems = [];
  let failedPages = 0;

  for (const status of STATUSES_TO_FETCH) {
    const params = { status, updated_at_gt: sinceISO, page: 1 };
    console.log(`  Checking ${status} updated since ${sinceISO}...`);
    const firstPage = await fetchPage(params);
    if (!firstPage || !firstPage.data) {
      console.log(`  No changes for status=${status}.`);
      continue;
    }

    const totalPages = firstPage.pages || 1;
    allItems.push(...firstPage.data);
    console.log(`  ${totalPages} page(s) of changes (~${firstPage.data.length} on page 1)`);

    for (let page = 2; page <= totalPages; page++) {
      await sleep(RATE_LIMIT_MS);
      const result = await fetchPage({ ...params, page });
      if (result && result.data) {
        allItems.push(...result.data);
      } else {
        failedPages++;
      }
    }
  }

  if (allItems.length === 0) {
    console.log('\nNo changes detected. Updating sync timestamp.');
    await sql`UPDATE sync_state SET last_delta_sync = NOW(), delta_items_changed = 0 WHERE id = 1`;
    return { mode: 'delta', itemsChanged: 0, failedPages: 0 };
  }

  console.log(`\nUpserting ${allItems.length} changed items...`);
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE);
    await upsertBatch(sql, batch);
    if (allItems.length > BATCH_SIZE) {
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allItems.length / BATCH_SIZE)} done`);
    }
  }

  await sql`UPDATE sync_state SET last_delta_sync = NOW(), delta_items_changed = ${allItems.length} WHERE id = 1`;
  console.log(`Delta sync complete: ${allItems.length} items upserted.`);
  return { mode: 'delta', itemsChanged: allItems.length, failedPages };
}

// --------------- Full Reconciliation ---------------

async function fullReconciliation(sql) {
  console.log('\n=== Full Reconciliation ===');
  const reconciliationStart = new Date().toISOString();

  const { items, failedPages } = await fetchAllPages();
  console.log(`\nFetched ${items.length} total items (${failedPages} failed pages).`);

  if (items.length === 0) {
    console.warn('No items fetched — aborting reconciliation to avoid data loss.');
    return { mode: 'full', totalItems: 0, removed: 0, failedPages };
  }

  const totalBatches = Math.ceil(items.length / BATCH_SIZE);
  const upsertStart = Date.now();
  console.log(`Upserting ${items.length} items in ${totalBatches} batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await upsertBatch(sql, batch);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const elapsed = ((Date.now() - upsertStart) / 1000).toFixed(0);
    const pct = Math.round((batchNum / totalBatches) * 100);
    if (batchNum % 5 === 0 || batchNum === totalBatches) {
      console.log(`  Batch ${batchNum}/${totalBatches} (${pct}%) — ${elapsed}s elapsed`);
    }
  }

  const stale = await sql`
    DELETE FROM inventory WHERE synced_at < ${reconciliationStart}::timestamptz
    RETURNING id
  `;
  const removedCount = stale.length;
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} stale items not found in WholeCell.`);
  }

  await sql`
    UPDATE sync_state SET
      last_delta_sync = NOW(),
      last_full_reconciliation = NOW(),
      delta_items_changed = ${items.length},
      full_total_items = ${items.length},
      full_items_removed = ${removedCount}
    WHERE id = 1
  `;

  console.log(`Full reconciliation complete: ${items.length} items, ${removedCount} removed.`);
  return { mode: 'full', totalItems: items.length, removed: removedCount, failedPages };
}

// --------------- Main ---------------

async function main() {
  console.log('=== WholeCell Inventory Sync ===');
  console.log(`Time: ${new Date().toISOString()}`);

  if (!APP_ID || !APP_SECRET) throw new Error('Missing WHOLECELL_APP_ID or WHOLECELL_APP_SECRET');
  if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');

  const sql = neon(DATABASE_URL);
  await initDb(sql);

  const state = await getSyncState(sql);
  console.log(`Last delta sync: ${state.last_delta_sync || 'never'}`);
  console.log(`Last full reconciliation: ${state.last_full_reconciliation || 'never'}`);

  const needsFull = FORCE_FULL
    || !state.last_full_reconciliation
    || (Date.now() - new Date(state.last_full_reconciliation).getTime()) > FULL_RECONCILIATION_INTERVAL_HOURS * 3600000;

  if (needsFull) {
    const reason = FORCE_FULL ? '--full flag' :
      !state.last_full_reconciliation ? 'first run' :
      `last full reconciliation > ${FULL_RECONCILIATION_INTERVAL_HOURS}h ago`;
    console.log(`\nTriggering full reconciliation (${reason}).`);
    return await fullReconciliation(sql);
  }

  return await deltaSync(sql, state.last_delta_sync);
}

const startTime = Date.now();
main()
  .then(result => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nSync succeeded in ${duration}s:`, result);
    process.exit(0);
  })
  .catch(err => {
    console.error('\nSync FAILED:', err.message, err.stack);
    process.exit(1);
  });
