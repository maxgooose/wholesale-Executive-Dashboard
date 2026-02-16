import { list } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'inventory/' });

    if (!blobs || blobs.length === 0) {
      return res.status(200).json({
        status: 'no_data',
        message: 'No inventory cache exists yet. Waiting for first sync.',
        lastSync: null,
        itemCount: 0,
      });
    }

    const sorted = blobs.sort(
      (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
    );
    const latest = sorted[0];

    const ageMs = Date.now() - new Date(latest.uploadedAt).getTime();
    const ageMinutes = Math.round(ageMs / 60000);

    return res.status(200).json({
      status: ageMinutes > 300 ? 'stale' : 'ok',
      lastSync: latest.uploadedAt,
      ageMinutes,
      blobSize: latest.size,
      blobUrl: latest.pathname,
      totalBlobs: blobs.length,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}
