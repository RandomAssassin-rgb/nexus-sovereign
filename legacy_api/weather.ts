import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { buildFallbackWeather, DEFAULT_COORDS, toNumber } from './_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const lat = toNumber(req.query.lat, DEFAULT_COORDS.lat);
  const lon = toNumber(req.query.lon, DEFAULT_COORDS.lon);
  const fallback = buildFallbackWeather(lat, lon);
  const apiKey = process.env.OPENWEATHER_API_KEY || process.env.VITE_OPENWEATHER_API_KEY;

  if (!apiKey || apiKey.includes('placeholder')) {
    return res.json(fallback);
  }

  try {
    const response = await axios.get(
      'https://api.openweathermap.org/data/2.5/weather',
      {
        params: { lat, lon, appid: apiKey },
        timeout: 5000,
      }
    );
    return res.json(response.data);
  } catch (error) {
    return res.json(fallback);
  }
}
