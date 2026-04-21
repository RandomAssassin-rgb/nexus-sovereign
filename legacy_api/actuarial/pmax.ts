import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toNumber } from '../_lib/fallbacks';
import { calculatePmax } from '../_lib/actuarial';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const wBase = toNumber(req.body?.w_base, 500);
  const incomeLossPct = toNumber(req.body?.income_loss_pct, 100) / 100;
  const calculatedPayout = toNumber(req.body?.calculated_payout, wBase * incomeLossPct);
  const reserveBase = toNumber(req.body?.b_res, 42050000);
  const activePolicies = Math.max(1, toNumber(req.body?.n_active, 8405));
  const triggerWindow = Math.max(1, toNumber(req.body?.t_w, 1));
  const result = calculatePmax({
    calculatedPayout,
    reservePool: reserveBase,
    activeWorkers: activePolicies,
    triggerWeight: triggerWindow,
  });

  return res.json({
    p_max: result.p_max,
    reserve_guardrail: result.reserve_guardrail,
    calculated_payout: result.calculatedPayout,
    final_payout: result.finalPayout,
    recommended_pmax: result.p_max,
    circuit_breaker_active: result.circuit_breaker_active,
    formula: result.formula,
  });
}
