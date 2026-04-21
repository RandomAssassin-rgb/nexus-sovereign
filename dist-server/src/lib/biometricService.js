import * as faceapi from "face-api.js";
const MODEL_URL = "/models";
let isEssentialLoaded = false;
let isFullLoaded = false;
let isLoading = false;
let globalLoadPromise = null;
export const TINY_FACE_DETECTOR_OPTIONS = {
    inputSize: 320,
    scoreThreshold: 0.15
};
export const INFERENCE_THROTTLE_MS = 200;
const listeners = new Set();
const notifyListeners = () => {
    const status = { essential: isEssentialLoaded, full: isFullLoaded };
    listeners.forEach(fn => fn(status));
};
export const subscribeToBiometrics = (fn) => {
    listeners.add(fn);
    // Immediate initial call
    fn({ essential: isEssentialLoaded, full: isFullLoaded });
    return () => { listeners.delete(fn); };
};
export const loadBiometricModels = async () => {
    if (isFullLoaded)
        return Promise.resolve();
    if (isLoading && globalLoadPromise)
        return globalLoadPromise;
    isLoading = true;
    globalLoadPromise = (async () => {
        try {
            console.log("[Biometrics] Initializing Secure Local Neural Engine...");
            // Phase 1: Essential Layer (Fast Detection + Landmarks)
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
            ]);
            isEssentialLoaded = true;
            notifyListeners();
            console.log("[Biometrics] Essential models active (Local).");
            // Phase 2: High-Fidelity Layer (Parallel Background)
            Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]).then(() => {
                isFullLoaded = true;
                notifyListeners();
                console.log("[Biometrics] Full engine synchronized (Local).");
            });
        }
        catch (err) {
            console.error("[Biometrics] Local Load Failure - Check public/models/", err);
            // Try fallback to CDN if local fails
            const CDN_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
            try {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL)
                ]);
                isEssentialLoaded = true;
                notifyListeners();
            }
            catch (cdnErr) {
                isLoading = false;
                globalLoadPromise = null;
            }
        }
        finally {
            isLoading = false;
        }
    })();
    return globalLoadPromise;
};
export const getBiometricStatus = () => ({
    essential: isEssentialLoaded,
    full: isFullLoaded
});
export const isBiometricEngineReady = () => isEssentialLoaded;
export const isRecognitionReady = () => isFullLoaded;
//# sourceMappingURL=biometricService.js.map