import { neon } from '@neondatabase/serverless';

export const config = {
  maxDuration: 10,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { status } = req.query;

    const rows = status
      ? await sql`SELECT raw_data FROM inventory WHERE status = ${status}`
      : await sql`SELECT raw_data FROM inventory`;

    const items = rows.map(r => r.raw_data);

    const syncState = await sql`SELECT last_delta_sync FROM sync_state WHERE id = 1`;
    const lastSync = syncState[0]?.last_delta_sync || null;

    res.setHeader('X-Inventory-Updated', lastSync || 'never');
    res.setHeader('X-Inventory-Count', String(items.length));

    return res.status(200).json({
      metadata: {
        timestamp: new Date().toISOString(),
        totalItems: items.length,
        lastSync,
        source: 'neon-postgresql',
      },
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error('Inventory API error:', error);
    return res.status(500).json({
      error: 'Failed to load inventory data',
      message: error.message,
    });
  }
}
