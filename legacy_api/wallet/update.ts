import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { ensureSkeletonUser } from '../_lib/supabaseHelper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { partnerId, balance, transaction } = req.body || {};
    if (!partnerId) return res.status(400).json({ error: 'Missing partnerId' });

    await ensureSkeletonUser(partnerId);

    if (balance !== undefined) {
      const { error: balanceError } = await supabaseServer
        .from('users')
        .update({ balance: Number(balance) })
        .eq('partnerId', partnerId);

      if (balanceError) throw balanceError;
    }

    if (transaction) {
      const referenceId = transaction.reference_id || transaction.referenceId || transaction.id;
      if (referenceId) {
        const { data: existing, error: existingError } = await supabaseServer
          .from('transactions')
          .select('id')
          .eq('worker_id', partnerId)
          .eq('reference_id', referenceId)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existing) return res.json({ success: true, deduped: true });
      }

      const { error: transactionError } = await supabaseServer
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
        });

      if (transactionError) throw transactionError;
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Wallet update failed' });
  }
}
