export type SignalName =
  | "weather"
  | "weather_history"
  | "aqi"
  | "traffic"
  | "activity"
  | "device_trust"
  | "multivariate"
  | "consensus";

export type DisruptionType =
  | "extreme_heat"
  | "heavy_rain"
  | "flood"
  | "severe_pollution"
  | "traffic_shutdown"
  | "platform_outage"
  | "civic_disruption";

export type SignalEvidence = {
  name: SignalName;
  source: string;
  observedAt: string;
  freshnessScore: number;
  confidenceScore: number;
  contradictionResult?: "passed" | "failed" | "unknown";
  payload: Record<string, unknown>;
};

export type EventExposureSnapshot = {
  coveredWorkers: number;
  likelyAffectedWorkers: number;
  projectedClaims: number;
  projectedPayoutMin: number;
  projectedPayoutMax: number;
  reserveImpact: number;
  expectedLossRatio: number;
  fraudDistribution: Record<string, number>;
};

export type EventTwin = {
  id: string;
  type: DisruptionType;
  status: "active" | "closed" | "draft";
  origin: "live" | "simulated" | "hybrid";
  scenario_id?: string;
  demo_tag?: string;
  created_by?: string;
  expires_at?: string;
  zoneIds: string[];
  startedAt: string;
  endedAt?: string;
  severity: number;
  confidence: number;
  signals: SignalEvidence[];
  exposure: EventExposureSnapshot;
};

export type FraudReasonCode =
  | "IMPOSSIBLE_TRAVEL"
  | "GEOFENCE_MISMATCH"
  | "MOCK_LOCATION_SUSPECTED"
  | "WEATHER_CONTRADICTION"
  | "AQI_CONTRADICTION"
  | "TRAFFIC_CONTRADICTION"
  | "LOW_DEVICE_TRUST"
  | "LOW_CONSENSUS"
  | "INACTIVE_DURING_CLAIM_WINDOW"
  | "DUPLICATE_EVENT_CLAIM"
  | "RESERVE_GUARD_REVIEW";

export type FraudTrace = {
  claimId: string;
  eventId?: string;
  gpsScore: number;
  deviceTrustScore: number;
  weatherMatchScore: number;
  activityMatchScore: number;
  consensusScore: number;
  duplicateScore: number;
  finalScore: number;
  finalDecision: "approve" | "hold" | "escalate";
  reasonCodes: FraudReasonCode[];
  details: Record<string, unknown>;
};

export type PayoutLedger = {
  claimId: string;
  triggerCrossed: string;
  eventWindow: {
    start: string;
    end: string;
  };
  affectedHoursEstimate: number;
  activeWeeklyPlan: string;
  coverageCap: number;
  reserveGuardAdjustment: number;
  finalPayoutAmount: number;
  narrative: string;
};

export type AuditPack = {
  claimId?: string;
  eventId?: string;
  origin: "live" | "simulated" | "hybrid";
  signalSnapshot: Record<string, unknown>;
  decisionTrace: Record<string, unknown>;
  payoutTrace: Record<string, unknown>;
  adminActions: Array<Record<string, unknown>>;
  exportableSummary: string;
};
