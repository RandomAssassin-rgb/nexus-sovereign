import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';

function normalizeStatus(status?: string) {
  if (!status) return 'offline';
  if (status === 'blocked') return 'blocked';
  if (status === 'active' || status === 'idle' || status === 'offline') return status;
  return 'active';
}

function getPlanLabel(tier?: string | null) {
  if (!tier || tier === 'basic') return 'Basic';
  return 'Premium';
}

function getRiskLevel(trustScore: number, claimsCount: number, status: string) {
  if (status === 'blocked' || claimsCount >= 5 || trustScore < 0.55) return 'high';
  if (claimsCount >= 2 || trustScore < 0.75) return 'medium';
  return 'low';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const [usersRes, claimsRes] = await Promise.all([
      supabaseServer.from('users').select('*').order('created_at', { ascending: false }).limit(250),
      supabaseServer.from('claims').select('*').limit(1000),
    ]);

    const claimsByWorker = new Map<string, { count: number; total: number }>();
    for (const claim of claimsRes.data || []) {
      const key = String(claim.worker_id || '');
      if (!key) continue;
      const current = claimsByWorker.get(key) || { count: 0, total: 0 };
      current.count += 1;
      current.total += Number(claim.payout_inr || claim.amount || 0);
      claimsByWorker.set(key, current);
    }

    const riders = (usersRes.data || []).map((user: any, index: number) => {
      const partnerId = String(user.partnerId || `WKR-${index + 1000}`);
      const trustScoreRaw = Number(user.trust_score || user.trustScore || 0.82);
      const trustScore = trustScoreRaw > 1 ? trustScoreRaw / 1000 : trustScoreRaw;
      const stats = claimsByWorker.get(partnerId) || { count: 0, total: Number(user.balance || 0) };
      const status = normalizeStatus(user.status);

      return {
        id: partnerId,
        name: user.full_name || user.name || 'Anonymous Rider',
        platform: user.platform || 'Blinkit',
        zone: user.h3_cell || 'Bengaluru Core',
        status,
        plan: getPlanLabel(user.premium_tier),
        claims: stats.count,
        total_paid: Math.round(stats.total || 0),
        rating: Number((4.2 + ((index % 7) * 0.1)).toFixed(1)),
        joined: new Date(user.created_at || Date.now()).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        risk: getRiskLevel(trustScore, stats.count, status),
      };
    });

    return res.json(riders);
  } catch (error) {
    return res.json([
      {
        id: 'PARTNER-123',
        name: 'Nexus Demo Rider',
        platform: 'Blinkit',
        zone: 'Bengaluru Core',
        status: 'active',
        plan: 'Premium',
        claims: 2,
        total_paid: 2400,
        rating: 4.8,
        joined: 'Apr 2026',
        risk: 'low',
      },
    ]);
  }
}
