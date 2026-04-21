import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/apiClient";
import { markNotificationsSeen, type NexusInboxResponse, type NexusNotificationPayload } from "../lib/notifications";
import { getClaims, syncWithServer } from "../lib/payoutStore";
import { getWorkerPartnerIdSnapshot } from "../lib/sessionIdentity";
import { playPayoutChime, primePayoutAudio } from "../lib/payoutSound";

const PENDING_NOTIF_PAYLOAD = "nexus_pending_payout_notif";
const LAST_DISPLAYED_PAYOUT_ID = "nexus_zero_touch_popup_last_claim_id";
const LAST_DISMISSED_PAYOUT_ID = "nexus_zero_touch_popup_last_dismissed_claim_id";
const LAST_SOUNDED_PAYOUT_ID = "nexus_zero_touch_popup_last_sounded_claim_id";
const CONSUMED_PAYOUT_IDS_KEY = "nexus_zero_touch_popup_consumed_claim_ids_v1";
const POPUP_POLL_MS = 2500;
const CLAIM_POPUP_POLL_MS = 1800;
const SIMULATION_POPUP_WINDOW_MS = 15 * 60 * 1000;

function getPayoutReference(payout: any) {
  return String(payout?.id || payout?.claim?.id || payout?.claimId || "").trim();
}

function getPayoutId(payout: any) {
  return getPayoutReference(payout);
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
    simulationId,
    notificationKey: simulationId || getPayoutReference(input),
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
    presetLabel: resolveSimulationText(
      input?.preset_label,
      claim?.preset_label,
      claim?.jepData?.preset_label,
      jepData?.preset_label
    ),
  };
}

function getPayoutNotificationKey(payout: any) {
  return String(getSimulationPopupMetadata(payout).notificationKey || "").trim();
}

function normalizePayoutPayload(input: any) {
  if (!input) return null;

  const claim = input?.claim || null;
  const popupMeta = getSimulationPopupMetadata(input);
  const payoutReference = getPayoutReference(input);
  if (!popupMeta.notificationKey && !payoutReference) return null;

  const claimJepData =
    (typeof claim?.jepData === "object" && claim?.jepData !== null
      ? claim.jepData
      : typeof claim?.jep_data === "object" && claim?.jep_data !== null
        ? claim.jep_data
        : {}) as Record<string, unknown>;
  const payoutJepData =
    (typeof input?.jepData === "object" && input?.jepData !== null
      ? input.jepData
      : typeof input?.jep_data === "object" && input?.jep_data !== null
        ? input.jep_data
        : {}) as Record<string, unknown>;

  const popupTitle = popupMeta.popupTitle || "Zero-Touch Trigger";
  const ctaLabel = popupMeta.ctaLabel || "View Claim Status";
  const simulationId = popupMeta.simulationId || undefined;
  const popupDisplayAt = popupMeta.popupDisplayAt || undefined;
  const popupDelayMs = popupMeta.popupDelayMs ?? undefined;

  return {
    ...input,
    id: payoutReference,
    simulation_id: simulationId,
    popup_display_at: popupDisplayAt,
    popup_delay_ms: popupDelayMs,
    title: popupTitle,
    cta_label: ctaLabel,
    claim: claim
      ? {
          ...claim,
          jepData: {
            ...claimJepData,
            source: "admin_simulation",
            simulation_id: simulationId,
            popup_display_at: popupDisplayAt,
            popup_delay_ms: popupDelayMs,
            popup_title: popupTitle,
            popup_cta_label: ctaLabel,
            preset_label: popupMeta.presetLabel || claimJepData.preset_label,
          },
        }
      : null,
    jepData: {
      ...payoutJepData,
      source: "admin_simulation",
      simulation_id: simulationId,
      popup_display_at: popupDisplayAt,
      popup_delay_ms: popupDelayMs,
      popup_title: popupTitle,
      popup_cta_label: ctaLabel,
      preset_label: popupMeta.presetLabel || payoutJepData.preset_label,
    },
  };
}

function getPayoutDisplayTimestamp(payout: any) {
  const popupMeta = getSimulationPopupMetadata(payout);
  if (popupMeta.popupDisplayAt) {
    const parsed = new Date(popupMeta.popupDisplayAt).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (popupMeta.popupDelayMs && popupMeta.popupDelayMs > 0) {
    const baseTimestamp = new Date(
      resolveSimulationText(
        payout?.pulse_timestamp,
        payout?.dateISO,
        payout?.claim?.dateISO
      ) || new Date().toISOString()
    ).getTime();

    if (Number.isFinite(baseTimestamp)) {
      return baseTimestamp + popupMeta.popupDelayMs;
    }
  }

  return null;
}

function getPendingDelayMs(payout: any, popupAlreadyVisible: boolean) {
  const displayTimestamp = getPayoutDisplayTimestamp(payout);
  const scheduledDelay = displayTimestamp ? Math.max(0, displayTimestamp - Date.now()) : 0;
  return popupAlreadyVisible ? Math.max(scheduledDelay, 900) : scheduledDelay;
}

function parseAmountFromBody(body: string | undefined) {
  if (!body) return 0;
  const match = body.match(/Rs\s+([\d,]+)/i);
  return match ? Number(String(match[1]).replace(/,/g, "")) : 0;
}

function isRecentIsoDate(value: string | undefined, windowMs: number = SIMULATION_POPUP_WINDOW_MS) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Math.abs(Date.now() - timestamp) <= windowMs;
}

function findLatestPayoutItem(items: NexusNotificationPayload[]) {
  return [...items]
    .filter((item) => item.kind === "payout")
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
}

function buildPayoutPayloadFromClaim(claim: any) {
  if (!claim) return null;
  return normalizePayoutPayload({
    id: String(claim.id || "").trim(),
    amount: Number(claim.amount || 0),
    type: claim.type || "Automatic payout",
    reason: claim.reason || claim.summary?.wordedReason || "Autonomous protection trigger detected.",
    dateISO: claim.dateISO || new Date().toISOString(),
    claim,
  });
}

function isSimulationPayoutCandidate(input: any) {
  const payoutId = getPayoutId(input);
  const claim = input?.claim || input;
  const jepData = claim?.jepData || claim?.jep_data || {};
  const source = String(jepData?.source || "").toLowerCase();
  const simulationType = String(jepData?.simulation_type || "").trim();
  return payoutId.startsWith("SIM-") || source === "admin_simulation" || simulationType.length > 0;
}

function readConsumedPayoutIds() {
  try {
    const raw = localStorage.getItem(CONSUMED_PAYOUT_IDS_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value).trim()).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

function writeConsumedPayoutIds(ids: Set<string>) {
  localStorage.setItem(CONSUMED_PAYOUT_IDS_KEY, JSON.stringify(Array.from(ids)));
}

function consumePayoutId(payoutId: string | null) {
  if (!payoutId) return;
  const ids = readConsumedPayoutIds();
  ids.add(payoutId);
  writeConsumedPayoutIds(ids);
}

function hasConsumedPayoutId(payoutId: string | null) {
  if (!payoutId) return false;
  return readConsumedPayoutIds().has(payoutId);
}

function findNewestClaimPayload(claimId?: string | null) {
  const claims = [...getClaims()].sort((left, right) => {
    const leftTime = new Date(left.dateISO || 0).getTime();
    const rightTime = new Date(right.dateISO || 0).getTime();
    return rightTime - leftTime;
  });
  const lastDisplayedId = localStorage.getItem(LAST_DISPLAYED_PAYOUT_ID);

  const byId = claimId
    ? claims.find((candidate) => String(candidate.id).trim() === String(claimId).trim())
    : null;

  if (
    byId &&
    isSimulationPayoutCandidate(byId) &&
    getPayoutNotificationKey(byId) !== String(lastDisplayedId || "") &&
    !hasConsumedPayoutId(getPayoutNotificationKey(byId)) &&
    isRecentIsoDate(byId.dateISO)
  ) {
    return buildPayoutPayloadFromClaim(byId);
  }

  const latestApproved = claims.find((candidate) => {
    const status = String(candidate.status || "").toLowerCase();
    return (
      ["approved", "success", "paid", "completed", "processed"].includes(status) &&
      isSimulationPayoutCandidate(candidate) &&
      getPayoutNotificationKey(candidate) !== String(lastDisplayedId || "") &&
      !hasConsumedPayoutId(getPayoutNotificationKey(candidate)) &&
      isRecentIsoDate(candidate.dateISO)
    );
  });

  return buildPayoutPayloadFromClaim(latestApproved);
}

interface GlobalSimulationPopupProps {
  partnerId?: string | null;
  forcedPayout?: any | null;
  onForcedPayoutHandled?: () => void;
}

export default function GlobalSimulationPopup({
  partnerId: externalPartnerId = null,
  forcedPayout = null,
  onForcedPayoutHandled,
}: GlobalSimulationPopupProps) {
  const navigate = useNavigate();
  const [showAutoTrigger, setShowAutoTrigger] = useState(false);
  const [currentPayout, setCurrentPayout] = useState<any>(null);
  const [partnerId, setPartnerId] = useState<string | null>(() => externalPartnerId || getWorkerPartnerIdSnapshot());
  const showAutoTriggerRef = useRef(false);
  const pendingDisplayTimeoutRef = useRef<number | null>(null);
  const inboxPollingRef = useRef(false);
  const handledForcedPayoutRef = useRef<string | null>(null);
  const currentPayoutRef = useRef<any>(null);
  const dismissingPayoutIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentPayoutRef.current = currentPayout;
  }, [currentPayout]);

  const playAlertForPayout = (payoutId: string | null) => {
    if (!payoutId) return;
    if (localStorage.getItem(LAST_SOUNDED_PAYOUT_ID) === payoutId) return;

    localStorage.setItem(LAST_SOUNDED_PAYOUT_ID, payoutId);
    void playPayoutChime().catch((error) => {
      console.warn("Audio alert failed", error);
      localStorage.removeItem(LAST_SOUNDED_PAYOUT_ID);
    });
  };

  const clearPendingDisplayTimeout = () => {
    if (pendingDisplayTimeoutRef.current !== null) {
      window.clearTimeout(pendingDisplayTimeoutRef.current);
      pendingDisplayTimeoutRef.current = null;
    }
  };

  const wasAlreadyDisplayed = useCallback((payout: any) => {
    const notificationKey = getPayoutNotificationKey(payout);
    if (!notificationKey) return false;
    const displayedId = localStorage.getItem(LAST_DISPLAYED_PAYOUT_ID);
    const dismissedId = localStorage.getItem(LAST_DISMISSED_PAYOUT_ID);
    const dismissingId = dismissingPayoutIdRef.current;
    return (
      notificationKey === displayedId ||
      notificationKey === dismissedId ||
      notificationKey === dismissingId ||
      hasConsumedPayoutId(notificationKey)
    );
  }, []);

  const readPendingPayout = useCallback(() => {
    const pending = localStorage.getItem(PENDING_NOTIF_PAYLOAD);
    if (!pending) return null;

    try {
      const parsed = normalizePayoutPayload(JSON.parse(pending));
      if (!parsed || !isSimulationPayoutCandidate(parsed) || wasAlreadyDisplayed(parsed)) {
        localStorage.removeItem(PENDING_NOTIF_PAYLOAD);
        return null;
      }
      return parsed;
    } catch (error) {
      console.error("Failed to parse persistent payout", error);
      localStorage.removeItem(PENDING_NOTIF_PAYLOAD);
      return null;
    }
  }, [wasAlreadyDisplayed]);

  const openPopup = useCallback((payout: any) => {
    const normalizedPayout = normalizePayoutPayload(payout);
    const notificationKey = getPayoutNotificationKey(normalizedPayout);
    if (!normalizedPayout || !notificationKey) return;
    if (!isSimulationPayoutCandidate(normalizedPayout)) return;
    if (dismissingPayoutIdRef.current === notificationKey) return;

    setCurrentPayout(normalizedPayout);
    setShowAutoTrigger(true);
    localStorage.setItem(LAST_DISPLAYED_PAYOUT_ID, notificationKey);
    consumePayoutId(notificationKey);
    if (localStorage.getItem(LAST_DISMISSED_PAYOUT_ID) === notificationKey) {
      localStorage.removeItem(LAST_DISMISSED_PAYOUT_ID);
    }
    localStorage.removeItem(PENDING_NOTIF_PAYLOAD);
  }, []);

  const schedulePendingDisplay = useCallback(() => {
    clearPendingDisplayTimeout();

    const pending = readPendingPayout();
    if (!pending) return;

    const delayMs = getPendingDelayMs(pending, showAutoTriggerRef.current);

    pendingDisplayTimeoutRef.current = window.setTimeout(() => {
      pendingDisplayTimeoutRef.current = null;

      const latestPending = readPendingPayout();
      if (!latestPending) return;

      if (showAutoTriggerRef.current) {
        schedulePendingDisplay();
        return;
      }

      console.log("%c[GLOBAL] Displaying queued zero-touch payout", "color: #10b981; font-weight: bold;");
      openPopup(latestPending);
    }, delayMs);
  }, [openPopup, readPendingPayout]);

  const queueOrDisplayPayout = useCallback((payout: any) => {
    const normalizedPayout = normalizePayoutPayload(payout);
    if (!normalizedPayout || !isSimulationPayoutCandidate(normalizedPayout) || wasAlreadyDisplayed(normalizedPayout)) {
      return;
    }

    localStorage.setItem(PENDING_NOTIF_PAYLOAD, JSON.stringify(normalizedPayout));

    const delayMs = getPendingDelayMs(normalizedPayout, showAutoTriggerRef.current);

    if (showAutoTriggerRef.current || delayMs > 0) {
      schedulePendingDisplay();
      return;
    }

    openPopup(normalizedPayout);
  }, [openPopup, schedulePendingDisplay, wasAlreadyDisplayed]);

  const dismissPopup = useCallback((targetPayout?: any) => {
    const payout = targetPayout ?? currentPayoutRef.current;
    const notificationKey = getPayoutNotificationKey(payout);

    if (notificationKey) {
      dismissingPayoutIdRef.current = notificationKey;
      localStorage.setItem(LAST_DISPLAYED_PAYOUT_ID, notificationKey);
      localStorage.setItem(LAST_DISMISSED_PAYOUT_ID, notificationKey);
      consumePayoutId(notificationKey);
      handledForcedPayoutRef.current = notificationKey;
    }
    localStorage.removeItem(PENDING_NOTIF_PAYLOAD);
    clearPendingDisplayTimeout();
    setShowAutoTrigger(false);
    setCurrentPayout(null);
    window.dispatchEvent(new Event("nexus-payout-dismissed"));

    window.setTimeout(() => {
      if (dismissingPayoutIdRef.current === notificationKey) {
        dismissingPayoutIdRef.current = null;
      }
    }, 250);

    window.requestAnimationFrame(() => {
      onForcedPayoutHandled?.();
    });
  }, [onForcedPayoutHandled]);

  useEffect(() => {
    showAutoTriggerRef.current = showAutoTrigger;
    if (!showAutoTrigger) {
      schedulePendingDisplay();
    }
  }, [schedulePendingDisplay, showAutoTrigger]);

  useEffect(() => {
    if (!showAutoTrigger) return;
    const notificationKey = getPayoutNotificationKey(currentPayout);
    if (!notificationKey) return;

    playAlertForPayout(notificationKey);
  }, [dismissPopup, showAutoTrigger]);

  useEffect(() => {
    if (!showAutoTrigger) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissPopup();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showAutoTrigger, currentPayout]);

  useEffect(() => {
    primePayoutAudio();

    const refreshPartnerId = () => {
      const next = getWorkerPartnerIdSnapshot();
      setPartnerId((previous) => (previous === next ? previous : next));
    };

    refreshPartnerId();
    window.addEventListener("storage", refreshPartnerId);
    window.addEventListener("auth-change", refreshPartnerId);

    return () => {
      window.removeEventListener("storage", refreshPartnerId);
      window.removeEventListener("auth-change", refreshPartnerId);
    };
  }, []);

  useEffect(() => {
    if (!externalPartnerId) return;
    setPartnerId((previous) => (previous === externalPartnerId ? previous : externalPartnerId));
  }, [externalPartnerId]);

  useEffect(() => {
    const handleZeroTouch = (event: Event) => {
      const payout = (event as CustomEvent).detail;
      if (!isSimulationPayoutCandidate(payout)) return;
      console.log("%c[GLOBAL] Zero-Touch Payout Received", "background: #10b981; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;");
      queueOrDisplayPayout(payout);
    };

    const checkPersistentNotifications = () => {
      const payout = readPendingPayout();
      if (!payout) return;

      console.log("%c[GLOBAL] Recovering Persistent Payout", "color: #10b981; font-weight: bold;");
      queueOrDisplayPayout(payout);
    };

    window.addEventListener("nexus-zero-touch-payout", handleZeroTouch as EventListener);
    window.addEventListener("nexus-payout-update", checkPersistentNotifications);
    window.addEventListener("focus", checkPersistentNotifications);
    window.addEventListener("storage", checkPersistentNotifications);
    document.addEventListener("visibilitychange", checkPersistentNotifications);
    checkPersistentNotifications();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      checkPersistentNotifications();
    }, 1200);

    return () => {
      window.removeEventListener("nexus-zero-touch-payout", handleZeroTouch as EventListener);
      window.removeEventListener("nexus-payout-update", checkPersistentNotifications);
      window.removeEventListener("focus", checkPersistentNotifications);
      window.removeEventListener("storage", checkPersistentNotifications);
      document.removeEventListener("visibilitychange", checkPersistentNotifications);
      window.clearInterval(intervalId);
      clearPendingDisplayTimeout();
    };
  }, []);

  useEffect(() => {
    if (!partnerId) return;

    let cancelled = false;

    const pollInboxForPayouts = async () => {
      if (cancelled || inboxPollingRef.current || document.visibilityState !== "visible") return;
      inboxPollingRef.current = true;

      try {
        const response = await apiClient.get<NexusInboxResponse>(`/api/user/inbox?partnerId=${encodeURIComponent(partnerId)}`);
        if (cancelled) return;

        const latestPayout = findLatestPayoutItem(response.data?.items || []);
        if (!latestPayout) return;

        const claimId = String(latestPayout.metadata?.claimId || latestPayout.id.replace(/^claim-/, "")).trim();
        const lastDisplayedId = localStorage.getItem(LAST_DISPLAYED_PAYOUT_ID);
        if (claimId && (claimId === lastDisplayedId || hasConsumedPayoutId(claimId))) return;

        await syncWithServer(partnerId, "popup-inbox-fallback").catch(() => null);
        if (cancelled) return;

        const payoutPayload = normalizePayoutPayload(
          findNewestClaimPayload(claimId) || {
            id: claimId || latestPayout.id,
            amount: Number(parseAmountFromBody(latestPayout.body) || 0),
            type: latestPayout.title,
            reason: latestPayout.body,
            dateISO: latestPayout.createdAt,
          }
        );

        if (!isSimulationPayoutCandidate(payoutPayload)) return;

        queueOrDisplayPayout(payoutPayload);
        markNotificationsSeen([latestPayout.id]);
      } catch (error) {
        console.warn("[GLOBAL] Inbox payout poll failed", error);
      } finally {
        inboxPollingRef.current = false;
      }
    };

    void pollInboxForPayouts();
    const intervalId = window.setInterval(() => {
      void pollInboxForPayouts();
    }, POPUP_POLL_MS);

    const handleFocus = () => {
      void pollInboxForPayouts();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [partnerId, queueOrDisplayPayout]);

  useEffect(() => {
    if (!forcedPayout) return;

    const normalizedForcedPayout = normalizePayoutPayload(forcedPayout);
    const forcedId = getPayoutNotificationKey(normalizedForcedPayout);
    if (!forcedId) return;
    if (!isSimulationPayoutCandidate(normalizedForcedPayout)) {
      onForcedPayoutHandled?.();
      return;
    }
    if (wasAlreadyDisplayed(normalizedForcedPayout)) {
      handledForcedPayoutRef.current = forcedId;
      onForcedPayoutHandled?.();
      return;
    }
    if (handledForcedPayoutRef.current === forcedId) return;

    handledForcedPayoutRef.current = forcedId;
    queueOrDisplayPayout(normalizedForcedPayout);
    onForcedPayoutHandled?.();
  }, [forcedPayout, onForcedPayoutHandled, queueOrDisplayPayout, wasAlreadyDisplayed]);

  useEffect(() => {
    if (!partnerId) return;

    let cancelled = false;
    let claimPolling = false;

    const pollClaimsForPayouts = async () => {
      if (
        cancelled ||
        claimPolling ||
        showAutoTriggerRef.current ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const pending = readPendingPayout();
      if (pending) {
        queueOrDisplayPayout(pending);
        return;
      }

      claimPolling = true;

      try {
        await syncWithServer(partnerId, "popup-claim-fallback").catch(() => null);
        if (cancelled) return;

        const latestClaimPayout = findNewestClaimPayload();
        if (!latestClaimPayout) return;

        queueOrDisplayPayout(latestClaimPayout);
      } catch (error) {
        console.warn("[GLOBAL] Claim payout poll failed", error);
      } finally {
        claimPolling = false;
      }
    };

    void pollClaimsForPayouts();
    const intervalId = window.setInterval(() => {
      void pollClaimsForPayouts();
    }, CLAIM_POPUP_POLL_MS);

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void pollClaimsForPayouts();
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [partnerId, queueOrDisplayPayout, readPendingPayout]);

  const popupMeta = getSimulationPopupMetadata(currentPayout);
  const payoutReference = String(
    currentPayout?.claim?.id ||
    currentPayout?.id ||
    currentPayout?.simulation_id ||
    "NX-SIM-482"
  ).trim();
  const payoutAmount = Number(currentPayout?.amount || currentPayout?.claim?.amount || 0);
  const payoutType = String(currentPayout?.type || currentPayout?.claim?.type || "Disruption").trim();
  const payoutTitle = popupMeta.popupTitle || "Zero-Touch Trigger";
  const payoutCtaLabel = popupMeta.ctaLabel || "View Claim Status";
  const payoutPresetLabel = popupMeta.presetLabel || payoutType || "Payout";
  const payoutDescription =
    currentPayout?.reason ||
    currentPayout?.claim?.summary?.wordedReason ||
    `${payoutType} auto-triggered payout detected in your zone. Your payout has been processed instantly.`;
  const payoutNavigationTarget =
    currentPayout?.claim?.id || (payoutReference && !currentPayout?.isFallback)
      ? `/payout-success/${currentPayout?.claim?.id || payoutReference}`
      : "/wallet";
  const payoutStatusLabel = currentPayout?.isFallback ? "Syncing payout" : "Zero-touch ready";

  return (
    <AnimatePresence>
      {showAutoTrigger && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-xl pointer-events-auto"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              dismissPopup(currentPayoutRef.current);
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            className="relative w-full max-w-[24rem] overflow-hidden rounded-[2rem] border border-[#2d2a24] bg-[#111111]/96 px-5 py-5 shadow-[0_34px_120px_rgba(0,0,0,0.68)] sm:px-6 sm:py-6"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,166,35,0.16),transparent_34%),radial-gradient(circle_at_50%_16%,rgba(16,185,129,0.12),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
            <div className="pointer-events-none absolute inset-[1px] rounded-[calc(2rem-1px)] border border-white/7" />

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dismissPopup(currentPayoutRef.current);
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dismissPopup(currentPayoutRef.current);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  dismissPopup(currentPayoutRef.current);
                }
              }}
              className="absolute right-4 top-4 z-30 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/[0.03] text-white/55 transition-colors hover:bg-white/10 hover:text-white active:scale-95 pointer-events-auto touch-manipulation"
              aria-label="Close payout popup"
            >
              <X size={15} />
            </button>

            <div className="relative z-10 flex flex-col items-center text-center pt-2">
              <motion.div
                initial={{ scale: 0.9, opacity: 0.8 }}
                animate={{ scale: [0.98, 1.04, 1], opacity: 1 }}
                transition={{ duration: 0.65, ease: "easeOut" }}
                className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/14 shadow-[0_0_0_10px_rgba(16,185,129,0.05),0_0_30px_rgba(16,185,129,0.18)]"
              >
                <Zap className="h-8 w-8 text-emerald-300" />
              </motion.div>

              <div className="mb-5">
                <h2 className="text-[1.7rem] font-black tracking-tight text-white sm:text-[1.8rem]">
                  {payoutTitle}
                </h2>
                <p className="mx-auto mt-3 max-w-[18rem] text-[0.98rem] leading-6 text-white/64">
                  {payoutDescription}
                </p>
              </div>

              <div className="mb-5 w-full rounded-[1.45rem] border border-white/8 bg-black/40 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/35">
                      Payout amount
                    </div>
                    <div className="mt-2 text-[1.65rem] font-black tracking-tight text-emerald-400">
                      Rs {payoutAmount ? payoutAmount.toLocaleString("en-IN") : "---"}
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                    {payoutPresetLabel}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
                  <div>
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/32">
                      Ref ID
                    </div>
                    <div className="mt-1 truncate font-mono text-[0.78rem] text-white/72">
                      {payoutReference}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/32">
                      Status
                    </div>
                    <div className="mt-1 text-[0.84rem] font-semibold text-white/72">
                      {payoutStatusLabel}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  dismissPopup();
                  navigate(payoutNavigationTarget);
                }}
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-[1.15rem] bg-primary px-5 text-base font-black text-primary-foreground shadow-[0_18px_42px_rgba(245,166,35,0.3)] transition-all hover:bg-primary/95 hover:shadow-[0_22px_54px_rgba(245,166,35,0.38)] active:scale-[0.99]"
              >
                {payoutCtaLabel}
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
