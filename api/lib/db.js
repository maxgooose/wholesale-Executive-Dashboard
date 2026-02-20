import { neon } from '@neondatabase/serverless';

let initialized = false;

export async function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  if (!initialized) {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventory' AND column_name = 'wc_updated_at'
    `;
    if (cols.length === 0) {
      await sql`DROP TABLE IF EXISTS inventory`;
    }
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
    initialized = true;
  }
  return sql;
}
