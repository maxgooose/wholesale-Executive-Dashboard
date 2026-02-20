import { neon } from '@neondatabase/serverless';

export const config = {
  maxDuration: 10,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  try {
    const sql = neon(process.env.DATABASE_URL);

    const state = await sql`SELECT * FROM sync_state WHERE id = 1`;
    const count = await sql`SELECT COUNT(*)::int AS total FROM inventory`;

    const lastSync = state[0]?.last_delta_sync || null;
    const ageMs = lastSync ? Date.now() - new Date(lastSync).getTime() : null;

    return res.status(200).json({
      lastDeltaSync: lastSync,
      lastFullReconciliation: state[0]?.last_full_reconciliation || null,
      totalItems: count[0]?.total || 0,
      lastDeltaChanges: state[0]?.delta_items_changed || 0,
      lastFullRemoved: state[0]?.full_items_removed || 0,
      ageMinutes: ageMs != null ? Math.round(ageMs / 60000) : null,
      status: !lastSync ? 'no_data' : (ageMs > 20 * 60000 ? 'stale' : 'ok'),
    });
  } catch (error) {
    console.error('Inventory status error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}
