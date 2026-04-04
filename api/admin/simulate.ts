import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { ensureSkeletonUser } from '../_lib/supabaseHelper';
import { calculateReservePool, calculateZeroTouchPayout, normalizePersonaLabel } from '../_lib/actuarial';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { type, message } = req.body || {};
    if (!type) return res.status(400).json({ error: "Disruption type required" });

    const status = await supabaseServer.channel('disruptions').send({
      type: 'broadcast',
      event: 'MASS_ANOMALY',
      payload: { 
        type, 
        message: message || `Incident: ${type} (L5 Verified)`,
        pulse_timestamp: new Date().toISOString()
      }
    });

    if (status !== 'ok') {
      console.error(`[Admin] Broadcast failed with status: ${status}`);
    }

    const activeUsersRes = await supabaseServer.from('users').select('*').eq('status', 'active');
    const anyUsersRes = activeUsersRes.data && activeUsersRes.data.length > 0
      ? activeUsersRes
      : await supabaseServer.from('users').select('*').limit(50);

    const users = anyUsersRes.data || [];
    const totalBalance = users.reduce((sum: number, user: any) => sum + Number(user.balance || 0), 0);
    const reservePool = calculateReservePool(totalBalance);
    const results = [];

    for (const user of users) {
      const partnerId = user.partnerId;
      if (!partnerId) continue;

      await ensureSkeletonUser(partnerId);

      const processedAt = new Date().toISOString();
      const claimId = `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const payoutQuote = calculateZeroTouchPayout({
        persona: user.platform,
        triggerType: type,
        declaredEarnings: user.declared_earnings ?? user.declaredEarnings,
        reservePool,
        activeWorkers: Math.max(1, users.length),
      });
      const payout = payoutQuote.final_payout;
      const partnerPlatform = normalizePersonaLabel(user.platform);

      const claimInsert = await supabaseServer
        .from('claims')
        .insert({
          worker_id: partnerId,
          payout_inr: payout,
          status: 'approved',
          type,
          reason: message || `${type} auto-triggered payout`,
          processed_at: processedAt,
          claim_id_str: claimId,
          jep_data: {
            simulation_type: type,
            source: 'admin_simulation',
            auto: true,
            partnerPlatform,
            hourly_rate: payoutQuote.hourly_rate,
            income_loss_pct: payoutQuote.income_loss_pct,
            duration_hours: payoutQuote.duration_hours,
            calculated_payout: payoutQuote.calculated_payout,
            p_max: payoutQuote.p_max,
            circuit_breaker_active: payoutQuote.circuit_breaker_active,
            formula: payoutQuote.formula,
          },
        })
        .select()
        .maybeSingle();

      const claimRow = claimInsert.data;

      await supabaseServer.from('transactions').insert({
        worker_id: partnerId,
        amount: payout,
        type: 'credit',
        status: 'completed',
        reference_id: claimRow?.id ? String(claimRow.id) : claimId,
        description: `${type} zero-touch payout`,
        title: 'Zero-Touch Payout',
        via: 'Admin Simulation',
        created_at: processedAt,
      });

      const currentBalance = Number(user.balance);
      if (Number.isFinite(currentBalance)) {
        await supabaseServer
          .from('users')
          .update({ balance: currentBalance + payout })
          .eq('partnerId', partnerId);
      }

      await supabaseServer.channel(`nexus-realtime-${partnerId}`).send({
        type: 'broadcast',
        event: 'claim-update',
        payload: {
          partnerId,
          claimId,
          payout,
          type,
        },
      });

      results.push({
        partnerId,
        payout,
        claimId,
        persona: partnerPlatform,
        p_max: payoutQuote.p_max,
        circuit_breaker_active: payoutQuote.circuit_breaker_active,
      });
    }

    res.json({
      success: true,
      message: `Simulated ${type} event broadcasted.`,
      count: results.length,
      affected_users: results.length,
      reserve_pool: reservePool,
      results,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
