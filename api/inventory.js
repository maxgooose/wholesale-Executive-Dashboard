import { list, head } from '@vercel/blob';

export const config = {
  maxDuration: 10,
};

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Look for the cached inventory blob
    const { blobs } = await list({ prefix: 'inventory/' });

    if (!blobs || blobs.length === 0) {
      return res.status(503).json({
        error: 'No cached inventory data available yet. Sync has not run.',
        hint: 'Trigger the GitHub Action or wait for the next cron run.',
      });
    }

    // Get the most recent blob (sorted by uploadedAt desc)
    const sorted = blobs.sort(
      (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
    );
    const latest = sorted[0];

    // Fetch the blob content
    const response = await fetch(latest.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status}`);
    }

    const data = await response.json();

    // Return with metadata
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Inventory-Updated', latest.uploadedAt);
    res.setHeader('X-Inventory-Size', String(data.items?.length || 0));

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error serving inventory:', error);
    return res.status(500).json({
      error: 'Failed to load inventory data',
      message: error.message,
    });
  }
}
