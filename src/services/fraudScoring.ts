import { weightedScore } from "../lib/signalMath";
import type { FraudReasonCode, FraudTrace } from "../types/eventTwin";

export type FraudInput = {
  claimId: string;
  eventId?: string;
  gpsScore: number;
  deviceTrustScore: number;
  weatherMatchScore: number;
  activityMatchScore: number;
  consensusScore: number;
  duplicateScore: number;
  hints?: {
    impossibleTravel?: boolean;
    geofenceMismatch?: boolean;
    mockLocationSuspected?: boolean;
    weatherContradiction?: boolean;
    aqiContradiction?: boolean;
    trafficContradiction?: boolean;
    inactiveDuringClaimWindow?: boolean;
    reserveGuardReview?: boolean;
  };
};

function buildReasonCodes(input: FraudInput): FraudReasonCode[] {
  const reasons: FraudReasonCode[] = [];
  if (input.hints?.impossibleTravel) reasons.push("IMPOSSIBLE_TRAVEL");
  if (input.hints?.geofenceMismatch) reasons.push("GEOFENCE_MISMATCH");
  if (input.hints?.mockLocationSuspected) reasons.push("MOCK_LOCATION_SUSPECTED");
  if (input.hints?.weatherContradiction) reasons.push("WEATHER_CONTRADICTION");
  if (input.hints?.aqiContradiction) reasons.push("AQI_CONTRADICTION");
  if (input.hints?.trafficContradiction) reasons.push("TRAFFIC_CONTRADICTION");
  if (input.deviceTrustScore < 45) reasons.push("LOW_DEVICE_TRUST");
  if (input.consensusScore < 35) reasons.push("LOW_CONSENSUS");
  if (input.hints?.inactiveDuringClaimWindow) reasons.push("INACTIVE_DURING_CLAIM_WINDOW");
  if (input.duplicateScore < 40) reasons.push("DUPLICATE_EVENT_CLAIM");
  if (input.hints?.reserveGuardReview) reasons.push("RESERVE_GUARD_REVIEW");
  return reasons;
}

export function scoreFraud(input: FraudInput): FraudTrace {
  const finalScore = weightedScore([
    { score: input.gpsScore, weight: 0.24 },
    { score: input.deviceTrustScore, weight: 0.18 },
    { score: input.weatherMatchScore, weight: 0.18 },
    { score: input.activityMatchScore, weight: 0.16 },
    { score: input.consensusScore, weight: 0.12 },
    { score: input.duplicateScore, weight: 0.12 },
  ]);

  const reasonCodes = buildReasonCodes(input);

  let finalDecision: FraudTrace["finalDecision"] = "approve";
  if (finalScore < 50 || reasonCodes.includes("IMPOSSIBLE_TRAVEL") || reasonCodes.includes("MOCK_LOCATION_SUSPECTED")) {
    finalDecision = "hold";
  } else if (finalScore < 68 || reasonCodes.includes("RESERVE_GUARD_REVIEW")) {
    finalDecision = "escalate";
  }

  return {
    claimId: input.claimId,
    eventId: input.eventId,
    gpsScore: input.gpsScore,
    deviceTrustScore: input.deviceTrustScore,
    weatherMatchScore: input.weatherMatchScore,
    activityMatchScore: input.activityMatchScore,
    consensusScore: input.consensusScore,
    duplicateScore: input.duplicateScore,
    finalScore,
    finalDecision,
    reasonCodes,
    details: {
      hints: input.hints ?? {},
      generatedAt: new Date().toISOString(),
    },
  };
}
