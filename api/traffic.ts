import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { buildFallbackTraffic, DEFAULT_COORDS, toNumber } from './_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const lat = toNumber(req.query.lat, DEFAULT_COORDS.lat);
  const lon = toNumber(req.query.lon, DEFAULT_COORDS.lon);
  const fallback = buildFallbackTraffic(lat, lon);
  const apiKey = process.env.HERE_TRAFFIC_API_KEY;

  if (!apiKey) return res.json(fallback);

  try {
    const bbox = `${lon - 0.05},${lat - 0.05},${lon + 0.05},${lat + 0.05}`;
    const response = await axios.get('https://data.traffic.hereapi.com/v7/flow', {
      params: {
        locationReferencing: 'shape',
        in: `bbox:${bbox}`,
        apiKey,
      },
      timeout: 5000,
    });

    let totalJam = 0;
    let count = 0;

    for (const item of response.data?.results || []) {
      if (item?.currentFlow?.jamFactor !== undefined) {
        totalJam += Number(item.currentFlow.jamFactor);
        count += 1;
      }
    }

    if (count === 0) return res.json(fallback);

    const jamFactor = Number((totalJam / count).toFixed(1));
    const trafficDensity = Number((0.5 + (jamFactor / 10) * 1.5).toFixed(2));

    return res.json({ jamFactor, trafficDensity });
  } catch (error) {
    return res.json(fallback);
  }
}
