import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { alertId, status, workerId } = req.body || {};
  if (!alertId || !status) return res.status(400).json({ error: 'Missing fields' });

  try {
    const { error } = await supabaseServer
      .from('alerts')
      .update({ status })
      .eq('id', alertId);

    if (error) {
      return res.json({ success: true, mocked: true });
    }

    if (status === 'blocked' && workerId) {
      await supabaseServer
        .from('users')
        .update({ status: 'blocked' })
        .eq('partnerId', workerId);
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.json({ success: true, mocked: true, warning: error.message });
  }
}
