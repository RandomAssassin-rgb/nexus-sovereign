import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';
import { ensureSkeletonUser } from '../../_lib/supabaseHelper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, transaction } = req.body || {};
    if (!partnerId || !transaction) return res.status(400).json({ error: 'Missing data' });

    await ensureSkeletonUser(partnerId);

    const referenceId = transaction.reference_id || transaction.referenceId || transaction.id;
    if (referenceId) {
      const { data: existing, error: existingError } = await supabaseServer
        .from('transactions')
        .select('id, reference_id')
        .eq('worker_id', partnerId)
        .eq('reference_id', referenceId)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) return res.json({ success: true, transaction: existing, deduped: true });
    }

    const { data, error } = await supabaseServer
      .from('transactions')
      .insert({
        worker_id: partnerId,
        title: transaction.title || 'Wallet Activity',
        description: transaction.desc || transaction.description || '',
        amount: Number(transaction.amount || 0),
        type: transaction.type || 'credit',
        via: transaction.via || 'Nexus Core',
        status: transaction.status || 'completed',
        reference_id: referenceId,
        created_at: transaction.dateISO || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, transaction: data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Transaction sync failed' });
  }
}
