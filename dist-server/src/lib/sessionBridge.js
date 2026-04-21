import { readSecureValue, removeSecureValue, saveSecureValue } from "./deviceCapabilities";
const SESSION_BRIDGE_KEY = "nexus_session_bridge_v1";
const SESSION_KEYS = [
    "partner_id",
    "nexus_session",
    "signin_platform",
    "signin_phone",
    "admin_id",
    "admin_role",
    "admin_code",
    "biometric_token"
];
function captureCurrentSessionState() {
    if (typeof window === "undefined")
        return {};
    return SESSION_KEYS.reduce((state, key) => {
        state[key] = localStorage.getItem(key);
        return state;
    }, {});
}
function applySessionState(state) {
    if (typeof window === "undefined")
        return;
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
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed ? parsed : {};
    }
    catch {
        return {};
    }
}
export async function persistSessionBridge(overrides = {}) {
    const persisted = await readPersistedBridgeState();
    const current = captureCurrentSessionState();
    const next = {
        ...persisted,
        ...current,
        ...overrides,
    };
    await saveSecureValue(SESSION_BRIDGE_KEY, JSON.stringify(next));
    return next;
}
export async function restoreSessionBridge() {
    const persisted = await readPersistedBridgeState();
    applySessionState(persisted);
    return persisted;
}
export async function clearSessionBridge() {
    if (typeof window !== "undefined") {
        SESSION_KEYS.forEach(key => localStorage.removeItem(key));
        localStorage.removeItem("dummy_session"); // Legacy cleanup
    }
    await removeSecureValue(SESSION_BRIDGE_KEY);
    window.dispatchEvent(new Event("auth-change"));
}
//# sourceMappingURL=sessionBridge.js.map