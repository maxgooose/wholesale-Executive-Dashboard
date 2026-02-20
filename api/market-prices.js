/**
 * Market Price API — Scrapes Swappa for current device market prices.
 * GET /api/market-prices?model=iphone+13&storage=128gb
 * Returns average asking prices by condition.
 */

export const config = { maxDuration: 15 };

// Swappa search URL patterns for common devices
const SWAPPA_SEARCH = 'https://swappa.com/search?q=';

// Known Swappa category slugs for fast lookup
const DEVICE_SLUGS = {
  'IPHONE 15 PRO MAX': 'apple-iphone-15-pro-max',
  'IPHONE 15 PRO': 'apple-iphone-15-pro',
  'IPHONE 15': 'apple-iphone-15',
  'IPHONE 14 PRO MAX': 'apple-iphone-14-pro-max',
  'IPHONE 14 PRO': 'apple-iphone-14-pro',
  'IPHONE 14': 'apple-iphone-14',
  'IPHONE 13 PRO MAX': 'apple-iphone-13-pro-max',
  'IPHONE 13 PRO': 'apple-iphone-13-pro',
  'IPHONE 13': 'apple-iphone-13',
  'IPHONE 12 PRO MAX': 'apple-iphone-12-pro-max',
  'IPHONE 12 PRO': 'apple-iphone-12-pro',
  'IPHONE 12': 'apple-iphone-12',
  'IPHONE 11 PRO MAX': 'apple-iphone-11-pro-max',
  'IPHONE 11 PRO': 'apple-iphone-11-pro',
  'IPHONE 11': 'apple-iphone-11',
  'IPHONE XR': 'apple-iphone-xr',
  'IPHONE XS MAX': 'apple-iphone-xs-max',
  'IPHONE XS': 'apple-iphone-xs',
  'IPAD 9 WIFI': 'apple-ipad-9th-gen',
  'IPAD 8 WIFI': 'apple-ipad-8th-gen',
  'IPAD 7 WIFI': 'apple-ipad-7th-gen',
  'IPAD 6 WIFI': 'apple-ipad-6th-gen',
  'IPAD 5 CELLULAR': 'apple-ipad-5th-gen',
  'GALAXY S23': 'samsung-galaxy-s23',
  'GALAXY S23 ULTRA': 'samsung-galaxy-s23-ultra',
  'GALAXY S22': 'samsung-galaxy-s22',
  'GALAXY S21': 'samsung-galaxy-s21',
};

async function fetchSwappaPrice(model) {
  const slug = DEVICE_SLUGS[model.toUpperCase()];
  let url;
  if (slug) {
    url = `https://swappa.com/mobile/${slug}`;
  } else {
    // Fallback to search
    url = SWAPPA_SEARCH + encodeURIComponent(model);
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    // Extract prices from Swappa listing page
    // They show "Starting at $XXX" and price ranges
    const prices = [];

    // Pattern: "Starting at $XXX" or price listings
    const priceMatches = html.matchAll(/\$(\d{2,4}(?:\.\d{2})?)/g);
    for (const m of priceMatches) {
      const p = parseFloat(m[1]);
      if (p > 20 && p < 5000) prices.push(p);
    }

    if (prices.length === 0) return null;

    // Remove outliers (bottom/top 10%)
    prices.sort((a, b) => a - b);
    const trimStart = Math.floor(prices.length * 0.1);
    const trimEnd = Math.ceil(prices.length * 0.9);
    const trimmed = prices.slice(trimStart, trimEnd);

    if (trimmed.length === 0) return null;

    return {
      low: trimmed[0],
      high: trimmed[trimmed.length - 1],
      median: trimmed[Math.floor(trimmed.length / 2)],
      avg: Math.round(trimmed.reduce((s, p) => s + p, 0) / trimmed.length),
      samples: trimmed.length,
      source: 'swappa',
      url,
    };
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const model = req.query.model;
  if (!model) {
    return res.status(400).json({ error: 'model parameter required' });
  }

  const result = await fetchSwappaPrice(model);
  if (!result) {
    return res.json({ model, prices: null, message: 'No pricing data found' });
  }

  return res.json({
    model,
    prices: result,
    fetchedAt: new Date().toISOString(),
  });
}
