import { motion } from "framer-motion";
import { FileText, ChevronRight, AlertCircle, CheckCircle2, Clock, Languages, Zap, UserPlus, Scale, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useState, useEffect } from "react";
import { 
  getClaims, 
  syncWithServer,
  type PayoutClaim, 
} from "../lib/payoutStore";
import NotificationBell from "../components/NotificationBell";

export default function Claims() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [claims, setClaims] = useState<PayoutClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // ── Supabase-first load ──────────────────────────────────────────────
    // Pull the live dataset from Supabase on every mount.
    // localStorage is only used as a fast cache while the network request resolves.
    const partnerId = localStorage.getItem("partner_id") ||
                      localStorage.getItem("signin_phone") ||
                      localStorage.getItem("signin_platform");

    // Show cached data immediately (avoids blank screen flash)
    const cached = getClaims();
    if (cached.length > 0) setClaims(cached);

    const fetchFromServer = async () => {
      setIsLoading(true);
      try {
        if (partnerId) {
          await syncWithServer(partnerId, "claims-screen-mount");
        }
      } catch (e) {
        console.warn("[Claims] Server sync failed, using cache:", e);
      } finally {
        // Read from cache (now populated by syncWithServer)
        setClaims(getClaims());
        setIsLoading(false);
      }
    };

    fetchFromServer();

    // ── Live updates ─────────────────────────────────────────────────────
    // Re-read cache whenever a sync fires (e.g. after filing a claim)
    const refresh = () => setClaims(getClaims());
    window.addEventListener("nexus-payout-update", refresh);
    window.addEventListener("focus", () => {
      if (partnerId) syncWithServer(partnerId, "focus-refresh").then(refresh).catch(() => refresh());
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });

    return () => {
      window.removeEventListener("nexus-payout-update", refresh);
    };
  }, []);



  const t = {
    en: {
      title: "Claims & Payouts",
      subtitle: "Track your Sovereign Shield claims.",
      approved: "Approved",
      rejected: "Rejected",
      processing: "Processing",
      challenge: "Challenge Decision",
      viewJEP: "View Judicial Evidence Packet",
    },
    hi: {
      title: "दावे और भुगतान",
      subtitle: "Track your Sovereign Shield claims.",
      approved: "मंज़ूर",
      rejected: "अस्वीकृत",
      processing: "प्रक्रिया में",
      challenge: "निर्णय को चुनौती दें",
      viewJEP: "न्यायिक साक्ष्य पैकेट देखें",
    },
  };

  return (
    <div className="min-h-full bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10 sticky top-0 bg-background/95 backdrop-blur-md z-40">
        <h1 className="font-bold tracking-tight text-xl">{t[lang].title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-secondary transition-colors"
          >
            <Languages size={14} />
            {lang === "en" ? "HI" : "EN"}
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2"
        >
          <p className="text-muted-foreground">{t[lang].subtitle}</p>
        </motion.div>

        {/* Three-Tier Architecture Explanation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm mb-6"
        >
          <h3 className="font-bold text-lg mb-4">Our 3-Tier Claims Architecture</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap size={16} className="text-emerald-500" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Tier 1 (Autonomous)</h4>
                <p className="text-xs text-muted-foreground mt-1">System auto-detects disruption. You do nothing. Payout in 47 seconds.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <UserPlus size={16} className="text-blue-500" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Tier 2 (Assisted)</h4>
                <p className="text-xs text-muted-foreground mt-1">Manually file a claim the system missed. 90-second AI verification.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Scale size={16} className="text-purple-500" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Tier 3 (Disputed)</h4>
                <p className="text-xs text-muted-foreground mt-1">Challenge any rejected claim within 24 hours with evidence. Human adjuster reviews.</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg">Recent Claims</h3>
            <button onClick={() => navigate("/file-claim")} className="text-xs font-bold text-primary uppercase tracking-wider">File Claim (Tier 2)</button>
          </div>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm font-medium">Fetching claims from Supabase...</p>
            </div>
          )}

          {!isLoading && claims.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3 bg-card border border-border/50 rounded-3xl p-6">
              <FileText size={32} className="text-muted-foreground/50" />
              <p className="text-sm font-semibold">No claims yet</p>
              <p className="text-xs text-center">File your first claim using the "File Claim (Tier 2)" button above. It will appear here immediately after submission.</p>
            </div>
          )}

          {!isLoading && claims.map((claim, i) => {
            const displayStatus = claim.status;
            
            return (
              <motion.div
                key={claim.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + (i * 0.1) }}
                className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm relative overflow-hidden"
              >
                {claim.status === "rejected" && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-destructive/5 rounded-full blur-2xl -mr-8 -mt-8" />
                )}

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-lg">{claim.id}</h4>
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", claim.tierBg, claim.tierColor)}>
                        {claim.tier}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{claim.date} • {claim.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">₹{claim.amount.toLocaleString()}</p>
                    <div className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md mt-1",
                      displayStatus === "approved" ? "bg-emerald-500/10 text-emerald-500" :
                      displayStatus === "rejected" ? "bg-destructive/10 text-destructive" :
                      "bg-amber-500/10 text-amber-500"
                    )}>
                      {displayStatus === "approved" && <CheckCircle2 size={12} />}
                      {displayStatus === "rejected" && <AlertCircle size={12} />}
                      {displayStatus === "processing" && <Clock size={12} />}
                      {t[lang][displayStatus as keyof typeof t["en"]]}
                    </div>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-xl p-4 mb-4 relative z-10 space-y-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Comprehensive Judicial Summary</h4>
                  
                  {displayStatus === "approved" && (
                    <div className="space-y-2">
                      <p className="text-xs text-foreground leading-relaxed">{claim.summary.wordedReason}</p>
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Policy Clauses Met</p>
                        <ul className="list-disc list-inside text-xs text-muted-foreground">
                          {claim.summary.policyClauses.map((clause, i) => <li key={i}>{clause}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}

                  {displayStatus === "rejected" && (
                    <div className="space-y-2">
                      <p className="text-xs text-destructive leading-relaxed font-medium">{claim.summary.wordedReason}</p>
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-1">Technical Reason</p>
                        <p className="text-xs text-muted-foreground font-mono">{claim.summary.technicalReason}</p>
                      </div>
                    </div>
                  )}

                  {displayStatus === "processing" && (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-600 leading-relaxed font-medium">
                        {claim.summary.wordedReason}
                      </p>
                    </div>
                  )}
                </div>

                {claim.status === "rejected" && (
                  <div className="mt-4 pt-4 border-t border-border/50 relative z-10">
                    <p className="text-xs text-destructive font-medium mb-3">Reason: {claim.reason}</p>
                    <button
                      onClick={() => navigate(`/claim-evidence/${claim.id}`)}
                      className="w-full bg-destructive/10 text-destructive hover:bg-destructive/20 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      {t[lang].challenge} (Tier 3) <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {claim.status === "approved" && (
                  <div className="mt-4 pt-4 border-t border-border/50 relative z-10">
                    <button
                      onClick={() => navigate(`/payout-success/${claim.id}`)}
                      className="w-full bg-secondary/50 text-foreground hover:bg-secondary font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <FileText size={16} /> {t[lang].viewJEP}
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
