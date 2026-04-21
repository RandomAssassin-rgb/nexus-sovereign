import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSimulationSignal } from '../../src/lib/adminSimulation';
import { resolveWorkerIdentity } from '../_lib/v2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const partnerId = String(req.query.partnerId || '').trim();
    const afterClaimId = String(req.query.afterClaimId || '');
    const directData = readSimulationSignal(partnerId, afterClaimId);
    if (partnerId && (directData.has_new || directData.latest_claim_id || directData.payload)) {
      return res.status(200).json({
        ...directData,
        partnerId,
      });
    }

    const resolved = await resolveWorkerIdentity(partnerId);
    const canonicalPartnerId = resolved.partnerId || partnerId;
    const data = readSimulationSignal(canonicalPartnerId, afterClaimId);
    res.status(200).json({
      ...data,
      partnerId: canonicalPartnerId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load simulation signal' });
  }
}
