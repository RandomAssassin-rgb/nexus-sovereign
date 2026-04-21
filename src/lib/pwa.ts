function isLocalRuntime() {
  if (typeof window === "undefined") return false;

  const { hostname, protocol } = window.location;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    protocol === "http:"
  );
}

async function clearLocalServiceWorkerState() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn("[PWA] Failed to unregister local service workers:", error);
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("[PWA] Failed to clear local caches:", error);
  }
}

export async function registerNexusServiceWorker() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    import.meta.env.DEV
  ) {
    return;
  }

  if (isLocalRuntime()) {
    await clearLocalServiceWorkerState();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.update().catch(() => undefined))
      .catch((error) => console.warn("[PWA] Service worker registration failed:", error));
  });
}
