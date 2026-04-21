import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, CheckCircle2, ScanFace, XCircle, RefreshCcw, HelpCircle, Smartphone, ExternalLink, AlertCircle, Radar, Sparkles, X, Camera } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import Tesseract from "tesseract.js";
import { apiClient } from "../lib/apiClient";
import { cn } from "../lib/utils";
import { persistSessionBridge } from "../lib/sessionBridge";

export default function AadhaarVerify() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [scanProgress, setScanProgress] = useState(0);

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
      await new Promise(resolve => setTimeout(resolve, 1500));

      if (isAdmin && isFallback) {
        if (isSignup) {
            try {
              await apiClient.post("/api/admin/auth/aadhaar-fallback", {
                admin_id: adminId,
                aadhaar_number: cleaned,
              });
              localStorage.setItem("admin_id", adminId);
              localStorage.setItem("admin_role", "Insurer Admin");
              localStorage.setItem("admin_code", adminCode || localStorage.getItem("admin_code") || "");
              localStorage.setItem("admin_aadhaar", cleaned);
              window.dispatchEvent(new Event("admin-auth-change"));
              setStatus("success");
              setTimeout(() => navigate("/admin/dashboard", { replace: true }), 1500);
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
          try {
            const { data } = await apiClient.post("/api/admin/auth/aadhaar-signin", {
              aadhaar_number: cleaned,
              admin_code: adminCode || localStorage.getItem("admin_code") || "",
            });
            if (data.success) {
              localStorage.setItem("admin_id", data.admin.id);
              localStorage.setItem("admin_role", data.admin.role);
              localStorage.setItem("admin_aadhaar", cleaned);
              window.dispatchEvent(new Event("admin-auth-change"));
              setStatus("success");
              setTimeout(() => navigate("/admin/dashboard", { replace: true }), 1500);
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

      if (isAdmin) {
          setStatus("success");
          setTimeout(() => navigate("/biometrics", { state: { isAdmin: true, isSignup, adminId, adminCode } }), 1000);
          return;
      }

      const session = {
          user: { 
            id: localStorage.getItem("partner_id"), 
            aadhaarVerified: true,
            platform: localStorage.getItem("signin_platform")
          },
          expires: new Date(Date.now() + 3600000).toISOString()
      };
      try {
          await apiClient.post("/api/auth/register-user", {
              platform: localStorage.getItem("signin_platform"),
              method: localStorage.getItem("signin_method"),
              partnerId: localStorage.getItem("partner_id"),
              phone: localStorage.getItem("signin_phone"),
              aadhaar_verified: true,
              aadhaar_number: cleaned
          });
          await persistSessionBridge({
              partner_id: localStorage.getItem("partner_id"),
              nexus_session: JSON.stringify(session)
          });
      } catch (err) {
          console.warn("Express backend synced failed.");
      }
      setStatus("success");
      window.dispatchEvent(new Event("auth-change"));
      setTimeout(() => navigate("/home", { replace: true }), 1500);
    } catch (err: any) {
        setStatus("failed");
        setErrorMessage("Verification protocol failed.");
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    setStatus("scanning");
    setScanProgress(5);
    setErrorMessage("");
    setDeviceError(null);
    setRawErrorName(null);
    isCanceledRef.current = false;
    
    try {
        const worker = await Tesseract.createWorker('eng');
        setScanProgress(15);
        
        let attempts = 0;
        const scanLoop = setInterval(async () => {
            if (!webcamRef.current || isCanceledRef.current) {
                clearInterval(scanLoop);
                await worker.terminate();
                return;
            }

            const imageSrc = webcamRef.current.getScreenshot();
            if (!imageSrc) return;

            attempts++;
            setScanProgress(prev => Math.min(95, prev + (100 - prev) * 0.1));

            try {
                const { data: { text } } = await worker.recognize(imageSrc);
                const match = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
                if (match && match[0]) {
                    clearInterval(scanLoop);
                    await worker.terminate();
                    setScanProgress(100);
                    setAadhaarNumber(match[0]);
                    setIsScanning(false);
                    handleVerify(match[0]);
                }
            } catch (e) {
                 console.error("OCR Exception", e);
            }
        }, 1500);

        setTimeout(async () => {
            if (!isCanceledRef.current && isScanning && status !== "success") {
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
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#D4A056]/30 overflow-hidden">
      <header className="flex items-center justify-between p-6 px-4 md:px-8">
        <button onClick={() => navigate(-1)} className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group">
          <ArrowLeft size={20} className="text-[#D4A056] group-hover:-translate-x-1 transition-transform" />
        </button>
        <div className="flex flex-col items-center">
          <p className="text-[10px] text-[#D4A056] font-black uppercase tracking-[0.3em] mb-1">Nexus Sovereign</p>
          <h1 className="text-xl font-bold tracking-tight">Vault Entry</h1>
        </div>
        <div className="w-12 h-12 bg-[#D4A056]/10 rounded-2xl flex items-center justify-center border border-[#D4A056]/20 shadow-lg shadow-[#D4A056]/5">
          <Shield size={20} className="text-[#D4A056]" />
        </div>
      </header>

      <main className="flex-1 px-4 md:px-12 flex flex-col max-w-2xl mx-auto w-full relative pb-12">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#D4A056]/5 blur-[120px] rounded-full pointer-events-none opacity-40" />

        <div className="text-center mb-10 z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-3 py-1 bg-[#D4A056]/10 border border-[#D4A056]/20 rounded-full mb-6"
          >
            <Radar size={12} className="text-[#D4A056] animate-pulse" />
            <span className="text-[8px] font-black text-[#D4A056] uppercase tracking-[0.2em]">Identity Fallback Protocol</span>
          </motion.div>
          <h1 className="text-4xl font-black tracking-tighter mb-4 px-2 xl:text-5xl">Digital Card Lock</h1>
          <p className="text-white/40 text-sm leading-relaxed max-w-sm mx-auto font-medium">Biometric inconclusive. Align your physical card within the sensor frame to re-establish trust.</p>
        </div>

        {isScanning ? (
            <div className="flex-1 flex flex-col items-center z-10 w-full animate-in fade-in zoom-in duration-500">
                <div className="relative w-full aspect-[1.586/1] rounded-[2.5rem] overflow-hidden mb-10 border border-white/10 bg-black shadow-2xl">
                    {!deviceError && (
                        <Webcam
                            key={cameraKey}
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            screenshotQuality={1}
                            videoConstraints={videoConstraints}
                            className="w-full h-full object-cover grayscale-[0.2] contrast-[1.1] scale-105"
                            onUserMedia={() => setStatus("idle")}
                            onUserMediaError={handleCameraError}
                            disablePictureInPicture={true}
                            mirrored={false}
                            imageSmoothing={true}
                            forceScreenshotSourceSize={true}
                        />
                    )}
                    
                    {/* HUD Overlays */}
                    <div className="absolute inset-x-8 top-8 flex items-center justify-between z-20">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
                         <div className="w-2 h-2 rounded-full bg-[#D4A056] animate-pulse" />
                         <span className="text-[10px] font-bold text-white uppercase tracking-widest">Scanning Signal</span>
                      </div>
                      <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
                         <span className="text-[10px] font-mono text-[#D4A056]">{Math.round(scanProgress)}%</span>
                      </div>
                    </div>

                    {/* Tracking Brackets */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8 z-10">
                        <div className="relative w-full h-[85%] border-2 border-dashed border-[#D4A056]/30 rounded-[1.5rem] flex items-center justify-center">
                            {/* Brackets */}
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#D4A056]" />
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#D4A056]" />
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#D4A056]" />
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#D4A056]" />

                            <div className="absolute inset-x-0 bottom-[15%] h-14 bg-[#D4A056]/10 border-y border-[#D4A056]/20 flex items-center justify-center backdrop-blur-md">
                                <p className="text-[10px] font-black text-[#D4A056] uppercase tracking-[0.4em]">Center Identity Number</p>
                            </div>
                        </div>
                    </div>

                    {/* Progress Ring */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 100 100">
                      <circle
                        cx="50" cy="50" r="48"
                        fill="none"
                        stroke="#D4A056"
                        strokeWidth="0.5"
                        strokeDasharray={301.59}
                        strokeDashoffset={301.59 * (1 - scanProgress / 100)}
                        strokeLinecap="round"
                        className="transition-all duration-300 ease-out opacity-20"
                      />
                    </svg>

                    <motion.div
                        initial={{ top: "10%" }}
                        animate={{ top: "90%" }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute left-8 right-8 h-1 bg-gradient-to-r from-transparent via-[#D4A056] to-transparent shadow-[0_0_30px_#D4A056] z-10 opacity-30"
                    />
                </div>
                
                <div className="flex items-center gap-4 mb-10 w-full">
                    <button
                        onClick={() => {
                            isCanceledRef.current = true;
                            setIsScanning(false);
                            setStatus("idle");
                        }}
                        className="flex-1 py-5 rounded-[1.5rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-2 group"
                    >
                        <X size={18} className="text-white/40 group-hover:text-white transition-colors" />
                        ABORT ENGINE
                    </button>
                    <div className="px-6 py-5 rounded-[1.5rem] bg-[#D4A056]/10 border border-[#D4A056]/20 flex items-center justify-center">
                        <Sparkles size={20} className="text-[#D4A056] animate-pulse" />
                    </div>
                </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col z-10 w-full animate-in fade-in slide-in-from-bottom-5 duration-700">
                <button
                    onClick={startScanner}
                    className="group relative w-full bg-gradient-to-br from-[#D4A056]/10 to-transparent border border-[#D4A056]/20 py-12 rounded-[2.5rem] flex flex-col items-center gap-6 hover:border-[#D4A056]/40 transition-all mb-10 overflow-hidden shadow-2xl"
                >
                    <div className="absolute inset-0 bg-[#D4A056]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="w-16 h-16 rounded-3xl bg-[#D4A056]/10 border border-[#D4A056]/20 flex items-center justify-center text-[#D4A056] group-hover:scale-110 group-hover:bg-[#D4A056] group-hover:text-black transition-all">
                      <Camera size={32} />
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-black tracking-tight">ENGAGE OCR SENSOR</p>
                        <p className="text-[10px] font-black text-[#D4A056]/60 mt-1 uppercase tracking-[0.3em]">Precision Neural extraction</p>
                    </div>
                </button>

                <div className="flex items-center gap-6 mb-10">
                    <div className="h-px bg-white/5 flex-1" />
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">OR MANUAL OVERRIDE</span>
                    <div className="h-px bg-white/5 flex-1" />
                </div>

                <div className="space-y-8 mb-10">
                    <div className="group">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-4 block px-2 group-focus-within:text-[#D4A056] transition-colors">
                            12-Digit Identification Signature
                        </label>
                        <input
                            type="tel"
                            value={aadhaarNumber}
                            onChange={(e) => handleManualFormat(e.target.value)}
                            placeholder="0000 0000 0000"
                            className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] py-6 px-8 text-3xl font-black font-mono text-center tracking-[0.4em] flex items-center justify-center text-[#D4A056] placeholder:text-white/5 focus:outline-none focus:border-[#D4A056]/50 focus:ring-1 focus:ring-[#D4A056]/20 transition-all shadow-inner"
                        />
                         <AnimatePresence>
                            {aadhaarNumber.length > 0 && !isValid && (
                                <motion.p 
                                  initial={{ opacity: 0, y: -10 }} 
                                  animate={{ opacity: 1, y: 0 }} 
                                  className="text-[10px] text-red-400 mt-4 font-bold uppercase tracking-widest text-center flex items-center justify-center gap-2"
                                >
                                    <AlertCircle size={12} />
                                    Invalid cryptographic signature
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>

                    {status === "failed" && (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }} 
                          animate={{ opacity: 1, x: 0 }}
                          className="p-6 rounded-[1.5rem] bg-red-500/5 border border-red-500/20 flex items-center gap-4"
                        >
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                               <XCircle className="text-red-500" size={20} />
                            </div>
                            <p className="text-sm text-red-200/70 font-bold tracking-tight">{errorMessage}</p>
                        </motion.div>
                    )}
                </div>

                <button
                    onClick={() => handleVerify(aadhaarNumber)}
                    disabled={!isValid || status === "scanning" || status === "success"}
                    className={cn(
                        "w-full py-6 rounded-[2rem] font-black text-xl transition-all flex items-center justify-center gap-4 shadow-2xl group",
                        status === "success" 
                          ? "bg-emerald-500 text-white" 
                          : "bg-gradient-to-r from-[#D4A056] to-[#B8860B] text-black hover:scale-[1.03] active:scale-[0.98] disabled:opacity-30 disabled:grayscale transition-all"
                    )}
                >
                    {status === "scanning" ? (
                      <RefreshCcw className="w-6 h-6 animate-spin" />
                    ) : status === "success" ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <Shield className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                    )}
                    <span className="uppercase tracking-[0.1em]">
                      {status === "scanning" ? "Validating Signal" : status === "success" ? "Access Granted" : "Authorize Identity"}
                    </span>
                </button>
            </div>
        )}

        <AnimatePresence>
            {showTroubleshoot && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-end p-6"
                >
                  <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    className="w-full max-w-sm bg-[#111] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4A056]/5 rounded-full blur-3xl -mr-16 -mt-16" />
                    
                    <div className="flex items-start gap-5 mb-8">
                        <div className="p-4 bg-amber-500/10 rounded-[1.2rem] border border-amber-500/20">
                            <HelpCircle className="text-amber-500" size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold tracking-tight">Hardware Enclave</h3>
                            <p className="text-white/40 text-[10px] font-mono mt-1">
                                EXCEPTION: <span className="text-[#D4A056]">{rawErrorName}</span>
                            </p>
                        </div>
                    </div>

                    <div className="space-y-6 mb-10 text-left">
                        {deviceError === "HARDWARE_BUSY" && (
                            <div className="flex gap-4 p-4 bg-red-500/5 rounded-2xl border border-red-500/10">
                                <AlertCircle className="text-red-500 shrink-0" size={18} />
                                <p className="text-xs text-white/70 leading-relaxed font-medium">Camera is locked by another session. Please close all background apps.</p>
                            </div>
                        )}
                        {deviceError === "INSECURE_CONTEXT" && (
                            <div className="flex gap-4 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                                <Smartphone className="text-amber-500 shrink-0" size={18} />
                                <p className="text-xs text-white/70 leading-relaxed font-medium">Insecure Tunnel. Ensure identity synchronization is occurring over <span className="text-[#D4A056] font-bold">HTTPS</span>.</p>
                            </div>
                        )}
                        <div className="flex gap-4 px-1">
                            <Shield className="text-[#D4A056] shrink-0 opacity-40" size={18} />
                            <p className="text-[11px] text-white/50 leading-relaxed">Ensure camera permissions are toggled 'ON' in your system settings enclave.</p>
                        </div>
                    </div>

                    <button 
                        onClick={retryAccess}
                        className="w-full py-5 bg-white text-black rounded-[1.5rem] font-black text-sm hover:bg-[#D4A056] transition-all flex items-center justify-center gap-3"
                    >
                        <RefreshCcw size={16} />
                        RE-INITIALIZE SENSOR
                    </button>
                    
                    <button 
                      onClick={() => setShowTroubleshoot(false)}
                      className="w-full py-4 mt-2 text-white/40 font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors"
                    >
                      Dismiss Portal
                    </button>
                  </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
      </main>
    </div>
  );
}
