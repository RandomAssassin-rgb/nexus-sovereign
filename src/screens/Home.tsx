import { motion } from "framer-motion";
import { Bell, Shield, TrendingUp, AlertTriangle, ChevronRight, Activity, Zap, MapPin, Wallet as WalletIcon, Sun, Moon, CloudRain, ArrowRight, X, CheckCircle, Loader2, CreditCard, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useEffect, useState } from "react";
import axios from "axios";
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
  getTotalProtectedEarnings
} from "../lib/payoutStore";
import NotificationBell from "../components/NotificationBell";
import {
  PREMIUM_PLANS,
  getActiveStoredTier,
  getUpgradeTiers,
  isPremiumActive,
  type PlanTier,
} from "../lib/premiumPlans";

export default function Home() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const [weatherData, setWeatherData] = useState<any>(null);
  const [premiumRate, setPremiumRate] = useState<number>(58);
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [zoneName, setZoneName] = useState<string>("Locating...");
  const [zoneId, setZoneId] = useState<string>("---");
  const [locationError, setLocationError] = useState<string>("");
  const [aqiData, setAqiData] = useState<any>(null);
  const [trafficData, setTrafficData] = useState<any>(null);
  const [showPredictiveShield, setShowPredictiveShield] = useState(true);
  const [coverageCap, setCoverageCap] = useState<number>(480);

  // ── Premium plan state (persisted 7-day window) ────────────────────
  const [activeTier, setActiveTier] = useState<PlanTier | null>(() => getActiveStoredTier());
  const hasUpgraded = activeTier !== null && isPremiumActive();

  // ── Remaining state ────────────────────────────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [partnerId] = useState(() => localStorage.getItem("partner_id") || "");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState(getBalance());
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>(getTransactions());
  // Modal states kept for the inline upgrade modal (still used below)
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeStep, setUpgradeStep] = useState<1 | 2 | 3>(1);
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "upi" | "netbanking" | null>(null);

  // Refresh plan tier from localStorage after any wallet/sync event
  const refreshPlanState = () => {
    setActiveTier(getActiveStoredTier());
  };
  
  // 1. EVENT LISTENERS (Established earliest to catch immediate sync results)
  useEffect(() => {
    const refreshWallet = () => {
      setWalletBalance(getBalance());
      setWalletTransactions(getTransactions());
      refreshPlanState(); // also refresh plan on every wallet event
      
      // Also sync user profile from localStorage if present
      const phone = localStorage.getItem("signin_phone");
      const platform = localStorage.getItem("signin_platform");
      const name = localStorage.getItem("nexus_profile_name");
      if (phone || platform) {
        setUserProfile({ phone, platform, name });
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
    }, 5000);

    return () => {
      window.removeEventListener("nexus-payout-update", refreshWallet);
      window.removeEventListener("storage", refreshWallet);
      window.removeEventListener("focus", refreshWallet);
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

  const handleRazorpayPayment = () => {
    // Plan purchasing is handled in CoveragePlans.tsx
    // This modal is kept for inline upgrades that may be triggered from Home
    setIsProcessing(true);
    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_SWnCTuOpDtQAgw",
      amount: "1500",
      currency: "INR",
      name: "Nexus Sovereign",
      description: "Premium Shield Upgrade (+₹500 Coverage)",
      handler: async function () {
        setIsProcessing(true);
        try {
          if (partnerId) {
            await axios.post("/api/premium/activate", { partnerId, planType: "basic" });
          }
          localStorage.setItem("nexus_premium_upgraded", "true");
          setUpgradeStep(3);
          refreshPlanState();
        } catch (err) {
          console.error("Cloud activation failed:", err);
          setUpgradeStep(3);
          refreshPlanState();
        } finally {
          setIsProcessing(false);
        }
      },
      prefill: { name: userProfile?.full_name || "Nexus Rider", contact: userProfile?.phone || "9999999999", email: `${partnerId}@nexus.sovereign` },
      theme: { color: "#6366f1" },
      modal: { ondismiss: () => setIsProcessing(false) }
    };
    if (typeof (window as any).Razorpay === 'undefined') {
      alert("Razorpay SDK not loaded.");
      setIsProcessing(false);
      return;
    }
    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  // 4. Offline Sync
  useEffect(() => {
    const handleOnline = async () => {
      const claims = getOfflineClaims();
      if (claims.length > 0) {
        await syncOfflineClaims();
      }
    };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) handleOnline();
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // 5. Geolocation Accessor
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ lat: 12.9716, lon: 77.5946 });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setLocation({ lat: 12.9716, lon: 77.5946 }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 6. Location Sync Heartbeat
  useEffect(() => {
    if (!location || !partnerId) return;
    const sync = () => axios.post("/api/user/location", { partnerId, lat: location.lat, lng: location.lon }).catch(() => {});
    sync();
    const id = setInterval(sync, 30000);
    return () => clearInterval(id);
  }, [location?.lat, location?.lon, partnerId]);

  // 7. Core Risk Data Fetching
  useEffect(() => {
    if (!location) return;

    const fetchData = async () => {
      try {
        const { lat, lon } = location;
        const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
        
        if (mapboxToken && mapboxToken !== 'placeholder_mapbox_token') {
          const res = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${mapboxToken}&types=neighborhood,locality,place`);
          if (res.data.features?.[0]) {
            setZoneName(res.data.features[0].text);
            setZoneId(`H3-${Math.abs(lat).toFixed(2).slice(-2)}${Math.abs(lon).toFixed(2).slice(-2)}`);
          }
        }

        const [weather, aqi, traffic] = await Promise.all([
          axios.get(`/api/weather?lat=${lat}&lon=${lon}`),
          axios.get(`/api/aqi?lat=${lat}&lon=${lon}`),
          axios.get(`/api/traffic?lat=${lat}&lon=${lon}`)
        ]);

        setWeatherData(weather.data);
        setAqiData(aqi.data);
        setTrafficData(traffic.data);

        // Premium Calculation
        const premiumRes = await axios.post('/api/ml/calculate-premium', {
          zone_h3: "8760a0000ffffff",
          persona: localStorage.getItem("signin_platform") || "blinkit",
          trust_score: Number(userProfile?.trust_score || localStorage.getItem("nexus_trust_score") || 0.5),
          weather_severity: weather?.data?.weather?.[0]?.main === 'Rain' ? 0.8 : 0.1,
          traffic_density: (traffic?.data?.jamFactor || 0) / 10,
          aqi_severity: (aqi?.data?.aqi || 0) / 300,
          trigger_type: weather?.data?.weather?.[0]?.main === 'Rain' ? 'rain' : 'heat',
          weeks_enrolled: 12,
          declared_earnings: Number(localStorage.getItem("nexus_declared_earnings") || 650)
        });

        if (premiumRes.data.premium) {
          setPremiumRate(premiumRes.data.premium);
          setCoverageCap(premiumRes.data.coverage_cap);
        }
      } catch (err) {
        console.error("Risk data update failed:", err);
      }
    };
    fetchData();
  }, [location?.lat, location?.lon]);

  const weatherDisplay = weatherData?.weather?.[0]?.main === "Rain" 
    ? { text: "Rain (+50%)", color: "text-amber-500" } 
    : { text: "Clear (+0%)", color: "text-emerald-500" };

  const trafficDisplay = (trafficData?.jamFactor || 0) > 7 
    ? { text: "Heavy (+15%)", color: "text-destructive" }
    : { text: "Light (+0%)", color: "text-emerald-500" };

  const aqiDisplay = (aqiData?.aqi || 0) > 150 
    ? { text: `Poor (${aqiData?.aqi || 0})`, color: "text-destructive" }
    : { text: `Good (${aqiData?.aqi || 0})`, color: "text-emerald-500" };


  return (
    <div className="min-h-full bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10 sticky top-0 bg-background/95 backdrop-blur-md z-40">
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
            <h1 className="font-bold tracking-tight leading-none mb-1">
              {userProfile?.full_name ? `Hello, ${userProfile.full_name.split(' ')[0]}` : "Nexus Sovereign"}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Shield
              </p>
              {isSyncing && (
                <div className="flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 text-primary animate-spin" />
                  <span className="text-[9px] text-muted-foreground font-medium animate-pulse">Syncing...</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="p-2.5 bg-secondary/50 hover:bg-secondary rounded-xl transition-all active:scale-95"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Predictive Shield Notification */}
        {showPredictiveShield && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-2xl p-4 relative overflow-hidden border",
              activeTier === "pro"
                ? "bg-gradient-to-r from-amber-500/20 to-amber-600/20 border-amber-500/30"
                : hasUpgraded
                ? "bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 border-emerald-500/30"
                : "bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-indigo-500/30"
            )}
          >
            <button 
              onClick={() => setShowPredictiveShield(false)}
              className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                activeTier === "pro" ? "bg-amber-500/20" : hasUpgraded ? "bg-emerald-500/20" : "bg-indigo-500/20"
              )}>
                {activeTier === "pro"
                  ? <CheckCircle className="w-5 h-5 text-amber-400" />
                  : hasUpgraded
                  ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                  : <CloudRain className="w-5 h-5 text-indigo-400" />
                }
              </div>
              <div>
                <h3 className="font-bold text-sm flex items-center gap-1">
                  Predictive Shield <Zap size={12} className="text-amber-400" />
                </h3>
                {activeTier === "pro" ? (
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle size={14} className="text-amber-400" />
                    <span className="text-sm font-bold text-amber-400">Pro Shield Active — Maximum Protection</span>
                  </div>
                ) : hasUpgraded ? (
                  <>
                    <div className="flex items-center gap-1.5 mt-1 mb-2">
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span className="text-sm font-bold text-emerald-500">
                        {activeTier ? PREMIUM_PLANS[activeTier].name : ""} Plan Active
                      </span>
                    </div>
                    {canUpgrade && (
                      <button
                        onClick={() => navigate("/coverage-plans")}
                        className="bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                      >
                        Upgrade to {upgradableTiers[upgradableTiers.length - 1].charAt(0).toUpperCase() + upgradableTiers[upgradableTiers.length - 1].slice(1)} →
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mt-1 mb-3">
                      Heavy rain forecasted for your zone tomorrow (80% probability). Upgrade coverage by ₹15 to protect ₹2,500 earnings.
                    </p>
                    <button
                      onClick={() => navigate("/coverage-plans")}
                      className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      Upgrade Coverage
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-card border border-border/50 p-6 shadow-sm"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
          
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Protected Earnings</p>
              <h2 className="text-4xl font-bold tracking-tight flex items-baseline gap-1">
                <span className="text-primary">₹</span>{getTotalProtectedEarnings().toLocaleString()}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Shield className="w-6 h-6 text-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 relative z-10">
            <div className="bg-secondary/50 rounded-2xl p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Est. Payout</span>
              </div>
              <p className="text-lg font-semibold">₹1,200/day</p>
            </div>
            <div className="bg-secondary/50 rounded-2xl p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Activity size={14} className="text-blue-500" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Coverage</span>
              </div>
              <p className="text-lg font-semibold">98.5%</p>
            </div>
          </div>
        </motion.div>

        {/* Dynamic Risk Assessment */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl bg-card border border-border/50 p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Zap size={18} className="text-primary" />
              Live Risk Oracle
            </h3>
            <span className="text-xs font-bold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-500 uppercase tracking-wider">
              Low Risk
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <MapPin size={14} />
                Current Zone ({zoneId})
              </span>
              <div className="flex flex-col items-end">
                <span className="font-medium">{zoneName}</span>
                {locationError && <span className="text-[10px] text-amber-500">{locationError}</span>}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm group relative">
              <span className="text-muted-foreground flex items-center gap-1">
                Weather Impact
                <div className="relative">
                  <Zap size={12} className="text-muted-foreground cursor-help" />
                  <div className="absolute left-full ml-2 top-0 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 border border-border">
                    Higher impact during rain or storms increases risk.
                  </div>
                </div>
              </span>
              <span className={cn("font-medium", weatherDisplay.color)}>{weatherDisplay.text}</span>
            </div>
            <div className="flex items-center justify-between text-sm group relative">
              <span className="text-muted-foreground flex items-center gap-1">
                Traffic Density
                <div className="relative">
                  <Zap size={12} className="text-muted-foreground cursor-help" />
                  <div className="absolute left-full ml-2 top-0 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 border border-border">
                    Higher traffic density increases collision risk.
                  </div>
                </div>
              </span>
              <span className={cn("font-medium", trafficDisplay.color)}>{trafficDisplay.text}</span>
            </div>
            <div className="flex items-center justify-between text-sm group relative">
              <span className="text-muted-foreground flex items-center gap-1">
                Air Quality (AQI)
                <div className="relative">
                  <Zap size={12} className="text-muted-foreground cursor-help" />
                  <div className="absolute left-full ml-2 top-0 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 border border-border">
                    Poor air quality may impact health and increase claim risk.
                  </div>
                </div>
              </span>
              <span className={cn("font-medium", aqiDisplay.color)}>{aqiDisplay.text}</span>
            </div>
            
            <div className="pt-4 border-t border-border/50">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-emerald-500">Actuarial Premium</span>
                <span className="text-lg font-bold text-primary">₹{displayPremium.toFixed(0)}/week</span>
              </div>
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Max Coverage Cap</span>
                <span className="text-sm font-bold text-primary">₹{displayCoverage}</span>
              </div>
              {!hasUpgraded ? (
                <button 
                  onClick={() => navigate("/coverage-plans")}
                  className="w-full mt-2 text-xs font-bold text-primary hover:text-primary/80 flex items-center justify-center gap-1"
                >
                  Explore Upgrade Options <ChevronRight size={12} />
                </button>
              ) : (
                <div className="w-full mt-2 text-xs font-bold text-emerald-500 flex items-center justify-center gap-1">
                  Weekly premium upgraded <CheckCircle size={12} />
                </div>
              )}
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mt-2">
                <div className="h-full bg-primary w-[20%]" />
              </div>
            </div>
          </div>
        </motion.div>

        <RiskAnalysis 
          weatherData={weatherData}
          aqiData={aqiData}
          trafficData={trafficData}
          location={location}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => navigate("/claims")}
            className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertTriangle size={20} />
            </div>
            <span className="font-semibold text-xs text-center">Claims Center</span>
          </button>
          <button
            onClick={() => navigate("/coverage")}
            className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Shield size={20} />
            </div>
            <span className="font-semibold text-xs text-center">View Policy</span>
          </button>
          <button
            onClick={() => navigate("/wallet")}
            className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <WalletIcon size={20} />
            </div>
            <span className="font-semibold text-xs text-center">Wallet</span>
          </button>
        </div>

        {/* Recent Activity */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Recent Activity</h3>
            <button className="text-xs font-bold text-primary uppercase tracking-wider flex items-center">
              View All <ChevronRight size={14} />
            </button>
          </div>
          
          <div className="space-y-3">
            {(() => {
              // Compute dynamic recent activity from live wallet/premium state
              const latestDebit = walletTransactions.find(t => t.type === "debit");
              const latestCredit = walletTransactions.find(t => t.type === "credit");
              
               const policyStatus = getPolicyStatus();
               const validTill = policyStatus.validTill;
               const isActive = policyStatus.isActive;

               const activityItems = [
                { 
                  title: "Weekly Policy Active", 
                  desc: `Term: 3 Months • Valid till ${validTill}`, 
                  time: isActive ? "Active" : "Expired", 
                  icon: "🛡️", 
                  color: isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive" 
                },
                { 
                  title: "Weekly Premium Deducted", 
                  desc: latestDebit 
                    ? `₹${Number(latestDebit?.amount || 0).toFixed(2)} • Wallet Balance` 
                    : `₹${(premiumRate * 24).toFixed(2)} • Wallet Balance`, 
                  time: latestDebit?.date?.split(",")[0] || "Monday", 
                  icon: "💸", 
                  color: "bg-destructive/10 text-destructive" 
                },
                { 
                  title: latestCredit ? latestCredit.title : "Claim Approved", 
                  desc: latestCredit 
                    ? `${latestCredit.desc?.split("•")[0]?.trim()} • ₹${Number(latestCredit?.amount || 0).toFixed(2)}` 
                    : "Heatwave Alert • ₹239.00", 
                  time: latestCredit?.date?.split(",")[0] || "Last Week", 
                  icon: "✅", 
                  color: "bg-primary/10 text-primary" 
                },
              ];

              return activityItems.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-card border border-border/50">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0", item.color)}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm truncate">{item.title}</h4>
                  <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                </div>
                <span className="text-[10px] font-medium text-muted-foreground shrink-0">{item.time}</span>
              </div>
              ));
            })()}
          </div>
        </div>
      </main>

      {/* Upgrade Modal & Payment Flow */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm bg-card border border-border/50 rounded-3xl overflow-hidden shadow-2xl relative"
          >
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-4 right-4 p-2 bg-secondary rounded-full text-muted-foreground hover:text-foreground z-10"
              disabled={isProcessing}
            >
              <X size={16} />
            </button>

            {upgradeStep === 1 && (
              <div className="p-6">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-4 border border-indigo-500/30">
                  <Shield className="w-6 h-6 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold mb-2">Premium Shield Upgrade</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Enhance your hourly coverage by paying a one-time upgrade fee. Get maximum protection against unforeseen disruptions.
                </p>

                <div className="bg-secondary/50 rounded-2xl p-4 space-y-3 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Additional Cost</span>
                    <span className="font-bold">₹15.00</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-500">
                    <span className="text-sm font-bold">New Max Coverage</span>
                    <span className="font-bold">+₹500.00</span>
                  </div>
                </div>

                <button
                  onClick={() => setUpgradeStep(2)}
                  className="w-full bg-primary text-background font-bold py-3.5 rounded-xl hover:bg-primary/90 transition-colors"
                >
                  Continue to Payment
                </button>
              </div>
            )}

            {upgradeStep === 2 && (
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">Select Payment Method</h2>
                
                <div className="space-y-3 mb-6">
                  <button 
                    onClick={() => setPaymentMethod("wallet")}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-2xl border transition-colors text-left",
                      paymentMethod === "wallet" ? "border-primary bg-primary/10" : "border-border/50 bg-secondary/50"
                    )}
                  >
                    <WalletIcon className="text-primary" size={20} />
                    <div>
                      <div className="font-bold text-sm">Nexus Wallet</div>
                      <div className="text-xs text-muted-foreground">Balance: ₹1,240.00</div>
                    </div>
                  </button>
                  <button 
                    onClick={() => setPaymentMethod("upi")}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-2xl border transition-colors text-left",
                      paymentMethod === "upi" ? "border-primary bg-primary/10" : "border-border/50 bg-secondary/50"
                    )}
                  >
                    <Smartphone className="text-emerald-500" size={20} />
                    <div>
                      <div className="font-bold text-sm">UPI</div>
                      <div className="text-xs text-muted-foreground">GPay, PhonePe, Paytm</div>
                    </div>
                  </button>
                  <button 
                    onClick={() => setPaymentMethod("netbanking")}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-2xl border transition-colors text-left",
                      paymentMethod === "netbanking" ? "border-primary bg-primary/10" : "border-border/50 bg-secondary/50"
                    )}
                  >
                    <CreditCard className="text-indigo-500" size={20} />
                    <div>
                      <div className="font-bold text-sm">Netbanking</div>
                      <div className="text-xs text-muted-foreground">All major banks</div>
                    </div>
                  </button>
                </div>

                <button
                  onClick={handleRazorpayPayment}
                  disabled={!paymentMethod || isProcessing}
                  className="w-full bg-primary text-background font-bold py-3.5 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={18} /> : "Pay ₹15.00"}
                </button>
              </div>
            )}

            {upgradeStep === 3 && (
              <div className="p-6 flex flex-col items-center text-center py-10">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                >
                  <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
                </motion.div>
                <h2 className="text-xl font-bold mb-2">Upgrade Successful!</h2>
                <p className="text-sm text-muted-foreground mb-8">
                  Your coverage has been actively extended. Your new cap is ₹{displayCoverage}.
                </p>
                <button
                  onClick={() => {
                    refreshPlanState();
                    setShowUpgradeModal(false);
                  }}
                  className="w-full bg-secondary text-foreground font-bold py-3.5 rounded-xl hover:bg-secondary/80 transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
