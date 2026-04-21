import { readSecureValue, saveSecureValue } from "./deviceCapabilities";

const WORKER_STATE_MIRROR_KEY = "nexus_worker_state_mirror_v1";
const WORKER_STATE_VERSION = 1;

const MIRRORED_KEYS = [
  "partner_id",
  "signin_phone",
  "signin_platform",
  "specific_platform",
  "nexus_profile_name",
  "nexus_profile_upi",
  "nexus_aadhaar_number",
  "nexus_last_lat",
  "nexus_last_lng",
  "nexus_wallet_balance",
  "nexus_payment_methods",
  "nexus_claims",
  "nexus_transactions",
  "nexus_notifications",
  "nexus_notifications_read_ids",
  "nexus_last_seen_claim_id",
  "nexus_pending_payout_notif",
  "nexus_premium_tier",
  "nexus_premium_until",
  "nexus_premium_upgraded",
  "biometric_token",
] as const;

const EXCLUDED_KEYS = new Set<string>([
  WORKER_STATE_MIRROR_KEY,
  "nexus_api_base_override",
  "nexus-theme",
]);

type MirroredKey = (typeof MIRRORED_KEYS)[number];

export interface WorkerStateSnapshot {
  version: number;
  capturedAt: string;
  partnerId: string | null;
  local: Partial<Record<MirroredKey, string>>;
}

let initialized = false;
let listenersBound = false;
let applyingSnapshot = false;
let serverHydrationInFlight = false;
let mirrorTimer: number | null = null;
let remoteTimer: number | null = null;
let hydratePromise: Promise<void> | null = null;

let rawSetItem: Storage["setItem"] | null = null;
let rawRemoveItem: Storage["removeItem"] | null = null;
let rawClear: Storage["clear"] | null = null;

function canUseWindow() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizedIdentity(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCurrentWorkerIdentity() {
  if (!canUseWindow()) return null;
  return (
    normalizedIdentity(localStorage.getItem("partner_id")) ||
    normalizedIdentity(localStorage.getItem("signin_phone"))
  );
}

function shouldTrackKey(key: string) {
  return MIRRORED_KEYS.includes(key as MirroredKey);
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getRawStorageApi() {
  if (!rawSetItem || !rawRemoveItem || !rawClear) {
    rawSetItem = Storage.prototype.setItem;
    rawRemoveItem = Storage.prototype.removeItem;
    rawClear = Storage.prototype.clear;
  }

  return {
    setItem: rawSetItem!,
    removeItem: rawRemoveItem!,
    clear: rawClear!,
  };
}

function readLocalSnapshot(): WorkerStateSnapshot | null {
  if (!canUseWindow()) return null;

  const local: Partial<Record<MirroredKey, string>> = {};
  MIRRORED_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (typeof value === "string" && value.length > 0) {
      local[key] = value;
    }
  });

  const partnerId =
    normalizedIdentity(local.partner_id || null) ||
    normalizedIdentity(local.signin_phone || null);

  if (!partnerId && Object.keys(local).length === 0) {
    return null;
  }

  return {
    version: WORKER_STATE_VERSION,
    capturedAt: new Date().toISOString(),
    partnerId,
    local,
  };
}

function applyLocalSnapshot(snapshot: WorkerStateSnapshot | null, source: "secure" | "server") {
  if (!canUseWindow() || !snapshot?.local) return;

  const currentIdentity = getCurrentWorkerIdentity();
  if (
    source === "secure" &&
    currentIdentity &&
    snapshot.partnerId &&
    currentIdentity !== snapshot.partnerId &&
    currentIdentity !== snapshot.local.signin_phone
  ) {
    return;
  }

  const { setItem, removeItem } = getRawStorageApi();
  applyingSnapshot = true;
  try {
    Object.entries(snapshot.local).forEach(([key, value]) => {
      if (!shouldTrackKey(key)) return;
      if (typeof value === "string" && value.length > 0) {
        setItem.call(localStorage, key, value);
      } else if (source === "server") {
        removeItem.call(localStorage, key);
      }
    });

    if (snapshot.partnerId) {
      setItem.call(localStorage, "partner_id", snapshot.partnerId);
    }
  } finally {
    applyingSnapshot = false;
  }

  window.dispatchEvent(new Event("auth-change"));
  window.dispatchEvent(new Event("nexus-payout-update"));
  window.dispatchEvent(new CustomEvent("nexus-worker-state-hydrated", { detail: { source } }));
}

async function mirrorSnapshotToSecureStore(snapshot: WorkerStateSnapshot | null) {
  if (!snapshot) return;
  await saveSecureValue(WORKER_STATE_MIRROR_KEY, JSON.stringify(snapshot));
}

async function hydrateFromSecureMirror() {
  const raw = await readSecureValue(WORKER_STATE_MIRROR_KEY);
  const snapshot = safeJsonParse<WorkerStateSnapshot | null>(raw, null);
  if (snapshot?.local) {
    applyLocalSnapshot(snapshot, "secure");
  }
}

async function fetchWorkerStateSnapshot(partnerId: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`/api/user/state?partnerId=${encodeURIComponent(partnerId)}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { snapshot?: WorkerStateSnapshot | null };
    return data?.snapshot || null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postWorkerStateSnapshot(snapshot: WorkerStateSnapshot, reason: string) {
  if (!snapshot.partnerId) return;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);

  try {
    await fetch("/api/user/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        partnerId: snapshot.partnerId,
        snapshot,
        reason,
      }),
    });
  } catch {
    // Best-effort bridge. Local and secure-state durability remains intact even if the network is down.
  } finally {
    window.clearTimeout(timeout);
  }
}

function flushTimers() {
  if (mirrorTimer !== null) {
    window.clearTimeout(mirrorTimer);
    mirrorTimer = null;
  }
  if (remoteTimer !== null) {
    window.clearTimeout(remoteTimer);
    remoteTimer = null;
  }
}

async function flushSnapshot(reason: string) {
  if (!canUseWindow()) return;
  const snapshot = readLocalSnapshot();
  if (!snapshot) return;

  await mirrorSnapshotToSecureStore(snapshot);
  if (navigator.onLine !== false && snapshot.partnerId) {
    await postWorkerStateSnapshot(snapshot, reason);
  }
}

function scheduleSnapshotFlush(reason: string) {
  if (!canUseWindow() || applyingSnapshot) return;

  if (mirrorTimer !== null) window.clearTimeout(mirrorTimer);
  mirrorTimer = window.setTimeout(() => {
    void flushSnapshot(`${reason}:mirror`);
  }, 500); // Increased from 250ms

  if (remoteTimer !== null) window.clearTimeout(remoteTimer);
  remoteTimer = window.setTimeout(() => {
    void flushSnapshot(`${reason}:remote`);
  }, 6000); // Increased from 1200ms to reduce server socket pressure
}

function installStorageObserver() {
  if (!canUseWindow() || initialized) return;

  const { setItem, removeItem, clear } = getRawStorageApi();

  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    const prevValue = localStorage.getItem(key);
    setItem.call(this, key, value);
    
    // Only trigger heavy flushes if the value actually changed and it's a mirrored key
    if (this === localStorage && !applyingSnapshot && prevValue !== value && shouldTrackKey(String(key))) {
      scheduleSnapshotFlush(`set:${String(key)}`);
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
    const exists = localStorage.getItem(key) !== null;
    removeItem.call(this, key);
    if (this === localStorage && !applyingSnapshot && exists && shouldTrackKey(String(key))) {
      scheduleSnapshotFlush(`remove:${String(key)}`);
    }
  };

  Storage.prototype.clear = function patchedClear() {
    clear.call(this);
    if (this === localStorage && !applyingSnapshot) {
      scheduleSnapshotFlush("clear");
    }
  };

  initialized = true;
}

function bindBridgeListeners() {
  if (!canUseWindow() || listenersBound) return;

  window.addEventListener("auth-change", () => {
    scheduleSnapshotFlush("auth-change");
    void hydrateWorkerStateFromSupabase();
  });
  window.addEventListener("nexus-payout-update", () => scheduleSnapshotFlush("payout-update"));
  window.addEventListener("nexus-offline-queue-update", () => scheduleSnapshotFlush("offline-queue"));
  window.addEventListener("storage", () => scheduleSnapshotFlush("storage-event"));
  window.addEventListener("online", () => {
    scheduleSnapshotFlush("online");
    void hydrateWorkerStateFromSupabase();
  });
  window.addEventListener("beforeunload", () => {
    const snapshot = readLocalSnapshot();
    if (!snapshot) return;
    try {
      localStorage.setItem(WORKER_STATE_MIRROR_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore unload race failures.
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushSnapshot("hidden");
    } else if (document.visibilityState === "visible") {
      void hydrateWorkerStateFromSupabase();
    }
  });

  listenersBound = true;
}

export async function initializePersistedWorkerStateBridge() {
  if (!canUseWindow()) return;
  installStorageObserver();
  bindBridgeListeners();

  if (!hydratePromise) {
    hydratePromise = hydrateFromSecureMirror().finally(() => {
      hydratePromise = null;
    });
  }

  await hydratePromise;
  scheduleSnapshotFlush("bootstrap");
}

export async function hydrateWorkerStateFromSupabase() {
  if (!canUseWindow()) return;
  if (serverHydrationInFlight) return;

  const partnerId = getCurrentWorkerIdentity();
  if (!partnerId) return;

  serverHydrationInFlight = true;
  try {
    const snapshot = await fetchWorkerStateSnapshot(partnerId);
    if (!snapshot) return;

    applyLocalSnapshot(snapshot, "server");
    await mirrorSnapshotToSecureStore(snapshot);
  } finally {
    serverHydrationInFlight = false;
  }
}

export async function flushPersistedWorkerState(reason = "manual") {
  flushTimers();
  await flushSnapshot(reason);
}
