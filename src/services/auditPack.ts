import type { AuditPack, EventTwin, FraudTrace, PayoutLedger } from "../types/eventTwin";

export function buildAuditPack(input: {
  claimId?: string;
  eventTwin?: EventTwin;
  fraudTrace?: FraudTrace;
  payoutLedger?: PayoutLedger;
  adminActions?: Array<Record<string, unknown>>;
}): AuditPack {
  return {
    claimId: input.claimId,
    eventId: input.eventTwin?.id,
    signalSnapshot: {
      eventType: input.eventTwin?.type,
      startedAt: input.eventTwin?.startedAt,
      zoneIds: input.eventTwin?.zoneIds,
      signals: input.eventTwin?.signals ?? [],
      exposure: input.eventTwin?.exposure ?? {},
    },
    decisionTrace: input.fraudTrace ?? {},
    payoutTrace: input.payoutLedger ?? {},
    adminActions: input.adminActions ?? [],
    exportableSummary: buildSummary(input),
    origin: input.eventTwin?.origin ?? "simulated",
  };
}

function buildSummary(input: {
  claimId?: string;
  eventTwin?: EventTwin;
  fraudTrace?: FraudTrace;
  payoutLedger?: PayoutLedger;
}): string {
  const decision = input.fraudTrace?.finalDecision ?? "unknown";
  const payout = input.payoutLedger?.finalPayoutAmount ?? 0;
  return [
    `Claim: ${input.claimId ?? "n/a"}`,
    `Event: ${input.eventTwin?.type ?? "n/a"} (${input.eventTwin?.id ?? "n/a"})`,
    `Decision: ${decision}`,
    `Payout: ${payout}`,
    `Reasons: ${(input.fraudTrace?.reasonCodes ?? []).join(", ") || "none"}`,
  ].join(" | ");
}
