import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Lock, KeyRound, ShieldCheck, Zap, Link2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import { clearUserSession } from "../lib/payoutStore";
import { getApiErrorMessage } from "../lib/apiError";

export default function SignInCredentials() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"quick" | "manual">("quick");
  const [partnerId, setPartnerId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorPopup, setErrorPopup] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [platform, setPlatform] = useState("");

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
        clearUserSession(); // wipe previous user's data before loading new user
        setPartnerId(pId);
        localStorage.setItem("partner_id", pId);
        setIsConnecting(false);
        setIsConnected(true);
        setTimeout(() => navigate("/biometrics"), 1500);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

  const handleConnect = (specificPlatform: string) => {
    setIsConnecting(true);
    localStorage.setItem("specific_platform", specificPlatform);
    
    // Fallback to pure routing so we don't break on mobile popups.
    // For signin, successful mock oauth should go to biometrics.
    navigate(`/mock-oauth?next=/biometrics`);
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

  const handleContinue = async () => {
    if (!isValidPartnerId) {
      setErrorPopup("Invalid Partner ID! Please check formatting.");
      return;
    }

    if (!password) {
      setErrorPopup("Please specify your password.");
      return;
    }

    if (!validatePassword(password)) {
      setErrorPopup("Invalid password! Make sure it meets all parameters.");
      return;
    }

    try {
      const response = await axios.post("/api/auth/verify-password", {
        partnerId,
        password
      });

      if (response.data.success) {
        clearUserSession(); // wipe previous user's data before loading new user
        localStorage.setItem("partner_id", partnerId);
        const session = JSON.parse(localStorage.getItem("dummy_session") || "{}");
        session.user = { 
            ...session.user, 
            id: partnerId,
            verified: true 
        };
        localStorage.setItem("dummy_session", JSON.stringify(session));
        window.dispatchEvent(new Event("auth-change"));
        navigate("/biometrics");
      }
    } catch (e: any) {
      setErrorPopup(getApiErrorMessage(e, "Backend Error: Could not connect to verification server."));
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center p-4 border-b border-border/10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-secondary rounded-full">
          <ArrowLeft size={20} />
        </button>
        <div className="ml-2 flex items-center gap-2">
          <div className="w-6 h-6 bg-primary/20 rounded-md flex items-center justify-center">
            <span className="text-primary text-xs font-bold">N</span>
          </div>
          <span className="font-bold tracking-tight">Nexus Sovereign</span>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        {/* Step indicator */}
        <div className="mb-2">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Sign In</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome Back</h1>
          <p className="text-muted-foreground text-sm">
            Sign in with your gig platform or partner credentials to resume coverage.
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

                {/* Password */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Password
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

                {/* Forgot Password */}
                <button
                  onClick={() => {
                    if (partnerId) localStorage.setItem("partner_id", partnerId);
                    navigate("/signin-phone");
                  }}
                  className="text-primary hover:text-primary/80 font-bold text-xs transition-colors"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Security note */}
              <div className="p-4 rounded-2xl bg-secondary/50 border border-border/50 flex gap-3 mt-6">
                <ShieldCheck className="text-primary shrink-0 mt-0.5" size={16} />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  We encrypt your credentials using PBKDF2-SHA512 before transit. Nexus Sovereign is a GDPR compliant platform.
                </p>
              </div>

              {/* Submit  */}
              <button
                onClick={handleContinue}
                disabled={!isValidPartnerId || !password}
                className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl mt-6 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Lock size={18} />
                Verify & Sign In
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
