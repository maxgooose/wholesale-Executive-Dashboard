import { neon } from '@neondatabase/serverless';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const APP_ID = process.env.WHOLECELL_APP_ID;
    const APP_SECRET = process.env.WHOLECELL_APP_SECRET;

    if (!APP_ID || !APP_SECRET) {
      return res.status(500).json({ error: 'Missing WHOLECELL_APP_ID or WHOLECELL_APP_SECRET' });
    }

    // Get last sync time from DB
    const lastSync = await sql`SELECT synced_at FROM inventory_sync ORDER BY synced_at DESC LIMIT 1`;
    const since = lastSync[0]?.synced_at
      ? new Date(lastSync[0].synced_at).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // fallback: last 24h

    const auth = 'Basic ' + Buffer.from(APP_ID + ':' + APP_SECRET).toString('base64');
    const url = `https://api.wholecell.io/api/v1/inventories?updated_at_gt=${encodeURIComponent(since)}`;

    const response = await fetch(url, {
      headers: { Authorization: auth, 'X-App-Id': APP_ID, Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });

    const data = await response.json();

    // Collect all pages if needed
    let allItems = data.data || [];
    const totalPages = data.pages || 1;

    if (totalPages > 1) {
      for (let p = 2; p <= Math.min(totalPages, 5); p++) {
        await new Promise(r => setTimeout(r, 1000));
        const r2 = await fetch(url + '&page=' + p, {
          headers: { Authorization: auth, 'X-App-Id': APP_ID, Accept: 'application/json' },
        });
        const d2 = await r2.json();
        if (d2.data) allItems = allItems.concat(d2.data);
      }
    }

    // Summarize changes
    const summary = allItems.map(item => {
      const pv = item.product_variation || {};
      const product = pv.product || {};
      return {
        id: item.id,
        model: product.model || 'Unknown',
        status: item.status,
        grade: pv.grade,
        color: product.color,
        location: item.location?.name,
        updated_at: item.updated_at,
      };
    });

    return res.status(200).json({
      lastSyncAt: since,
      checkedAt: new Date().toISOString(),
      apiStatus: response.status,
      totalPages,
      changedItems: allItems.length,
      items: summary,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
