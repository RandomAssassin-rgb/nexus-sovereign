import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { calculateReservePool, RESERVE_POOL_BUFFER } from '../_lib/actuarial';

const FALLBACK_INPUTS = {
  b_res: RESERVE_POOL_BUFFER,
  n_active: 8405,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const [usersCountRes, usersRes] = await Promise.all([
      supabaseServer
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gt('premium_until', new Date().toISOString()),
      supabaseServer.from('users').select('*').limit(500),
    ]);

    const reserveBase = (usersRes.data || []).reduce((sum, user: any) => {
      const balance = Number(user.balance || 0);
      return sum + (Number.isFinite(balance) ? balance : 0);
    }, 0);

    return res.json({
      b_res: reserveBase > 0 ? calculateReservePool(reserveBase) : FALLBACK_INPUTS.b_res,
      n_active: usersCountRes.count || FALLBACK_INPUTS.n_active,
    });
  } catch (error) {
    return res.json(FALLBACK_INPUTS);
  }
}
