import type { VercelRequest, VercelResponse } from '@vercel/node';
import { diagnoseAuthSystem } from '../../_lib/authDiagnostics';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const health = await diagnoseAuthSystem();
    res.json({
      success: true,
      ...health,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    res.status(500).json({ 
      success: false, 
      status: 'AUTH_QUERY_FAILED', 
      details: e.message 
    });
  }
}
