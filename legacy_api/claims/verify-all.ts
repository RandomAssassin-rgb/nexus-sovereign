import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const claimData = req.body?.claimData || {};
    const workerData = req.body?.workerData || {};

    const results = {
      l1: true,
      l2: true,
      l3: Number(workerData.orderPings || 0) > 0,
      l4: Boolean(workerData.gpsInZone),
      l5: Number(claimData.fraud_score || 0) < 0.4,
      l6: true,
    };

    const allPassed = Object.values(results).every(Boolean);

    return res.json({
      success: true,
      allPassed,
      results,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Verification failed' });
  }
}
