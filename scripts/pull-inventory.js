#!/usr/bin/env node
/**
 * Simple WholeCell inventory puller. Saves progress after every page.
 * If it crashes, run again — it resumes from the last page.
 */
const fs = require('fs');
const path = require('path');

const APP_ID = process.env.WHOLECELL_APP_ID;
const APP_SECRET = process.env.WHOLECELL_APP_SECRET;
const API = 'https://api.wholecell.io/api/v1/inventories';
const OUT = path.join(__dirname, '..', 'data', 'available-inventory.json');
const PROGRESS = path.join(__dirname, '..', 'data', '.pull-progress.json');
const DELAY = 1200; // ms between requests

if (!APP_ID || !APP_SECRET) { console.error('Missing WHOLECELL_APP_ID or WHOLECELL_APP_SECRET'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(page, status, retries = 3) {
  const url = `${API}?status=${status}&per_page=100&page=${page}`;
  for (let i = 0; i < retries; i++) {
    try {
      const auth = 'Basic ' + Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
      const r = await fetch(url, { headers: { 'Authorization': auth, 'X-App-Id': APP_ID, 'Accept': 'application/json' }, signal: AbortSignal.timeout(45000) });
      if (r.status === 429) { console.log(`  Rate limited, waiting 5s...`); await sleep(5000); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.log(`  Retry ${i+1}/${retries}: ${e.message}`);
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { items: [], page: 1, status: 'Available' }; }
}

function saveProgress(state) {
  fs.writeFileSync(PROGRESS, JSON.stringify({ items: state.items.length, page: state.page, status: state.status }));
  // Save items separately to avoid huge JSON in progress file
  const tmpOut = OUT + '.tmp';
  fs.writeFileSync(tmpOut, JSON.stringify({ data: state.items, metadata: { timestamp: new Date().toISOString(), count: state.items.length, partial: true } }));
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  
  // Check if we have partial data from a previous run
  let items = [];
  let startPage = 1;
  let startStatus = 'Available';
  
  const prog = loadProgress();
  if (prog.items > 0) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT + '.tmp', 'utf8'));
      if (existing.data && existing.data.length > 0) {
        items = existing.data;
        startPage = prog.page;
        startStatus = prog.status;
        console.log(`Resuming: ${items.length} items from page ${startPage} (${startStatus})`);
      }
    } catch {}
  }

  const statuses = ['Available', 'Inbound'];
  
  for (const status of statuses) {
    if (statuses.indexOf(status) < statuses.indexOf(startStatus)) continue;
    
    let page = (status === startStatus) ? startPage : 1;
    let totalPages = null;
    
    console.log(`\n--- Fetching ${status} inventory ---`);
    
    while (true) {
      process.stdout.write(`  Page ${page}${totalPages ? '/' + totalPages : ''}... `);
      const data = await fetchPage(page, status);
      
      if (!data) { console.log('FAILED - stopping'); break; }
      
      if (!totalPages && data.total_pages) totalPages = data.total_pages;
      
      const pageItems = data.data || data.inventories || data || [];
      if (!Array.isArray(pageItems) || pageItems.length === 0) {
        console.log(`0 items — done with ${status}`);
        break;
      }
      
      items.push(...pageItems);
      console.log(`+${pageItems.length} (total: ${items.length})`);
      
      // Save progress after every page
      saveProgress({ items, page: page + 1, status });
      
      if (totalPages && page >= totalPages) break;
      page++;
      await sleep(DELAY);
    }
  }

  // Final save
  const output = { data: items, metadata: { timestamp: new Date().toISOString(), count: items.length, partial: false } };
  fs.writeFileSync(OUT, JSON.stringify(output));
  try { fs.unlinkSync(OUT + '.tmp'); } catch {}
  try { fs.unlinkSync(PROGRESS); } catch {}
  
  console.log(`\n=== DONE: ${items.length} items saved to ${OUT} ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
