import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle, Shield, Zap, Crown, Star, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
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
    icon: <Shield size={20} />,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-400/10 border-blue-400/20",
    recommended: false,
    features: [
      "Up to ₹200 per disruption",
      "2 claims per week",
      "45-minute trigger threshold",
      "Within 90 seconds settlement",
      "72 hours waiting period",
    ],
    desc: "Best for: Low-risk zones, dry season workers",
  },
  {
    id: "standard" as PlanTier,
    icon: <Star size={20} />,
    iconColor: "text-primary",
    iconBg: "bg-primary/10 border-primary/20",
    recommended: true,
    features: [
      "Up to ₹350 per disruption",
      "3 claims per week",
      "30-minute trigger threshold",
      "Within 90 seconds settlement",
      "48 hours waiting period",
      "Storm Shield: Available (+₹20/w)",
    ],
    desc: "Best for: Most delivery workers, monsoon season",
  },
  {
    id: "pro" as PlanTier,
    icon: <Crown size={20} />,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-400/10 border-amber-400/20",
    recommended: false,
    features: [
      "Up to ₹580 per disruption",
      "4 claims per week",
      "20-minute trigger threshold",
      "Within 60 seconds settlement",
      "24 hours waiting period",
      "Storm Shield: Included automatically",
      "Human adjuster within 6 hours",
    ],
    desc: "Best for: High earners, flood-prone zones, peak monsoon",
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
          const res = await axios.post("/api/premium/activate", {
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
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-background/95 backdrop-blur-md border-b border-border/50 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-secondary text-muted-foreground transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-primary" />
            <span className="font-bold text-lg tracking-tight">Nexus Sovereign</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col max-w-md mx-auto w-full">
        {/* Step indicator */}
        <div className="flex justify-between items-center mb-6">
          <p className="text-xs font-bold text-primary uppercase tracking-widest">
            {activeTier ? "Upgrade Plan" : "Step 3 of 3"}
          </p>
          <p className="text-xs font-semibold text-muted-foreground">Choose Plan</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {activeTier ? "Upgrade Your Shield" : "Weekly Coverage Plans"}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {activeTier
              ? `You're on the ${PREMIUM_PLANS[activeTier].name} plan. Upgrade to unlock higher payouts and faster protection.`
              : "Standard recommended for your high-risk zone. Pricing recalculates weekly."}
          </p>
        </motion.div>

        {/* Active plan badge */}
        <AnimatePresence>
          {activeTier && premiumUntilDate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-3"
            >
              <CheckCircle size={18} className="text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-500">
                  {PREMIUM_PLANS[activeTier].name} Plan Active
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Valid until {premiumUntilDate} — no re-purchase needed
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4 mb-8 relative">
          {isProcessing && (
            <div className="absolute inset-0 z-20 bg-background/60 backdrop-blur-sm flex items-center justify-center rounded-3xl">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {PLAN_DISPLAY.map((plan, i) => {
            const config = PREMIUM_PLANS[plan.id];
            const isCurrentPlan = activeTier === plan.id;
            const isUpgradable = upgradableTiers.includes(plan.id);
            const isLocked = activeTier !== null && !isUpgradable && !isCurrentPlan;

            return (
              <motion.button
                key={plan.id}
                onClick={() => isUpgradable && handleSelectPlan(plan.id)}
                disabled={isProcessing || !isUpgradable}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  "w-full text-left rounded-3xl p-6 border transition-all relative group shadow-sm",
                  isCurrentPlan
                    ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                    : isLocked
                    ? "border-border/30 bg-card/40 opacity-50 cursor-not-allowed"
                    : plan.recommended
                    ? "border-primary/50 bg-card shadow-primary/5 ring-1 ring-primary/20 hover:border-primary hover:shadow-primary/10"
                    : "border-border/50 bg-card hover:border-primary/40"
                )}
              >
                {/* Badges */}
                <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
                  {isCurrentPlan && (
                    <div className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle size={10} /> Current Plan
                    </div>
                  )}
                  {isLocked && (
                    <div className="bg-secondary text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                      <Lock size={9} /> Locked
                    </div>
                  )}
                  {plan.recommended && !isCurrentPlan && !isLocked && (
                    <div className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 shadow-sm shadow-primary/20">
                      <Zap size={10} className="fill-current" /> Recommended
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3 mb-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border shrink-0", plan.iconBg)}>
                    <span className={plan.iconColor}>{plan.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{plan.id.charAt(0).toUpperCase() + plan.id.slice(1)}</h3>
                    <p className="text-xs text-muted-foreground font-medium">
                      <span className="text-lg font-bold text-foreground">₹{config.price}</span> / week
                    </p>
                  </div>
                </div>

                <ul className="space-y-2.5 mb-5">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-card-foreground font-medium">
                      <CheckCircle
                        size={14}
                        className={cn(
                          "shrink-0 mt-0.5",
                          isCurrentPlan ? "text-emerald-500/70" : "text-primary/70"
                        )}
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="text-xs text-muted-foreground font-medium pt-4 border-t border-border/50">
                  {plan.desc}
                </div>

                {/* CTA */}
                {isUpgradable && !isCurrentPlan && (
                  <div className="mt-4 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 text-xs font-bold text-primary text-center">
                    {activeTier ? `Upgrade to ${plan.id.charAt(0).toUpperCase() + plan.id.slice(1)} →` : `Select ${plan.id.charAt(0).toUpperCase() + plan.id.slice(1)} →`}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        <div className="bg-secondary/50 rounded-2xl p-4 mb-6 text-xs text-muted-foreground font-medium leading-relaxed border border-border/10 flex items-start gap-3">
          <Zap size={16} className="text-primary shrink-0 mt-0.5" />
          <p>
            Base ₹30 adjusted to{" "}
            <strong className="text-foreground">₹40/week</strong> for High Risk
            zone. Dynamic pricing model recalculates every Sunday based on IMD
            weekly forecast.
          </p>
        </div>
      </main>
    </div>
  );
}
