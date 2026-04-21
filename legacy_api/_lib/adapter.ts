import { roundAmount } from "./v2";

export interface LegacyScenarioResponse {
  success: boolean;
  execute: boolean;
  scenario_key: string;
  scenario: string;
  workers_impacted: number;
  projected_payout_load: number;
  reserve_after_24h: number;
  reserve_guardrail: string;
  p_max: number;
  runway_days_after_scenario: number;
  origin: "live" | "simulated" | "hybrid";
  demo_tag?: string;
  controls: {
    payout_corridor: string;
    replacement_ratio: string;
    trigger_sensitivity: string;
    geography_rulebook: string;
    review_mode: string;
  };
  economics: {
    reserve_drawdown_pct: number;
    average_worker_payout: number;
    solvency_posture: string;
  };
  audit_seed: string[];
  twin_id?: string;
}

/**
 * Normalizes a Phase 3 EventTwin into the Legacy Scenario Response shape.
 */
export function adaptEventTwinToLegacy(
  twin: any, 
  execute: boolean,
  reserveContext: { reserve_pool: number; burn_rate_per_day: number; p_max: number; reserve_guardrail: string | number },
  productControls: any
): LegacyScenarioResponse {
  const projectedLoad = twin.metrics?.projected_load || 0;
  
  return {
    success: true,
    execute,
    scenario_key: twin.type,
    scenario: twin.type.split("_").map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
    workers_impacted: twin.exposure || 0,
    projected_payout_load: projectedLoad,
    reserve_after_24h: Math.max(0, reserveContext.reserve_pool - projectedLoad),
    reserve_guardrail: String(reserveContext.reserve_guardrail),
    p_max: reserveContext.p_max,
    runway_days_after_scenario: Number(
      ((Math.max(0, reserveContext.reserve_pool - projectedLoad) || 1) / Math.max(1, reserveContext.burn_rate_per_day)).toFixed(1)
    ),
    origin: twin.origin || "simulated",
    demo_tag: twin.demo_tag,
    controls: {
      payout_corridor: productControls.payout_corridor,
      replacement_ratio: productControls.replacement_ratio,
      trigger_sensitivity: productControls.trigger_sensitivity,
      geography_rulebook: productControls.geography_rulebook,
      review_mode: twin.exposure > 15 ? "assisted + autonomous" : "autonomous preferred",
    },
    economics: {
      reserve_drawdown_pct: twin.metrics?.reserve_drawdown_pct || 0,
      average_worker_payout: roundAmount(projectedLoad / Math.max(1, twin.exposure)),
      solvency_posture: twin.metrics?.reserve_drawdown_pct > 18 ? "Guardrail engagement likely" : "Healthy release window",
    },
    audit_seed: [
      `Phase 3 Event Twin [${twin.origin}] initialized`,
      `Signal Fabric correlation score: ${twin.signals?.confidenceScore || "High"}`,
       ...(twin.signals?.contradictionIndex < 20 ? ["Hardened fraud validation passed"] : ["Signal contradictions noted in audit trace"]),
      execute ? "Execution payload broadcast to worker orbit" : "Preview only - autonomous twin active",
    ],
    twin_id: twin.id,
  };
}
