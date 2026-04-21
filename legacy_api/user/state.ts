import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildWorkerStateSnapshot, persistWorkerStateSnapshot } from "../_lib/v2.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const partnerId = Array.isArray(req.query?.partnerId) ? req.query.partnerId[0] : req.query?.partnerId;
      const result = await buildWorkerStateSnapshot(typeof partnerId === "string" ? partnerId : null);
      return res.json(result);
    }

    if (req.method === "POST") {
      const partnerId = typeof req.body?.partnerId === "string" ? req.body.partnerId : null;
      const snapshot =
        req.body && typeof req.body === "object" && req.body.snapshot && typeof req.body.snapshot === "object"
          ? req.body.snapshot
          : null;
      const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
      const result = await persistWorkerStateSnapshot({ partnerId, snapshot, reason });
      return res.json(result);
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Worker state persistence failed" });
  }
}

