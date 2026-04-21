import axios from "axios";
import { getRuntimePlatform, isHttpOrigin, isNativePlatform } from "./platform";

declare global {
  interface Window {
    __NEXUS_FETCH_PATCHED__?: boolean;
    __NEXUS_API_RUNTIME__?: ApiRuntimeSnapshot;
  }
}

export interface ApiRuntimeSnapshot {
  baseUrl: string;
  platform: ReturnType<typeof getRuntimePlatform>;
  isNative: boolean;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function parseCandidateList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => isHttpOrigin(entry))
    .map(trimTrailingSlash);
}

function getWindowOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const LOCAL_DEV_API_CANDIDATES = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3001",
  "http://localhost:3001",
];

function isLoopbackOrigin(origin: string) {
  if (!isHttpOrigin(origin)) return false;

  try {
    return isLoopbackHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function isLoopbackWebRuntime(snapshot: ApiRuntimeSnapshot) {
  return !snapshot.isNative && isLoopbackOrigin(getWindowOrigin());
}

function isApiRequestUrl(url: string | undefined) {
  if (!url) return false;
  if (url.startsWith("/api/")) return true;

  if (isHttpOrigin(url)) {
    try {
      return new URL(url).pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }

  return false;
}

function looksLikeHtmlResponse(response: { data?: unknown; headers?: unknown } | undefined) {
  if (!response) return false;

  let contentType = "";
  const headers = response.headers as
    | { get?: (name: string) => string | null; [key: string]: unknown }
    | undefined;

  if (typeof headers?.get === "function") {
    contentType = headers.get("content-type") || "";
  } else if (headers && typeof headers === "object") {
    const headerValue = headers["content-type"] ?? headers["Content-Type"];
    if (typeof headerValue === "string") {
      contentType = headerValue;
    } else if (Array.isArray(headerValue)) {
      contentType = headerValue.join("; ");
    }
  }

  if (contentType.toLowerCase().includes("text/html")) {
    return true;
  }

  return typeof response.data === "string" && /<!doctype html|<html/i.test(response.data);
}

async function probeApiBase(candidate: string, timeoutMs = 1200) {
  if (typeof window === "undefined") return false;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timeout = window.setTimeout(() => controller?.abort(), timeoutMs);

  try {
    const response = await window.fetch(`${trimTrailingSlash(candidate)}/api/system/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller?.signal,
    });

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("application/json")) {
      return false;
    }

    const payload = await response.json().catch(() => null);
    return payload?.ok === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

function getApiBaseCandidates() {
  if (typeof window === "undefined") return [];

  const override = localStorage.getItem("nexus_api_base_override")?.trim();
  const lastSuccessful = localStorage.getItem("nexus_last_successful_api_base")?.trim();
  const envBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  const envCandidates = parseCandidateList(String(import.meta.env.VITE_API_BASE_CANDIDATES || ""));
  const windowOrigin = getWindowOrigin();
  const native = isNativePlatform();

  const candidates = new Set<string>();

  if (override && isHttpOrigin(override)) {
    candidates.add(trimTrailingSlash(override));
  }

  if (lastSuccessful && isHttpOrigin(lastSuccessful)) {
    candidates.add(trimTrailingSlash(lastSuccessful));
  }

  envCandidates.forEach((candidate) => candidates.add(candidate));

  if (envBase && isHttpOrigin(envBase)) {
    candidates.add(trimTrailingSlash(envBase));
  }

  if (!native && isHttpOrigin(windowOrigin)) {
    if (isLoopbackOrigin(windowOrigin)) {
      LOCAL_DEV_API_CANDIDATES.forEach((candidate) => candidates.add(candidate));
    }
    return Array.from(candidates);
  }

  if (native && isHttpOrigin(windowOrigin)) {
    try {
      const parsed = new URL(windowOrigin);
      if (!isLoopbackHost(parsed.hostname)) {
        candidates.add(trimTrailingSlash(windowOrigin));
      }
    } catch {
      // noop
    }
  }

  if (native) {
    [
      "http://10.0.2.2:3001",
      "http://10.0.3.2:3001",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "https://10.0.2.2:3000",
      "https://10.0.3.2:3000",
    ].forEach((candidate) => candidates.add(candidate));
  }

  return Array.from(candidates);
}

function remapApiUrl(url: string | undefined, nextBase: string) {
  if (!url) return url;

  if (url.startsWith("/api/")) {
    return new URL(url, `${nextBase}/`).toString();
  }

  if (isHttpOrigin(url)) {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/api/")) {
      return new URL(`${parsed.pathname}${parsed.search}`, `${nextBase}/`).toString();
    }
  }

  return url;
}

export function getApiBaseUrl() {
  if (typeof window === "undefined") return "";

  const windowOrigin = getWindowOrigin();
  const native = isNativePlatform();
  const candidates = getApiBaseCandidates();
  const preferred = candidates[0];

  if (!native && isHttpOrigin(windowOrigin)) {
    return "";
  }

  if (preferred) {
    return preferred;
  }

  return native ? "http://10.0.2.2:3001" : "";
}

export function resolveApiUrl(input: RequestInfo | URL) {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) return input;

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

export function setApiBaseOverride(value: string | null) {
  if (typeof window === "undefined") return;

  if (value && isHttpOrigin(value)) {
    localStorage.setItem("nexus_api_base_override", trimTrailingSlash(value));
  } else {
    localStorage.removeItem("nexus_api_base_override");
  }
}

export const apiClient = axios;

export function initializeApiRuntime(): ApiRuntimeSnapshot {
  if (typeof window === "undefined") {
    return { baseUrl: "", platform: "unknown", isNative: false };
  }

  const snapshot: ApiRuntimeSnapshot = {
    baseUrl: getApiBaseUrl(),
    platform: getRuntimePlatform(),
    isNative: isNativePlatform(),
  };

  apiClient.defaults.withCredentials = true;
  apiClient.defaults.headers.common["X-Nexus-Platform"] = snapshot.platform;
  
  if (snapshot.baseUrl) {
    apiClient.defaults.baseURL = snapshot.baseUrl;
  }

  if (!(apiClient.defaults as any).__nexusInterceptorAttached) {
    apiClient.defaults.timeout = snapshot.isNative ? 3500 : 10000;

    apiClient.interceptors.request.use(async (config) => {
      // 1. Resolve relative URLs if a separate base URL is set (standard for native apps)
      if (config.url?.startsWith("/api/") && snapshot.baseUrl) {
        config.url = new URL(config.url, `${snapshot.baseUrl}/`).toString();
      }
      
      const headers = (config.headers || {}) as Record<string, any>;
      headers["X-Nexus-Platform"] = snapshot.platform;

      // 2. Production Auth Injection (JWT + Optional Master Secret)
      try {
          const { supabase } = await import("./supabase");
          
          // SPEED FIX: Race the session check to prevent hanging if Supabase is slow/unreachable
          // Reduced to 800ms for ultra-fast demo engine response.
          const sessionRes = await (supabase.auth.getSession() as any)
            .abortSignal(AbortSignal.timeout(800))
            .catch((e: any) => {
              console.warn("[ApiClient] Supabase session check bypassed (Fast-Track Demo Engine):", e.message);
              return { data: { session: null } };
            }) as any;

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
      } catch (e) {
          console.error("[ApiClient] Fatal interceptor error", e);
      }

      config.headers = headers as any;
      return config;
    });

    (apiClient.defaults as any).__nexusInterceptorAttached = true;
  }

  if (!(apiClient.defaults as any).__nexusResponseInterceptorAttached) {
    apiClient.interceptors.response.use(
      (response) => {
        try {
          const requestUrl = remapApiUrl(response.config.url, response.config.baseURL || snapshot.baseUrl || window.location.origin);
          if (requestUrl && isHttpOrigin(requestUrl)) {
            const parsed = new URL(requestUrl);
            const successfulBase = `${parsed.protocol}//${parsed.host}`;
            localStorage.setItem("nexus_last_successful_api_base", successfulBase);
            if (snapshot.isNative) {
              apiClient.defaults.baseURL = successfulBase;
              snapshot.baseUrl = successfulBase;
              window.__NEXUS_API_RUNTIME__ = snapshot;
            }
          }
        } catch {
          // noop
        }
        return response;
      },
      async (error) => {
        const config = error?.config;
        const localWebFallback = isLoopbackWebRuntime(snapshot);
        const shouldRetry =
          Boolean(config) &&
          isApiRequestUrl(config?.url) &&
          !config.__nexusBaseRetried &&
          (
            (snapshot.isNative && !error?.response) ||
            (
              localWebFallback &&
              (
                !error?.response ||
                looksLikeHtmlResponse(error.response) ||
                [404, 405, 502, 503, 504].includes(Number(error?.response?.status))
              )
            )
          );

        if (!shouldRetry) {
          return Promise.reject(error);
        }

        const currentBase = config.baseURL || snapshot.baseUrl || "";
        const candidates = getApiBaseCandidates().filter((candidate) => candidate && candidate !== currentBase);

        for (const candidate of candidates) {
          const healthy = await probeApiBase(candidate, 1000);
          if (!healthy) continue;

          try {
            const retryConfig = {
              ...config,
              baseURL: candidate,
              url: remapApiUrl(config.url, candidate),
              timeout: 2500,
              __nexusBaseRetried: true,
            };

            const response = await apiClient.request(retryConfig);
            localStorage.setItem("nexus_last_successful_api_base", candidate);
            apiClient.defaults.baseURL = candidate;
            snapshot.baseUrl = candidate;
            window.__NEXUS_API_RUNTIME__ = snapshot;
            return response;
          } catch {
            // try next candidate
          }
        }

        return Promise.reject(error);
      },
    );

    (apiClient.defaults as any).__nexusResponseInterceptorAttached = true;
  }

  if (!window.__NEXUS_FETCH_PATCHED__) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      return originalFetch(resolveApiUrl(input), init);
    }) as typeof window.fetch;
    window.__NEXUS_FETCH_PATCHED__ = true;
  }

  if (snapshot.isNative || isLoopbackWebRuntime(snapshot)) {
    const bootCandidates = getApiBaseCandidates();
    void (async () => {
      if (isLoopbackWebRuntime(snapshot)) {
        const sameOriginHealthy = await probeApiBase(window.location.origin, 800);
        if (sameOriginHealthy) {
          window.__NEXUS_API_RUNTIME__ = snapshot;
          return;
        }
      }

      for (const candidate of bootCandidates) {
        const healthy = await probeApiBase(candidate);
        if (!healthy) continue;

        localStorage.setItem("nexus_last_successful_api_base", candidate);
        apiClient.defaults.baseURL = candidate;
        snapshot.baseUrl = candidate;
        window.__NEXUS_API_RUNTIME__ = snapshot;
        break;
      }
    })();
  }

  window.__NEXUS_API_RUNTIME__ = snapshot;
  return snapshot;
}
