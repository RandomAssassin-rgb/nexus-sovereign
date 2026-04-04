import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, CheckCircle2, ScanFace, XCircle, RefreshCcw, HelpCircle, Smartphone, ExternalLink, AlertCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import Tesseract from "tesseract.js";
import axios from "axios";
import { cn } from "../lib/utils";

export default function AadhaarVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  // isFallback: came here from FaceVerification after biometric failure
  // isSignup: true = new admin registration, false = sign-in
  const { isAdmin, isSignup, adminCode, isFallback } = location.state || {};
  const adminId = localStorage.getItem("admin_id") || "";
  const [aadhaarAttempts, setAadhaarAttempts] = useState(0);

  const webcamRef = useRef<Webcam>(null);
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "failed">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [rawErrorName, setRawErrorName] = useState<string | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [videoConstraints, setVideoConstraints] = useState<any>({ facingMode: "environment" });
  const isCanceledRef = useRef(false);

  const validateAadhaar = (num: string) => /^\d{4}\s?\d{4}\s?\d{4}$/.test(num);
  const isValid = validateAadhaar(aadhaarNumber);

  useEffect(() => {
    const checkSecureContext = () => {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isHttps = window.location.protocol === 'https:';
      const secureContext = (window.isSecureContext ?? (isHttps || isLocal));
      
      if (!secureContext) {
        setDeviceError("INSECURE_CONTEXT");
        setErrorMessage("Secure Tunnel Required: Camera restricted on HTTP mobile sessions.");
        setShowTroubleshoot(true);
      }
    };
    checkSecureContext();
  }, []);

  const handleManualFormat = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 12);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
    setAadhaarNumber(formatted);
  };

  const handleVerify = async (finalNumber: string) => {
    const cleaned = finalNumber.replace(/\s/g, "");
    setStatus("scanning");
    try {
      await new Promise(resolve => setTimeout(resolve, 1200));

      if (isAdmin && isFallback) {
        // ─── Admin Aadhaar Fallback ───
        if (isSignup) {
          // Registration: save the Aadhaar number to this admin's row
            try {
              await axios.post("/api/admin/auth/aadhaar-fallback", {
                admin_id: adminId,
                aadhaar_number: cleaned,
              });
              localStorage.setItem("admin_id", adminId);
              localStorage.setItem("admin_role", "Insurer Admin");
              localStorage.setItem("admin_code", adminCode || localStorage.getItem("admin_code") || "");
              localStorage.setItem("admin_aadhaar", cleaned);
              window.dispatchEvent(new Event("admin-auth-change"));
              setStatus("success");
              setTimeout(() => navigate("/admin/dashboard"), 1500);
            } catch (err: any) {
              const newAttempts = aadhaarAttempts + 1;
              setAadhaarAttempts(newAttempts);
              setStatus("failed");
              if (newAttempts >= 3) {
                setErrorMessage("Too many incorrect attempts. Redirecting to start.");
                setTimeout(() => navigate("/", { replace: true }), 2500);
              } else {
                const msg = err.response?.data?.message || "Aadhaar record invalid.";
                setErrorMessage(`${msg} Attempt ${newAttempts} of 3.`);
              }
            }
        } else {
          // Sign-in: look up this admin's stored Aadhaar
          try {
            const { data } = await axios.post("/api/admin/auth/aadhaar-signin", {
              aadhaar_number: cleaned,
              admin_code: adminCode || localStorage.getItem("admin_code") || "",
            });
            if (data.success) {
              localStorage.setItem("admin_id", data.admin.id);
              localStorage.setItem("admin_role", data.admin.role);
              localStorage.setItem("admin_aadhaar", cleaned);
              window.dispatchEvent(new Event("admin-auth-change"));
              setStatus("success");
              setTimeout(() => navigate("/admin/dashboard"), 1500);
            } else {
              throw new Error(data.message || "Aadhaar not found.");
            }
          } catch (err: any) {
            const newAttempts = aadhaarAttempts + 1;
            setAadhaarAttempts(newAttempts);
            setStatus("failed");
            if (newAttempts >= 3) {
              setErrorMessage("Too many incorrect attempts. Redirecting to start.");
              setTimeout(() => navigate("/", { replace: true }), 2500);
            } else {
              const msg = err.response?.data?.message || "Aadhaar not recognised.";
              setErrorMessage(`${msg} Attempt ${newAttempts} of 3.`);
            }
          }
        }
        return;
      }

      // ─── Regular worker flow ───
      if (isAdmin) {
          setStatus("success");
          setTimeout(() => navigate("/biometrics", { state: { isAdmin: true, isSignup, adminId, adminCode } }), 1000);
          return;
      }

      const session = JSON.parse(localStorage.getItem("dummy_session") || "{}");
      localStorage.setItem("dummy_session", JSON.stringify({
          ...session,
          user: { ...session.user, aadhaarVerified: true }
      }));
      try {
          await axios.post("/api/auth/register-user", {
              platform: localStorage.getItem("signin_platform"),
              method: localStorage.getItem("signin_method"),
              partnerId: localStorage.getItem("partner_id"),
              phone: localStorage.getItem("signin_phone"),
              aadhaar_verified: true,
              aadhaar_number: cleaned
          });
      } catch (err) {
          console.warn("Express backend synced failed.");
      }
      setStatus("success");
      window.dispatchEvent(new Event("auth-change"));
      setTimeout(() => navigate("/home"), 1500);
    } catch (err: any) {
        setStatus("failed");
        setErrorMessage("Verification protocol failed.");
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    setStatus("scanning");
    setErrorMessage("");
    setDeviceError(null);
    setRawErrorName(null);
    isCanceledRef.current = false;
    
    try {
        const worker = await Tesseract.createWorker('eng');
        const scanLoop = setInterval(async () => {
            if (!webcamRef.current || isCanceledRef.current) {
                clearInterval(scanLoop);
                await worker.terminate();
                return;
            }

            const imageSrc = webcamRef.current.getScreenshot();
            if (!imageSrc) return;

            try {
                const { data: { text } } = await worker.recognize(imageSrc);
                const match = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
                if (match && match[0]) {
                    clearInterval(scanLoop);
                    await worker.terminate();
                    setAadhaarNumber(match[0]);
                    setIsScanning(false);
                    handleVerify(match[0]);
                }
            } catch (e) {
                 console.error("OCR Exception", e);
            }
        }, 1200);

        setTimeout(async () => {
            if (!isCanceledRef.current && isScanning) {
                clearInterval(scanLoop);
                await worker.terminate();
                setIsScanning(false);
                setStatus("failed");
                setErrorMessage("OCR Timeout: Signal clarity insufficient.");
            }
        }, 45000);
    } catch (err) {
        console.error("OCR Worker Init Failed", err);
        setIsScanning(false);
        setStatus("failed");
        setErrorMessage("Verification Engine offline.");
    }
  };

  const handleCameraError = useCallback((err: any) => {
    console.error("Aadhaar Hardware Exception:", err);
    setRawErrorName(err.name || "UnknownError");
    setStatus("failed");

    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      setDeviceError("PERMISSION_DENIED");
      setErrorMessage("Shield blocked: Camera permission denied.");
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      setDeviceError("NO_HARDWARE");
      setErrorMessage("Hardware Error: No back-facing camera detected.");
    } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      setDeviceError("HARDWARE_BUSY");
      setErrorMessage("Hardware Lock: Camera is being used by another application.");
    } else if (err.name === "OverconstrainedError") {
      setDeviceError("CONSTRAINTS_FAILED");
      setErrorMessage("Signal Error: Camera constraints cannot be met.");
      setVideoConstraints(true);
    } else {
      setDeviceError("UNKNOWN");
      setErrorMessage("System Exception: Unable to engage camera hardware.");
    }
    setShowTroubleshoot(true);
  }, []);

  const retryAccess = () => {
    setDeviceError(null);
    setRawErrorName(null);
    setErrorMessage("");
    setStatus("idle");
    setShowTroubleshoot(false);
    setCameraKey(prev => prev + 1);
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
          <h1 className="text-xl font-bold tracking-tight">Vault Entry</h1>
          <p className="text-[8px] text-[#D4A056] font-black uppercase tracking-[0.2em] opacity-60">Identity Fallback</p>
        </div>
        <div className="w-10 h-10 bg-[#D4A056]/10 rounded-xl flex items-center justify-center border border-[#D4A056]/20">
          <Shield size={18} className="text-[#D4A056]" />
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col max-w-md mx-auto w-full relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#D4A056]/5 blur-[80px] rounded-full pointer-events-none" />

        <div className="text-center mb-8 z-10">
          <h1 className="text-4xl font-black tracking-tighter mb-3">Card Verification</h1>
          <p className="text-white/50 text-sm leading-relaxed px-4">Biometric verification inconclusive. Please scan your physical identification card to secure your account.</p>
        </div>

        {isScanning ? (
            <div className="flex-1 flex flex-col items-center z-10">
                <div className="relative w-full aspect-[1.586/1] rounded-3xl overflow-hidden mb-8 border-[3px] border-[#D4A056] shadow-[0_0_50px_rgba(212,160,86,0.2)]">
                    {!deviceError && (
                        <Webcam
                            key={cameraKey}
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            videoConstraints={videoConstraints}
                            className="w-full h-full object-cover grayscale-[0.3] contrast-[1.2]"
                            onUserMedia={() => setStatus("idle")}
                            onUserMediaError={handleCameraError}
                            disablePictureInPicture={true}
                            forceScreenshotSourceSize={true}
                            imageSmoothing={true}
                            screenshotQuality={0.92}
                            mirrored={false}
                        />
                    )}
                    
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="relative w-[90%] h-[80%] border-2 border-white/20 rounded-2xl flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                           <div className="absolute inset-0 border border-emerald-500/30 rounded-2xl animate-pulse" />
                           <div className="absolute inset-x-0 bottom-[15%] h-12 bg-[#D4A056]/10 border-y border-[#D4A056]/30 flex items-center justify-center backdrop-blur-sm">
                               <p className="text-[10px] font-black text-[#D4A056] uppercase tracking-[0.3em]">Align Identity Number</p>
                           </div>
                        </div>
                    </div>

                    <motion.div
                        initial={{ top: "0%" }}
                        animate={{ top: "100%" }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute left-0 right-0 h-1 bg-emerald-400 shadow-[0_0_20px_#10B981] z-10 opacity-60"
                    />
                </div>
                
                <div className="flex items-center gap-3 mb-8 px-6 py-3 rounded-full bg-white/5 border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">OCR Engine Active</p>
                </div>

                <button
                    onClick={() => {
                        isCanceledRef.current = true;
                        setIsScanning(false);
                        setStatus("idle");
                    }}
                    className="w-full py-5 rounded-2xl font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all mt-auto"
                >
                    ABORT SCAN
                </button>
            </div>
        ) : (
            <div className="flex-1 flex flex-col z-10">
                <button
                    onClick={startScanner}
                    className="group relative w-full bg-[#D4A056]/5 border border-[#D4A056]/20 py-8 rounded-3xl flex flex-col items-center gap-4 hover:border-[#D4A056]/40 transition-all mb-8 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-[#D4A056]/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <ScanFace size={40} className="text-[#D4A056] group-hover:scale-110 transition-transform" />
                    <div className="text-center">
                        <p className="text-xl font-black tracking-tight">ENGAGE OCR SCANNER</p>
                        <p className="text-[9px] font-black text-[#D4A056]/60 mt-1 uppercase tracking-[0.2em]">Neural extraction enabled</p>
                    </div>
                </button>

                <div className="flex items-center gap-4 mb-8">
                    <div className="h-px bg-white/5 flex-1" />
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Manual Override</span>
                    <div className="h-px bg-white/5 flex-1" />
                </div>

                <div className="space-y-6 mb-auto">
                    <div>
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-3 block px-1">
                            Aadhaar Identification (12-Digit)
                        </label>
                        <input
                            type="tel"
                            value={aadhaarNumber}
                            onChange={(e) => handleManualFormat(e.target.value)}
                            placeholder="0000 0000 0000"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-2xl font-black font-mono text-center tracking-[0.3em] flex items-center justify-center text-[#D4A056] placeholder:text-white/10 focus:outline-none focus:border-[#D4A056] focus:ring-1 focus:ring-[#D4A056] transition-all"
                        />
                         <AnimatePresence>
                            {aadhaarNumber.length > 0 && !isValid && (
                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-red-400 mt-3 font-bold uppercase tracking-widest text-center">
                                    Invalid identification signature
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>

                    {status === "failed" && (
                        <div className="p-5 rounded-2xl bg-red-500/5 border border-red-500/20 flex items-center gap-4">
                            <XCircle className="text-red-500 shrink-0" size={24} />
                            <p className="text-sm text-red-200/80 font-bold tracking-tight">{errorMessage}</p>
                        </div>
                    )}
                </div>

                <button
                    onClick={() => handleVerify(aadhaarNumber)}
                    disabled={!isValid || status === "scanning" || status === "success"}
                    className={cn(
                        "w-full py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 shadow-2xl",
                        status === "success" ? "bg-emerald-500 text-white" : "bg-[#D4A056] text-black hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 disabled:grayscale transition-all"
                    )}
                >
                    {status === "success" && <CheckCircle2 size={24} />}
                    {status === "scanning" ? "VALIDATING SIGNAL..." : status === "success" ? "ACCESSED" : "SECURE VERIFICATION"}
                </button>
            </div>
        )}

        <AnimatePresence>
            {showTroubleshoot && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-x-0 bottom-0 z-50 bg-[#151515] border border-[#D4A056]/30 rounded-3xl p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)]"
                >
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-amber-500/10 rounded-2xl">
                            <HelpCircle className="text-amber-500" size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Secure Access Guide</h3>
                            <p className="text-white/40 text-[10px]">
                                Exception Signature: <span className="text-[#D4A056] font-mono">{rawErrorName}</span>
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4 mb-8 text-left">
                        {deviceError === "HARDWARE_BUSY" && (
                            <div className="flex gap-4">
                                <AlertCircle className="text-red-400 shrink-0" size={20} />
                                <p className="text-xs text-white/70">The camera is currently locked by another application. Please close other camera apps.</p>
                            </div>
                        )}
                        {deviceError === "INSECURE_CONTEXT" && (
                            <div className="flex gap-4">
                                <Smartphone className="text-[#D4A056] shrink-0" size={20} />
                                <p className="text-xs text-white/70">Mobile browsers block camera on HTTP. ensure you are navigating via <span className="text-[#D4A056] font-bold">HTTPS</span>.</p>
                            </div>
                        )}
                        <div className="flex gap-4">
                            <Shield className="text-[#D4A056] shrink-0" size={20} />
                            <p className="text-xs text-white/70">Enable camera access in settings or click the Lock icon in your address bar.</p>
                        </div>
                        <div className="flex gap-4">
                            <ExternalLink className="text-[#D4A056] shrink-0" size={20} />
                            <p className="text-xs text-white/70">Bypass SSL warnings: <span className="underline">Advanced</span> → <span className="underline">Proceed</span>.</p>
                        </div>
                    </div>

                    <button 
                        onClick={retryAccess}
                        className="w-full py-4 bg-white/10 rounded-2xl font-black text-xs hover:bg-white/20 transition-all"
                    >
                        RE-INITIALIZE HARDWARE
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
      </main>
    </div>
  );
}
