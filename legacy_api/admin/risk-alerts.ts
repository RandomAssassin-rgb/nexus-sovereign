import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { formatRelativeTime, mockRiskAlerts } from '../_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { data, error } = await supabaseServer
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.json(mockRiskAlerts);

    const alerts = (data || []).map((alert: any) => ({
      ...alert,
      worker: alert.worker || alert.worker_name || alert.worker_id || 'Unknown Worker',
      time: formatRelativeTime(alert.created_at),
    }));

    return res.json(alerts.length > 0 ? alerts : mockRiskAlerts);
  } catch (error) {
    return res.json(mockRiskAlerts);
  }
}
