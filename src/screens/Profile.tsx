import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Share2, ShieldCheck, Award, Star, LogOut, ChevronRight, Moon, Sun, Camera, Radar, Wallet, Fingerprint, X, Shield, AlertTriangle, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme } from "../components/theme-provider";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import NotificationBell from "../components/NotificationBell";
import { clearUserSession } from "../lib/payoutStore";
import { apiClient } from "../lib/apiClient";
import { clearSessionBridge } from "../lib/sessionBridge";
import BiometricScanner from "../components/BiometricScanner";

export default function Profile() {
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [faceImageState, setFaceImageState] = useState<string | null>(null);
  const [trustPassport, setTrustPassport] = useState<any>(null);
  const [passportLoading, setPassportLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const pid = localStorage.getItem("partner_id") || "BLK-98234";
      const [{ data }, passportRes] = await Promise.all([
        supabase
        .from('users')
        .select('*')
        .eq('partnerId', pid)
        .single(),
        apiClient.get(`/api/user/trust-passport?partnerId=${pid}`).catch(() => ({ data: null })),
      ]);
      
      if (data) {
        setUserProfile(data);
        setFaceImageState(data.avatar_url || localStorage.getItem("face_image"));
      }
      setTrustPassport(passportRes?.data || null);
      setPassportLoading(false);
    };
    fetchProfile();
  }, []);

  const handleBiometricComplete = async ({ descriptor, image }: { descriptor: Float32Array; image: string }) => {
    setIsUploading(true);
    setShowScanner(false);
    
    try {
      const partnerId = localStorage.getItem("partner_id") || "BLK-98234";
      
      // Update descriptors
      localStorage.setItem("face_descriptor", JSON.stringify(Array.from(descriptor)));

      // 2. Update User Profile in Database
      const { error: updateError } = await supabase
        .from('users')
        .update({ face_descriptor: Array.from(descriptor) })
        .eq('partnerId', partnerId);
      
      if (updateError) throw updateError;
      
      setFaceImageState(image);
      localStorage.setItem("face_image", image);

      alert("Biometric anchors updated successfully.");
      setIsUploading(false);
    } catch (error: any) {
      console.error("Error updating biometrics:", error);
      alert(`Failed to update neural pattern: ${error.message}`);
      setIsUploading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("nexus.sovereign/ref/BLK982");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    clearUserSession();
    await clearSessionBridge().catch(() => undefined);
    window.dispatchEvent(new Event("auth-change"));
    window.dispatchEvent(new Event("admin-auth-change"));
    navigate("/", { replace: true });
  };

  const trustScoreDisplay = trustPassport?.overview?.trust_score || userProfile?.trust_score || 842;

  return (
    <div className="min-h-full flex flex-col bg-background font-sans">
      <header className="nexus-page-header">
        <div>
          <div className="nexus-section-eyebrow mb-2">Identity & account</div>
          <h1 className="nexus-page-title text-3xl font-bold tracking-tight">Worker profile</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="nexus-icon-button"
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="nexus-app-main space-y-6 pb-24">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="nexus-panel-hero flex items-center gap-5 p-6 rounded-[2.5rem] bg-gradient-to-br from-card to-card/50 border-primary/20 shadow-xl"
        >
          <div 
            className="relative w-20 h-20 bg-primary/20 rounded-3xl flex items-center justify-center border border-primary/30 shrink-0 overflow-hidden group cursor-pointer shadow-inner"
            onClick={() => setShowScanner(true)}
          >
            {faceImageState ? (
              <img src={faceImageState} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-primary" />
            )}
            
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
              <Camera className="w-6 h-6 text-primary mb-1" />
              <span className="text-[8px] font-bold uppercase tracking-widest text-white">Live Scan</span>
            </div>
            
            {isUploading && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-1">{userProfile?.full_name || "Nexus Rider"}</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <ShieldCheck size={12} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Verified Identity</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {localStorage.getItem("partner_id") || "BLK-98234"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Global Trust Posture */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* Trust Score */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="nexus-panel relative overflow-hidden rounded-[2rem] p-6 group"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-amber-500/10 transition-colors" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2 tracking-tight">
                  <Award size={18} className="text-amber-500" />
                  Trust Posture
                </h3>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Actuarial Rating</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-black text-amber-500 tracking-tighter tabular-nums">{trustScoreDisplay}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                   <Sparkles size={10} className="text-emerald-500 animate-pulse" />
                   <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Peak Performance</p>
                </div>
              </div>
            </div>
            <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden relative z-10">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: "84%" }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500" 
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => navigate("/trust-passport")}
            className="nexus-panel rounded-[2rem] p-6 cursor-pointer hover:border-primary/40 transition-all hover:bg-primary/5 group relative overflow-hidden flex flex-col justify-center"
          >
            <div className="absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="flex items-center gap-3 mb-3">
               <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-black transition-all">
                  <Radar size={20} />
               </div>
               <div>
                  <h4 className="font-bold tracking-tight">Identity Enclave</h4>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Diagnostics & Biometrics</p>
               </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Verify your multi-source fraud mesh data and biometric lock status.
            </p>
          </motion.div>
        </div>

        {/* Viral Loop / Referral */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="nexus-panel relative overflow-hidden rounded-[2rem] border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-6"
        >
          <div className="flex items-start gap-5 mb-5">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <Star className="w-7 h-7 text-black" />
            </div>
            <div>
              <h3 className="font-bold text-xl tracking-tight mb-1">Refer & Accelerate</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Invite fellow riders to the Sovereign platform. You get <strong className="text-primary">+50 Trust Points</strong> per verified node.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="relative flex-1 rounded-2xl border border-border bg-background py-4 text-xs font-mono font-bold transition-all hover:border-primary/50 text-center"
            >
              {copied ? (
                <span className="text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-2"><ShieldCheck size={14}/> Node Link Copied</span>
              ) : (
                "NEXUS.SOVEREIGN/REF/BLK982"
              )}
            </button>
            <button className="nexus-button-primary px-6 rounded-2xl shadow-lg shadow-primary/10">
              <Share2 size={20} />
            </button>
          </div>
        </motion.div>

        {/* Settings Matrix */}
        <div className="nexus-section-stack space-y-3">
          <div className="nexus-section-heading px-2">
             <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Enclave Configuration</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: "Neural Lock Status", value: "Active", icon: Fingerprint, detail: "Industrial Grade", color: "text-emerald-500" },
              { label: "Payout Enclave", value: "9876543210@ybl", icon: Wallet, detail: "Instant Settle" },
              { label: "Security Protocol", value: "RBAC-2.4", icon: Shield, detail: "RBI Regulated" },
              { label: "Interface Theme", value: theme.toUpperCase(), icon: theme === 'dark' ? Moon : Sun, detail: "Dynamic OS" },
            ].map((item, i) => (
              <button key={i} className="flex items-center justify-between p-5 rounded-[1.5rem] bg-card/40 border border-border/50 hover:border-primary/30 transition-all hover:translate-y-[-2px]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground">
                    <item.icon size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold tracking-tight">{item.label}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">{item.detail}</p>
                  </div>
                </div>
                <div className="text-right">
                   <p className={cn("text-xs font-mono font-bold", item.color)}>{item.value}</p>
                   <ChevronRight size={14} className="text-muted-foreground ml-auto mt-1" />
                </div>
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-3 p-5 text-destructive font-black uppercase tracking-[0.2em] hover:bg-destructive/5 rounded-3xl transition-all border border-transparent hover:border-destructive/20 mt-4 group"
        >
          <LogOut size={20} className="group-hover:translate-x-[-4px] transition-transform" />
          Purge Session
        </button>
      </main>

      {/* Biometric Scanner Overlay */}
      <AnimatePresence>
        {showScanner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-sm flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter text-white">Neural Registration</h2>
                  <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Protocol: Sovereign Scan 2.5</p>
                </div>
                <button 
                  onClick={() => setShowScanner(false)}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors border border-white/10"
                >
                  <X size={20} />
                </button>
              </div>

              <BiometricScanner 
                mode="CAPTURE"
                onComplete={handleBiometricComplete}
                className="w-full"
              />

              <div className="mt-8 p-4 rounded-2xl bg-primary/5 border border-primary/20">
                <p className="text-[10px] items-start flex gap-2 text-primary leading-relaxed font-bold uppercase tracking-wider">
                  <AlertTriangle size={12} className="shrink-0" />
                  Ensure you are in a well-lit environment. Micro-movements are required to confirm liveness and prevent spoofing.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
