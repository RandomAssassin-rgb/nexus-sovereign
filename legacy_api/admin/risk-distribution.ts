import type { VercelRequest, VercelResponse } from '@vercel/node';
import { latLngToCell } from 'h3-js';
import { supabaseServer } from '../_lib/supabase';
import { DEFAULT_COORDS } from '../_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { data, error } = await supabaseServer.from('users').select('*').limit(1000);
    if (error) throw error;

    const distribution: Record<string, number> = {};
    for (const user of data || []) {
      const lat = Number(user.last_lat);
      const lng = Number(user.last_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      try {
        const hex = latLngToCell(lat, lng, 7);
        distribution[hex] = (distribution[hex] || 0) + 1;
      } catch {}
    }

    if (Object.keys(distribution).length === 0) {
      const fallbackHex = latLngToCell(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon, 7);
      return res.json({
        [fallbackHex]: 5,
      });
    }

    return res.json(distribution);
  } catch (error) {
    const fallbackHex = latLngToCell(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon, 7);
    return res.json({
      [fallbackHex]: 5,
    });
  }
}
