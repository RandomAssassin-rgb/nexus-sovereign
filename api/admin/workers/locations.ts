import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import { DEFAULT_COORDS } from '../../_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { data, error } = await supabaseServer.from('users').select('*').limit(250);
    if (error) throw error;

    const workers = (data || [])
      .filter((user: any) => Number.isFinite(Number(user.last_lat)) && Number.isFinite(Number(user.last_lng)))
      .map((user: any) => ({
        id: user.id || user.partnerId,
        full_name: user.full_name || user.name || user.partnerId || 'Anonymous Worker',
        last_lat: Number(user.last_lat),
        last_lng: Number(user.last_lng),
        status: user.status || 'active',
      }));

    if (workers.length > 0) return res.json(workers);

    return res.json([
      {
        id: 'PARTNER-123',
        full_name: 'Nexus Demo Rider',
        last_lat: DEFAULT_COORDS.lat,
        last_lng: DEFAULT_COORDS.lon,
        status: 'active',
      },
    ]);
  } catch (error) {
    return res.json([
      {
        id: 'PARTNER-123',
        full_name: 'Nexus Demo Rider',
        last_lat: DEFAULT_COORDS.lat,
        last_lng: DEFAULT_COORDS.lon,
        status: 'active',
      },
    ]);
  }
}
