import type { VercelRequest, VercelResponse } from "@vercel/node";
import { orchestrateFinalistSimulation, getCachedSimulationUsers } from "../../../src/lib/adminSimulation";
import { supabaseServer } from "../../_lib/supabase";
import { buildReserveProjection, getProductControls } from "../../_lib/v2";
import { adaptEventTwinToLegacy } from "../../_lib/adapter";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const source = req.method === "GET" ? req.query : req.body || {};
    const execute = source.execute === true || source.execute === "true";
    const scenarioType = Array.isArray(source.scenarioType) ? source.scenarioType[0] : (source.scenarioType || "monsoon-flood");

    const [reserve, users] = await Promise.all([
      buildReserveProjection(),
      getCachedSimulationUsers(supabaseServer)
    ]);

    const twin = await orchestrateFinalistSimulation({
      type: scenarioType,
      message: source.message,
      supabaseServer,
      activeWorkers: users,
      reservePool: reserve.reserve_pool,
    });

    // In a real Phase 3 scenario, orchestrateFinalistSimulation would handle the 'execute' flag
    // or we pass it through. For now it creates the twin.
    
    const productControls = getProductControls();
    const legacyResponse = adaptEventTwinToLegacy(twin, execute, reserve, productControls);

    return res.status(200).json(legacyResponse);
  } catch (error: any) {
    console.error("[Scenario Phase 3] Error:", error);
    return res.status(500).json({ error: error?.message || "Scenario simulation failed" });
  }
}
