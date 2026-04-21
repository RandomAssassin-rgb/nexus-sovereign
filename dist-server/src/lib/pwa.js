export async function registerNexusServiceWorker() {
    if (typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        import.meta.env.DEV) {
        return;
    }
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("/sw.js")
            .catch((error) => console.warn("[PWA] Service worker registration failed:", error));
    });
}
//# sourceMappingURL=pwa.js.map