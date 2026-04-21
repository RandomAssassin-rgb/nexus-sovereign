import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import { verifyAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await verifyAdmin(req);

    const { claimId, resolution, reason } = req.body;
    if (!claimId || !resolution) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Tightly-scoped check: only allow resolving processing or failed claims
    const { data: claim, error: fetchError } = await supabaseServer
      .from('claims')
      .select('status')
      .eq('claim_id_str', claimId)
      .single();

    if (fetchError || !claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const permittedStatuses = ['processing', 'failed', 'review'];
    if (!permittedStatuses.includes(claim.status)) {
      return res.status(403).json({ 
        error: `Cannot manually resolve claim in status: ${claim.status}. Only processing, failed, or review states are eligible.` 
      });
    }

    // Update status and add a resolution note
    const { error: updateError } = await supabaseServer
      .from('claims')
      .update({ 
        status: resolution,
        resolution_reason: reason || 'Manual administrative resolution',
        resolved_at: new Date().toISOString()
      })
      .eq('claim_id_str', claimId);

    if (updateError) throw updateError;

    // If approved, create a transaction record
    if (resolution === 'approved') {
        // Logic to insert into transactions table would go here
        // (Assuming standard payout logic handles the ledger entry if status bits change)
    }

    console.log(`[Admin] Claim ${claimId} resolved as ${resolution}`);
    return res.status(200).json({ success: true, claimId, resolution });

  } catch (error: any) {
    console.error('[Admin] Resolution error:', error);
    return res.status(500).json({ error: error.message });
  }
}
