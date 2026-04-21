import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { formatRelativeTime, mockRecentClaims } from '../_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { data, error } = await supabaseServer
      .from('claims')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(25);

    if (error) {
      return res.json(mockRecentClaims);
    }

    const claims = (data || []).map((claim: any) => {
      const rawAmount = Number(claim.payout_inr || claim.amount || 0);
      const trigger = claim.type || claim.trigger_type || claim.jep_data?.simulation_type || 'Zero-Touch Trigger';
      const time = formatRelativeTime(claim.processed_at || claim.created_at);

      return {
        id: String(claim.claim_id_str || claim.id || 'N/A').slice(0, 12).toUpperCase(),
        worker_name: claim.worker_id || claim.partnerId || 'Unknown Worker',
        amount: rawAmount,
        trigger_type: trigger,
        trigger,
        status: claim.status === 'approved' ? 'completed' : claim.status || 'processing',
        created_at: time,
        time,
        zone: claim.jep_data?.zone || 'Bengaluru Core',
      };
    });

    return res.json(claims.length > 0 ? claims : mockRecentClaims);
  } catch (error) {
    return res.json(mockRecentClaims);
  }
}
