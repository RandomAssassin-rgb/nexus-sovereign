import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { claimId, reason } = req.body || {};
    if (!claimId) return res.status(400).json({ error: 'Missing claimId' });

    console.log(`[Claims] Dispute logged for ${claimId}: ${reason || 'No reason provided'}`);

    return res.json({
      success: true,
      message: 'Dispute submitted for manual review',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Dispute submission failed' });
  }
}
