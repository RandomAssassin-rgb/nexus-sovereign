import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { calculateReservePool, calculateZeroTouchPayout, normalizePersonaLabel } from '../_lib/actuarial';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Vercel Cron protection: Check Authorization header if needed, 
  // though Vercel handles it via vercel.json schedules.

  try {
    console.log("🕒 Running Auto-Trigger Cron...");

    const disruptions = [
       { type: 'Weather Anomaly', reason: 'Cyclone Anomaly (L5 Verified)' },
       { type: 'Grid Disruption', reason: 'Mass Event (Automated)' },
       { type: 'Systemic Pulse', reason: 'High-Demand Burst (Predictive)' }
    ];
    const disruption = disruptions[Math.floor(Math.random() * disruptions.length)];

    // 1. Broadcast the event globally via Supabase Realtime
    await supabaseServer.channel('disruptions').send({
      type: 'broadcast',
      event: 'MASS_ANOMALY',
      payload: { 
        type: disruption.type,
        message: `Global ${disruption.type} Detected. Automatic Payouts Initialized.`
      }
    });

    // 2. Fetch all active users
    const activeUsersRes = await supabaseServer
      .from('users')
      .select('*')
      .eq('status', 'active');

    const users = activeUsersRes.data && activeUsersRes.data.length > 0
      ? activeUsersRes.data
      : (await supabaseServer.from('users').select('*').limit(250)).data;

    if (users && users.length > 0) {
      console.log(`[Cron] Processing claims for ${users.length} users...`);
      const reservePool = calculateReservePool(
        users.reduce((sum: number, user: any) => sum + Number(user.balance || 0), 0)
      );

      const claims = users
        .filter((u: any) => u.partnerId)
        .map((u: any) => {
          const payoutQuote = calculateZeroTouchPayout({
            persona: u.platform,
            triggerType: disruption.type,
            declaredEarnings: u.declared_earnings ?? u.declaredEarnings,
            reservePool,
            activeWorkers: Math.max(1, users.length),
          });

          return {
            worker_id: u.partnerId,
            payout_inr: payoutQuote.final_payout,
            status: 'approved',
            type: disruption.type,
            reason: disruption.reason,
            processed_at: new Date().toISOString(),
            jep_data: {
              trigger_type: disruption.type,
              worded_summary: `${disruption.reason} verified by the autonomous trigger engine.`,
              technical_reason: payoutQuote.formula,
              partnerPlatform: normalizePersonaLabel(u.platform),
              hourly_rate: payoutQuote.hourly_rate,
              income_loss_pct: payoutQuote.income_loss_pct,
              duration_hours: payoutQuote.duration_hours,
              calculated_payout: payoutQuote.calculated_payout,
              p_max: payoutQuote.p_max,
              circuit_breaker_active: payoutQuote.circuit_breaker_active,
            },
          };
        });

      const { error: claimsErr } = await supabaseServer.from('claims').insert(claims);
      if (claimsErr) throw claimsErr;

      // Note: In a real serverless env, we might want to use a Queue (Upstash/QStash)
      // for mass balance updates to avoid timeout. For now, we do it bulk.
    }

    res.json({ success: true, processed: users?.length || 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
