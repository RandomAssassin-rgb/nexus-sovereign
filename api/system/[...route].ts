import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatchLegacyHandler } from '../../serverless/legacyDispatch';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return dispatchLegacyHandler('system', req, res);
}
