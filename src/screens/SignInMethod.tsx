import { motion } from "framer-motion";
import { ArrowLeft, Link2, KeyRound, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { cn } from "../lib/utils";
import { clearUserSession } from "../lib/payoutStore";
import AuthShell from "../components/AuthShell";
import { clearSessionBridge, persistSessionBridge } from "../lib/sessionBridge";
import { apiClient } from "../lib/apiClient";
import { loadBiometricModels } from "../lib/biometricService";

export default function SignInMethod() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const resolveFaceDescriptor = useCallback(async (partnerId: string) => {
    try {
      const response = await apiClient.get(`/api/auth/profile/${encodeURIComponent(partnerId)}`);
      return response.data?.user?.face_descriptor ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void loadBiometricModels();
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
            await apiClient.post("/api/auth/register-user", {
              platform: localStorage.getItem("signin_platform") || "swiggy_zomato",
              method: "oauth",
              partnerId,
            });

            clearUserSession();
            await clearSessionBridge().catch(() => undefined);
            localStorage.setItem("signin_method", "oauth");
            localStorage.setItem("partner_id", partnerId);
            const session = JSON.stringify({
                user: { id: partnerId, verified: true },
                expiry: new Date(Date.now() + 86400000).toISOString()
            });
            localStorage.setItem("nexus_session", session);
            await persistSessionBridge({
              partner_id: partnerId,
              nexus_session: session,
              signin_platform: localStorage.getItem("signin_platform"),
            }).catch(() => undefined);
            window.dispatchEvent(new Event("auth-change"));
            const faceDescriptor = await resolveFaceDescriptor(partnerId);
            navigate("/biometrics", {
              state: faceDescriptor
                ? {
                    partnerId,
                    faceDescriptor,
                    hasFaceDescriptor: true,
                  }
                : {
                    isSignup: true,
                    recoveryMode: true,
                    partnerId,
                  },
            });
        } catch (error) {
            console.error("OAuth sync failed", error);
            clearUserSession();
            localStorage.setItem("partner_id", partnerId);
            navigate("/biometrics", { state: { isSignup: true, recoveryMode: true, partnerId } });
        } finally {
            setIsConnecting(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate, resolveFaceDescriptor]);

  const handleConnect = (specificPlatform: string) => {
    setIsConnecting(true);
    localStorage.setItem("specific_platform", specificPlatform);

    navigate("/mock-oauth?next=/biometrics&flow=signin");
  };

  const getPlatformLabel = (id: string) => {
    if (id === "swiggy_zomato") return ["Swiggy", "Zomato"];
    if (id === "blinkit") return ["Blinkit", "Zepto"];
    if (id === "amazon") return ["Amazon", "Flipkart"];
    return [id];
  };

  const platformsToShow = getPlatformLabel(platform);

  return (
    <AuthShell
      title="How do you want to sign in?"
      subtitle="Authenticate your account and restore policy, claims, and payout context."
      onBack={() => navigate(-1)}
      step="Sign in"
      progress={0.66}
    >
      <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
                {platformsToShow.map((p) => (
                    <button
                        key={p}
                        onClick={() => handleConnect(p)}
                        disabled={isConnecting}
                        className="group w-full rounded-[1.6rem] border border-primary/18 bg-primary/8 p-6 text-left transition-all hover:bg-primary/12"
                    >
                        <div className="flex w-12 h-12 rounded-2xl bg-primary/20 items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
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
                className="w-full p-6 flex items-center gap-4 rounded-[1.6rem] border border-border/50 bg-background/45 hover:border-primary/20 hover:bg-card/70 transition-all"
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
    </AuthShell>
  );
}
