import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { ensureSkeletonUser } from '../_lib/supabaseHelper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, tier, until } = req.body || {};
    if (!partnerId || !tier) return res.status(400).json({ error: 'Missing fields' });

    await ensureSkeletonUser(partnerId);

    const { error } = await supabaseServer
      .from('users')
      .update({ premium_tier: tier, premium_until: until || null, premium_upgraded: true })
      .eq('partnerId', partnerId);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Plan update failed' });
  }
}
