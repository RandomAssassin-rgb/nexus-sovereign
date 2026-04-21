import { motion } from "framer-motion";
import { Bell, Shield, TrendingUp, AlertTriangle, ChevronRight, Activity, Zap, MapPin, Wallet as WalletIcon, Sun, Moon, CloudRain, ArrowRight, X, CheckCircle, Loader2, CreditCard, Smartphone, Wifi, ShieldCheck, Crown, Star, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNexusConnectivity } from "../hooks/useNexusConnectivity";
import { useNexusLocation } from "../hooks/useNexusLocation";
import { useNexusTelemetry } from "../hooks/useNexusTelemetry";
import { useNexusPolicy } from "../hooks/useNexusPolicy";
import { apiClient } from "../lib/apiClient";
import { useTheme } from "../components/theme-provider";
import { syncOfflineClaims, getOfflineClaims } from "../lib/offlineQueue";
import RiskAnalysis from "../components/RiskAnalysis";
import { 
  generateZeroTouchPayout, 
  type GeneratedPayout, 
  getBalance, 
  getTransactions, 
  type WalletTransaction, 
  syncWithServer,
  initRealtimeSubscription,
  getPolicyStatus,
  getTotalProtectedEarnings,
  getConnectionStatus
} from "../lib/payoutStore";
import NotificationBell from "../components/NotificationBell";
import { getDeviceStateSnapshot, registerForPushNotifications, requestCurrentLocation } from "../lib/deviceCapabilities";
import {
  deliverUnseenNotifications,
  type NexusInboxResponse,
} from "../lib/notifications";
import {
  PREMIUM_PLANS,
  getActiveStoredTier,
  getUpgradeTiers,
  isPremiumActive,
  savePlanToLocalStorage,
  calculateDynamicPrice,
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
import { getWorkerPartnerIdSnapshot } from "../lib/sessionIdentity";

export default function Home() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const { 
    lat, lon, zoneName: locationName, isApproximate, provenance: locProvenance, 
    permissionState, requestPreciseLocation 
  } = useNexusLocation();
  const { weather, aqi, traffic, observedAt, rawJson, refresh: refreshTelemetry } = useNexusTelemetry(lat, lon);
  const { syncStatus, signalStatus, systemMode, signalAgeSeconds, modeReason } = useNexusConnectivity(observedAt);
  const policy = useNexusPolicy();

  const [premiumRate, setPremiumRate] = useState<number>(58);
  const [showPredictiveShield, setShowPredictiveShield] = useState(true);
  const [coverageCap, setCoverageCap] = useState<number>(480);
  const [forecastData, setForecastData] = useState<any>(null);
  const [deviceTrust, setDeviceTrust] = useState<any>(null);
  const [inbox, setInbox] = useState<NexusInboxResponse | null>(null);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [showAuditPanel, setShowAuditPanel] = useState(false);

  // ── Premium plan state (persisted 7-day window) ────────────────────
  const [activeTier, setActiveTier] = useState<PlanTier | null>(() => getActiveStoredTier());
  const hasUpgraded = activeTier !== null && isPremiumActive();

  // ── Remaining state ────────────────────────────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [partnerId] = useState(() => getWorkerPartnerIdSnapshot() || "");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState(getBalance());
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>(getTransactions());
  // Modal states kept for the inline upgrade modal (still used below)
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeStep, setUpgradeStep] = useState<1 | 2 | 3>(1);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "upi" | "netbanking" | null>(null);
  const [connectionStatus, setConnectionStatus] = useState(getConnectionStatus());

  // Refresh plan tier from localStorage after any wallet/sync event
  const refreshPlanState = () => {
    setActiveTier(getActiveStoredTier());
  };

  // ── Handle plan purchase ────────────────────────────────────────────────────
  const handleSelectPlan = (planId: PlanTier) => {
    if (!upgradableTiers.includes(planId)) return; // guard
    setIsProcessing(true);

    const plan = PREMIUM_PLANS[planId];
    // Use dynamic price calculated from telemetry
    const dynamicPrice = calculateDynamicPrice(plan.price, weather, aqi, locationName);

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_SWnCTuOpDtQAgw",
      amount: (dynamicPrice * 100).toString(),
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
          savePlanToLocalStorage(planId, res.data.premiumUntil);
        } catch (err) {
          console.error("Cloud activation failed, persisting locally:", err);
          savePlanToLocalStorage(planId);
        }
        refreshPlanState();
        setIsProcessing(false);
      },
      prefill: { name: userProfile?.full_name || "Delivery Partner", contact: userProfile?.phone || "9999999999" },
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
  
  // 1. EVENT LISTENERS (Established earliest to catch immediate sync results)
  useEffect(() => {
    const refreshWallet = () => {
      const balance = getBalance();
      const transactions = getTransactions();
      
      setWalletBalance(prev => (prev === balance ? prev : balance));
      setWalletTransactions(prev => (JSON.stringify(prev) === JSON.stringify(transactions) ? prev : transactions));
      refreshPlanState(); 

      const phone = localStorage.getItem("signin_phone");
      const platform = localStorage.getItem("signin_platform");
      const name = localStorage.getItem("nexus_profile_name");
      
      if (phone || platform || name) {
        setUserProfile((prev: any) => {
          if (prev?.phone === phone && prev?.platform === platform && prev?.name === name) return prev;
          return { phone, platform, name };
        });
      }
    };

    window.addEventListener("nexus-payout-update", refreshWallet);
    window.addEventListener("storage", refreshWallet);
    window.addEventListener("focus", refreshWallet);
    
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshWallet();
      }
    });

    // Pulse local UI but don't do server sync here anymore (MainLayout handles it)
    const pollLocalInterval = setInterval(() => {
        refreshWallet();
    }, 15000); // Pulse every 15s instead of 5s

    const handleConnectionUpdate = () => {
      setConnectionStatus(getConnectionStatus());
    };
    window.addEventListener("nexus-connection-update", handleConnectionUpdate);

    return () => {
      window.removeEventListener("nexus-payout-update", refreshWallet);
      window.removeEventListener("storage", refreshWallet);
      window.removeEventListener("focus", refreshWallet);
      window.removeEventListener("nexus-connection-update", handleConnectionUpdate);
      clearInterval(pollLocalInterval);
    };
  }, []);

  // ── Derived display values from active plan ───────────────────────────────
  const activePlanConfig = activeTier ? PREMIUM_PLANS[activeTier] : null;
  const displayPremium = activePlanConfig
    ? activePlanConfig.price
    : premiumRate;
  const displayCoverage = activePlanConfig
    ? activePlanConfig.maxPayout
    : coverageCap;
  const upgradableTiers = getUpgradeTiers(activeTier);
  const canUpgrade = upgradableTiers.length > 0;

  useEffect(() => {
    let isMounted = true;
    const refreshQueue = async () => {
      const claims = await getOfflineClaims();
      if (isMounted) {
        setOfflineQueueCount(claims.length);
      }
    };

    const handleQueueUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === "number") {
        setOfflineQueueCount(detail.count);
        return;
      }
      void refreshQueue();
    };

    void refreshQueue();
    window.addEventListener("nexus-offline-queue-update", handleQueueUpdate as EventListener);
    return () => {
      isMounted = false;
      window.removeEventListener("nexus-offline-queue-update", handleQueueUpdate as EventListener);
    };
  }, []);

  // 5. Offline Sync
  useEffect(() => {
    const handleOnline = async () => {
      const result = await syncOfflineClaims();
      setOfflineQueueCount(result.remaining);
      if (result.syncedCount > 0 && partnerId) {
        await syncWithServer(partnerId, "offline-replay");
      }
    };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) handleOnline();
    return () => window.removeEventListener('online', handleOnline);
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId) return;

    let isMounted = true;

    const syncCrossPlatformState = async () => {
      try {
        const snapshot = await getDeviceStateSnapshot();
        const [deviceStateRes, inboxRes] = await Promise.all([
          apiClient.post("/api/user/device-state", snapshot),
          apiClient.get(`/api/user/inbox?partnerId=${partnerId}`),
        ]);

        if (!isMounted) return;
        setDeviceTrust(deviceStateRes.data?.trust || null);
        setInbox(inboxRes.data || null);
      } catch (error) {
        console.warn("Cross-platform state bootstrap failed", error);
      }
    };

    void syncCrossPlatformState();

    return () => {
      isMounted = false;
    };
  }, [partnerId]);

  useEffect(() => {
    if (!inbox?.items?.length) return;

    const nonPayoutItems = inbox.items.filter((item) => item.kind !== "payout");
    if (nonPayoutItems.length > 0) {
      void deliverUnseenNotifications(nonPayoutItems, { limit: 2 });
    }
    window.dispatchEvent(
      new CustomEvent("nexus-inbox-update", {
        detail: { count: inbox.unreadCount || inbox.items.length },
      })
    );
  }, [inbox]);

  // 8. Forecast & Premium Sync
  useEffect(() => {
    if (!lat || !lon || !partnerId) return;

    const fetchForecast = async () => {
      try {
        const forecastRes = await apiClient.post("/api/verify/forecast", {
          partnerId,
          lat,
          lon,
        });
        setForecastData(forecastRes.data || null);
        
        if (forecastRes.data?.premium) {
            setPremiumRate(forecastRes.data.premium.weekly || 58);
        }
      } catch (err) {
        console.error("Forecast update failed:", err);
      }
    };
    fetchForecast();
  }, [lat, lon, partnerId]);

  const isRain = weather?.label === "Rain";
  const firstName =
    userProfile?.full_name?.split(" ")?.[0] ||
    userProfile?.name?.split(" ")?.[0] ||
    "Operator";

  return (
    <div className="min-h-full flex flex-col">
      <header className="nexus-page-header">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30 overflow-hidden cursor-pointer active:scale-95 transition-transform"
            onClick={() => navigate("/profile")}
          >
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-primary font-bold">{userProfile?.full_name?.charAt(0) || "N"}</span>
            )}
          </div>
          <div>
            <h1 className="nexus-page-title">
              {userProfile?.full_name ? `Hello, ${firstName}` : "Nexus Sovereign"}
            </h1>
            <div className="flex items-center gap-2">
              <p className={cn("text-[11px] font-bold uppercase tracking-[0.18em] flex items-center gap-1.5", policy.isActive ? "text-emerald-500" : "text-amber-500")}>
                <span className={cn("w-1.5 h-1.5 rounded-full", policy.isActive ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                {policy.isActive ? "Active Shield" : "Shield Inactive"}
              </p>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                {policy.daysLeft}d left
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="nexus-icon-button"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="nexus-app-main space-y-6 pb-8">
        <section className="nexus-panel-hero p-6 md:p-8 lg:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl -mr-10 -mt-10" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Signal Fabric active</div>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-foreground tracking-tighter leading-[0.95]">
              Monitoring the <br /> 
              <span className="text-primary italic">Signal Fabric</span>
            </h1>
            <p className="mt-6 text-sm md:text-base text-muted-foreground leading-relaxed max-w-xl font-medium">
              Real-time parametric protection powered by global satellites and local sensor networks. Your income is secured by the Nexus Sovereign Event Twins.
            </p>
            
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Signal Freshness', value: '42ms', sub: 'OpenWeather Sync', icon: Wifi, color: 'text-emerald-500' },
                { label: 'Event Twins Live', value: '3', sub: 'Regional Disruptions', icon: Zap, color: 'text-primary' },
                { label: 'Protection Capacity', value: 'Rs 4.2L', sub: 'Available Reserve', icon: ShieldCheck, color: 'text-blue-500' },
              ].map((kpi, idx) => {
                const Icon = kpi.icon;
                return (
                  <div key={idx} className="nexus-panel rounded-2xl p-5 border border-border/40 hover:border-primary/20 transition-all flex items-center justify-between group bg-background/40 backdrop-blur-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{kpi.label}</p>
                      <p className="text-2xl font-black text-foreground tracking-tighter">{kpi.value}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">{kpi.sub}</p>
                    </div>
                    <div className={cn("p-4 rounded-2xl bg-secondary group-hover:bg-primary/5 transition-colors", kpi.color)}>
                      <Icon size={24} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="nexus-panel p-6 space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-xl">
                <div className="nexus-section-eyebrow mb-2">Earnings coverage</div>
                <h2 className="text-4xl font-black tracking-[-0.05em] text-foreground">
                  Rs {getTotalProtectedEarnings().toLocaleString()}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground font-medium">
                  Total protected income across current policy winndows.
                </p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <span className="nexus-inline-metric text-emerald-500 bg-emerald-500/10 border-emerald-500/20 px-3 py-1">
                  <Shield size={12} />
                  Tier 3 Secure
                </span>
                <span className="text-[10px] text-muted-foreground/50 font-mono">ID: {partnerId.slice(0, 8)}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="nexus-kpi-card bg-secondary/20 border-border/40">
                <p className="nexus-kpi-label">Weekly premium</p>
                <div className="nexus-kpi-value text-primary mt-1">Rs {displayPremium.toFixed(0)}</div>
                <p className="nexus-kpi-meta mt-2">Adaptive rate active</p>
              </div>
              <div className="nexus-kpi-card bg-secondary/20 border-border/40">
                <p className="nexus-kpi-label">Coverage cap</p>
                <div className="nexus-kpi-value mt-1">Rs {displayCoverage}</div>
                <p className="nexus-kpi-meta mt-2">Per event protection</p>
              </div>
              <div className="nexus-kpi-card bg-secondary/20 border-border/40">
                <p className="nexus-kpi-label">Wallet balance</p>
                <div className="nexus-kpi-value mt-1">Rs {walletBalance.toFixed(0)}</div>
                <p className="nexus-kpi-meta mt-2">Available for payout</p>
              </div>
            </div>
            
            <div className="pt-4 flex gap-3">
              <button 
                onClick={() => navigate("/file-claim")}
                className="nexus-button-primary flex-1"
              >
                File Protection Claim
              </button>
              <button 
                onClick={() => navigate("/wallet")}
                className="nexus-button-secondary flex-1"
              >
                Withdraw Funds
              </button>
            </div>
          </section>

          <section className="nexus-panel p-6 border border-border/40 relative overflow-hidden">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="nexus-section-eyebrow mb-2">Protection Twin</div>
                <h3 className="text-xl font-bold tracking-tight">Signal Fabric Monitor</h3>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-full border",
                  systemMode === "Live" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", systemMode === "Live" ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{systemMode}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="nexus-subpanel p-4 rounded-2xl border-border/30">
                <p className="nexus-kpi-label">Current Location</p>
                <p className="text-sm font-bold mt-1">{locationName}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase font-black">{locProvenance} Sync</span>
                  <MapPin size={14} className="text-primary/40" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="nexus-subpanel p-4 rounded-2xl border-border/30">
                  <p className="nexus-kpi-label">Weather</p>
                  <p className={cn("text-sm font-bold mt-1", weather?.impact === 'Severe' ? 'text-destructive' : 'text-foreground')}>
                    {weather?.value || '--'}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-2 uppercase font-bold">{weather?.impact || 'Stable'}</p>
                </div>
                <div className="nexus-subpanel p-4 rounded-2xl border-border/30">
                  <p className="nexus-kpi-label">Traffic</p>
                  <p className={cn("text-sm font-bold mt-1", traffic?.impact === 'Severe' ? 'text-destructive' : 'text-foreground')}>
                    {traffic?.value ? `JF ${traffic.value}` : '--'}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-2 uppercase font-bold">{traffic?.impact || 'Stable'}</p>
                </div>
              </div>

              <button 
                onClick={() => setShowAuditPanel(!showAuditPanel)}
                className="w-full py-3 rounded-xl border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-all text-center mt-2"
              >
                {showAuditPanel ? "Hide Raw Trace" : "View Signal Fabric Trace"}
              </button>

              {showAuditPanel && (
                <pre className="mt-4 p-4 rounded-xl bg-black/5 dark:bg-black/40 text-[9px] font-mono text-muted-foreground overflow-auto max-h-40 scrollbar-hide">
                  {JSON.stringify(rawJson || { status: 'Waiting for heartbeat...' }, null, 2)}
                </pre>
              )}
            </div>
          </section>
        </div>

        {/* Dynamic Premium Tiers Section */}
        <section className="mt-8 mb-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div className="max-w-2xl">
              <div className="nexus-section-eyebrow mb-2">
                {activeTier ? "Account Upgrade" : "Security Protocol 03"}
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight mb-2">
                {activeTier ? "Enhance Your Shield" : "Weekly Coverage Plans"}
              </h2>
              <p className="text-muted-foreground text-sm">
                Pricing is dynamically adjusted based on risk metrics.
                Current modifiers: {weather?.impact === "Severe" || weather?.value?.toLowerCase().includes("rain") ? "High Weather Risk (+15%) " : ""}
                {aqi?.value && parseInt(aqi.value) > 300 ? "Hazardous AQI (+20%)" : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative overflow-visible">
            {isProcessing && (
              <div className="absolute inset-0 z-50 bg-background/40 backdrop-blur-md flex items-center justify-center rounded-[2.5rem]">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 size={32} className="text-primary animate-spin" />
                  <p className="text-xs font-bold tracking-widest text-primary uppercase animate-pulse">Initializing Gateway...</p>
                </div>
              </div>
            )}

            {PLAN_DISPLAY.map((plan, i) => {
              const config = PREMIUM_PLANS[plan.id];
              const isCurrentPlan = activeTier === plan.id;
              const isUpgradable = upgradableTiers.includes(plan.id);
              const isLocked = activeTier !== null && !isUpgradable && !isCurrentPlan;
              const dynamicPrice = calculateDynamicPrice(config.price, weather, aqi, locationName);

              return (
                <div
                  key={plan.id}
                  className="relative group h-full"
                >
                  <button
                    onClick={() => isUpgradable && handleSelectPlan(plan.id)}
                    disabled={isProcessing || !isUpgradable}
                    className={cn(
                      "w-full h-full text-left rounded-[2.5rem] p-6 transition-all duration-300 relative flex flex-col items-stretch",
                      isCurrentPlan
                        ? "nexus-glow-card border-emerald-500/40 shadow-emerald-500/10 bg-emerald-500/5"
                        : isLocked
                        ? "border-border/20 bg-card/20 opacity-40 cursor-not-allowed grayscale"
                        : plan.recommended
                        ? "nexus-glow-card border-primary/50 shadow-primary/20 scale-[1.02] z-10"
                        : "nexus-glass-card hover:border-primary/40 hover:translate-y-[-4px]"
                    )}
                  >
                    {/* Status Badges */}
                    <div className="absolute top-6 right-6 flex flex-col items-end gap-2">
                      {isCurrentPlan && (
                        <div className="bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5">
                          <CheckCircle size={10} /> ACTIVE SHIELD
                        </div>
                      )}
                      {isLocked && (
                        <div className="bg-secondary/80 text-muted-foreground text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5">
                          <Lock size={9} /> MULTIPLIER SECURED
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border-2 shadow-inner", plan.bg)}>
                        <span className={plan.accent}>{plan.icon}</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-black tracking-tight">{plan.id.toUpperCase()}</h3>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-black text-foreground tabular-nums tracking-tighter">₹{dynamicPrice}</span>
                          {dynamicPrice > config.price && (
                            <span className="text-xs text-muted-foreground line-through">₹{config.price}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">/ week</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-grow">
                      <ul className="space-y-3 mb-6">
                        {plan.features.map((feat, j) => (
                          <li key={j} className="flex items-start gap-3 text-xs font-semibold opacity-90 leading-tight">
                            <div className={cn("mt-0.5 shrink-0", isCurrentPlan ? "text-emerald-500" : "text-primary")}>
                              <CheckCircle size={14} />
                            </div>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-4 border-t border-border/10">
                      <div 
                        className={cn(
                          "w-full rounded-2xl py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg flex items-center justify-center gap-2",
                          isCurrentPlan 
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                            : isUpgradable 
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/30" 
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
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
