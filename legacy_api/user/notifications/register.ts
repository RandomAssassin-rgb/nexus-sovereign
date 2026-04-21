import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildDeviceTrustReport } from "../../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { partnerId, token, platform, pushReady } = req.body || {};
    const trust = buildDeviceTrustReport({
      nativeApp: platform === "android" || platform === "ios",
      pushReady,
      biometricsAvailable: true,
      secureStorageReady: true,
      locationPermission: "granted",
    });

    return res.status(200).json({
      success: true,
      partnerId: partnerId || null,
      registration_id: token ? `${platform || "web"}-${String(token).slice(0, 12)}` : null,
      trust_score: trust.trust_score,
      registered_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Notification registration failed" });
  }
}
