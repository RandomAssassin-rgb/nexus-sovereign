import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildProtectionForecast } from "../_lib/v2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const source = req.method === "GET" ? req.query : req.body || {};
    const result = await buildProtectionForecast({
      partnerId: Array.isArray(source.partnerId) ? source.partnerId[0] : source.partnerId,
      lat: Array.isArray(source.lat) ? source.lat[0] : source.lat,
      lon: Array.isArray(source.lon) ? source.lon[0] : source.lon,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Forecast generation failed" });
  }
}
