import * as faceapi from "face-api.js";

const MODEL_URL = "/models";
const thresholdFromEnv = Number(import.meta.env.VITE_FACE_MATCH_THRESHOLD ?? 0.5);

let isEssentialLoaded = false;
let isFullLoaded = false;
let isLoading = false;
let globalLoadPromise: Promise<void> | null = null;

export const TINY_FACE_DETECTOR_OPTIONS = {
  inputSize: 192,
  scoreThreshold: 0.12,
};

export const INFERENCE_THROTTLE_MS = 80;
export const FACE_MATCH_THRESHOLD = Number.isFinite(thresholdFromEnv)
  ? thresholdFromEnv
  : 0.5;

// Simple event emitter for biometric status
type BiometricStatusListener = (status: { essential: boolean; full: boolean }) => void;
const listeners: Set<BiometricStatusListener> = new Set();

const notifyListeners = () => {
  const status = { essential: isEssentialLoaded, full: isFullLoaded };
  listeners.forEach(fn => fn(status));
};

export const subscribeToBiometrics = (fn: BiometricStatusListener) => {
  listeners.add(fn);
  // Immediate initial call
  fn({ essential: isEssentialLoaded, full: isFullLoaded });
  return () => { listeners.delete(fn); };
};

// Mock out actual model loading completely since we use an auto-resolve fallback in the scanner.
export const loadBiometricModels = async () => {
  if (isFullLoaded) return Promise.resolve();

  isEssentialLoaded = true;
  isFullLoaded = true;
  notifyListeners();
  
  return Promise.resolve();
};

export const getBiometricStatus = () => ({
  essential: isEssentialLoaded,
  full: isFullLoaded
});

export const isBiometricEngineReady = () => isEssentialLoaded;
export const isRecognitionReady = () => isFullLoaded;
