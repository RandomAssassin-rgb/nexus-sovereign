import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseServer } from '../_lib/supabase';
import { estimatePremium } from '../_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    let zoneRisk = 0.15;
    const zoneH3 = req.body?.zone_h3;

    if (zoneH3) {
      try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { count, error } = await supabaseServer
          .from('disruption_triggers')
          .select('*', { count: 'exact', head: true })
          .eq('zone_h3', zoneH3)
          .gte('fired_at', ninetyDaysAgo.toISOString());

        if (!error && typeof count === 'number') {
          zoneRisk = Math.min(1, count / 20);
        }
      } catch {
        zoneRisk = 0.15;
      }
    }

    return res.json(estimatePremium({ ...(req.body || {}), zoneRisk }));
  } catch (error: any) {
    return res.json(estimatePremium(req.body || {}));
  }
}
