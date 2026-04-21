import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import GlobalSimulationPopup from "./GlobalSimulationPopup";
import {
  addClaimLocally,
  getBalance,
  getClaims,
  getTransactions,
  initRealtimeSubscription,
  saveTransactions,
  setBalance,
  syncWithServer,
} from "../lib/payoutStore";
import { restoreSessionBridge } from "../lib/sessionBridge";
import { getWorkerPartnerIdSnapshot } from "../lib/sessionIdentity";
import { primePayoutAudio } from "../lib/payoutSound";
import { apiClient } from "../lib/apiClient";

const AUTH_ROUTES = new Set([
  "/",
  "/platform",
  "/signin-platform",
  "/signin-method",
  "/signin-credentials",
  "/signin-phone",
  "/mock-oauth",
  "/verify",
  "/otp",
  "/preview",
  "/biometrics",
  "/aadhaar-verify",
  "/coverage-plans",
  "/admin/auth",
]);

const PENDING_NOTIF_PAYLOAD = "nexus_pending_payout_notif";
const LAST_DISPLAYED_PAYOUT_ID = "nexus_zero_touch_popup_last_claim_id";
const CLAIM_MODAL_SCAN_MS = 3000;
const LATEST_PAYOUT_POLL_MS = 2500;
const SIMULATION_POPUP_WINDOW_MS = 15 * 60 * 1000;

function isSimulationPayoutClaim(input: any) {
  const claim = input?.claim || input;
  const claimId = String(claim?.id || input?.id || "").trim();
  const jepData = claim?.jepData || claim?.jep_data || {};
  const source = String(jepData?.source || "").toLowerCase();
  const simulationType = String(jepData?.simulation_type || "").trim();
  return claimId.startsWith("SIM-") || source === "admin_simulation" || simulationType.length > 0;
}

function resolvePartnerIdFromSession(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const value =
    (session as any)?.user?.partnerId ??
    (session as any)?.user?.partner_id ??
    (session as any)?.user?.id ??
    (session as any)?.partnerId ??
    (session as any)?.partner_id ??
    (session as any)?.id;

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isWorkerExperiencePath(pathname: string) {
  if (!pathname) return false;
  if (pathname.startsWith("/admin")) return false;
  return !AUTH_ROUTES.has(pathname);
}

function isApprovedPayoutStatus(status: unknown) {
  const normalized = String(status || "").toLowerCase();
  return ["approved", "success", "paid", "completed", "processed"].includes(normalized);
}

function isRecentIsoDate(value: unknown, windowMs: number = SIMULATION_POPUP_WINDOW_MS) {
  if (typeof value !== "string" || !value.trim()) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Math.abs(Date.now() - timestamp) <= windowMs;
}

function resolveSimulationText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function resolveSimulationNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function getSimulationNotificationKey(input: any) {
  const claim = input?.claim || input;
  const jepData = claim?.jepData || claim?.jep_data || {};

  return resolveSimulationText(
    input?.simulation_id,
    input?.simulationId,
    claim?.simulation_id,
    jepData?.simulation_id,
    input?.id,
    input?.claimId,
    claim?.id
  );
}

function getSimulationPopupMetadata(input: any) {
  const claim = input?.claim || input;
  const jepData = claim?.jepData || claim?.jep_data || {};

  const simulationId = resolveSimulationText(
    input?.simulation_id,
    input?.simulationId,
    claim?.simulation_id,
    jepData?.simulation_id
  );

  return {
    notificationKey: getSimulationNotificationKey(input),
    simulationId,
    popupDisplayAt: resolveSimulationText(
      input?.popup_display_at,
      input?.popupDisplayAt,
      claim?.popup_display_at,
      jepData?.popup_display_at
    ),
    popupDelayMs: resolveSimulationNumber(
      input?.popup_delay_ms,
      input?.popupDelayMs,
      claim?.popup_delay_ms,
      jepData?.popup_delay_ms
    ),
    popupTitle: resolveSimulationText(
      input?.title,
      input?.popup_title,
      claim?.title,
      claim?.popup_title,
      jepData?.popup_title
    ),
    ctaLabel: resolveSimulationText(
      input?.cta_label,
      input?.ctaLabel,
      claim?.cta_label,
      claim?.popup_cta_label,
      jepData?.popup_cta_label
    ),
  };
}

function buildPayoutPayloadFromClaim(claim: any) {
  if (!claim) return null;
  const popupMeta = getSimulationPopupMetadata(claim);
  const existingJepData =
    (typeof claim?.jepData === "object" && claim?.jepData !== null
      ? claim.jepData
      : typeof claim?.jep_data === "object" && claim?.jep_data !== null
        ? claim.jep_data
        : {}) as Record<string, unknown>;

  return {
    id: String(claim.id || "").trim(),
    simulation_id: popupMeta.simulationId || undefined,
    amount: Number(claim.amount || 0),
    type: claim.type || "Autonomous protection payout",
    reason:
      claim.reason ||
      claim.summary?.wordedReason ||
      "A fresh zero-touch payout was cleared for your protection zone.",
    dateISO: claim.dateISO || new Date().toISOString(),
    popup_display_at: popupMeta.popupDisplayAt || undefined,
    popup_delay_ms: popupMeta.popupDelayMs ?? undefined,
    title: popupMeta.popupTitle || "Zero-Touch Trigger",
    cta_label: popupMeta.ctaLabel || "View Claim Status",
    claim,
    jepData: {
      ...existingJepData,
      source: "admin_simulation",
      simulation_id: popupMeta.simulationId || undefined,
      popup_display_at: popupMeta.popupDisplayAt || undefined,
      popup_delay_ms: popupMeta.popupDelayMs ?? undefined,
      popup_title: popupMeta.popupTitle || "Zero-Touch Trigger",
      popup_cta_label: popupMeta.ctaLabel || "View Claim Status",
    },
  };
}

function findLatestEligibleClaim() {
  const lastDisplayedId = localStorage.getItem(LAST_DISPLAYED_PAYOUT_ID);

  return [...getClaims()]
    .sort((left, right) => {
      const leftTime = new Date(left.dateISO || 0).getTime();
      const rightTime = new Date(right.dateISO || 0).getTime();
      return rightTime - leftTime;
    })
    .find((claim) => {
      const notificationKey = getSimulationNotificationKey(claim);
      if (!notificationKey) return false;
      if (notificationKey === String(lastDisplayedId || "")) return false;
      if (!isSimulationPayoutClaim(claim)) return false;
      if (!isApprovedPayoutStatus(claim.status)) return false;
      if (!isRecentIsoDate(claim.dateISO)) return false;
      return true;
    });
}

export default function WorkerRuntimeLayer({ session }: { session: unknown }) {
  const location = useLocation();
  const [partnerId, setPartnerId] = useState<string | null>(() =>
    getWorkerPartnerIdSnapshot() || resolvePartnerIdFromSession(session)
  );
  const [forcedPayout, setForcedPayout] = useState<any | null>(null);
  const isActive = Boolean(session) && isWorkerExperiencePath(location.pathname);
  const lastAnnouncedClaimIdRef = useRef<string | null>(null);
  const latestPayoutPollRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    primePayoutAudio();
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    const refreshPartnerId = () => {
      const current = getWorkerPartnerIdSnapshot() || resolvePartnerIdFromSession(session);
      setPartnerId((previous) => (previous === current ? previous : current));
    };

    void restoreSessionBridge()
      .catch(() => undefined)
      .finally(refreshPartnerId);

    const interval = window.setInterval(refreshPartnerId, 5000);
    window.addEventListener("storage", refreshPartnerId);
    window.addEventListener("auth-change", refreshPartnerId);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", refreshPartnerId);
      window.removeEventListener("auth-change", refreshPartnerId);
    };
  }, [isActive, session]);

  useEffect(() => {
    if (!isActive || !partnerId) return;

    console.log(`[WorkerRuntime] Global sync engine started for ${partnerId} on ${location.pathname}`);
    void syncWithServer(partnerId, "runtime-init");

    const serverSyncInterval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void syncWithServer(partnerId, "runtime-pulse");
    }, 30000); // Reduce from 2s to 30s fallback

    return () => {
      console.log("[WorkerRuntime] Global sync engine stopped.");
      window.clearInterval(serverSyncInterval);
    };
  }, [isActive, location.pathname, partnerId]);

  useEffect(() => {
    if (!isActive || !partnerId) return;

    let cleanupFn = initRealtimeSubscription(partnerId);

    const handleReconnect = () => {
      console.log("[WorkerRuntime] Device is online. Re-initializing sync.");
      void syncWithServer(partnerId, "runtime-online-reconnect");
      cleanupFn?.();
      cleanupFn = initRealtimeSubscription(partnerId);
    };

    window.addEventListener("online", handleReconnect);

    return () => {
      window.removeEventListener("online", handleReconnect);
      cleanupFn?.();
    };
  }, [isActive, partnerId]);

  useEffect(() => {
    if (!isActive) return;

    const emitLatestPayoutIfNeeded = () => {
      if (document.visibilityState !== "visible") return;

      const latestClaim = findLatestEligibleClaim();
      if (!latestClaim) return;

      const payoutPayload = buildPayoutPayloadFromClaim(latestClaim);
      const notificationKey = getSimulationNotificationKey(payoutPayload);
      if (!payoutPayload?.id || !notificationKey) return;

      if (lastAnnouncedClaimIdRef.current === notificationKey) return;

      lastAnnouncedClaimIdRef.current = notificationKey;
      localStorage.setItem(PENDING_NOTIF_PAYLOAD, JSON.stringify(payoutPayload));
      setForcedPayout(payoutPayload);
    };

    emitLatestPayoutIfNeeded();

    const intervalId = window.setInterval(emitLatestPayoutIfNeeded, CLAIM_MODAL_SCAN_MS);
    window.addEventListener("nexus-payout-update", emitLatestPayoutIfNeeded);
    window.addEventListener("focus", emitLatestPayoutIfNeeded);
    document.addEventListener("visibilitychange", emitLatestPayoutIfNeeded);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("nexus-payout-update", emitLatestPayoutIfNeeded);
      window.removeEventListener("focus", emitLatestPayoutIfNeeded);
      document.removeEventListener("visibilitychange", emitLatestPayoutIfNeeded);
    };
  }, [isActive, partnerId, location.pathname]);

  useEffect(() => {
    if (!isActive || !partnerId) return;

    let cancelled = false;

    const upsertLatestTransaction = async (transaction: any) => {
      if (!transaction?.id) return;
      const existing = getTransactions();
      const next = [transaction, ...existing.filter((item) => String(item.id) !== String(transaction.id))];
      await saveTransactions(next, false);
    };

    const applyIncomingPayout = async (
      payload: any,
      options?: { syncSource?: string | null }
    ) => {
      const claim = payload?.claim || null;
      if (!isSimulationPayoutClaim(payload) && !isSimulationPayoutClaim(claim)) {
        return;
      }

      if (claim?.id) {
        addClaimLocally(claim);
      }

      if (payload?.transaction?.id) {
        await upsertLatestTransaction(payload.transaction);
      }

      if (Number.isFinite(Number(payload?.balance))) {
        await setBalance(Number(payload.balance), false);
      }

      const payoutPayload =
        buildPayoutPayloadFromClaim(claim) || {
          id: String(payload?.id || payload?.latest_claim_id || "").trim(),
          simulation_id: getSimulationPopupMetadata(payload).simulationId || undefined,
          amount: Number(payload?.amount || claim?.amount || 0),
          type: payload?.type || claim?.type || "Automatic payout",
          reason:
            payload?.reason ||
            claim?.reason ||
            claim?.summary?.wordedReason ||
            "A fresh zero-touch payout was cleared for your protection zone.",
          dateISO: payload?.dateISO || claim?.dateISO || new Date().toISOString(),
          popup_display_at: getSimulationPopupMetadata(payload).popupDisplayAt || undefined,
          popup_delay_ms: getSimulationPopupMetadata(payload).popupDelayMs ?? undefined,
          title: getSimulationPopupMetadata(payload).popupTitle || "Zero-Touch Trigger",
          cta_label: getSimulationPopupMetadata(payload).ctaLabel || "View Claim Status",
          claim,
        };

      const notificationKey = getSimulationNotificationKey(payoutPayload);
      if (!payoutPayload?.id || !notificationKey) return;

      if (options?.syncSource) {
        await syncWithServer(partnerId, options.syncSource).catch(() => undefined);
      }

      lastAnnouncedClaimIdRef.current = notificationKey;
      localStorage.setItem(PENDING_NOTIF_PAYLOAD, JSON.stringify(payoutPayload));
      localStorage.setItem("nexus_last_seen_claim_id", notificationKey);
      setForcedPayout(payoutPayload);
      window.dispatchEvent(new Event("nexus-payout-update"));
    };

    const processLatestPayoutSignal = async () => {
      if (cancelled || latestPayoutPollRef.current || document.visibilityState !== "visible") return;
      latestPayoutPollRef.current = true;

      try {
        const afterClaimId = localStorage.getItem(LAST_DISPLAYED_PAYOUT_ID) || "";

        const signalResponse = await apiClient.get("/api/user/simulation-signal", {
          params: {
            partnerId,
            afterClaimId,
          },
          timeout: 1200,
        });

        if (cancelled) return;
        const fastSignal = signalResponse.data;
        if (fastSignal?.has_new && fastSignal?.payload?.id) {
          await applyIncomingPayout(fastSignal.payload);
          return;
        }

        const response = await apiClient.get("/api/user/latest-payout", {
          params: {
            partnerId,
            afterClaimId,
          },
          timeout: 2200,
        });

        if (cancelled) return;
        const signal = response.data;
        if (!signal?.has_new || !signal?.claim?.id) return;

        await applyIncomingPayout(
          {
            id: signal.latest_claim_id,
            claim: signal.claim,
            transaction: signal.transaction,
            balance: signal.balance,
          },
          { syncSource: "runtime-latest-payout" }
        );
      } catch (error) {
        console.warn("[WorkerRuntime] latest payout poll failed", error);
      } finally {
        latestPayoutPollRef.current = false;
      }
    };

    void processLatestPayoutSignal();
    const intervalId = window.setInterval(() => {
      void processLatestPayoutSignal();
    }, LATEST_PAYOUT_POLL_MS);

    const handleWake = () => {
      void processLatestPayoutSignal();
    };

    window.addEventListener("focus", handleWake);
    document.addEventListener("visibilitychange", handleWake);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWake);
      document.removeEventListener("visibilitychange", handleWake);
    };
  }, [isActive, partnerId, location.pathname]);

  if (!isActive) return null;

  return (
    <GlobalSimulationPopup
      partnerId={partnerId}
      forcedPayout={forcedPayout}
      onForcedPayoutHandled={() => setForcedPayout(null)}
    />
  );
}
