import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Bell, Fingerprint, ShieldCheck, Link2, CheckCircle2, Zap, KeyRound, Eye, EyeOff, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import { clearUserSession } from "../lib/payoutStore";
import { getApiErrorMessage } from "../lib/apiError";

export default function PartnerVerify() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"quick" | "manual">("quick");
  const [fullName, setFullName] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [platform, setPlatform] = useState("");
  const [errorPopup, setErrorPopup] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("signin_platform") || "blinkit";
    setPlatform(saved);

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      // Allow any origin for local development testing, or specific production domains
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !/^http:\/\/10\./.test(origin) && !/^http:\/\/192\./.test(origin)) {
        console.warn("Blocked message from untrusted origin:", origin);
        return;
      }
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const pId = event.data.payload.partnerId;
        setPartnerId(pId);
        localStorage.setItem("partner_id", pId);
        setIsConnecting(false);
        setIsConnected(true);
        setTimeout(() => navigate("/biometrics", { state: { isSignup: true } }), 1500);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

  const handleConnect = (specificPlatform: string) => {
    setIsConnecting(true);
    localStorage.setItem("specific_platform", specificPlatform);
    
    // Ensure we capture the intended next step.
    navigate("/mock-oauth?next=/biometrics");
  };

  const getPlatformLabel = (id: string) => {
    if (id === "swiggy_zomato") return ["Swiggy", "Zomato"];
    if (id === "blinkit") return ["Blinkit", "Zepto"];
    if (id === "amazon") return ["Amazon", "Flipkart"];
    return [id];
  };

  const platformsToShow = getPlatformLabel(platform);

  const validatePartnerId = (id: string) => /^[A-Za-z0-9_-]{5,20}$/.test(id);
  const validatePassword = (pwd: string) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,16}$/.test(pwd);

  const isValidPartnerId = validatePartnerId(partnerId);

  const handleVerify = async () => {
    if (!fullName || fullName.trim().length < 2) {
      setErrorPopup("Please enter your full name.");
      return;
    }
    if (!isValidPartnerId) {
      setErrorPopup("Invalid Partner ID! Please check the formatting.");
      return;
    }
    if (!password || !confirmPassword) {
      setErrorPopup("Please fill out both password fields.");
      return;
    }
    if (!validatePassword(password)) {
      setErrorPopup("Invalid password! Make sure it meets all parameters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorPopup("Passwords don't match!");
      return;
    }
    
    try {
      // Clean slate before registration to prevent leakage
      clearUserSession();

      const response = await axios.post("/api/auth/register-password", {
        partnerId,
        password,
        fullName: fullName.trim()
      });

      if (response.data.success) {
        localStorage.setItem("partner_id", partnerId);
        navigate("/signin-phone");
      }
    } catch (e: any) {
      setErrorPopup(getApiErrorMessage(e, "Backend Error: Could not connect to authentication server."));
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary/20 rounded-md flex items-center justify-center">
              <span className="text-primary text-xs font-bold">N</span>
            </div>
            <span className="font-bold tracking-tight">Nexus Sovereign</span>
          </div>
        </div>
        <button className="p-2 hover:bg-secondary rounded-full relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
        </button>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        {/* Step indicator */}
        <div className="mb-2">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Step 2 of 3</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-3xl font-bold tracking-tight mb-2">Connect Account</h1>
          <p className="text-muted-foreground text-sm">
            Link your gig platform account to verify your identity and income history.
          </p>
        </motion.div>

        {/* Tab Switch */}
        <div className="grid grid-cols-2 gap-0 mb-6 bg-card border border-border/50 rounded-xl overflow-hidden">
          <button
            onClick={() => setActiveTab("quick")}
            className={`py-3 text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === "quick"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Quick Connect
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`py-3 text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === "manual"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Manual Login
          </button>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "quick" ? (
            <motion.div
              key="quick"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              {!isConnected ? (
                <div className="space-y-3">
                  {platformsToShow.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleConnect(p)}
                      disabled={isConnecting}
                      className="w-full bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-4 hover:border-primary/50 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                        <Zap className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 text-left">
                        <h4 className="font-bold text-base">Connect {p}</h4>
                        <p className="text-xs text-muted-foreground">Secure OAuth Login</p>
                      </div>
                      {isConnecting ? (
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Link2 size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center gap-3">
                  <CheckCircle2 className="text-emerald-500" size={40} />
                  <p className="font-bold text-emerald-500 text-lg">Account Connected</p>
                  <p className="text-xs text-muted-foreground font-mono">ID: {partnerId}</p>
                </div>
              )}

              {/* Security note */}
              <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex gap-3 mt-6">
                <ShieldCheck className="text-blue-400 shrink-0 mt-0.5" size={16} />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Quick connect securely authenticates you via the platform's official login. We do not store your password.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="manual"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Full Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rahul Kumar"
                      className="w-full bg-card border border-border/50 rounded-xl p-4 text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all pl-12"
                    />
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  </div>
                </div>

                {/* Partner ID */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Partner ID
                  </label>
                  <input
                    type="text"
                    value={partnerId}
                    onChange={(e) => setPartnerId(e.target.value)}
                    placeholder="e.g. BLK-98234"
                    className="w-full bg-card border border-border/50 rounded-xl p-4 text-lg font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                  {partnerId.length > 0 && !isValidPartnerId && (
                    <p className="text-xs text-red-500 mt-2 font-mono">
                      Invalid format. Must be 5-20 characters (alphanumeric, hyphens, underscores).
                    </p>
                  )}
                </div>

                {/* Set Password */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Set Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-card border border-border/50 rounded-xl p-4 text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all pr-16"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/60 mt-1.5">
                    8-16 chars • 1 uppercase • 1 lowercase • 1 number • 1 symbol
                  </p>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-card border border-border/50 rounded-xl p-4 text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all pr-16"
                    />
                    <button
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Security note */}
              <div className="p-4 rounded-2xl bg-secondary/50 border border-border/50 flex gap-3 mt-6">
                <ShieldCheck className="text-primary shrink-0 mt-0.5" size={16} />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Your credentials are encrypted end-to-end using PBKDF2-SHA512 before transit. We only access payout history to calculate your Sovereign Shield premium.
                </p>
              </div>

              {/* Submit */}
              <button
                onClick={handleVerify}
                disabled={!isValidPartnerId || !password || !confirmPassword}
                className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl mt-6 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <KeyRound size={18} />
                Register & Continue
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Popup */}
        {errorPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-card border border-destructive/50 rounded-2xl p-6 shadow-2xl max-w-sm w-full"
            >
              <h3 className="text-xl font-bold text-destructive mb-2">Error</h3>
              <p className="text-sm text-muted-foreground mb-6">{errorPopup}</p>
              <button
                onClick={() => setErrorPopup("")}
                className="w-full bg-destructive text-destructive-foreground font-bold py-3 rounded-xl hover:bg-destructive/90 transition-colors"
              >
                Okay
              </button>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
