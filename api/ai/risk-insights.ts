import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildRiskInsight } from '../_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const analysis = buildRiskInsight(req.body || {});
    return res.json({ analysis, source: 'heuristic' });
  } catch (error: any) {
    return res.json({
      analysis:
        'Telemetry remains within the insured range. Keep Sovereign Shield active so disruptions still settle without manual claim friction.',
      source: 'fallback',
      warning: error.message,
    });
  }
}
