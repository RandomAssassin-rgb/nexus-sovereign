import { readSecureValue, removeSecureValue, saveSecureValue } from "./deviceCapabilities";

const SESSION_BRIDGE_KEY = "nexus_session_bridge_v1";

export interface NexusSessionBridgeState {
  partner_id?: string | null;
  nexus_session?: string | null; // Unified session object (JSON)
  signin_platform?: string | null;
  signin_phone?: string | null;
  admin_id?: string | null;
  admin_role?: string | null;
  admin_code?: string | null;
  biometric_token?: string | null;
}

const SESSION_KEYS: Array<keyof NexusSessionBridgeState> = [
  "partner_id",
  "nexus_session",
  "signin_platform",
  "signin_phone",
  "admin_id",
  "admin_role",
  "admin_code",
  "biometric_token"
];

function captureCurrentSessionState(): NexusSessionBridgeState {
  if (typeof window === "undefined") return {};

  return SESSION_KEYS.reduce<NexusSessionBridgeState>((state, key) => {
    state[key] = localStorage.getItem(key);
    return state;
  }, {});
}

function applySessionState(state: NexusSessionBridgeState) {
  if (typeof window === "undefined") return;

  SESSION_KEYS.forEach((key) => {
    const value = state[key];
    if (typeof value === "string" && value.length > 0) {
      localStorage.setItem(key, value);
    }
  });
}

async function readPersistedBridgeState() {
  try {
    const raw = await readSecureValue(SESSION_BRIDGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as NexusSessionBridgeState) : {};
  } catch {
    return {};
  }
}

export async function persistSessionBridge(
  overrides: Partial<NexusSessionBridgeState> = {}
): Promise<NexusSessionBridgeState> {
  const persisted = await readPersistedBridgeState();
  const current = captureCurrentSessionState();
  const next: NexusSessionBridgeState = {
    ...persisted,
    ...current,
    ...overrides,
  };

  applySessionState(next);
  await saveSecureValue(SESSION_BRIDGE_KEY, JSON.stringify(next));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-change"));
    if (next.admin_id) {
      window.dispatchEvent(new Event("admin-auth-change"));
    }
  }
  return next;
}

export async function restoreSessionBridge(): Promise<NexusSessionBridgeState> {
  const persisted = await readPersistedBridgeState();
  applySessionState(persisted);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-change"));
    if (persisted.admin_id) {
      window.dispatchEvent(new Event("admin-auth-change"));
    }
  }
  return persisted;
}

export async function clearSessionBridge() {
  if (typeof window !== "undefined") {
    SESSION_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem("dummy_session"); // Legacy cleanup
  }
  await removeSecureValue(SESSION_BRIDGE_KEY);
  window.dispatchEvent(new Event("auth-change"));
  window.dispatchEvent(new Event("admin-auth-change"));
}
