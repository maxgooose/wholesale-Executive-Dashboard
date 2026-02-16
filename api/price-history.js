import { neon } from '@neondatabase/serverless';

export const config = {
  maxDuration: 10,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { model, storage } = req.query;

    if (model && storage) {
      const rows = await sql`
        SELECT price, created_at FROM price_history 
        WHERE model = ${model} AND storage = ${storage} 
        ORDER BY created_at DESC LIMIT 50
      `;
      return res.json({ model, storage, history: rows });
    }

    if (model) {
      const rows = await sql`
        SELECT storage, price, created_at FROM price_history 
        WHERE model = ${model} 
        ORDER BY created_at DESC LIMIT 100
      `;
      return res.json({ model, history: rows });
    }

    const rows = await sql`
      SELECT model, storage, price, created_at FROM price_history 
      ORDER BY created_at DESC LIMIT 200
    `;
    return res.json({ history: rows });
  } catch (err) {
    console.error('Price history API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
