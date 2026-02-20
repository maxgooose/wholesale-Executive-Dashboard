import { neon } from '@neondatabase/serverless';

export const config = { maxDuration: 10 };

let initialized = false;

async function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  if (!initialized) {
    await sql`
      CREATE TABLE IF NOT EXISTS model_prices (
        id SERIAL PRIMARY KEY,
        model VARCHAR(255) NOT NULL,
        storage VARCHAR(50) NOT NULL,
        grade_a NUMERIC(10,2) DEFAULT 0,
        grade_b NUMERIC(10,2) DEFAULT 0,
        grade_c NUMERIC(10,2) DEFAULT 0,
        grade_c_amz NUMERIC(10,2) DEFAULT 0,
        grade_d NUMERIC(10,2) DEFAULT 0,
        defective NUMERIC(10,2) DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by VARCHAR(100) DEFAULT 'System',
        UNIQUE(model, storage)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_model_prices_model ON model_prices(model)`;

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

    if (req.method === 'GET') {
      const { model, storage } = req.query;
      if (model && storage) {
        const rows = await sql`
          SELECT * FROM model_prices WHERE model = ${model} AND storage = ${storage}
        `;
        return res.json({ price: rows[0] || null });
      }
      const rows = await sql`SELECT * FROM model_prices ORDER BY model, storage`;
      return res.json({ prices: rows });
    }

    if (req.method === 'POST') {
      const { model, storage, grade_a, grade_b, grade_c, grade_c_amz, grade_d, defective, updated_by } = req.body;
      if (!model || !storage) {
        return res.status(400).json({ error: 'model and storage are required' });
      }
      const rows = await sql`
        INSERT INTO model_prices (model, storage, grade_a, grade_b, grade_c, grade_c_amz, grade_d, defective, updated_by, updated_at)
        VALUES (
          ${model}, ${storage},
          ${parseFloat(grade_a) || 0}, ${parseFloat(grade_b) || 0},
          ${parseFloat(grade_c) || 0}, ${parseFloat(grade_c_amz) || 0},
          ${parseFloat(grade_d) || 0}, ${parseFloat(defective) || 0},
          ${updated_by || 'System'}, NOW()
        )
        ON CONFLICT (model, storage) DO UPDATE SET
          grade_a = EXCLUDED.grade_a,
          grade_b = EXCLUDED.grade_b,
          grade_c = EXCLUDED.grade_c,
          grade_c_amz = EXCLUDED.grade_c_amz,
          grade_d = EXCLUDED.grade_d,
          defective = EXCLUDED.defective,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING *
      `;
      return res.json({ ok: true, price: rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Model prices API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
