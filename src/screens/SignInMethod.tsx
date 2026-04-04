import { motion } from "framer-motion";
import { ArrowLeft, Link2, KeyRound, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { cn } from "../lib/utils";
import { clearUserSession } from "../lib/payoutStore";

export default function SignInMethod() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("signin_platform");
    if (saved) setPlatform(saved);
    
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      // ALWAYS allow app's own origin (fixes localhost / tunnel / IP issues)
      const isSameOrigin = origin === window.location.origin;
      const isTrustedRemote = origin.endsWith('.run.app') || origin.includes('localhost') || /^http:\/\/10\./.test(origin) || /^http:\/\/192\./.test(origin);

      if (!isSameOrigin && !isTrustedRemote) {
        console.warn("Blocked message from untrusted origin:", origin);
        return;
      }
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const partnerId = event.data.payload.partnerId;
        setIsConnecting(true);
        
        try {
            await fetch("/api/auth/register-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    platform: localStorage.getItem("signin_platform") || "swiggy_zomato",
                    method: "oauth",
                    partnerId,
                    biometric_verified: true
                })
            });

            clearUserSession(); // ← wipe previous user's data FIRST
            localStorage.setItem("signin_method", "oauth");
            localStorage.setItem("partner_id", partnerId);
            localStorage.setItem("dummy_session", JSON.stringify({
                user: { id: partnerId, verified: true },
                expiry: new Date(Date.now() + 86400000).toISOString()
            }));
            window.dispatchEvent(new Event("auth-change"));
            navigate("/biometrics");
        } catch (error) {
            console.error("OAuth sync failed", error);
            clearUserSession(); // fallback: still clear old session
            localStorage.setItem("partner_id", partnerId);
            navigate("/biometrics");
        } finally {
            setIsConnecting(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

  const handleConnect = (specificPlatform: string) => {
    setIsConnecting(true);
    localStorage.setItem("specific_platform", specificPlatform);
    
    // Mock OAuth popup
    const width = 500;
    const height = 650;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    
    const authWindow = window.open(
        '/mock-oauth', 
        'oauth_popup', 
        `width=${width},height=${height},top=${top},left=${left},scrollbars=no,resizable=no`
    );

    if (!authWindow) {
        alert('Please allow popups for this site.');
        setIsConnecting(false);
    }
  };

  const getPlatformLabel = (id: string) => {
    if (id === "swiggy_zomato") return ["Swiggy", "Zomato"];
    if (id === "blinkit") return ["Blinkit", "Zepto"];
    if (id === "amazon") return ["Amazon", "Flipkart"];
    return [id];
  };

  const platformsToShow = getPlatformLabel(platform);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center p-4 border-b border-border/10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-secondary rounded-full">
          <ArrowLeft size={20} />
        </button>
        <span className="ml-2 font-bold tracking-tight">Nexus Sovereign</span>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        <div className="flex justify-center gap-2 mb-8">
          <div className="h-1 w-2 bg-secondary rounded-full" />
          <div className="h-1 w-8 bg-primary rounded-full" />
          <div className="h-1 w-2 bg-secondary rounded-full" />
        </div>

        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
        >
            <h1 className="text-3xl font-bold tracking-tight mb-3">How do you want to sign in?</h1>
            <p className="text-muted-foreground">Authenticate your account to sync coverage.</p>
        </motion.div>

        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
                {platformsToShow.map((p) => (
                    <button
                        key={p}
                        onClick={() => handleConnect(p)}
                        disabled={isConnecting}
                        className="w-full p-6 flex items-center gap-4 rounded-3xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all group"
                    >
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
                            {isConnecting ? (
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Link2 size={24} />
                            )}
                        </div>
                        <div className="text-left">
                            <h3 className="font-bold text-lg text-primary">Connect {p}</h3>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Trusted device verification • No OTP</p>
                        </div>
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-4 my-4">
                <div className="h-px bg-border/50 flex-1" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">OR USE CREDENTIALS</span>
                <div className="h-px bg-border/50 flex-1" />
            </div>

            <button
                onClick={() => {
                    localStorage.setItem("signin_method", "partner_id");
                    navigate("/signin-credentials");
                }}
                className="w-full p-6 flex items-center gap-4 rounded-3xl border border-border/50 bg-card hover:border-border transition-all"
            >
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                    <KeyRound size={24} />
                </div>
                <div className="text-left">
                    <h3 className="font-bold">Partner ID & Password</h3>
                    <p className="text-xs text-muted-foreground">Requires Phone & OTP verification.</p>
                </div>
            </button>
        </div>

        <div className="mt-8 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex gap-3">
            <CheckCircle2 className="text-blue-500 shrink-0 mt-0.5" size={18} />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
                Connect Account uses encrypted OAuth protocols. Nexus Sovereign never sees your platform password.
            </p>
        </div>
      </main>
    </div>
  );
}
