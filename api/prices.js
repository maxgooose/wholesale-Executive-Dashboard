import { neon } from '@neondatabase/serverless';

export const config = {
  maxDuration: 10,
};

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  model VARCHAR(255) NOT NULL,
  storage VARCHAR(50) NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_history_model_storage ON price_history(model, storage);
`;

let initialized = false;

async function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  if (!initialized) {
    await sql(INIT_SQL);
    initialized = true;
  }
  return sql;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sql = await getDb();

    if (req.method === 'POST') {
      const { model, storage, price } = req.body;
      if (!model || !storage || price == null) {
        return res.status(400).json({ error: 'model, storage, and price are required' });
      }
      await sql(
        'INSERT INTO price_history (model, storage, price) VALUES ($1, $2, $3)',
        [model, storage, parseFloat(price)]
      );
      return res.json({ ok: true, model, storage, price: parseFloat(price) });
    }

    if (req.method === 'GET') {
      // GET /api/prices — returns latest price per model+storage
      const rows = await sql(`
        SELECT DISTINCT ON (model, storage) model, storage, price, created_at
        FROM price_history
        ORDER BY model, storage, created_at DESC
      `);
      return res.json({ prices: rows });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Prices API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
