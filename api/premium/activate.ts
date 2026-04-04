import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { ensureSkeletonUser } from '../_lib/supabaseHelper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, planType, tier } = req.body || {};
    if (!partnerId) return res.status(400).json({ error: 'Missing partnerId' });

    const validPlans = ['basic', 'standard', 'pro'];
    const requestedTier = typeof planType === 'string' ? planType : tier;
    const normalizedTier = validPlans.includes(requestedTier) ? requestedTier : 'basic';

    await ensureSkeletonUser(partnerId);

    const premiumUntil = new Date();
    premiumUntil.setDate(premiumUntil.getDate() + 7);

    const { error } = await supabaseServer
      .from('users')
      .update({
        premium_until: premiumUntil.toISOString(),
        premium_tier: normalizedTier,
        premium_upgraded: true,
      })
      .eq('partnerId', partnerId);

    if (error) throw error;

    return res.json({
      success: true,
      planType: normalizedTier,
      premiumUntil: premiumUntil.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Premium activation failed' });
  }
}
