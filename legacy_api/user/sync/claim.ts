import type { VercelRequest, VercelResponse } from '@vercel/node';
import { latLngToCell } from 'h3-js';
import { supabaseServer } from '../../_lib/supabase';
import { ensureSkeletonUser } from '../../_lib/supabaseHelper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, claim } = req.body || {};
    if (!partnerId || !claim) return res.status(400).json({ error: 'Missing data' });

    await ensureSkeletonUser(partnerId);

    const claimId = claim.claim_id_str || claim.claimId || claim.id;
    if (claimId) {
      const { data: existing, error: existingError } = await supabaseServer
        .from('claims')
        .select('id, claim_id_str')
        .eq('worker_id', partnerId)
        .eq('claim_id_str', claimId)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) return res.json({ success: true, claim: existing, deduped: true });
    }

    const lat = claim.lat ?? claim.jepData?.lat;
    const lng = claim.lng ?? claim.jepData?.lng;
    let h3Cell = null;

    if (lat !== undefined && lng !== undefined) {
      try {
        h3Cell = latLngToCell(Number(lat), Number(lng), 7);
      } catch {
        h3Cell = null;
      }
    }

    const { data, error } = await supabaseServer
      .from('claims')
      .insert({
        worker_id: partnerId,
        claim_id_str: claimId,
        payout_inr: Number(claim.amount || claim.payout_inr || 0),
        status: claim.status || 'processing',
        type: claim.type || 'Manual Claim',
        reason: claim.reason || claim.summary?.wordedReason || 'Claim sync',
        processed_at: claim.dateISO || new Date().toISOString(),
        lat: lat ?? null,
        lng: lng ?? null,
        h3_cell: h3Cell,
        jep_data: claim.jepData || {},
      })
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, claim: data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Claim sync failed' });
  }
}
