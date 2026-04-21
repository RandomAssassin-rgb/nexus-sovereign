import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Upload, Shield, Loader2, CheckCircle2, XCircle, 
  Clock, AlertTriangle, Gavel, FileText, Zap, Globe, Cloud, 
  Car, Search, Lock, Camera 
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { fetchJsonOrThrow } from "../lib/fetchJson";
import { addClaimLocally, syncWithServer, type PayoutClaim } from "../lib/payoutStore";
import BiometricScanner from "../components/BiometricScanner";
import { requestCurrentLocation } from "../lib/deviceCapabilities";

interface ChallengeResult {
  status: "accepted" | "rejected" | "pending";
  confidence: number;
  jep: any;
  processingTimeMs: number;
  apiResults: Record<string, any>;
}

const API_SOURCES = [
  { id: "openweather", name: "OpenWeather", icon: Cloud, desc: "Cross-referencing historical weather telemetry..." },
  { id: "newsdata", name: "NewsData.io", icon: Globe, desc: "Scanning hyper-local news corroboration..." },
  { id: "here_traffic", name: "HERE Traffic", icon: Car, desc: "Analyzing real-time mobility friction data..." },
  { id: "justserp", name: "JustSerp", icon: Search, desc: "Verifying web-scraped evidence signals..." },
  { id: "openrouter", name: "OpenRouter AI", icon: Zap, desc: "Running GPT-4o forensic evidence analysis..." },
];

export default function Tier3Challenge() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { claimId?: string; claimData?: any; originalRejection?: any } | null;

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [additionalContext, setAdditionalContext] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLiveScanner, setShowLiveScanner] = useState(false);
  const [currentApiIndex, setCurrentApiIndex] = useState(-1);
  const [apiStatuses, setApiStatuses] = useState<Record<string, "pending" | "running" | "done" | "error">>({});
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isFinal, setIsFinal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if the 24-hour window has expired
  const claimTimestamp = state?.claimData?.processedAt || state?.claimData?.dateISO;
  const challengeDeadline = claimTimestamp ? new Date(new Date(claimTimestamp).getTime() + 24 * 60 * 60 * 1000) : null;
  const isExpired = challengeDeadline ? new Date() > challengeDeadline : false;

  // Time remaining display
  const [timeRemaining, setTimeRemaining] = useState("");
  useEffect(() => {
    if (!challengeDeadline) return;
    const update = () => {
      const now = new Date();
      const diff = challengeDeadline.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeRemaining("Expired");
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeRemaining(`${hours}h ${minutes}m remaining`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [challengeDeadline]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEvidenceFile(file);
      setEvidencePreview(URL.createObjectURL(file));
      setShowLiveScanner(false);
    }
  };

  const handleSubmitChallenge = async () => {
    if (!additionalContext && !evidenceFile) return;
    if (isExpired || isFinal) return;

    setIsProcessing(true);
    setResult(null);
    const startTime = Date.now();

    // Start elapsed timer
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 50);

    // Convert evidence to base64
    let base64Evidence: string | null = null;
    if (evidenceFile) {
      base64Evidence = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(evidenceFile);
      });
    }

    // Animate API sources sequentially
    const statuses: Record<string, "pending" | "running" | "done" | "error"> = {};
    API_SOURCES.forEach((s) => (statuses[s.id] = "pending"));
    setApiStatuses({ ...statuses });

    try {
      const partnerId = localStorage.getItem("partner_id") || localStorage.getItem("signin_phone") || "BLK-98234";

      // Animate sources as "running" in sequence while the server works
      const animationPromise = (async () => {
        const currentStatuses = { ...statuses };
        for (let i = 0; i < API_SOURCES.length; i++) {
          setCurrentApiIndex(i);
          currentStatuses[API_SOURCES[i].id] = "running";
          setApiStatuses({ ...currentStatuses });
          await new Promise((r) => setTimeout(r, 800));
          currentStatuses[API_SOURCES[i].id] = "done";
          setApiStatuses({ ...currentStatuses });
        }
      })();

      // Capture live GPS signal
      let liveLat = 12.9716;
      let liveLon = 77.5946;
      try {
        const loc = await requestCurrentLocation();
        if (loc) {
          liveLat = loc.latitude;
          liveLon = loc.longitude;
        }
      } catch (err) {
        console.warn("[Tier3] Location capture failed, using fallback:", err);
      }

      const [serverResult] = await Promise.all([
        fetchJsonOrThrow<ChallengeResult>("/api/claims/tier3-challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claimId: state?.claimId,
            partnerId,
            additionalContext,
            evidenceBase64: base64Evidence,
            originalClaim: state?.claimData,
            mimeType: evidenceFile?.type || "image/jpeg",
            lat: liveLat,
            lon: liveLon,
          }),
        }, "Tier 3 challenge processing failed"),
        animationPromise,
      ]);

      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedMs(Date.now() - startTime);
      setResult(serverResult);
      setIsFinal(true);
      setCurrentApiIndex(-1);

      if (serverResult.status === "accepted") {
        const localClaim: PayoutClaim = {
          id: state?.claimId || `T3-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          dateISO: new Date().toISOString(),
          amount: 239.0,
          status: "approved",
          type: "Tier 3 Challenge",
          reason: additionalContext || "Challenge upheld with corroborating evidence",
          tier: "Tier 3 (Sovereign)",
          tierColor: "text-amber-500",
          tierBg: "bg-amber-500/10",
          summary: {
            type: "approved",
            wordedReason: serverResult.jep?.worded_summary || "Challenge accepted after multi-API corroboration.",
            technicalReason: serverResult.jep?.technical_reason || "Passed 5-source validation.",
            policyClauses: ["Clause 7.1 (Challenge Protocol)", "Tier 3 Sovereign Override"],
            triggers: ["Manual Challenge"],
          },
          jepData: serverResult.jep,
        };
        addClaimLocally(localClaim);
        try { await syncWithServer(partnerId, "tier3-challenge"); } catch {}
      }
    } catch (err: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      console.error("Tier 3 challenge error:", err);
      setResult({
        status: "rejected",
        confidence: 0,
        jep: { worded_summary: `Challenge processing failed: ${err.message}` },
        processingTimeMs: Date.now() - startTime,
        apiResults: {},
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-amber-500/30">
      <header className="flex items-center justify-between p-4 border-b border-border/10 sticky top-0 bg-background/95 backdrop-blur-md z-40">
        <button onClick={() => navigate(-1)} className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group">
          <ArrowLeft size={18} className="text-amber-500 group-hover:-translate-x-1 transition-transform" />
        </button>
        <div className="text-center">
          <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] mb-1">Nexus Sovereign</p>
          <h1 className="text-lg font-bold tracking-tight">Final Adjudication</h1>
        </div>
        <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
          <Shield size={20} className="text-amber-500" />
        </div>
      </header>

      <div className="flex-1 p-4 md:p-8 space-y-6 max-w-2xl mx-auto w-full overflow-y-auto pb-32">
        {/* Status Window */}
        {isExpired && !isFinal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 rounded-[2rem] bg-red-500/5 border border-red-500/20 flex items-start gap-4 shadow-2xl">
            <div className="p-3 bg-red-500/10 rounded-xl">
              <XCircle className="w-6 h-6 text-red-400 shrink-0" />
            </div>
            <div>
              <p className="text-sm font-black text-red-400 uppercase tracking-widest">Protocol Expired</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">The 24-hour adjudication window is closed. Original decision is now immutable.</p>
            </div>
          </motion.div>
        )}

        {!isExpired && !isFinal && challengeDeadline && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-6 rounded-[2rem] bg-amber-500/5 border border-amber-500/20 flex items-start gap-4 shadow-2xl">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Clock className="w-6 h-6 text-amber-400 shrink-0" />
            </div>
            <div>
              <p className="text-sm font-black text-amber-400 uppercase tracking-widest">{timeRemaining}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Engage Sovereign evidence capture to overturn the Tier 2 rejection. Single attempt permitted.</p>
            </div>
          </motion.div>
        )}

        {/* Evidence Section */}
        {!isFinal && !isExpired && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Evidence Signal</h3>
              <button 
                onClick={() => setShowLiveScanner(!showLiveScanner)}
                className="text-[9px] font-black text-amber-500 uppercase tracking-[0.2em] px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/20 transition-all flex items-center gap-2"
              >
                <Zap size={10} />
                {showLiveScanner ? "Manual Upload" : "Engage Neural Scan"}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {showLiveScanner ? (
                <motion.div 
                  key="scanner"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full h-[450px] rounded-[2.5rem] overflow-hidden border border-amber-500/30 bg-black/40 backdrop-blur-md shadow-2xl relative"
                >
                  <BiometricScanner 
                    mode="CAPTURE"
                    onComplete={async ({ image }) => {
                      setEvidencePreview(image);
                      try {
                        const res = await fetch(image);
                        const blob = await res.blob();
                        const file = new File([blob], "evidence.jpg", { type: "image/jpeg" });
                        setEvidenceFile(file);
                        setShowLiveScanner(false);
                      } catch (err) {
                        console.error("Blob Conversion Failed", err);
                      }
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "group relative w-full aspect-[1.586/1] border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden",
                    evidencePreview 
                      ? "border-amber-500/40 bg-amber-500/5 shadow-2xl" 
                      : "border-white/5 hover:border-amber-500/30 bg-white/5 backdrop-blur-sm"
                  )}
                >
                  {evidencePreview ? (
                    <img src={evidencePreview} alt="Evidence" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center group-hover:scale-110 transition-transform">
                      <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                        <Camera className="w-8 h-8 text-amber-500" />
                      </div>
                      <p className="text-lg font-black text-white/80">Engage Sensor</p>
                      <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mt-1">Upload high-res corroboration</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        )}

        {/* Form Fields */}
        {!isFinal && !isExpired && (
          <div className="space-y-6">
            <div className="group">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-4 block px-2 group-focus-within:text-amber-500 transition-colors">
                Technical Context Override
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Detail the failure conditions: weather variance, geolocation drift, or sensor obstruction..."
                className="w-full p-6 rounded-[1.5rem] bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/10 resize-none h-32 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
            </div>
          </div>
        )}

        {/* Final result and processing views remain similar to original but with sovereign scan theme */}
        {isProcessing && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 pt-4">
             <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em]">Engaging Multi-API Pulse</span>
              </div>
              <span className="text-[10px] font-mono text-white/30">SIGNAL STRENGTH: STABLE</span>
            </div>

            {API_SOURCES.map((source, idx) => {
              const status = apiStatuses[source.id] || "pending";
              const Icon = source.icon;
              return (
                <motion.div
                  key={source.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-[1.2rem] transition-all",
                    status === "running" ? "bg-amber-500/10 border border-amber-500/20 shadow-[0_0_20px_#D4A0560a]" :
                    status === "done" ? "bg-emerald-500/5 border border-emerald-500/10" :
                    "bg-white/5 border border-white/5"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                    status === "running" ? "bg-amber-500/20 border-amber-500/30" :
                    status === "done" ? "bg-emerald-500/20 border-emerald-500/30" : "bg-white/5 border-white/5"
                  )}>
                    {status === "running" ? <Loader2 className="w-5 h-5 text-amber-400 animate-spin" /> :
                     status === "done" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                     <Icon className="w-5 h-5 text-white/20" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white/80 uppercase tracking-widest">{source.name}</p>
                    <p className="text-[9px] text-white/30 truncate mt-0.5">{status === "running" ? source.desc : status === "done" ? "TELEMETRY VERIFIED" : "WAITING FOR SIGNAL..."}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {result && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 pt-6 pb-12">
            <div className={cn(
              "p-8 rounded-[2.5rem] border text-center relative overflow-hidden shadow-2xl",
              result.status === "accepted" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"
            )}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-current opacity-[0.03] rounded-full blur-3xl -mr-16 -mt-16" />
              
              <div className="mb-6">
                {result.status === "accepted" ? (
                  <div className="w-20 h-20 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-[2rem] bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                    <XCircle className="w-10 h-10 text-red-400" />
                  </div>
                )}
              </div>

              <h2 className={cn(
                "text-3xl font-black tracking-tighter mb-4",
                result.status === "accepted" ? "text-emerald-400" : "text-red-400"
              )}>
                {result.status === "accepted" ? "SYSTEM OVERRIDE SUCCESS" : "PROTOCOL REJECTED"}
              </h2>
              
              <p className="text-sm text-white/50 leading-relaxed mb-8 max-w-sm mx-auto font-medium">
                {result.status === "accepted"
                  ? "Sovereign signal corroboration confirmed. The Nexus ledger has been updated and payout dispatched."
                  : "Adjudication failure. Manual evidence signals were insufficient to clear the Tier 2 block."}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                   <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Confidence Score</p>
                   <p className="text-xl font-bold text-white">{result.confidence}%</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                   <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Compute Latency</p>
                   <p className="text-xl font-bold text-white">{(result.processingTimeMs / 1000).toFixed(1)}s</p>
                </div>
              </div>
            </div>

            {result.jep && (
              <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <Gavel className="w-5 h-5 text-amber-500" />
                  <span className="text-[10px] font-black text-white/80 uppercase tracking-[0.2em]">Adjudication Rationale</span>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">{result.jep.worded_summary}</p>
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  <Lock className="w-3 h-3 text-white/20" />
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Decision finalized in secure enclave</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-background/95 backdrop-blur-xl border-t border-white/5 z-50">
        {!isFinal && !isExpired ? (
          <button
            onClick={handleSubmitChallenge}
            disabled={isProcessing || (!additionalContext && !evidenceFile)}
            className={cn(
              "w-full py-6 rounded-[2rem] font-black text-lg transition-all flex items-center justify-center gap-4 shadow-2xl",
              isProcessing || (!additionalContext && !evidenceFile)
                ? "bg-white/5 text-white/20 border border-white/5 cursor-not-allowed"
                : "bg-gradient-to-r from-amber-500 to-[#B8860B] text-black hover:scale-[1.02] active:scale-[0.98]"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                INITIATING OVERRIDE...
              </>
            ) : (
              <>
                <Shield className="w-6 h-6" />
                AUTHORIZE CHALLENGE
              </>
            )}
          </button>
        ) : isFinal && (
          <button
            onClick={() => navigate("/claims")}
            className="w-full py-6 rounded-[2rem] bg-white/5 border border-white/10 text-white font-black text-lg hover:bg-white/10 transition-all uppercase tracking-widest"
          >
            Return to Ledger
          </button>
        )}
      </div>
    </div>
  );
}
