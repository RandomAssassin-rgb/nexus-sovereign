var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { getRuntimePlatform, isNativePlatform } from "./platform";
const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
const CAMERA_PACKAGE = "@capacitor/camera";
const GEOLOCATION_PACKAGE = "@capacitor/geolocation";
const PREFERENCES_PACKAGE = "@capacitor/preferences";
const PUSH_PACKAGE = "@capacitor/push-notifications";
const BIOMETRIC_PACKAGE = "@aparajita/capacitor-biometric-auth";
async function optionalImport(specifier) {
    try {
        return (await import(__rewriteRelativeImportExtension(/* @vite-ignore */ specifier)));
    }
    catch {
        return null;
    }
}
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
async function captureWithWebInput(accept = "image/*") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.capture = "environment";
    return new Promise((resolve) => {
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) {
                resolve({ dataUrl: null, webPath: null });
                return;
            }
            const dataUrl = await fileToDataUrl(file);
            resolve({ dataUrl, webPath: URL.createObjectURL(file) });
        };
        input.click();
    });
}
export async function captureDeviceImage(source = "prompt") {
    if (isNativePlatform()) {
        const cameraPackage = await optionalImport(CAMERA_PACKAGE);
        if (cameraPackage?.Camera) {
            const { Camera, CameraResultType, CameraSource } = cameraPackage;
            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: source === "camera" ? CameraSource.Camera : CameraSource.Prompt,
            });
            return {
                dataUrl: photo.dataUrl || null,
                webPath: photo.webPath || null,
            };
        }
    }
    return captureWithWebInput();
}
export async function saveSecureValue(key, value) {
    const preferencesPackage = await optionalImport(PREFERENCES_PACKAGE);
    if (preferencesPackage?.Preferences) {
        await preferencesPackage.Preferences.set({ key, value });
        return;
    }
    localStorage.setItem(key, value);
}
export async function readSecureValue(key) {
    const preferencesPackage = await optionalImport(PREFERENCES_PACKAGE);
    if (preferencesPackage?.Preferences) {
        const result = await preferencesPackage.Preferences.get({ key });
        return result.value || null;
    }
    return localStorage.getItem(key);
}
export async function removeSecureValue(key) {
    const preferencesPackage = await optionalImport(PREFERENCES_PACKAGE);
    if (preferencesPackage?.Preferences) {
        await preferencesPackage.Preferences.remove({ key });
        return;
    }
    localStorage.removeItem(key);
}
export async function getLocationPermissionState() {
    const geolocationPackage = await optionalImport(GEOLOCATION_PACKAGE);
    if (geolocationPackage?.Geolocation?.checkPermissions) {
        const result = await geolocationPackage.Geolocation.checkPermissions();
        if (result.location === "granted")
            return "granted";
        if (result.location === "denied")
            return "denied";
        return "prompt";
    }
    if (navigator.permissions?.query) {
        try {
            const result = await navigator.permissions.query({ name: "geolocation" });
            return result.state;
        }
        catch {
            return "prompt";
        }
    }
    return navigator.geolocation ? "prompt" : "unavailable";
}
export async function requestCurrentLocation() {
    const geolocationPackage = await optionalImport(GEOLOCATION_PACKAGE);
    if (geolocationPackage?.Geolocation?.getCurrentPosition) {
        try {
            const result = await geolocationPackage.Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                maximumAge: 60000, // 1 minute cached is fine and much faster
                timeout: 5000, // strict 5s timeout to trigger fallbacks quickly
            });
            // Phase 3: Advanced Anti-GPS Spoofing Heuristics
            // Mocked locations often have:
            // 1. Accuracy of 0 or exactly 1.0 (some simulators)
            // 2. Altitude of exactly 0 or null (often missed by mock providers)
            // 3. Impossible speed (> 500 m/s)
            const coords = result.coords;
            const isSpoofed = coords.accuracy <= 0 ||
                coords.accuracy === 1 ||
                (coords.speed && coords.speed > 500) ||
                (coords.altitude === 0 && coords.altitudeAccuracy === 0); // Common signature of basic mocks
            if (isSpoofed) {
                console.warn("Nexus Security: Potential GPS spoofing detected (Native). Rejecting location signal.");
                return null;
            }
            return {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
            };
        }
        catch (err) {
            console.warn("Native Geolocation failed", err);
            return null;
        }
    }
    if (!navigator.geolocation)
        return null;
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition((position) => {
            const coords = position.coords;
            // Web heuristic for spoofing (accuracy is often a tell-tale sign)
            const isSpoofed = coords.accuracy <= 0 || coords.accuracy === 1;
            if (isSpoofed) {
                console.warn("Nexus Security: Potential GPS spoofing detected (Web). Rejecting signal.");
                resolve(null);
                return;
            }
            resolve({
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
            });
        }, (error) => {
            console.warn("Web Geolocation failed", error);
            resolve(null);
        }, { enableHighAccuracy: true, maximumAge: 60000, timeout: 5000 });
    });
}
export async function authenticateWithBiometrics(reason = "Authenticate to continue") {
    const biometricPackage = await optionalImport(BIOMETRIC_PACKAGE);
    const biometricAuth = biometricPackage?.BiometricAuth;
    if (!biometricAuth?.authenticate) {
        return {
            success: false,
            reason: "Biometric plugin unavailable",
        };
    }
    try {
        await biometricAuth.authenticate({ reason });
        return { success: true, reason: null };
    }
    catch (error) {
        return {
            success: false,
            reason: error?.message || "Biometric authentication failed",
        };
    }
}
export async function registerForPushNotifications() {
    const pushPackage = await optionalImport(PUSH_PACKAGE);
    if (pushPackage?.PushNotifications) {
        const { PushNotifications } = pushPackage;
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== "granted") {
            return { registered: false, token: null, permission: permission.receive };
        }
        return new Promise((resolve) => {
            const done = (payload) => {
                resolve(payload);
            };
            PushNotifications.addListener("registration", (token) => {
                done({ registered: true, token: token.value, permission: permission.receive });
            });
            PushNotifications.addListener("registrationError", () => {
                done({ registered: false, token: null, permission: permission.receive });
            });
            void PushNotifications.register();
        });
    }
    if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        return {
            registered: permission === "granted",
            token: null,
            permission,
        };
    }
    return { registered: false, token: null, permission: "unavailable" };
}
export async function getPushSupportState() {
    if (isNativePlatform()) {
        const pushPackage = await optionalImport(PUSH_PACKAGE);
        return {
            supported: Boolean(pushPackage?.PushNotifications),
            permission: "unknown",
            registered: false,
        };
    }
    if ("Notification" in window) {
        return {
            supported: true,
            permission: Notification.permission,
            registered: Notification.permission === "granted",
        };
    }
    return { supported: false, permission: "unavailable", registered: false };
}
export async function getDeviceStateSnapshot() {
    const pushState = await getPushSupportState().catch(() => ({
        registered: false,
        permission: "unavailable",
    }));
    const locationPermission = await getLocationPermissionState();
    const biometricsAvailable = Boolean((await optionalImport(BIOMETRIC_PACKAGE))?.BiometricAuth);
    const secureStorageReady = Boolean(await optionalImport(PREFERENCES_PACKAGE));
    return {
        platform: getRuntimePlatform(),
        nativeApp: isNativePlatform(),
        pwa: getRuntimePlatform() === "pwa",
        biometricsAvailable,
        secureStorageReady,
        pushReady: Boolean(pushState.registered),
        locationPermission,
    };
}
import { loadBiometricModels } from "./biometricService";
/**
 * Pre-warms the face-api neural engine via the Biometric Service singleton.
 */
export async function warmupBiometrics() {
    return loadBiometricModels();
}
//# sourceMappingURL=deviceCapabilities.js.map