import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { ensureSkeletonUser } from '../_lib/supabaseHelper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, lat, lng } = req.body || {};
    if (!partnerId || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Missing data' });
    }

    await ensureSkeletonUser(partnerId);

    const { error } = await supabaseServer
      .from('users')
      .update({
        last_lat: lat,
        last_lng: lng,
        last_seen: new Date().toISOString(),
      })
      .eq('partnerId', partnerId);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Location sync failed' });
  }
}
