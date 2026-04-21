import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import axios from "axios";
import { calculateReservePool, calculateZeroTouchPayout } from '../_lib/actuarial';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, lat, lng, payload, query } = req.body;
    if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });

    console.log(`[Pulse] Verification started for ${partnerId}...`);

    // 1. Fetch User and Trust Score
    const { data: user } = await supabaseServer.from('users').select('*').eq('partnerId', partnerId).maybeSingle();
    
    // 2. Mock Pulse Simulation Logic (Verified L5 Anomaly)
    // In production, this would call real-time geo-clustering
    const isVerified = (user?.trust_score || 800) > 750 && Math.random() < 1.0; 

    if (isVerified) {
       const [{ count: activeWorkers }, { data: balanceRows }] = await Promise.all([
         supabaseServer.from('users').select('*', { count: 'exact', head: true }),
         supabaseServer.from('users').select('balance').limit(1000),
       ]);
       const reservePool = calculateReservePool(
         (balanceRows || []).reduce((sum: number, row: any) => sum + Number(row.balance || 0), 0)
       );
       const payoutQuote = calculateZeroTouchPayout({
         persona: user?.platform,
         triggerType: payload?.type || payload?.triggerType || query || 'Civic Disruption',
         declaredEarnings: user?.declared_earnings ?? user?.declaredEarnings,
         reservePool,
         activeWorkers: Math.max(1, activeWorkers || 1),
       });
       const payout = payoutQuote.final_payout;
       const claimId = `PULSE-${Date.now()}`;

       // 3. Insert Claim
       const { data: claim } = await supabaseServer.from('claims').insert({
         worker_id: partnerId,
         payout_inr: payout,
         status: 'approved',
         type: 'Multivariate Pulse (L5)',
         reason: 'Zero-Touch Anomaly Verified',
         claim_id_str: claimId,
         lat: lat || 12.9716,
         lng: lng || 77.5946,
         processed_at: new Date().toISOString(),
         jep_data: {
           trigger_type: payload?.type || payload?.triggerType || query || 'Civic Disruption',
           technical_reason: payoutQuote.formula,
           hourly_rate: payoutQuote.hourly_rate,
           income_loss_pct: payoutQuote.income_loss_pct,
           duration_hours: payoutQuote.duration_hours,
           calculated_payout: payoutQuote.calculated_payout,
           p_max: payoutQuote.p_max,
           circuit_breaker_active: payoutQuote.circuit_breaker_active,
         }
       }).select().single();

       // 4. Update Balance
       if (user) {
         await supabaseServer.from('users').update({ balance: Number(user.balance || 0) + payout }).eq('partnerId', partnerId);
         
         // 5. Create Transaction
         await supabaseServer.from('transactions').insert({
           worker_id: partnerId,
           amount: payout,
           type: 'credit',
           status: 'completed',
           reference_id: claim?.id.toString(),
           description: 'Verified L5 Pulse Payout',
           title: 'L5 Verification Pulse',
           via: 'Nexus Pulse Core'
         });
       }

       return res.json({
         success: true,
         verification: 'verified',
         payout_inr: payout,
         claim_id: claimId,
         confidence_score: 0.99,
         p_max: payoutQuote.p_max,
         circuit_breaker_active: payoutQuote.circuit_breaker_active,
       });
    } else {
       return res.json({
         success: false,
         verification: 'rejected',
         reason: 'Insufficient trust score or location drift'
       });
    }

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
