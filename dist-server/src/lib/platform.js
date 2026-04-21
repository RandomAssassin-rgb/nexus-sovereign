function hasWindow() {
    return typeof window !== "undefined";
}
export function getCapacitorPlatform() {
    if (!hasWindow())
        return undefined;
    return window.Capacitor?.getPlatform?.();
}
export function isNativePlatform() {
    if (!hasWindow())
        return false;
    return Boolean(window.Capacitor?.isNativePlatform?.());
}
export function isStandalonePwa() {
    if (!hasWindow())
        return false;
    const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
    const legacyStandalone = window.navigator.standalone;
    return Boolean(mediaStandalone || legacyStandalone);
}
export function getRuntimePlatform() {
    const capacitorPlatform = getCapacitorPlatform();
    if (capacitorPlatform === "android")
        return "android";
    if (capacitorPlatform === "ios")
        return "ios";
    if (isStandalonePwa())
        return "pwa";
    if (hasWindow())
        return "web";
    return "unknown";
}
export function isHttpOrigin(value) {
    return Boolean(value && /^https?:\/\//i.test(value));
}
//# sourceMappingURL=platform.js.map