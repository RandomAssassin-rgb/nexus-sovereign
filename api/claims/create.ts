import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { ensureSkeletonUser } from '../_lib/supabaseHelper';
import { latLngToCell } from "h3-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const payload = req.body.claim ? {
      ...req.body.claim,
      worker_id: req.body.partnerId || req.body.worker_id,
      amount: req.body.claim.amount || req.body.claim.payout_inr
    } : req.body;

    const { worker_id, amount, status, type, reason, lat, lng, jep_data } = payload;
    
    if (!worker_id) return res.status(400).json({ error: "worker_id is required" });

    await ensureSkeletonUser(worker_id);

    const processed_at = new Date().toISOString();
    const claim_id_str = payload.claimId || payload.claim_id_str || `CLM-${Math.floor(Math.random() * 9000) + 1000}`;

    // Geo-indexing
    let h3_cell = null;
    if (lat && lng) {
      try {
        h3_cell = latLngToCell(Number(lat), Number(lng), 7);
      } catch (e) {
        console.warn("[Claims] H3 conversion failed:", e);
      }
    }

    // 1. Insert Claim
    const { data: claimData, error: claimErr } = await supabaseServer
      .from('claims')
      .insert({
        worker_id,
        payout_inr: amount || 0,
        status: status || "pending",
        processed_at,
        type: type || "Manual Claim",
        reason: reason || "Manual Verification Claim",
        claim_id_str, 
        lat: lat || 12.9716,
        lng: lng || 77.5946,
        h3_cell,
        jep_data: jep_data || {}
      })
      .select()
      .single();

    if (claimErr) throw claimErr;

    // 2. If approved, create transaction and update balance
    if (status === "approved" && amount > 0) {
      await supabaseServer.from('transactions').insert({
        worker_id,
        amount,
        type: "credit",
        status: "completed",
        reference_id: claimData.id.toString(),
        description: `Claim Payout: ${type}`,
        title: "Claim Payout",
        via: "Nexus Core",
        created_at: processed_at
      });

      // Update balance
      const { data: userData } = await supabaseServer.from('users').select('balance').eq('partnerId', worker_id).single();
      if (userData) {
        await supabaseServer.from('users').update({ balance: Number(userData.balance || 0) + amount }).eq('partnerId', worker_id);
      }
    }

    return res.json({ success: true, claim: claimData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
