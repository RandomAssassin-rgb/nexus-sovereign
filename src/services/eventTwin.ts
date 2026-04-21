import { average } from "../lib/signalMath";
import type { BuildSignalFabricInput } from "./signalFabric";
import { buildSignalFabric } from "./signalFabric";
import type { EventTwin } from "../types/eventTwin";

export type BuildEventTwinInput = BuildSignalFabricInput & {
  id: string;
  coveredWorkers: number;
  likelyAffectedWorkers: number;
  projectedClaims: number;
  projectedPayoutMin: number;
  projectedPayoutMax: number;
  reserveImpact: number;
  expectedLossRatio: number;
  fraudDistribution?: Record<string, number>;
};

export async function buildEventTwin(input: BuildEventTwinInput): Promise<EventTwin> {
  const signals = await buildSignalFabric(input);
  const confidence = average(signals.map((signal) => signal.confidenceScore));
  const severity = average(signals.map((signal) => signal.freshnessScore));

  return {
    id: input.id,
    type: input.disruptionType,
    status: "active",
    zoneIds: input.zoneIds,
    startedAt: input.startedAt ?? new Date().toISOString(),
    severity,
    confidence,
    signals,
    exposure: {
      coveredWorkers: input.coveredWorkers,
      likelyAffectedWorkers: input.likelyAffectedWorkers,
      projectedClaims: input.projectedClaims,
      projectedPayoutMin: input.projectedPayoutMin,
      projectedPayoutMax: input.projectedPayoutMax,
      reserveImpact: input.reserveImpact,
      expectedLossRatio: input.expectedLossRatio,
      fraudDistribution: input.fraudDistribution ?? {},
    },
    origin: input.disruptionType.includes("heat") ? "simulated" : "hybrid",
  };
}
