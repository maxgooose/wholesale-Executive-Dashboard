import { neon } from '@neondatabase/serverless';

export const config = { maxDuration: 10 };

let initialized = false;

async function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  if (!initialized) {
    await sql`
      CREATE TABLE IF NOT EXISTS deals (
        id SERIAL PRIMARY KEY,
        deal_name VARCHAR(255) NOT NULL,
        buyer VARCHAR(255) DEFAULT '',
        items JSONB NOT NULL,
        total_units INTEGER DEFAULT 0,
        total_value NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at DESC)`;
    initialized = true;
  }
  return sql;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sql = await getDb();

    if (req.method === 'POST') {
      const { deal_name, buyer, items, total_units, total_value } = req.body;
      if (!deal_name || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'deal_name and items[] required' });
      }
      const itemsJson = JSON.stringify(items);
      const rows = await sql`
        INSERT INTO deals (deal_name, buyer, items, total_units, total_value)
        VALUES (${deal_name}, ${buyer || ''}, ${itemsJson}::jsonb, ${total_units || 0}, ${total_value || 0})
        RETURNING id, deal_name, buyer, total_units, total_value, created_at
      `;
      return res.json({ ok: true, deal: rows[0] });
    }

    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const rows = await sql`SELECT * FROM deals WHERE id = ${parseInt(id)}`;
        if (rows.length === 0) return res.status(404).json({ error: 'Deal not found' });
        return res.json({ deal: rows[0] });
      }
      // List all deals, most recent first
      const rows = await sql`
        SELECT id, deal_name, buyer, total_units, total_value, created_at
        FROM deals ORDER BY created_at DESC LIMIT 100
      `;
      return res.json({ deals: rows });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM deals WHERE id = ${parseInt(id)}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Deals API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
