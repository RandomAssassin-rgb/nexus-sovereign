import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, Camera, CheckCircle2, AlertCircle, Fingerprint, Lock, RefreshCcw, HelpCircle, Smartphone, ExternalLink } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import * as faceapi from "face-api.js";
import axios from "axios";
import { cn } from "../lib/utils";
import { syncWithServer } from "../lib/payoutStore";

export default function FaceVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  // isSignup: true = registration, false = sign-in
  // adminId: the pending admin_users row id (from signup response)
  // adminCode: needed for Aadhaar fallback
  const { isAdmin, isSignup, adminId, adminCode, aadhaar_number } = location.state || {};
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "failed">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSecure, setIsSecure] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showNoFaceWarning, setShowNoFaceWarning] = useState(false);
  const [showTimeoutOptions, setShowTimeoutOptions] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [rawErrorName, setRawErrorName] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [videoConstraints, setVideoConstraints] = useState<any>({ facingMode: "user" });
  const [debugDistance, setDebugDistance] = useState<number | null>(null);
  const [storedDescriptor, setStoredDescriptor] = useState<Float32Array | null>(null);
  const [isNewUser, setIsNewUser] = useState(!!isSignup);
  const [adminProfiles, setAdminProfiles] = useState<any[]>([]);
  // For admin sign-in: retry prompt after quality failure
  const [showRetryPrompt, setShowRetryPrompt] = useState(false);
  const isCanceledRef = useRef(false);

  // Load models from CDN
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setIsModelLoaded(true);
      } catch (error) {
        console.error("Failed to load face-api models:", error);
        setErrorMessage("System: Secure Neural Engine Offline.");
      }
    };
    loadModels();
    
    // Comprehensive Secure Context Check & Mobile Protocol Verification
    const checkSecureContext = () => {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isHttps = window.location.protocol === 'https:';
      
      // Mobile browsers (Chrome/Safari) HARD block camera on non-localhost HTTP
      if (!isLocalHost && !isHttps) {
        setIsSecure(false);
        setDeviceError("INSECURE_CONTEXT");
        setErrorMessage("Biometric Vault requires a full HTTPS tunnel for mobile access.");
        setShowTroubleshoot(true);
      } else if (!window.isSecureContext) {
        // Fallback for browsers that don't support isSecureContext but might be insecure
        setIsSecure(false);
        setDeviceError("INSECURE_CONTEXT");
        setShowTroubleshoot(true);
      }
    };
    checkSecureContext();

    // Fetch user profile to get stored biometric signature
    const fetchUserProfile = async () => {
      if (isAdmin && isSignup) {
        // Admin Sign-up: new user, will register face
        setIsNewUser(true);
        return;
      }

      if (isAdmin && !isSignup) {
        // Admin Sign-in: fetch this admin's face descriptor by adminId
        try {
          const response = await axios.get("/api/admin/auth/profiles");
          if (response.data.success && response.data.profiles.length > 0) {
            const profiles = response.data.profiles.map((p: any) => ({
              id: p.id,
              role: p.role,
              descriptor: new Float32Array(JSON.parse(p.face_descriptor))
            }));
            setAdminProfiles(profiles);
          }
          setIsNewUser(false);
        } catch (error) {
          console.warn("Failed to fetch admin profiles", error);
          setIsNewUser(false);
        }
        return;
      }

      // Regular worker flow
      const partnerId = localStorage.getItem("partner_id");
      if (!partnerId) return;

      try {
        const response = await axios.get(`/api/auth/profile/${partnerId}`);
        if (response.data.success) {
          if (response.data.user && response.data.user.face_descriptor) {
            setStoredDescriptor(new Float32Array(JSON.parse(response.data.user.face_descriptor)));
            setIsNewUser(false);
          } else {
            // No user found or no descriptor stored -> enrollment mode
            setIsNewUser(true);
          }
        }
      } catch (error) {
        console.error("Error fetching user profile for biometrics:", error);
        const localDesc = localStorage.getItem(`face_descriptor_${partnerId}`);
        if (localDesc) {
          setStoredDescriptor(new Float32Array(JSON.parse(localDesc)));
          setIsNewUser(false);
        } else {
          setIsNewUser(true);
        }
      }
    };
    fetchUserProfile();
  }, []);

  const handleVerify = async () => {
    if (!webcamRef.current || !isModelLoaded) return;

    setIsVerifying(true);
    setStatus("scanning");
    setProgress(0);
    setErrorMessage("");
    setShowNoFaceWarning(false);
    setShowTimeoutOptions(false);
    setShowRetryPrompt(false);
    isCanceledRef.current = false;

    const startTime = Date.now();
    let isScanning = true;
    let mismatchCount = 0;
    let noFaceCount = 0;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return 90; 
        return prev + 5;
      });
    }, 5000 / 18);

    try {
      while (isScanning) {
        if (!webcamRef.current || isCanceledRef.current) break; 

        if (Date.now() - startTime > 30000) {
          isScanning = false;
          setShowTimeoutOptions(true);
          setStatus("idle");
          setErrorMessage("Authentication session expired.");
          break;
        }

        if (Date.now() - startTime > 5000) {
          setShowNoFaceWarning(true);
        }

        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        const img = await faceapi.fetchImage(imageSrc);
        const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

        if (!detections) {
          noFaceCount++;
          // After 60 no-face frames (~6s), ask for retry
          if (noFaceCount > 60 && isAdmin) {
            isScanning = false;
            setStatus("failed");
            setShowRetryPrompt(true);
            setErrorMessage("Detection Error: Low visibility or incorrect head position. Please retry.");
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        noFaceCount = 0;
        setShowNoFaceWarning(false);
        setProgress(95);

        if (canvasRef.current && webcamRef.current && webcamRef.current.video) {
          const video = webcamRef.current.video;
          const canvas = canvasRef.current;
          const displaySize = { width: video.videoWidth, height: video.videoHeight };
          canvas.width = displaySize.width;
          canvas.height = displaySize.height;
          faceapi.matchDimensions(canvas, displaySize);
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const box = resizedDetections.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { label: 'AUTHENTICATING...', lineWidth: 2, boxColor: '#D4A056' });
            drawBox.draw(canvas);
            faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
          }
        }

        const partnerId = localStorage.getItem("partner_id") || "GUEST";
        
        if (isNewUser || (!isAdmin && !storedDescriptor)) {
          // ── REGISTRATION FLOW ──
          const descriptorArray = Array.from(detections.descriptor);
          const descriptorStr = JSON.stringify(descriptorArray);
          
          if (isAdmin && isSignup && adminId) {
            // Admin Sign-up: save descriptor via API
            try {
              await axios.post("/api/admin/auth/register-biometric", {
                admin_id: adminId,
                face_descriptor: descriptorStr,
              });
              localStorage.setItem("admin_id", adminId);
              localStorage.setItem("admin_role", "Insurer Admin"); // Default for registration
              localStorage.setItem("admin_code", adminCode || "");
              localStorage.setItem("admin_face_registered", "true");
              window.dispatchEvent(new Event("admin-auth-change"));
              setProgress(100);
              setStatus("success");
              isScanning = false;
              setTimeout(() => navigate("/admin/dashboard"), 1000);
            } catch (error: any) {
              throw new Error(error.response?.data?.message || "Failed to register biometric.");
            }
          } else {
            // Worker Registration
            localStorage.setItem(`face_descriptor_${partnerId}`, descriptorStr);
            localStorage.setItem("face_image", imageSrc);
            
            const session = JSON.parse(localStorage.getItem("dummy_session") || "{}");
            session.user = { ...session.user, photoURL: imageSrc };
            localStorage.setItem("dummy_session", JSON.stringify(session));
            
            try {
              await axios.post("/api/auth/register-user", {
                  platform: localStorage.getItem("signin_platform"),
                  method: localStorage.getItem("signin_method"),
                  partnerId: partnerId,
                  phone: localStorage.getItem("signin_phone"),
                  biometric_verified: true,
                  face_descriptor: descriptorStr
              });
              // FORCE FULL SYNC IMMEDIATELY AFTER SUCCESSFUL REGISTRATION
              await syncWithServer(partnerId, "enrollment");
            } catch (e) {
              console.warn("Backend node offline, syncing locally.");
            }

            setProgress(100);
            setStatus("success");
            isScanning = false;
            window.dispatchEvent(new Event("auth-change"));
            window.dispatchEvent(new CustomEvent("nexus-payout-update")); // Trigger balance refresh
            setTimeout(() => navigate("/home"), 1000);
          }
        } else {
          // ── VERIFICATION FLOW ──
          if (isAdmin && !isSignup) {
            if (adminProfiles.length === 0) {
              mismatchCount++;
              throw new Error("Profile not enrolled. Redirecting to Aadhaar Vault...");
            }
            // Admin Sign-in: compare against all profiles
            let bestMatch = null;
            let minDistance = 1.0;
            for (const profile of adminProfiles) {
              const distance = faceapi.euclideanDistance(detections.descriptor, profile.descriptor);
              if (distance < minDistance) {
                minDistance = distance;
                bestMatch = profile;
              }
            }
            setDebugDistance(minDistance);
            const matchThreshold = 0.55;
            
            if (minDistance < matchThreshold && bestMatch) {
              localStorage.setItem("admin_id", bestMatch.id);
              localStorage.setItem("admin_role", bestMatch.role);
              localStorage.setItem("admin_code", adminCode || ""); // Persist code used during signin
              window.dispatchEvent(new Event("admin-auth-change"));
              setProgress(100);
              setStatus("success");
              isScanning = false;
              setTimeout(() => navigate("/admin/dashboard"), 1000);
            } else {
              mismatchCount++;
              if (mismatchCount >= 8) {
                // Face mismatch — go to Aadhaar fallback
                isScanning = false;
                setStatus("failed");
                setErrorMessage("Face does not match. Redirecting to Aadhaar verification...");
                setTimeout(() => {
                  navigate("/aadhaar-verify", {
                    state: { isAdmin: true, isSignup, adminCode, isFallback: true }
                  });
                }, 2500);
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } else if (storedDescriptor) {
            // Worker Verification
            const distance = faceapi.euclideanDistance(detections.descriptor, storedDescriptor);
            setDebugDistance(distance);
            const matchThreshold = 0.55;

            if (distance < matchThreshold) {
              try {
                await axios.post("/api/auth/register-user", {
                    platform: localStorage.getItem("signin_platform"),
                    method: localStorage.getItem("signin_method"),
                    partnerId: partnerId,
                    phone: localStorage.getItem("signin_phone"),
                    biometric_verified: true
                });
              } catch (e) {
                console.warn("Backend node offline.");
              }

              const session = JSON.parse(localStorage.getItem("dummy_session") || "{}");
              session.user = { 
                  ...session.user, 
                  id: partnerId,
                  phone: localStorage.getItem("signin_phone"),
                  verified: true 
              };
              localStorage.setItem("dummy_session", JSON.stringify(session));

              setProgress(100);
              setStatus("success");
              isScanning = false;
              window.dispatchEvent(new Event("auth-change"));
              setTimeout(() => navigate("/home"), 1000);
            } else {
              mismatchCount++;
              if (mismatchCount >= 8) {
                 throw new Error("Identity mismatch detected. Redirecting to Aadhaar fallback.");
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } else {
            throw new Error("Missing biometric reference.");
          }
        }
      }
    } catch (error: any) {
      console.error("Biometric failure:", error);
      setStatus("failed");
      setErrorMessage(error.message || "Encrypted verification failed.");
      
      if (isAdmin) {
        // Admin: show retry prompt with Aadhaar fallback option
        setShowRetryPrompt(true);
      } else {
        // Worker fallback to Aadhaar
        setTimeout(() => {
          if (!isCanceledRef.current) navigate("/aadhaar-verify");
        }, 3000);
      }
    } finally {
      setIsVerifying(false);
      clearInterval(interval);
      setShowNoFaceWarning(false);
    }
  };

  const handleCameraError = useCallback((err: any) => {
    console.error("Camera Hardware Exception:", err);
    setRawErrorName(err.name || "UnknownError");
    setStatus("failed");
    
    // Detailed error categorization
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      setDeviceError("PERMISSION_DENIED");
      setErrorMessage("Shield blocked: Camera permission denied.");
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      setDeviceError("NO_HARDWARE");
      setErrorMessage("Hardware Error: No front-facing camera detected.");
    } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      setDeviceError("HARDWARE_BUSY");
      setErrorMessage("Hardware Lock: Camera is being used by another application.");
    } else if (err.name === "OverconstrainedError") {
      setDeviceError("CONSTRAINTS_FAILED");
      setErrorMessage("Signal Error: Camera constraints cannot be met.");
      // Auto-fallback if constraints fail
      setVideoConstraints(true); 
    } else {
      setDeviceError("UNKNOWN");
      setErrorMessage("System Exception: Unable to engage camera hardware.");
    }
    setShowTroubleshoot(true);
  }, []);

  const retryAccess = () => {
    console.log("Re-initializing biometric hardware...");
    setDeviceError(null);
    setRawErrorName(null);
    setErrorMessage("");
    setStatus("idle");
    setShowTroubleshoot(false);
    setCameraKey(prev => prev + 1); // Force remount
    // Try a more lenient constraint if it failed once
    if (deviceError === "CONSTRAINTS_FAILED" || deviceError === "UNKNOWN") {
        setVideoConstraints(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans selection:bg-[#D4A056]/30">
      <header className="flex items-center justify-between p-6">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/5 rounded-full transition-colors group">
          <ArrowLeft size={24} className="text-[#D4A056] group-hover:-translate-x-1 transition-transform" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-xl font-bold tracking-tight text-white/90">Biometric Vault</h1>
          <div className="flex items-center gap-1">
             <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[8px] text-white/30 uppercase tracking-[0.2em] font-black">Encrypted Tunnel Active</span>
          </div>
        </div>
        <div className="w-10 h-10 bg-[#D4A056]/10 rounded-xl flex items-center justify-center border border-[#D4A056]/20">
          <Lock size={18} className="text-[#D4A056]" />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 pt-12 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#D4A056]/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="text-center mb-12 z-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#D4A056] mb-3 opacity-80">Platform Verification</p>
          <h2 className="text-4xl font-black tracking-tighter">Sovereign Scan</h2>
        </div>

        <div className="relative w-full max-w-[340px] aspect-square mb-12 z-10">
          <div className="absolute -top-3 -right-3 w-16 h-16 border-t-[3px] border-r-[3px] border-[#D4A056] rounded-tr-3xl" />
          <div className="absolute -bottom-3 -left-3 w-16 h-16 border-b-[3px] border-l-[3px] border-[#D4A056] rounded-bl-3xl" />

          <div className={cn(
            "w-full h-full rounded-full border-[6px] p-3 transition-all duration-700 overflow-hidden relative shadow-2xl",
            status === "scanning" && !showNoFaceWarning ? "border-[#D4A056] shadow-[0_0_40px_rgba(212,160,86,0.3)]" : 
            status === "scanning" && showNoFaceWarning ? "border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.5)]" :
            status === "success" ? "border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)]" :
            status === "failed" ? "border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]" : "border-white/5 bg-white/5"
          )}>
            <div className="w-full h-full rounded-full overflow-hidden bg-black relative border border-white/10">
              {!deviceError && (
                <Webcam
                    key={cameraKey}
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={videoConstraints}
                    className="w-full h-full object-cover grayscale-[0.2] contrast-[1.1]"
                    mirrored={true} 
                    onUserMedia={() => setStatus("idle")}
                    onUserMediaError={handleCameraError}
                    disablePictureInPicture={true}
                    forceScreenshotSourceSize={true}
                    imageSmoothing={true}
                    screenshotQuality={0.92}
                />
              )}
              
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none" />
              
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-[0.5px] border-[#D4A056]/20 rounded-full flex items-center justify-center animate-[spin_20s_linear_infinite]">
                    <div className="absolute top-0 w-2 h-2 bg-[#D4A056] rounded-full blur-[2px]" />
                </div>
              </div>

              {status === "scanning" && (
                <motion.div
                  initial={{ top: "0%" }}
                  animate={{ top: "100%" }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute left-0 right-0 h-[100px] bg-gradient-to-b from-transparent via-[#D4A056]/30 to-transparent z-10 pointer-events-none"
                />
              )}

              <AnimatePresence mode="wait">
                {status === "failed" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-red-950/20 backdrop-blur-sm flex items-center justify-center z-20">
                        <AlertCircle className="text-red-500 w-16 h-16 animate-pulse" />
                    </motion.div>
                )}
                {status === "success" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm flex items-center justify-center z-20">
                        <CheckCircle2 className="text-emerald-400 w-16 h-16" />
                    </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="text-center max-w-[300px] mb-12 z-10">
          <AnimatePresence mode="wait">
            <motion.p 
                key={status + (errorMessage || "")}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-white/70 text-lg font-medium leading-tight"
            >
                {status === "idle" && (errorMessage || "Align your face in the circle to engage the biometric lock.")}
                {status === "scanning" && !showNoFaceWarning && "Analyzing neural patterns..."}
                {status === "scanning" && showNoFaceWarning && <span className="text-amber-500">Subject out of range. Adjust position.</span>}
                {status === "success" && <span className="text-emerald-400 font-bold">Identity Confirmed</span>}
                {status === "failed" && <span className="text-red-400">{errorMessage}</span>}
            </motion.p>
          </AnimatePresence>
        </div>

        {!showTimeoutOptions && !deviceError && (
          <div className="w-full max-w-[320px] mb-12 z-10">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[#D4A056] mb-2 px-1">
                <span>Engaging Sensors</span>
                <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                className="h-full bg-gradient-to-r from-[#D4A056]/40 to-[#D4A056]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                />
            </div>
          </div>
        )}

        <div className="w-full max-w-[340px] flex flex-col gap-4 z-10 mb-12">
            {showRetryPrompt ? (
            <div className="flex flex-col gap-3">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
                  <p className="text-amber-400 text-sm font-bold mb-1">Low Visibility Detected</p>
                  <p className="text-white/50 text-xs">{errorMessage}</p>
                </div>
                <button
                  onClick={() => { setShowRetryPrompt(false); setStatus("idle"); setErrorMessage(""); }}
                  className="w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-[#D4A056] text-black hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <RefreshCcw size={24} />
                  RETRY SCAN
                </button>
                <button
                  onClick={() => navigate("/aadhaar-verify", { state: { isAdmin, isSignup, adminCode, isFallback: true } })}
                  className="w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                >
                  <Shield size={24} />
                  USE AADHAAR INSTEAD
                </button>
            </div>
            ) : !showTimeoutOptions && !deviceError ? (
            <button
                onClick={handleVerify}
                disabled={!isModelLoaded || isVerifying || status === "success"}
                className={cn(
                "group relative w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all overflow-hidden",
                status === "success" ? "bg-emerald-500 text-white" : "bg-[#D4A056] text-black hover:scale-[1.02] active:scale-[0.98]"
                )}
            >
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                {status === "success" ? <CheckCircle2 size={24} /> : <Fingerprint size={24} className="group-hover:animate-pulse" />}
                {status === "success" ? "PROTOCOL COMPLETED" : "INITIATE SCAN"}
            </button>
            ) : (
            <div className="flex flex-col gap-3">
                <button
                onClick={retryAccess}
                className="w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                >
                <RefreshCcw size={24} />
                ENGAGE HARDWARE AGAIN
                </button>
                <button
                onClick={() => navigate("/aadhaar-verify", { state: { isAdmin, isSignup, adminCode, isFallback: true } })}
                className="w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 bg-[#D4A056] text-black hover:bg-[#E5B167] transition-all"
                >
                <Shield size={24} />
                VERIFY WITH AADHAAR ID
                </button>
            </div>
            )}
        </div>

        <div className="flex items-center gap-3 py-6 px-8 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
           <Shield size={14} className="text-[#D4A056]" />
           Quantum-Secure Identity Vault
        </div>

        <AnimatePresence>
            {debugDistance !== null && status === "scanning" && (
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="absolute top-24 left-6 z-50 bg-black/60 backdrop-blur-xl border border-[#D4A056]/30 p-4 rounded-2xl font-mono text-[10px]"
                >
                    <p className="text-[#D4A056] font-black mb-2 uppercase tracking-widest">Neural HUD</p>
                    <div className="space-y-2">
                        <div className="flex justify-between gap-4">
                            <span className="text-white/40 uppercase">Euc. Distance:</span>
                            <span className={cn("font-bold", debugDistance < 0.55 ? "text-emerald-400" : "text-red-400")}>
                                {debugDistance.toFixed(4)}
                            </span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-white/40 uppercase">Confidence:</span>
                            <span className="text-white font-bold">
                                {Math.max(0, (1 - debugDistance) * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                            <motion.div 
                                className="h-full bg-[#D4A056]"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(0, (1 - debugDistance) * 100)}%` }}
                            />
                        </div>
                        <p className="text-[8px] text-white/20 mt-2 italic">
                            *Threshold: 0.55 (Higher is safer)
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        <AnimatePresence>
            {showTroubleshoot && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed inset-x-6 bottom-10 z-50 bg-[#1A1A1A] border border-[#D4A056]/30 rounded-3xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
                >
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-amber-500/10 rounded-2xl">
                            <HelpCircle className="text-amber-500" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">Secure Access Guide</h3>
                            <p className="text-white/50 text-xs">
                                Hardware Exception: <span className="text-[#D4A056] font-mono">{rawErrorName}</span>
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4 mb-8 text-left">
                        {deviceError === "HARDWARE_BUSY" && (
                            <div className="flex gap-4">
                                <AlertCircle className="text-red-400 shrink-0" size={20} />
                                <p className="text-sm">The camera is locked by another window or app. Please close other apps and try again.</p>
                            </div>
                        )}
                        {deviceError === "INSECURE_CONTEXT" && (
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-4">
                                    <Smartphone className="text-[#D4A056] shrink-0" size={20} />
                                    <p className="text-sm">Mobile browsers block camera on HTTP. You MUST access via the <span className="text-[#D4A056] font-bold">HTTPS</span> URL provided by the server.</p>
                                </div>
                                <div className="p-4 bg-black/40 rounded-xl border border-white/5 font-mono text-[10px] text-white/60">
                                    Current Origin: <span className="text-red-400">{window.location.origin}</span><br/>
                                    Required: <span className="text-emerald-400">https://{window.location.hostname}...</span>
                                </div>
                            </div>
                        )}
                        <div className="flex gap-4">
                            <Shield className="text-[#D4A056] shrink-0" size={20} />
                            <p className="text-sm">Grant permission by clicking the lock icon (🔒) or the camera shield in the URL bar.</p>
                        </div>
                        <div className="flex gap-4">
                            <ExternalLink className="text-[#D4A056] shrink-0" size={20} />
                            <p className="text-sm font-medium">If you see a "Connection Not Private" warning, click <span className="underline font-bold">Advanced</span> and then <span className="underline font-bold">Proceed anyway</span>.</p>
                        </div>
                    </div>

                    <button 
                        onClick={retryAccess}
                        className="w-full py-4 bg-white/10 rounded-xl font-bold text-sm hover:bg-white/20 transition-colors"
                    >
                        DISMISS & RE-ENGAGE
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
      </main>
    </div>
  );
}
