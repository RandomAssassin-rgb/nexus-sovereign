import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildLatestPayoutSignal } from "../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const partnerId = Array.isArray(req.query.partnerId) ? req.query.partnerId[0] : req.query.partnerId;
    const afterClaimId = Array.isArray(req.query.afterClaimId) ? req.query.afterClaimId[0] : req.query.afterClaimId;
    const result = await buildLatestPayoutSignal({
      partnerId: typeof partnerId === "string" ? partnerId : null,
      afterClaimId: typeof afterClaimId === "string" ? afterClaimId : null,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Latest payout lookup failed" });
  }
}
