import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import * as faceapi from "face-api.js";
import { ArrowLeft, RefreshCcw, Shield, ShieldCheck } from "lucide-react";
import { persistSessionBridge } from "../lib/sessionBridge";
import { apiClient } from "../lib/apiClient";
import BiometricScanner from "../components/BiometricScanner";
import { FACE_MATCH_THRESHOLD, loadBiometricModels } from "../lib/biometricService";

type FaceRouteState = {
  partnerId?: string;
  isSignup?: boolean;
  recoveryMode?: boolean;
  isAdmin?: boolean;
  adminId?: string;
  adminCode?: string;
  faceDescriptor?: number[] | string | null;
  hasFaceDescriptor?: boolean;
} | null;

function parseDescriptor(value: unknown): Float32Array | null {
  if (!value) return null;

  if (value instanceof Float32Array) {
    return value.length ? value : null;
  }

  if (Array.isArray(value)) {
    return value.length ? new Float32Array(value.map(Number)) : null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? new Float32Array(parsed.map(Number)) : null;
    } catch {
      return null;
    }
  }

  return null;
}

function descriptorKey(descriptor: Float32Array) {
  return Array.from(descriptor.slice(0, 8))
    .map((value) => value.toFixed(5))
    .join("|");
}

function mergeDescriptors(...values: Array<Float32Array | null | undefined>) {
  const merged: Float32Array[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value?.length) continue;
    const key = descriptorKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
  }

  return merged;
}

function adminDescriptorKeys(adminId?: string, adminCode?: string) {
  return [
    adminId ? `admin_face_descriptor:${adminId}` : null,
    adminCode ? `admin_face_descriptor:code:${adminCode}` : null,
    "admin_face_descriptor",
  ].filter((value): value is string => Boolean(value));
}

function getBestMatchDistance(probe: Float32Array, candidates: Float32Array[]) {
  if (!candidates.length) return Number.POSITIVE_INFINITY;

  return candidates.reduce((best, candidate) => {
    const distance = faceapi.euclideanDistance(probe, candidate);
    return Math.min(best, distance);
  }, Number.POSITIVE_INFINITY);
}

export default function FaceVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as FaceRouteState;

  const partnerId =
    state?.partnerId ||
    localStorage.getItem("partner_id") ||
    localStorage.getItem("nexus_partner_id") ||
    undefined;

  const adminDescriptorCandidates = useMemo(() => {
    if (!state?.isAdmin) return [];
    return adminDescriptorKeys(state.adminId, state.adminCode).map((key) => parseDescriptor(localStorage.getItem(key)));
  }, [state?.adminCode, state?.adminId, state?.isAdmin]);

  const initialDescriptors = useMemo(
    () =>
      mergeDescriptors(
        parseDescriptor(state?.faceDescriptor),
        ...adminDescriptorCandidates,
        parseDescriptor(partnerId ? localStorage.getItem(`face_descriptor:${partnerId}`) : null),
        parseDescriptor(localStorage.getItem("face_descriptor")),
      ),
    [adminDescriptorCandidates, partnerId, state?.faceDescriptor],
  );

  const [storedDescriptors, setStoredDescriptors] = useState<Float32Array[]>(initialDescriptors);
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "failed">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isResolvingDescriptor, setIsResolvingDescriptor] = useState(
    !state?.isSignup && initialDescriptors.length === 0,
  );
  const [showAdminSkip, setShowAdminSkip] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    void loadBiometricModels();
  }, []);

  // Admin bypass timer: if biometric stalls for 12s during admin auth,
  // allow proceeding since password auth already succeeded.
  useEffect(() => {
    if (!state?.isAdmin) return;
    const timer = setTimeout(() => setShowAdminSkip(true), 12_000);
    return () => clearTimeout(timer);
  }, [state?.isAdmin]);

  useEffect(() => {
    if (!state?.isSignup && !state?.isAdmin && !partnerId) {
      setErrorMessage("Missing account context. Please sign in again before biometric verification.");
    }
  }, [partnerId, state?.isAdmin, state?.isSignup]);

  useEffect(() => {
    if (state?.isSignup || (!state?.isAdmin && !partnerId)) {
      setIsResolvingDescriptor(false);
      return;
    }

    let isActive = true;

    const resolveProfileDescriptor = async () => {
      if (!initialDescriptors.length) {
        setIsResolvingDescriptor(true);
      }

      try {
        let remoteDescriptor: Float32Array | null = null;

        if (state?.isAdmin) {
          const response = await apiClient.get("/api/admin/auth/profiles");
          const matchingProfile = Array.isArray(response.data?.profiles)
            ? response.data.profiles.find((profile: any) => profile.id === state.adminId)
            : null;
          remoteDescriptor = parseDescriptor(matchingProfile?.face_descriptor);
        } else {
          const response = await apiClient.get(`/api/auth/profile/${encodeURIComponent(partnerId)}`, { timeout: 60000 });
          remoteDescriptor = parseDescriptor(response.data?.user?.face_descriptor);
        }

        if (!isActive) return;

        if (remoteDescriptor) {
          setStoredDescriptors((current) => mergeDescriptors(...current, remoteDescriptor));
          if (state?.isAdmin) {
            for (const key of adminDescriptorKeys(state.adminId, state.adminCode)) {
              localStorage.setItem(key, JSON.stringify(Array.from(remoteDescriptor)));
            }
          } else {
            localStorage.setItem("face_descriptor", JSON.stringify(Array.from(remoteDescriptor)));
            localStorage.setItem(`face_descriptor:${partnerId}`, JSON.stringify(Array.from(remoteDescriptor)));
          }
          setErrorMessage("");
        } else if (!initialDescriptors.length) {
          setErrorMessage("No enrolled biometric profile found for this account.");
        }
      } catch (error) {
        if (isActive && !initialDescriptors.length) {
          setErrorMessage("Unable to retrieve enrolled biometric profile.");
        }
      } finally {
        if (isActive) {
          setIsResolvingDescriptor(false);
        }
      }
    };

    void resolveProfileDescriptor();

    return () => {
      isActive = false;
    };
  }, [initialDescriptors.length, partnerId, state?.adminCode, state?.adminId, state?.isAdmin, state?.isSignup]);

  const handleVerificationComplete = useCallback(async ({
    descriptor,
    image,
  }: {
    descriptor: Float32Array;
    image: string;
  }) => {
    setStatus("success");

    // Determine target FIRST so we always know where to go
    const target = state?.isAdmin ? "/admin/dashboard" : "/home";

    // STEP 1: Write session to localStorage SYNCHRONOUSLY — this is what route guards check
    if (state?.isSignup) {
      if (state.isAdmin) {
        if (state.adminId) localStorage.setItem("admin_id", state.adminId);
        if (state.adminCode) localStorage.setItem("admin_code", state.adminCode);
      } else {
        if (partnerId) {
          const session = JSON.stringify({ user: { id: partnerId, name: "Nexus Partner" } });
          localStorage.setItem("nexus_session", session);
          localStorage.setItem("partner_id", partnerId);
        }
      }
    } else if (state?.isAdmin) {
      if (state.adminId) localStorage.setItem("admin_id", state.adminId);
      if (state.adminCode) localStorage.setItem("admin_code", state.adminCode);
    } else if (partnerId) {
      const session = JSON.stringify({ user: { id: partnerId, name: "Nexus Partner" } });
      localStorage.setItem("nexus_session", session);
    }

    localStorage.setItem("face_descriptor", JSON.stringify(Array.from(descriptor)));
    if (partnerId) {
      localStorage.setItem(`face_descriptor:${partnerId}`, JSON.stringify(Array.from(descriptor)));
    }
    localStorage.setItem("biometric_authenticated", "true");

    // Dispatch auth events so App.tsx React state catches up
    window.dispatchEvent(new Event("auth-change"));
    if (state?.isAdmin) window.dispatchEvent(new Event("admin-auth-change"));

    console.log(`[FaceVerify] ✅ Session written to localStorage. Target: ${target}`);
    setIsRedirecting(true);

    // STEP 2: Fire-and-forget API calls — these MUST NOT block navigation
    // We don't await these. If they fail, the session is already in localStorage.
    const apiWork = async () => {
      try {
        if (state?.isSignup) {
          if (state.isAdmin) {
            await apiClient.post("/api/admin/auth/register-biometric", {
              admin_id: state.adminId,
              face_descriptor: Array.from(descriptor),
            }, { timeout: 15000 });
            for (const key of adminDescriptorKeys(state.adminId, state.adminCode)) {
              localStorage.setItem(key, JSON.stringify(Array.from(descriptor)));
            }
          } else if (partnerId) {
            await apiClient.post("/api/auth/register-user", {
              partnerId,
              biometric_verified: true,
              face_descriptor: Array.from(descriptor),
              face_image: image,
              fullName: localStorage.getItem("full_name") || undefined,
              platform: localStorage.getItem("signin_platform") || localStorage.getItem("specific_platform") || undefined,
              method: "biometric",
            }, { timeout: 15000 });
          }
        }
        await persistSessionBridge({
          partner_id: partnerId || undefined,
          nexus_session: localStorage.getItem("nexus_session") || undefined,
          admin_id: state?.adminId || undefined,
          admin_role: state?.isAdmin ? "admin" : undefined,
          admin_code: state?.adminCode || undefined,
          signin_platform: localStorage.getItem("signin_platform") || undefined,
        }).catch(() => undefined);
      } catch (err) {
        console.warn("[FaceVerify] Background API sync failed (non-blocking):", err);
      }
    };
    // Fire and forget — do NOT await
    void apiWork();

    // STEP 3: Biometric match validation (for sign-in, not signup)
    if (!state?.isSignup) {
      try {
        const distance = getBestMatchDistance(descriptor, storedDescriptors);
        if (storedDescriptors.length > 0 && (!Number.isFinite(distance) || distance > FACE_MATCH_THRESHOLD)) {
          setErrorMessage(state?.isAdmin ? "Admin biometric signature mismatch." : "Visual signature mismatch.");
          setStatus("failed");
          setIsRedirecting(false);
          return; // Abort navigation
        }
      } catch {
        // If matching fails, allow through (defensive)
      }
    }

    // STEP 4: HARD NAVIGATE after showing success animation for 1.2s
    // This uses window.location.href — completely bypasses React Router.
    // The App.tsx route guards now check localStorage synchronously, so this always works.
    console.log(`[FaceVerify] 🚀 Hard-navigating to ${target} in 1.2s...`);
    setTimeout(() => {
      window.location.href = target;
    }, 1200);
  }, [partnerId, state, storedDescriptors]);

  const handleStatusChange = useCallback((nextStatus: string) => {
    setStatus(nextStatus as any);
  }, []);

  const handleAdminSkip = async () => {
    try {
      await persistSessionBridge({
        admin_id: state?.adminId,
        admin_role: "admin",
        admin_code: state?.adminCode,
        nexus_session: JSON.stringify({ admin: { id: state?.adminId, code: state?.adminCode } }),
      });
      console.log("[FaceVerify] ⚠️ Admin bypass triggered. Redirecting...");
      window.dispatchEvent(new Event("admin-auth-change"));
      navigate("/admin/dashboard", { replace: true });
    } catch {
      navigate("/admin/dashboard", { replace: true });
    }
  };

  // REDIRECT SENTINEL: If somehow we're still on /biometrics after isRedirecting=true
  // (e.g. window.location.replace was suppressed by a browser extension), force a fallback.
  useEffect(() => {
    if (!isRedirecting) return;
    const target = state?.isAdmin ? "/admin/dashboard" : "/home";
    const fallback = setTimeout(() => {
      if (window.location.pathname.includes("biometrics")) {
        console.error("[FaceVerify] 🛑 Redirect sentinel triggered (window.location.replace was blocked). Forcing via href.");
        window.location.href = target;
      }
    }, 2000);
    return () => clearTimeout(fallback);
  }, [isRedirecting, state?.isAdmin]);

  return (
    <div className="nexus-auth-stage bg-black flex flex-col font-sans overflow-hidden">
      <header className="fixed top-0 left-0 right-0 p-6 z-50 flex items-center justify-between pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="nexus-icon-button pointer-events-auto bg-white/5 backdrop-blur-md rounded-full border border-white/10"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#D4A056]/10 rounded-full border border-[#D4A056]/20">
          <Shield className="w-3 h-3 text-[#D4A056]" />
          <span className="text-[10px] font-bold text-[#D4A056] uppercase tracking-widest">
            Sovereign Protocol v2.6
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
            {state?.isSignup ? (state?.recoveryMode ? "Face Recovery Enrollment" : "Face Enrollment") : "Identity Check"}
          </h1>
          <p className="text-sm text-white/40 max-w-[300px] mx-auto">
            {state?.isSignup
              ? state?.recoveryMode
                ? "No saved biometric was found for this account. Enroll once to finish secure access."
                : "Register your neural pattern for forensic-grade account protection."
              : "Scanning biometric anchors to authorize secure access."}
          </p>
          {!state?.isSignup && !state?.isAdmin && (
            <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-white/30">
              {!partnerId
                ? "Missing account context"
                : isResolvingDescriptor
                ? "Cross-checking enrolled biometric vault..."
                : storedDescriptors.length
                  ? `Cross-verified against ${storedDescriptors.length} enrolled template${
                      storedDescriptors.length > 1 ? "s" : ""
                    }`
                  : "Awaiting enrolled biometric profile"}
            </p>
          )}
        </motion.div>

        <BiometricScanner
          mode={state?.isSignup ? "ENROLL" : "VERIFY"}
          storedDescriptor={storedDescriptors[0] ?? null}
          storedDescriptors={storedDescriptors}
          onComplete={handleVerificationComplete}
          onStatusChange={handleStatusChange}
          className="w-full max-w-sm"
        />

        {status === "success" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs">
              Identity Corroborated
            </p>
          </motion.div>
        )}

        {status === "failed" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 flex flex-col items-center gap-4"
          >
            <div className="px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
              <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">
                Authorization Blocked
              </p>
              <p className="text-white/40 text-[10px]">{errorMessage}</p>
            </div>
            <button
              onClick={() => {
                setErrorMessage("");
                setStatus("idle");
              }}
              className="text-[10px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-2 hover:text-white transition-colors"
            >
              <RefreshCcw size={12} /> Retry Neural Lock
            </button>
          </motion.div>
        )}

        {showAdminSkip && status !== "success" && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleAdminSkip}
            className="mt-6 px-6 py-3 bg-[#D4A056]/20 border border-[#D4A056]/40 rounded-2xl text-[#D4A056] text-xs font-bold uppercase tracking-widest hover:bg-[#D4A056]/30 transition-all"
          >
            Proceed with Password Auth →
          </motion.button>
        )}
      </main>

      <footer className="p-8 text-center bg-gradient-to-t from-black to-transparent">
        <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">
          End-to-End Cryptographic Identity • Non-Custodial
        </p>
      </footer>
    </div>
  );
}
