import { neon } from '@neondatabase/serverless';

export const config = { maxDuration: 10 };

let initialized = false;

async function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  if (!initialized) {
    // Check if new schema already exists (deal_items table = migrated)
    const hasNewSchema = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'deal_items'
      ) AS exists
    `;

    if (!hasNewSchema[0]?.exists) {
      // Check for legacy table with JSONB items column
      const legacy = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'deals' AND column_name = 'items'
      `;
      if (legacy.length > 0) {
        await sql`ALTER TABLE deals RENAME TO deals_legacy`;
      }
    }

    await sql`
      CREATE TABLE IF NOT EXISTS deals (
        id SERIAL PRIMARY KEY,
        deal_name VARCHAR(255) NOT NULL,
        buyer VARCHAR(255) DEFAULT '',
        status VARCHAR(50) DEFAULT 'draft',
        notes TEXT DEFAULT '',
        total_units INTEGER DEFAULT 0,
        total_value NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        finalized_at TIMESTAMPTZ
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_v2_status ON deals(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_v2_created ON deals(created_at DESC)`;

    await sql`
      CREATE TABLE IF NOT EXISTS deal_items (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        model VARCHAR(255) NOT NULL,
        storage VARCHAR(50) DEFAULT '',
        grade VARCHAR(50) DEFAULT 'All',
        color VARCHAR(100) DEFAULT '',
        qty INTEGER DEFAULT 0,
        price NUMERIC(10,2) DEFAULT 0,
        subtotal NUMERIC(12,2) DEFAULT 0
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deal_items_deal_id ON deal_items(deal_id)`;

    // Migrate legacy data if the renamed table exists
    const hasLegacy = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'deals_legacy'
      ) AS exists
    `;
    if (hasLegacy[0]?.exists) {
      try {
        const alreadyMigrated = await sql`SELECT COUNT(*) AS cnt FROM deals`;
        if (parseInt(alreadyMigrated[0]?.cnt) === 0) {
          const oldDeals = await sql`SELECT * FROM deals_legacy ORDER BY created_at`;
          for (const od of oldDeals) {
            const rows = await sql`
              INSERT INTO deals (deal_name, buyer, status, total_units, total_value, created_at, updated_at)
              VALUES (${od.deal_name}, ${od.buyer || ''}, 'finalized',
                      ${od.total_units || 0}, ${od.total_value || 0}, ${od.created_at}, ${od.created_at})
              RETURNING id
            `;
            const newId = rows[0].id;
            let items = [];
            try { items = typeof od.items === 'string' ? JSON.parse(od.items) : (od.items || []); } catch {}
            for (const item of items) {
              await sql`
                INSERT INTO deal_items (deal_id, model, storage, grade, color, qty, price, subtotal)
                VALUES (${newId}, ${item.model || ''}, ${item.storage || ''}, ${item.grade || 'All'},
                        ${item.color || ''}, ${item.qty || 0}, ${item.price || 0},
                        ${(item.qty || 0) * (item.price || 0)})
              `;
            }
          }
        }
        await sql`DROP TABLE IF EXISTS deals_legacy`;
      } catch (migErr) {
        console.error('Legacy migration error (non-fatal):', migErr.message);
      }
    }

    initialized = true;
  }
  return sql;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sql = await getDb();

    // ── CREATE ──
    if (req.method === 'POST') {
      const { deal_name, buyer, items, total_units, total_value, notes } = req.body;
      if (!deal_name || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'deal_name and items[] required' });
      }
      const dealRows = await sql`
        INSERT INTO deals (deal_name, buyer, notes, total_units, total_value)
        VALUES (${deal_name}, ${buyer || ''}, ${notes || ''}, ${total_units || 0}, ${total_value || 0})
        RETURNING *
      `;
      const deal = dealRows[0];
      for (const item of items) {
        await sql`
          INSERT INTO deal_items (deal_id, model, storage, grade, color, qty, price, subtotal)
          VALUES (${deal.id}, ${item.model || ''}, ${item.storage || ''}, ${item.grade || 'All'},
                  ${item.color || ''}, ${item.qty || 0}, ${item.price || 0},
                  ${(item.qty || 0) * (item.price || 0)})
        `;
      }
      const savedItems = await sql`SELECT * FROM deal_items WHERE deal_id = ${deal.id} ORDER BY id`;
      return res.json({ ok: true, deal: { ...deal, items: savedItems } });
    }

    // ── READ ──
    if (req.method === 'GET') {
      const { id, status } = req.query;
      if (id) {
        const dealRows = await sql`SELECT * FROM deals WHERE id = ${parseInt(id)}`;
        if (dealRows.length === 0) return res.status(404).json({ error: 'Deal not found' });
        const items = await sql`SELECT * FROM deal_items WHERE deal_id = ${parseInt(id)} ORDER BY id`;
        return res.json({ deal: { ...dealRows[0], items } });
      }
      let rows;
      if (status) {
        rows = await sql`
          SELECT id, deal_name, buyer, status, total_units, total_value, created_at, updated_at, finalized_at
          FROM deals WHERE status = ${status} ORDER BY updated_at DESC LIMIT 100
        `;
      } else {
        rows = await sql`
          SELECT id, deal_name, buyer, status, total_units, total_value, created_at, updated_at, finalized_at
          FROM deals ORDER BY updated_at DESC LIMIT 100
        `;
      }
      return res.json({ deals: rows });
    }

    // ── UPDATE ──
    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { deal_name, buyer, items, total_units, total_value, notes } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'items[] required' });
      }
      const dealId = parseInt(id);
      const existing = await sql`SELECT id FROM deals WHERE id = ${dealId}`;
      if (existing.length === 0) return res.status(404).json({ error: 'Deal not found' });

      await sql`
        UPDATE deals SET
          deal_name = ${deal_name || 'Untitled Deal'},
          buyer = ${buyer || ''},
          notes = ${notes || ''},
          total_units = ${total_units || 0},
          total_value = ${total_value || 0},
          updated_at = NOW()
        WHERE id = ${dealId}
      `;
      await sql`DELETE FROM deal_items WHERE deal_id = ${dealId}`;
      for (const item of items) {
        await sql`
          INSERT INTO deal_items (deal_id, model, storage, grade, color, qty, price, subtotal)
          VALUES (${dealId}, ${item.model || ''}, ${item.storage || ''}, ${item.grade || 'All'},
                  ${item.color || ''}, ${item.qty || 0}, ${item.price || 0},
                  ${(item.qty || 0) * (item.price || 0)})
        `;
      }
      const updatedDeal = await sql`SELECT * FROM deals WHERE id = ${dealId}`;
      const updatedItems = await sql`SELECT * FROM deal_items WHERE deal_id = ${dealId} ORDER BY id`;
      return res.json({ ok: true, deal: { ...updatedDeal[0], items: updatedItems } });
    }

    // ── STATUS UPDATE ──
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { status } = req.body;
      const validStatuses = ['draft', 'finalized', 'exported', 'in_pipeline', 'completed'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      }
      const dealId = parseInt(id);
      if (status === 'finalized') {
        await sql`UPDATE deals SET status = ${status}, finalized_at = NOW(), updated_at = NOW() WHERE id = ${dealId}`;
      } else {
        await sql`UPDATE deals SET status = ${status}, updated_at = NOW() WHERE id = ${dealId}`;
      }
      const rows = await sql`SELECT * FROM deals WHERE id = ${dealId}`;
      if (rows.length === 0) return res.status(404).json({ error: 'Deal not found' });
      return res.json({ ok: true, deal: rows[0] });
    }

    // ── DELETE ──
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
