import axios from "axios";
import { getRuntimePlatform, isHttpOrigin, isNativePlatform } from "./platform";
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}
function getWindowOrigin() {
    if (typeof window === "undefined")
        return "";
    return window.location.origin;
}
export function getApiBaseUrl() {
    if (typeof window === "undefined")
        return "";
    const override = localStorage.getItem("nexus_api_base_override")?.trim();
    const envBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
    const windowOrigin = getWindowOrigin();
    const native = isNativePlatform();
    if (override && isHttpOrigin(override)) {
        return trimTrailingSlash(override);
    }
    if (envBase && isHttpOrigin(envBase)) {
        return trimTrailingSlash(envBase);
    }
    if (!native && isHttpOrigin(windowOrigin)) {
        return "";
    }
    if (native && isHttpOrigin(windowOrigin)) {
        return trimTrailingSlash(windowOrigin);
    }
    return native ? "https://localhost:3000" : "";
}
export function resolveApiUrl(input) {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl)
        return input;
    if (input instanceof URL) {
        return input;
    }
    if (typeof input === "string" && input.startsWith("/api/")) {
        return new URL(input, `${baseUrl}/`).toString();
    }
    if (typeof Request !== "undefined" && input instanceof Request && input.url.startsWith("/api/")) {
        return new Request(new URL(input.url, `${baseUrl}/`).toString(), input);
    }
    return input;
}
export function setApiBaseOverride(value) {
    if (typeof window === "undefined")
        return;
    if (value && isHttpOrigin(value)) {
        localStorage.setItem("nexus_api_base_override", trimTrailingSlash(value));
    }
    else {
        localStorage.removeItem("nexus_api_base_override");
    }
}
export const apiClient = axios;
export function initializeApiRuntime() {
    if (typeof window === "undefined") {
        return { baseUrl: "", platform: "unknown", isNative: false };
    }
    const snapshot = {
        baseUrl: getApiBaseUrl(),
        platform: getRuntimePlatform(),
        isNative: isNativePlatform(),
    };
    apiClient.defaults.withCredentials = true;
    apiClient.defaults.headers.common["X-Nexus-Platform"] = snapshot.platform;
    if (snapshot.baseUrl) {
        apiClient.defaults.baseURL = snapshot.baseUrl;
    }
    if (!apiClient.defaults.__nexusInterceptorAttached) {
        apiClient.defaults.timeout = 10000; // 10s global timeout
        apiClient.interceptors.request.use(async (config) => {
            // 1. Resolve relative URLs if a separate base URL is set (standard for native apps)
            if (config.url?.startsWith("/api/") && snapshot.baseUrl) {
                config.url = new URL(config.url, `${snapshot.baseUrl}/`).toString();
            }
            const headers = (config.headers || {});
            headers["X-Nexus-Platform"] = snapshot.platform;
            // 2. Production Auth Injection (JWT + Optional Master Secret)
            try {
                const { supabase } = await import("./supabase");
                // SPEED FIX: Race the session check to prevent hanging if Supabase is slow/unreachable
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Supabase session timeout")), 500));
                const sessionRes = await Promise.race([sessionPromise, timeoutPromise])
                    .catch((e) => {
                    console.warn("[ApiClient] Supabase session check bypassed:", e.message);
                    return { data: { session: null } };
                });
                const session = sessionRes.data?.session;
                if (session?.access_token) {
                    headers["Authorization"] = `Bearer ${session.access_token}`;
                }
                // Optional: Mastery layer secret for specific high-privilege operations
                const adminSecret = localStorage.getItem("nexus_admin_secret") ||
                    localStorage.getItem("admin_secret_key");
                if (adminSecret) {
                    headers["X-Admin-Secret"] = adminSecret;
                }
            }
            catch (e) {
                console.error("[ApiClient] Fatal interceptor error", e);
            }
            config.headers = headers;
            return config;
        });
        apiClient.defaults.__nexusInterceptorAttached = true;
    }
    if (!window.__NEXUS_FETCH_PATCHED__) {
        const originalFetch = window.fetch.bind(window);
        window.fetch = ((input, init) => {
            return originalFetch(resolveApiUrl(input), init);
        });
        window.__NEXUS_FETCH_PATCHED__ = true;
    }
    window.__NEXUS_API_RUNTIME__ = snapshot;
    return snapshot;
}
//# sourceMappingURL=apiClient.js.map