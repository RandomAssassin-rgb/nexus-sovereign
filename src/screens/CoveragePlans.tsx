import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle, Shield, Zap, Crown, Star, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { apiClient } from "../lib/apiClient";
import { cn } from "../lib/utils";
import {
  PREMIUM_PLANS,
  getActiveStoredTier,
  getUpgradeTiers,
  savePlanToLocalStorage,
  type PlanTier,
} from "../lib/premiumPlans";

// ─── Plan metadata for display ────────────────────────────────────────────────
const PLAN_DISPLAY = [
  {
    id: "basic" as PlanTier,
    icon: <Shield size={24} />,
    color: "blue",
    accent: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    recommended: false,
    gradient: "from-blue-500/20 to-transparent",
    features: [
      "Up to ₹200 per disruption",
      "2 claims per week",
      "45-minute trigger threshold",
      "Within 90 seconds settlement",
      "72 hours waiting period",
    ],
    desc: "Low-risk zones, dry season workers",
  },
  {
    id: "standard" as PlanTier,
    icon: <Star size={24} />,
    color: "primary",
    accent: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    recommended: true,
    gradient: "from-primary/30 to-transparent",
    features: [
      "Up to ₹350 per disruption",
      "3 claims per week",
      "30-minute trigger threshold",
      "Within 90 seconds settlement",
      "48 hours waiting period",
      "Storm Shield: Available",
    ],
    desc: "Most delivery workers, monsoon season",
  },
  {
    id: "pro" as PlanTier,
    icon: <Crown size={24} />,
    color: "amber",
    accent: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    recommended: false,
    gradient: "from-amber-400/20 to-transparent",
    features: [
      "Up to ₹580 per disruption",
      "4 claims per week",
      "20-minute trigger threshold",
      "Within 60 seconds settlement",
      "24 hours waiting period",
      "Storm Shield: Included",
      "Human adjuster within 6h",
    ],
    desc: "High earners, flood-prone zones",
  },
];

export default function CoveragePlans() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [partnerId] = useState(
    () => localStorage.getItem("partner_id") || "DEMO-PARTNER"
  );

  // Read active plan from localStorage (7-day window)
  const [activeTier, setActiveTier] = useState<PlanTier | null>(null);
  const [upgradableTiers, setUpgradableTiers] = useState<PlanTier[]>([]);

  useEffect(() => {
    const stored = getActiveStoredTier();
    const upgrades = getUpgradeTiers(stored);
    setActiveTier(stored);
    setUpgradableTiers(stored ? upgrades : ["basic", "standard", "pro"]);
  }, []);

  // ── Premium until display ──────────────────────────────────────────────────
  const premiumUntilRaw = localStorage.getItem("nexus_premium_until");
  const premiumUntilDate = premiumUntilRaw
    ? new Date(premiumUntilRaw).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  // ── Handle plan purchase ────────────────────────────────────────────────────
  const handleSelectPlan = (planId: PlanTier) => {
    if (!upgradableTiers.includes(planId)) return; // guard
    setIsProcessing(true);

    const plan = PREMIUM_PLANS[planId];

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_SWnCTuOpDtQAgw",
      amount: (plan.price * 100).toString(),
      currency: "INR",
      name: "Nexus Sovereign",
      description: `${plan.name} Shield — Weekly Coverage`,
      handler: async function () {
        setIsProcessing(true);
        try {
          const res = await apiClient.post("/api/premium/activate", {
            partnerId,
            planType: planId,
          });
          // Persist to localStorage with server-returned expiry
          savePlanToLocalStorage(planId, res.data.premiumUntil);
        } catch (err) {
          console.error("Cloud activation failed, persisting locally:", err);
          // Fallback: still save locally so app doesn't break offline
          savePlanToLocalStorage(planId);
        }
        navigate("/home");
        setIsProcessing(false);
      },
      prefill: { name: "Delivery Partner", contact: "9999999999" },
      theme: { color: "#f59e0b" },
      config: {
        display: {
          blocks: {
            upi: {
              name: "Enter UPI ID",
              instruments: [
                { method: "upi", flows: ["collect"] }
              ]
            }
          },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: true }
        }
      },
      modal: { ondismiss: () => setIsProcessing(false) },
    };

    if (typeof (window as any).Razorpay === "undefined") {
      alert("Razorpay SDK not loaded. Check your internet connection.");
      setIsProcessing(false);
      return;
    }

    const rzp = new (window as any).Razorpay(options);
    rzp.on("payment.failed", (r: any) => {
      alert("Payment Failed: " + r.error.description);
      setIsProcessing(false);
    });
    rzp.open();
  };

  // ── If Pro is active — full-screen pro status ───────────────────────────────
  if (activeTier === "pro") {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
        <header className="flex items-center p-4 bg-background/95 backdrop-blur-md border-b border-border/50 sticky top-0 z-40">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-secondary text-muted-foreground transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 ml-2">
            <Crown size={20} className="text-amber-400" />
            <span className="font-bold text-lg tracking-tight">Nexus Sovereign</span>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="w-24 h-24 rounded-3xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-6"
          >
            <Crown size={48} className="text-amber-400" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">
              <Zap size={12} className="fill-current" /> Pro Plan Active
            </div>
            <h1 className="text-3xl font-bold mb-3">You're on the best plan!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              Your <strong className="text-foreground">Pro Shield</strong> is active with:
            </p>
            <div className="bg-card border border-border/50 rounded-2xl p-4 text-left space-y-2 mb-6">
              {PLAN_DISPLAY[2].features.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
            {premiumUntilDate && (
              <p className="text-xs text-muted-foreground">
                Active until <strong className="text-foreground">{premiumUntilDate}</strong>
              </p>
            )}
            <button
              onClick={() => navigate("/home")}
              className="mt-6 w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl hover:bg-primary/90 transition-colors"
            >
              Back to Dashboard
            </button>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="nexus-app-stage min-h-screen bg-background text-foreground font-sans overflow-x-hidden">
      {/* Immersive Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] animate-nexus-drift" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[50%] bg-emerald-500/10 rounded-full blur-[140px] animate-nexus-aurora" />
      </div>

      {/* Header */}
      <header className="nexus-page-header sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-2xl hover:bg-secondary/80 text-muted-foreground transition-all active:scale-90 border border-border/20 backdrop-blur-md"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="nexus-page-title">Sovereign Protection</h1>
            <p className="text-[10px] font-bold text-primary tracking-[0.2em] uppercase mt-0.5">Nexus Control Center</p>
          </div>
        </div>
      </header>

      <main className="nexus-app-content relative z-10 p-6 md:p-12 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="max-w-2xl">
            <div className="nexus-section-eyebrow mb-2">
              {activeTier ? "Account Upgrade" : "Security Protocol 03"}
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              {activeTier ? "Enhance Your Shield" : "Weekly Coverage Plans"}
            </h2>
            <p className="nexus-section-copy text-lg">
              {activeTier
                ? `Current tier: ${PREMIUM_PLANS[activeTier].name}. Select a higher echelon for mission-critical protection.`
                : "Pricing is dynamically recalculated based on IMD heat and storm forecasts for your specific labor zone."}
            </p>
          </motion.div>

          <AnimatePresence>
            {activeTier && premiumUntilDate && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-5 backdrop-blur-xl flex items-center gap-4 shadow-xl shadow-emerald-500/5 group hover:border-emerald-500/40 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-500 tracking-tight">
                    {PREMIUM_PLANS[activeTier].name.toUpperCase()} SHIELD ACTIVE
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    Valid via network pulse until {premiumUntilDate}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-12 relative overflow-visible">
          {isProcessing && (
            <div className="fixed inset-0 z-[60] bg-background/40 backdrop-blur-md flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-primary/20 shadow-lg" />
                <p className="text-xs font-bold tracking-widest text-primary uppercase animate-pulse">Initializing Payment Gateway...</p>
              </div>
            </div>
          )}

          {PLAN_DISPLAY.map((plan, i) => {
            const config = PREMIUM_PLANS[plan.id];
            const isCurrentPlan = activeTier === plan.id;
            const isUpgradable = upgradableTiers.includes(plan.id);
            const isLocked = activeTier !== null && !isUpgradable && !isCurrentPlan;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 80 }}
                className="relative group h-full"
              >
                <button
                  onClick={() => isUpgradable && handleSelectPlan(plan.id)}
                  disabled={isProcessing || !isUpgradable}
                  className={cn(
                    "w-full h-full text-left rounded-[2.5rem] p-8 transition-all duration-300 relative flex flex-col items-stretch",
                    isCurrentPlan
                      ? "nexus-glow-card border-emerald-500/40 shadow-emerald-500/10"
                      : isLocked
                      ? "border-border/20 bg-card/20 opacity-40 cursor-not-allowed grayscale"
                      : plan.recommended
                      ? "nexus-glow-card border-primary/50 shadow-primary/20 scale-105 z-10 md:-translate-y-2"
                      : "nexus-glass-card hover:border-primary/40 hover:translate-y-[-4px]"
                  )}
                >
                  {/* Status Badges */}
                  <div className="absolute top-6 right-6 flex flex-col items-end gap-2">
                    {isCurrentPlan && (
                      <div className="bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-lg shadow-emerald-500/20">
                        <CheckCircle size={10} /> ACTIVE SHIELD
                      </div>
                    )}
                    {isLocked && (
                      <div className="bg-secondary/80 text-muted-foreground text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5">
                        <Lock size={9} /> TIER RESTRICTED
                      </div>
                    )}
                    {plan.recommended && !isCurrentPlan && !isLocked && (
                      <div className="bg-primary text-primary-foreground text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-xl shadow-primary/30 animate-pulse nexus-shimmer">
                        <Zap size={10} className="fill-current" /> OPTIMAL TIER
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mb-8">
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border-2 shadow-inner transition-transform group-hover:scale-110", plan.bg)}>
                      <span className={plan.accent}>{plan.icon}</span>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">{plan.id.toUpperCase()}</h3>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black text-foreground tabular-nums tracking-tighter">₹{config.price}</span>
                        <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">/ week</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-grow">
                    <ul className="space-y-4 mb-8">
                      {plan.features.map((feat, j) => (
                        <li key={j} className="flex items-start gap-3.5 text-sm font-semibold opacity-90 leading-tight">
                          <div className={cn("mt-0.5 shrink-0", isCurrentPlan ? "text-emerald-500" : "text-primary")}>
                            <CheckCircle size={15} />
                          </div>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-border/10">
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-4 leading-relaxed italic">
                      {plan.desc}
                    </p>

                    {/* CTA */}
                    <div 
                      className={cn(
                        "w-full rounded-2xl py-4 text-xs font-black uppercase tracking-[0.2em] transition-all shadow-lg flex items-center justify-center gap-2",
                        isCurrentPlan 
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                          : isUpgradable 
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98]" 
                          : "bg-secondary text-muted-foreground border border-border/10"
                      )}
                    >
                      {isCurrentPlan ? (
                        <>SHIELD ENGAGED</>
                      ) : isUpgradable ? (
                        <>{activeTier ? "EXECUTE UPGRADE" : `ACTIVATE ${plan.id.toUpperCase()}`} <Zap size={12} className="fill-current" /></>
                      ) : (
                        <>UNAVAILABLE</>
                      )}
                    </div>
                  </div>
                </button>
                
                {/* Visual Glow Layer for Recommended */}
                {plan.recommended && !isLocked && (
                  <div className="absolute inset-0 -z-10 bg-primary/5 blur-3xl opacity-50 pointer-events-none" />
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.5 }}
          className="nexus-glass-card rounded-3xl p-6 md:p-8 flex items-center gap-6 border-border/10"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <Zap size={28} className="text-primary animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest mb-2">Dynamic Actuarial Adjustment</h4>
            <p className="text-xs text-muted-foreground font-medium leading-loose">
              Base coverage (₹30) is currently adjusted to <strong className="text-foreground">₹40/week</strong> for the High Risk zone. 
              Pricing models recalculate every Sunday at 00:00 UTC based on cumulative IMD/Skymet forecast data.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
