import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { buildFallbackAqi, DEFAULT_COORDS, toNumber } from './_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const lat = toNumber(req.query.lat, DEFAULT_COORDS.lat);
  const lon = toNumber(req.query.lon, DEFAULT_COORDS.lon);
  const fallback = buildFallbackAqi(lat, lon);
  const token = process.env.AQI_TOKEN;

  if (!token) return res.json(fallback);

  try {
    const response = await axios.get(`https://api.waqi.info/feed/geo:${lat};${lon}/`, {
      params: { token },
      timeout: 5000,
    });

    if (response.data?.status === 'ok') {
      return res.json({ aqi: Number(response.data.data?.aqi || fallback.aqi) });
    }

    return res.json(fallback);
  } catch (error) {
    return res.json(fallback);
  }
}
