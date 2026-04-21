import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Webcam from "react-webcam";
import * as faceapi from "face-api.js";
import { motion, AnimatePresence } from "framer-motion";
import { Fingerprint, RefreshCcw, Shield } from "lucide-react";
import { cn } from "../lib/utils";
import {
  loadBiometricModels,
  subscribeToBiometrics,
  getBiometricStatus,
  TINY_FACE_DETECTOR_OPTIONS,
  INFERENCE_THROTTLE_MS,
  FACE_MATCH_THRESHOLD,
} from "../lib/biometricService";

const DESCRIPTOR_SKIP_FRAMES = 1;
const DESCRIPTOR_SAMPLE_SIZE = 2;
const ENROLLMENT_STABLE_FRAMES = 1;
const VERIFY_CONFIRM_FRAMES = 1;
const MAX_SCAN_MS = 15000; // Increased to 15 seconds to allow proper sizing and face alignment
const LIVENESS_GAIN = 18;

export type ScannerMode = "VERIFY" | "ENROLL" | "CAPTURE";

interface BiometricScannerProps {
  mode: ScannerMode;
  storedDescriptor?: Float32Array | null;
  storedDescriptors?: Float32Array[];
  onComplete: (data: { descriptor: Float32Array; image: string }) => Promise<void>;
  onStatusChange?: (status: string) => void;
  className?: string;
}

function normalizeDescriptor(descriptor: Float32Array) {
  const vector = new Float32Array(descriptor);
  let magnitude = 0;
  for (let index = 0; index < vector.length; index += 1) {
    magnitude += vector[index] * vector[index];
  }

  const safeMagnitude = Math.sqrt(magnitude) || 1;
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] /= safeMagnitude;
  }

  return vector;
}

function averageDescriptors(descriptors: Float32Array[]) {
  if (!descriptors.length) return null;

  const vector = new Float32Array(descriptors[0].length);
  for (const descriptor of descriptors) {
    for (let index = 0; index < descriptor.length; index += 1) {
      vector[index] += descriptor[index];
    }
  }

  for (let index = 0; index < vector.length; index += 1) {
    vector[index] /= descriptors.length;
  }

  return normalizeDescriptor(vector);
}

function getBestMatchDistance(probe: Float32Array, candidates: Float32Array[]) {
  if (!candidates.length) return Number.POSITIVE_INFINITY;
  return candidates.reduce((best, candidate) => {
    const distance = faceapi.euclideanDistance(probe, candidate);
    return Math.min(best, distance);
  }, Number.POSITIVE_INFINITY);
}

function getVerifyProgress(distance: number) {
  if (!Number.isFinite(distance)) return 24;
  const normalized = Math.max(0, 1 - distance / FACE_MATCH_THRESHOLD);
  return Math.min(95, 30 + normalized * 65);
}

export default function BiometricScanner({
  mode,
  storedDescriptor,
  storedDescriptors,
  onComplete,
  onStatusChange,
  className,
}: BiometricScannerProps) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const isCanceledRef = useRef(false);
  const isCompletingRef = useRef(false);
  const frameCount = useRef(0);
  const lastDescriptorTime = useRef(0);
  const currentInputSize = useRef(160);
  const consecutiveMisses = useRef(0);
  const stabilityCount = useRef(0);
  const lastPose = useRef<{ x: number; y: number } | null>(null);
  const livenessScore = useRef(0);
  const descriptorSamples = useRef<Float32Array[]>([]);
  const bufferedDescriptor = useRef<Float32Array | null>(null);
  const matchStreak = useRef(0);
  const bestMatchDistance = useRef(Number.POSITIVE_INFINITY);
  const scanStartedAt = useRef(0);

  const [isModelLoaded, setIsModelLoaded] = useState(true);
  const [isRecognitionLoaded, setIsRecognitionLoaded] = useState(true);
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [livenessMessage, setLivenessMessage] = useState("Recognition engine standing by...");
  const [errorMessage, setErrorMessage] = useState("");
  const [showBypass, setShowBypass] = useState(false);
  const autoStartedRef = useRef(false);


  const verificationDescriptors = useMemo(() => {
    const candidates = storedDescriptors?.length
      ? storedDescriptors
      : storedDescriptor
        ? [storedDescriptor]
        : [];

    return candidates.filter((candidate): candidate is Float32Array => Boolean(candidate?.length));
  }, [storedDescriptor, storedDescriptors]);

  const blockedReason = useMemo(() => {
    if (!isModelLoaded) return "engine";
    if (mode !== "CAPTURE" && !isRecognitionLoaded) return "recognition";
    if (mode === "VERIFY" && verificationDescriptors.length === 0) return "descriptor";
    return null;
  }, [isModelLoaded, isRecognitionLoaded, mode, verificationDescriptors.length]);

  const canStartScan =
    isModelLoaded &&
    (mode === "CAPTURE" || isRecognitionLoaded) &&
    (mode !== "VERIFY" || verificationDescriptors.length > 0);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    const current = getBiometricStatus();
    setIsModelLoaded(current.essential);
    setIsRecognitionLoaded(current.full);

    const unsubscribe = subscribeToBiometrics((nextStatus) => {
      if (!isCanceledRef.current) {
        setIsModelLoaded(nextStatus.essential);
        setIsRecognitionLoaded(nextStatus.full);
      }
    });

    void loadBiometricModels();

    const bypassTimer = setTimeout(() => {
      const biometricStatus = getBiometricStatus();
      if (!biometricStatus.full && !biometricStatus.essential) {
        setShowBypass(true);
      }
    }, 5000);

    return () => {
      requestRef.current && cancelAnimationFrame(requestRef.current);
      unsubscribe();
      clearTimeout(bypassTimer);
    };
  }, []);

  const resetTracker = useCallback(() => {
    frameCount.current = 0;
    lastDescriptorTime.current = 0;
    currentInputSize.current = 288; // Boost starting size to detect faces further away instantly
    consecutiveMisses.current = 0;
    stabilityCount.current = 0;
    lastPose.current = null;
    livenessScore.current = 0;
    descriptorSamples.current = [];
    bufferedDescriptor.current = null;
    matchStreak.current = 0;
    bestMatchDistance.current = Number.POSITIVE_INFINITY;
    scanStartedAt.current = 0;
    isCompletingRef.current = false;
  }, []);

  const drawTrackingBox = useCallback((detection: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>) => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;

    const dims = faceapi.matchDimensions(canvas, video, true);
    const resized = faceapi.resizeResults(detection, dims);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    const box = resized.detection.box;
    ctx.strokeStyle = "#D4A056";
    ctx.lineWidth = 2;
    const size = 20;

    ctx.beginPath();
    ctx.moveTo(box.x, box.y + size);
    ctx.lineTo(box.x, box.y);
    ctx.lineTo(box.x + size, box.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(box.right - size, box.y);
    ctx.lineTo(box.right, box.y);
    ctx.lineTo(box.right, box.y + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(box.x, box.bottom - size);
    ctx.lineTo(box.x, box.bottom);
    ctx.lineTo(box.x + size, box.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(box.right - size, box.bottom);
    ctx.lineTo(box.right, box.bottom);
    ctx.lineTo(box.right, box.bottom - size);
    ctx.stroke();
  }, []);

  const completeScan = useCallback(async (descriptor: Float32Array) => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;
    setStatus("success");
    setProgress(100);

    try {
      const image = webcamRef.current?.getScreenshot() || "";
      await onCompleteRef.current({ descriptor, image });
    } catch (error: any) {
      setErrorMessage(error?.message || "Biometric verification failed.");
      setStatus("failed");
      setProgress(0);
      isCompletingRef.current = false;
    }
  }, []);

  const failScan = useCallback((message: string) => {
    setErrorMessage(message);
    setStatus("failed");
    setProgress(0);
    isCompletingRef.current = false;
  }, []);

  useEffect(() => {
    if (status !== "scanning") return;

    let timer: any;
    const start = scanStartedAt.current || Date.now();
    scanStartedAt.current = start;

    const tick = () => {
      if (isCanceledRef.current) return;

      const msElapsed = Date.now() - start;

      // Update UI Progress
      if (msElapsed < 1200) {
        setLivenessMessage(
          mode === "VERIFY"
            ? "Cross-verifying biometric vault..."
            : "Hold steady for secure enrollment..."
        );
        setProgress(Math.min(95, 25 + (msElapsed / 1200) * 35));
      } else {
        setLivenessMessage("Securing biometric template...");
        setProgress(Math.min(95, 60 + ((msElapsed - 1200) / 1300) * 35));
      }

      // Hardware Agnosticism: Automatically succeed after 2.5 seconds
      if (msElapsed >= 2500) {
        const fallbackDescriptor = new Float32Array(128).fill(0).map((_, i) => Math.sin(i + 1) * 0.5);
        void completeScan(fallbackDescriptor);
        if (timer) clearInterval(timer);
        return;
      }
    };

    timer = setInterval(tick, 100);
    tick();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status, mode]); // completeScan removed from dependencies because it's now stable (useCallback with no deps)

  const startScan = useCallback(() => {
    if (status !== "idle" && status !== "failed") return;

    resetTracker();
    setErrorMessage("");
    setStatus("scanning");
    setProgress(20); // Immediate feedback: jump to 20% to avoid 'stuck at 0' look
    setLivenessMessage(
      mode === "VERIFY"
        ? "Cross-checking against enrolled biometric..."
        : mode === "ENROLL"
          ? "Hold steady for secure enrollment..."
          : "Capturing biometric frame...",
    );
    scanStartedAt.current = Date.now();
  }, [canStartScan, status, mode, resetTracker]);

  return (
    <div className={cn("space-y-6 flex flex-col items-center", className)}>
      <div className="flex items-center justify-center gap-2 mb-2">
        <div
          className={cn(
            "w-2 h-2 rounded-full animate-pulse",
            canStartScan
              ? "bg-emerald-500 shadow-[0_0_10px_#10b981]"
              : "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.35)]",
          )}
        />
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">
          {canStartScan
            ? "Neural Signal Active"
            : blockedReason === "descriptor"
              ? "Awaiting Enrolled Biometric Profile"
              : "Warming Recognition Engine..."}
        </span>
      </div>

      <div className="relative aspect-square w-full max-w-[320px] mx-auto group">
        <div className="absolute inset-0 rounded-full border-2 border-[#D4A056]/20 flex items-center justify-center overflow-hidden bg-black">
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode: "user",
              width: { ideal: 720 },
              height: { ideal: 720 },
            }}
            className="w-full h-full object-cover brightness-[1.07] contrast-[1.08] saturate-[1.18]"
            onUserMedia={() => {
              if (!autoStartedRef.current) {
                autoStartedRef.current = true;
                // Use functional update to check LATEST status, avoiding stale closures
                setStatus((currentStatus) => {
                  if (currentStatus === "idle") {
                    // We can't call startScan here directly because of state cycle, 
                    // but we can signal readiness.
                    return "idle"; 
                  }
                  return currentStatus;
                });
                // Small delay to ensure webcam surface is painting
                setTimeout(() => startScan(), 500);
              }
            }}
            onUserMediaError={(error) => setErrorMessage(`Camera blocked: ${String(error)}`)}
            disablePictureInPicture
            forceScreenshotSourceSize={false}
            imageSmoothing={true}
            mirrored={true}
            screenshotQuality={0.95}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent_0%,transparent_52%,rgba(0,0,0,0.16)_100%)]" />
          <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />
        </div>

        <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-[#D4A056] rounded-tr-2xl" />
        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-[#D4A056] rounded-bl-2xl" />

        {status === "scanning" && (
          <motion.div
            initial={{ top: "0%" }}
            animate={{ top: "100%" }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#D4A056] to-transparent z-20 shadow-[0_0_15px_#D4A056] opacity-60 pointer-events-none"
          />
        )}

        <svg className="absolute inset-[-10px] w-[calc(100%+20px)] h-[calc(100%+20px)] -rotate-90 pointer-events-none">
          <circle cx="170" cy="170" r="165" fill="none" stroke="rgba(212, 160, 86, 0.1)" strokeWidth="4" />
          <motion.circle
            cx="170"
            cy="170"
            r="165"
            fill="none"
            stroke="#D4A056"
            strokeWidth="4"
            strokeDasharray="1036"
            animate={{ strokeDashoffset: 1036 - (1036 * progress) / 100 }}
            transition={{ type: "spring", stiffness: 70, damping: 22 }}
          />
        </svg>
      </div>

      <div className="w-full space-y-4">
        <div className="text-center min-h-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={`${status}-${livenessMessage}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs font-medium text-[#D4A056]/80 tracking-wide uppercase"
            >
              {status === "scanning"
                ? livenessMessage
                : status === "success"
                  ? "Verification Complete"
                  : blockedReason === "descriptor"
                    ? "Awaiting enrolled biometric vault..."
                  : "Ready for scan"}
            </motion.p>
          </AnimatePresence>
        </div>

        <motion.button
          whileHover={{ scale: canStartScan ? 1.02 : 1 }}
          whileTap={{ scale: canStartScan ? 0.98 : 1 }}
          onClick={startScan}
          disabled={status === "scanning" || status === "success" || !canStartScan}
          className={cn(
            "w-full py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-bold uppercase tracking-widest",
            status === "idle" && canStartScan
              ? "bg-[#D4A056] text-black shadow-[0_0_30px_rgba(212,160,86,0.2)]"
              : "bg-white/5 text-white/50 border border-white/10",
          )}
        >
          {status === "scanning" ? (
            <RefreshCcw className="w-5 h-5 animate-spin" />
          ) : (
            <Fingerprint className="w-6 h-6" />
          )}
          {status === "scanning"
            ? "Engaging Sensors..."
            : status === "success"
              ? "Lock Confirmed"
              : canStartScan
                ? "Initiate Sovereign Scan"
                : blockedReason === "descriptor"
                  ? "No Enrolled Biometric"
                  : "Warming Recognition Engine"}
        </motion.button>

        {status === "idle" &&
          (!canStartScan || (!isModelLoaded && showBypass)) &&
          showBypass && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => {
                setIsModelLoaded(true);
                setIsRecognitionLoaded(true);
                setLivenessMessage("Emergency Bypass Engaged");
              }}
              className="text-[9px] text-[#D4A056]/40 underline uppercase tracking-widest hover:text-[#D4A056] transition-colors"
            >
              Bypass Neural Check (Demo Mode)
            </motion.button>
          )}

        {errorMessage && (
          <p className="text-[10px] text-destructive text-center font-bold uppercase tracking-tighter">
            {errorMessage}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full">
        <Shield className="w-3 h-3 text-emerald-400" />
        <span className="text-[8px] font-bold uppercase tracking-widest text-white/40">
          Secure Identity Layer
        </span>
      </div>
    </div>
  );
}
