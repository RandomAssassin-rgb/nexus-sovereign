import { readSecureValue, removeSecureValue, saveSecureValue } from "./deviceCapabilities";

const OFFLINE_QUEUE_KEY = "nexus_offline_claim_queue_v2";

export interface OfflineClaim {
  id: string;
  timestamp: string;
  gps: { lat: number; lon: number };
  shiftStatus: string;
  description: string;
  evidenceBase64?: string | null;
  workerId?: string | null;
  deviceState?: Record<string, unknown>;
  status?: "queued" | "syncing" | "failed";
  attempts?: number;
  lastError?: string | null;
}

export interface OfflineQueueSyncResult {
  syncedCount: number;
  failedCount: number;
  remaining: number;
  results: Array<{ claimId: string; status: "synced" | "failed"; message?: string }>;
}

async function persistQueue(queue: OfflineClaim[]) {
  await saveSecureValue(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function emitQueueUpdate(count: number) {
  window.dispatchEvent(new CustomEvent("nexus-offline-queue-update", { detail: { count } }));
}

export async function getOfflineClaims(): Promise<OfflineClaim[]> {
  try {
    const raw = await readSecureValue(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveOfflineClaim(claim: OfflineClaim) {
  const existing = await getOfflineClaims();
  const sanitized: OfflineClaim = {
    ...claim,
    evidenceBase64: claim.evidenceBase64 || null,
    workerId: claim.workerId || localStorage.getItem("partner_id") || null,
    status: "queued",
    attempts: claim.attempts ?? 0,
    lastError: null,
  };

  const next = [sanitized, ...existing.filter((item) => item.id !== claim.id)];
  await persistQueue(next);
  emitQueueUpdate(next.length);
  return sanitized;
}

export async function clearOfflineClaims() {
  await removeSecureValue(OFFLINE_QUEUE_KEY);
  emitQueueUpdate(0);
}

export async function removeOfflineClaim(claimId: string) {
  const queue = await getOfflineClaims();
  const next = queue.filter((claim) => claim.id !== claimId);
  await persistQueue(next);
  emitQueueUpdate(next.length);
  return next;
}

async function syncOfflineClaimsInternal(targetIds?: string[]) {
  const queue = await getOfflineClaims();
  const targetSet = targetIds?.length ? new Set(targetIds) : null;
  const replayQueue = targetSet ? queue.filter((claim) => targetSet.has(claim.id)) : queue;

  if (replayQueue.length === 0) {
    return { syncedCount: 0, failedCount: 0, remaining: 0, results: [] };
  }

  const results: OfflineQueueSyncResult["results"] = [];
  const nextQueue = [...queue];

  for (let index = 0; index < nextQueue.length; index += 1) {
    const claim = nextQueue[index];
    if (!claim?.id) continue;
    if (targetSet && !targetSet.has(claim.id)) continue;

    nextQueue[index] = {
      ...claim,
      status: "syncing",
      attempts: (claim.attempts || 0) + 1,
      lastError: null,
    };
    await persistQueue(nextQueue);

    try {
      const validationResponse = await fetch("/api/claims/time-shifted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: claim.id,
          cached_gps: claim.gps,
          cached_shift_status: claim.shiftStatus,
          submitted_at: new Date().toISOString(),
          original_timestamp: claim.timestamp,
          claim,
        }),
      });

      if (!validationResponse.ok) {
        throw new Error("Offline validation failed");
      }

      const validation = await validationResponse.json();
      const workerId = claim.workerId || localStorage.getItem("partner_id");

      const createResponse = await fetch("/api/claims/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: workerId,
          claimId: claim.id,
          amount: 0,
          status: "processing",
          type: "Offline Continuity Claim",
          reason: claim.description,
          lat: claim.gps?.lat,
          lng: claim.gps?.lon,
          jep_data: {
            trigger_type: "Offline Continuity Claim",
            worded_summary: "Queued offline claim replayed into the protection ledger after reconnection.",
            technical_reason: "Historical validation completed successfully and the claim was restored into the standard review pipeline.",
            confidence: 0.79,
            offline_continuity: true,
            original_timestamp: claim.timestamp,
            historical_validation: validation,
            evidence_present: Boolean(claim.evidenceBase64),
            queue_attempts: (claim.attempts || 0) + 1,
            device_state: claim.deviceState || null,
          },
        }),
      });

      if (!createResponse.ok) {
        throw new Error("Ledger replay failed");
      }

      results.push({
        claimId: claim.id,
        status: "synced",
        message: "Queued claim replayed into the review pipeline.",
      });
      nextQueue[index] = null as unknown as OfflineClaim;
    } catch (error: any) {
      const message = error?.message || "Claim replay failed";
      nextQueue[index] = {
        ...claim,
        status: "failed",
        attempts: (claim.attempts || 0) + 1,
        lastError: message,
      };
      results.push({ claimId: claim.id, status: "failed", message });
      await persistQueue(nextQueue.filter(Boolean));
    }
  }

  const remainingQueue = nextQueue.filter(Boolean);
  await persistQueue(remainingQueue);
  emitQueueUpdate(remainingQueue.length);

  return {
    syncedCount: results.filter((result) => result.status === "synced").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    remaining: remainingQueue.length,
    results,
  };
}

export async function syncOfflineClaims(): Promise<OfflineQueueSyncResult> {
  return syncOfflineClaimsInternal();
}

export async function syncSingleOfflineClaim(claimId: string): Promise<OfflineQueueSyncResult> {
  return syncOfflineClaimsInternal([claimId]);
}
