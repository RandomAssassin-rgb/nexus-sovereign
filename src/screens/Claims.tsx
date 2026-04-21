import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Languages,
  Loader2,
  RefreshCw,
  Scale,
  ShieldAlert,
  UserPlus,
  WifiOff,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import {
  getClaims,
  syncWithServer,
  type PayoutClaim,
} from "../lib/payoutStore";
import NotificationBell from "../components/NotificationBell";
import { fetchJsonOrThrow } from "../lib/fetchJson";
import {
  getOfflineClaims,
  removeOfflineClaim,
  syncSingleOfflineClaim,
  syncOfflineClaims,
  type OfflineClaim,
  type OfflineQueueSyncResult,
} from "../lib/offlineQueue";
import { restoreSessionBridge } from "../lib/sessionBridge";
import { getWorkerPartnerIdSnapshot } from "../lib/sessionIdentity";

const translations = {
  en: {
    title: "Claims & Payouts",
    subtitle: "Track your Sovereign Shield claims.",
    approved: "Approved",
    rejected: "Rejected",
    processing: "Processing",
    challenge: "Challenge decision",
    viewReceipt: "View Payout Receipt",
    viewEvidence: "View Evidence Pack",
  },
  hi: {
    title: "Daave aur bhugtan",
    subtitle: "Apne Sovereign Shield claims ko track kariye.",
    approved: "Manzoor",
    rejected: "Asvikarit",
    processing: "Prakriya mein",
    challenge: "Decision ko chunauti dein",
    viewReceipt: "Bhugtan raseed dekhein",
    viewEvidence: "Saboot packet dekhein",
  },
} as const;

export default function Claims() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [claims, setClaims] = useState<PayoutClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [explanation, setExplanation] = useState<any>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [offlineClaims, setOfflineClaims] = useState<OfflineClaim[]>([]);
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [offlineResult, setOfflineResult] = useState<OfflineQueueSyncResult | null>(null);
  const [activeOfflineClaimId, setActiveOfflineClaimId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(() => getWorkerPartnerIdSnapshot());
  const [syncNotice, setSyncNotice] = useState("");

  useEffect(() => {
    const refreshPartnerId = () => {
      const current = getWorkerPartnerIdSnapshot();
      setPartnerId((previous) => (previous === current ? previous : current));
    };

    void restoreSessionBridge()
      .catch(() => undefined)
      .finally(refreshPartnerId);

    window.addEventListener("storage", refreshPartnerId);
    window.addEventListener("auth-change", refreshPartnerId);

    return () => {
      window.removeEventListener("storage", refreshPartnerId);
      window.removeEventListener("auth-change", refreshPartnerId);
    };
  }, []);

  useEffect(() => {
    const cached = (() => {
      try {
        const raw = localStorage.getItem("nexus_claims");
        return raw ? (JSON.parse(raw) as PayoutClaim[]) : [];
      } catch {
        return [];
      }
    })();
    if (cached.length > 0) setClaims(cached);

    const fetchFromServer = async () => {
      if (cached.length === 0) setIsLoading(true);
      if (!partnerId) {
        setSyncNotice("No active worker session found yet. Sign in again if this does not resolve.");
        setClaims([]);
        setIsLoading(false);
        return;
      }

      try {
        const result = await Promise.race([
          syncWithServer(partnerId, "claims-screen-mount"),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 5200);
          }),
        ]);
        setSyncNotice(result ? "" : "Live claim sync is delayed. Showing the latest local ledger.");
      } catch (error) {
        console.warn("[Claims] Server sync failed, using cache:", error);
        setSyncNotice("Live claim sync is delayed. Showing the latest local ledger.");
      } finally {
        setClaims(getClaims());
        setIsLoading(false);
      }
    };

    const refreshClaims = () => setClaims(getClaims());
    const handleFocus = () => {
      if (partnerId) {
        syncWithServer(partnerId, "claims-focus-refresh")
          .then((result) => {
            setSyncNotice(result ? "" : "Live claim sync is delayed. Showing the latest local ledger.");
            refreshClaims();
          })
          .catch(() => {
            setSyncNotice("Live claim sync is delayed. Showing the latest local ledger.");
            refreshClaims();
          });
      } else {
        refreshClaims();
      }
    };

    void fetchFromServer();
    window.addEventListener("nexus-payout-update", refreshClaims);
    window.addEventListener("focus", handleFocus);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshClaims();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("nexus-payout-update", refreshClaims);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [partnerId]);

  useEffect(() => {
    let isMounted = true;

    const loadOfflineQueue = async () => {
      const queued = await getOfflineClaims();
      if (isMounted) setOfflineClaims(queued);
    };

    const handleQueueUpdate = () => {
      void loadOfflineQueue();
    };

    void loadOfflineQueue();
    window.addEventListener("nexus-offline-queue-update", handleQueueUpdate);
    window.addEventListener("focus", handleQueueUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener("nexus-offline-queue-update", handleQueueUpdate);
      window.removeEventListener("focus", handleQueueUpdate);
    };
  }, []);

  useEffect(() => {
    const approvedClaim = claims.find((claim) => claim.status === "approved");
    if (!approvedClaim) {
      setExplanation(null);
      return;
    }

    let isMounted = true;

    const fetchExplanation = async () => {
      setExplanationLoading(true);
      try {
        const result = await fetchJsonOrThrow<any>(
          `/api/claims/explain/${approvedClaim.id}`,
          { method: "GET" },
          "Payout explanation unavailable"
        );

        if (isMounted) {
          setExplanation(result);
        }
      } catch (error) {
        console.warn("[Claims] Payout explanation unavailable", error);
        if (isMounted) {
          setExplanation(null);
        }
      } finally {
        if (isMounted) setExplanationLoading(false);
      }
    };

    void fetchExplanation();

    return () => {
      isMounted = false;
    };
  }, [claims]);

  const handleOfflineReplay = async () => {
    setOfflineSyncing(true);
    try {
      const result = await syncOfflineClaims();
      setOfflineResult(result);
      setOfflineClaims(await getOfflineClaims());
      if (partnerId) {
        await syncWithServer(partnerId, "offline-continuity-replay").catch(() => undefined);
      }
      setClaims(getClaims());
      window.dispatchEvent(new Event("nexus-payout-update"));
    } finally {
      setOfflineSyncing(false);
    }
  };

  const handleSingleReplay = async (claimId: string) => {
    setActiveOfflineClaimId(claimId);
    try {
      const result = await syncSingleOfflineClaim(claimId);
      setOfflineResult(result);
      setOfflineClaims(await getOfflineClaims());
      if (partnerId) {
        await syncWithServer(partnerId, "single-offline-replay").catch(() => undefined);
      }
      setClaims(getClaims());
      window.dispatchEvent(new Event("nexus-payout-update"));
    } finally {
      setActiveOfflineClaimId(null);
    }
  };

  const handleRemoveOfflineClaim = async (claimId: string) => {
    setActiveOfflineClaimId(claimId);
    try {
      const next = await removeOfflineClaim(claimId);
      setOfflineClaims(next);
    } finally {
      setActiveOfflineClaimId(null);
    }
  };

  const t = translations[lang];

  const approvedCount = claims.filter((claim) => claim.status === "approved").length;
  const processingCount = claims.filter((claim) => claim.status === "processing").length;
  const disputedCount = claims.filter((claim) => claim.status === "rejected").length;
  const queuedCount = offlineClaims.filter((claim) => claim.status !== "failed").length;
  const failedQueueCount = offlineClaims.filter((claim) => claim.status === "failed").length;

  const offlineSummary = useMemo(
    () =>
      offlineResult
        ? [
            {
              label: "Synced",
              value: offlineResult.syncedCount,
              tone: "bg-emerald-500/10 text-emerald-500",
              icon: CheckCircle2,
            },
            {
              label: "Failed",
              value: offlineResult.failedCount,
              tone: "bg-amber-500/10 text-amber-500",
              icon: ShieldAlert,
            },
            {
              label: "Remaining",
              value: offlineResult.remaining,
              tone: "bg-secondary text-muted-foreground",
              icon: WifiOff,
            },
          ]
        : [],
    [offlineResult]
  );

  return (
    <div className="min-h-full flex flex-col">
      <header className="nexus-page-header">
        <div>
          <div className="nexus-section-eyebrow mb-2">Claims command</div>
          <h1 className="nexus-page-title">{t.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="nexus-chip"
          >
            <Languages size={14} />
            {lang === "en" ? "HI" : "EN"}
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="nexus-app-main space-y-6 pb-8">
        <section className="nexus-section-stack">
          <div className="nexus-section-heading">
            <div>
              <h2 className="nexus-section-title">Claim operations built for assisted and zero-touch payouts.</h2>
            </div>
            <p className="nexus-section-copy">{t.subtitle}</p>
          </div>
          {syncNotice ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-500">
              {syncNotice}
            </div>
          ) : null}
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="nexus-kpi-card">
            <div className="nexus-kpi-label">Approved</div>
            <div className="nexus-kpi-value text-emerald-500">{approvedCount}</div>
            <p className="nexus-kpi-meta">Released or settled claim packets.</p>
          </div>
          <div className="nexus-kpi-card">
            <div className="nexus-kpi-label">Processing</div>
            <div className="nexus-kpi-value text-amber-500">{processingCount}</div>
            <p className="nexus-kpi-meta">Claims under live review and payout computation.</p>
          </div>
          <div className="nexus-kpi-card">
            <div className="nexus-kpi-label">Disputed</div>
            <div className="nexus-kpi-value text-primary">{disputedCount}</div>
            <p className="nexus-kpi-meta">Rejected claims that can escalate to evidence review.</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.02 }}
          className="nexus-panel p-5 md:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="nexus-section-eyebrow mb-2">Offline continuity</div>
              <h3 className="text-2xl font-bold tracking-[-0.04em]">Claims captured offline replay into the live ledger once the worker reconnects.</h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Evidence, location, and shift posture are stored locally, then restored into the standard claim pipeline without duplicate claim creation.
              </p>
            </div>
            <button
              onClick={handleOfflineReplay}
              disabled={offlineSyncing || offlineClaims.length === 0}
              className="nexus-button-secondary min-w-[15rem]"
            >
              {offlineSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Replay queued claims
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="nexus-kpi-label">Queued now</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-foreground">{queuedCount}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Claims waiting for connectivity and replay.</p>
            </div>
            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="nexus-kpi-label">Needs attention</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-primary">{failedQueueCount}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Claims that failed replay and need another sync pass.</p>
            </div>
            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="nexus-kpi-label">Latest replay</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-emerald-500">
                {offlineResult ? offlineResult.syncedCount : 0}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Claims restored during the latest replay window.</p>
            </div>
          </div>

          {offlineSummary.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">
              {offlineSummary.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]", item.tone)}
                  >
                    <Icon size={12} />
                    {item.value} {item.label}
                  </div>
                );
              })}
            </div>
          )}

          {offlineResult?.results?.length ? (
            <div className="mt-5 nexus-subpanel rounded-2xl p-4">
              <div className="nexus-kpi-label">Replay history</div>
              <div className="mt-3 space-y-3">
                {offlineResult.results.map((result) => (
                  <div
                    key={`${result.claimId}-${result.status}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/30 bg-background/60 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-semibold">{result.claimId}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{result.message}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]",
                        result.status === "synced"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {result.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {offlineClaims.length === 0 ? (
              <div className="nexus-subpanel rounded-2xl p-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  No offline claims are waiting right now. New offline captures will appear here before replay.
                </p>
              </div>
            ) : (
              offlineClaims.map((claim) => (
                <div key={claim.id} className="nexus-subpanel rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-bold">{claim.id}</div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]",
                            claim.status === "failed"
                              ? "bg-destructive/10 text-destructive"
                              : claim.status === "syncing"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-primary/10 text-primary"
                          )}
                        >
                          {claim.status || "queued"}
                        </span>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{claim.description}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(claim.timestamp).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Attempts</div>
                      <div className="mt-2 text-xl font-black tracking-[-0.05em]">{claim.attempts || 0}</div>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Shift posture</div>
                      <div className="mt-2 text-base font-bold">{claim.shiftStatus}</div>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Coordinates</div>
                      <div className="mt-2 text-base font-bold">
                        {Number(claim.gps?.lat || 0).toFixed(2)}, {Number(claim.gps?.lon || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {claim.lastError && (
                    <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                      Last replay error: {claim.lastError}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => handleSingleReplay(claim.id)}
                      disabled={activeOfflineClaimId === claim.id}
                      className="nexus-button-secondary min-w-[12rem]"
                    >
                      {activeOfflineClaimId === claim.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                      Replay this claim
                    </button>
                    <button
                      onClick={() => handleRemoveOfflineClaim(claim.id)}
                      disabled={activeOfflineClaimId === claim.id}
                      className="rounded-xl border border-border/40 bg-background/60 px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-60"
                    >
                      Remove from queue
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="nexus-panel p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="nexus-section-eyebrow mb-2">Explainable payout graph</div>
              <h3 className="text-2xl font-bold tracking-[-0.04em]">Why a payout cleared, and where guardrails stepped in.</h3>
            </div>
            {explanationLoading && <Loader2 size={18} className="animate-spin text-primary" />}
          </div>

          {explanation ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="nexus-subpanel rounded-2xl p-4">
                <div className="nexus-kpi-label">Decision path</div>
                <div className="mt-3 space-y-3">
                  {(explanation.signal_chain || []).map((item: any) => (
                    <div key={item.stage} className="rounded-2xl border border-border/35 bg-background/55 p-3">
                      <div className="text-sm font-semibold">{item.stage}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="nexus-subpanel rounded-2xl p-4">
                  <div className="nexus-kpi-label">Final narrative</div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{explanation.narrative}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(explanation.graph || []).map((item: any) => (
                    <div key={item.label} className="rounded-2xl border border-border/35 bg-background/55 p-4">
                      <div className="nexus-kpi-label">{item.label}</div>
                      <div className="mt-2 text-xl font-black tracking-[-0.05em]">
                        Rs {Number(item.value || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 nexus-subpanel rounded-2xl p-4">
              <p className="text-sm text-muted-foreground">
                As soon as an approved claim is available, the payout graph will show event signal, income loss, replacement ratio, Pmax, and final release.
              </p>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="nexus-panel p-5 md:p-6"
        >
          <div className="nexus-section-heading mb-5">
            <div>
              <div className="nexus-section-eyebrow mb-2">Claims architecture</div>
              <h3 className="text-2xl font-bold tracking-[-0.04em]">Three tiers, one clean escalation path.</h3>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                <Zap size={16} className="text-emerald-500" />
              </div>
              <h4 className="mt-4 text-sm font-semibold">Tier 1 (Autonomous)</h4>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                System-detected disruption. Worker does nothing. Payout rail clears in under a minute when confidence is high enough.
              </p>
            </div>

            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10">
                <UserPlus size={16} className="text-blue-500" />
              </div>
              <h4 className="mt-4 text-sm font-semibold">Tier 2 (Assisted)</h4>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                Worker manually files a claim when the system misses an event. AI review restores it into the protection path.
              </p>
            </div>

            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10">
                <Scale size={16} className="text-purple-500" />
              </div>
              <h4 className="mt-4 text-sm font-semibold">Tier 3 (Disputed)</h4>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                Rejected claims can be escalated with evidence and reviewed with a more conservative confidence threshold.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="space-y-4 pb-2">
          <div className="nexus-section-heading mb-2">
            <div>
              <div className="nexus-section-eyebrow mb-2">Claim ledger</div>
              <h3 className="nexus-section-title text-[1.8rem]">Recent claims</h3>
            </div>
            <button onClick={() => navigate("/file-claim")} className="nexus-button-primary">
            File claim (Tier 2)
            </button>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 mb-2">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={16} className="text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Protocol transparency active</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every payout in this ledger is backed by an immutable Signal Fabric trace. Click "View Evidence Pack" on any approved claim to inspect the forensic audit trail.
            </p>
          </div>

          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm font-medium">Fetching claims from Supabase...</p>
            </div>
          )}

          {!isLoading && claims.length === 0 && (
            <div className="nexus-panel flex flex-col items-center justify-center gap-3 rounded-3xl p-6 py-16 text-muted-foreground">
              <FileText size={32} className="text-muted-foreground/50" />
              <p className="text-sm font-semibold">No claims yet</p>
              <p className="text-center text-xs">
                File your first claim using the "File claim (Tier 2)" button above. It will appear here after submission.
              </p>
            </div>
          )}

          {!isLoading &&
            claims.map((claim, index) => {
              const displayStatus = claim.status;

              return (
                <motion.div
                  key={claim.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.08 }}
                  className="nexus-panel relative overflow-hidden rounded-3xl p-5"
                >
                  {claim.status === "rejected" && (
                    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-destructive/5 blur-2xl" />
                  )}

                  <div className="relative z-10 mb-4 flex items-start justify-between">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="text-lg font-bold">{claim.id}</h4>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            claim.tierBg,
                            claim.tierColor
                          )}
                        >
                          {claim.tier}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{claim.date} | {claim.type}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold">Rs {claim.amount.toLocaleString("en-IN")}</p>
                      <div
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                          displayStatus === "approved"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : displayStatus === "rejected"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-500/10 text-amber-500"
                        )}
                      >
                        {displayStatus === "approved" && <CheckCircle2 size={12} />}
                        {displayStatus === "rejected" && <AlertCircle size={12} />}
                        {displayStatus === "processing" && <Clock size={12} />}
                        {t[displayStatus as keyof typeof t]}
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 mb-4 space-y-3 rounded-xl bg-secondary/50 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Comprehensive Judicial Summary
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">Signal Fabric Provenance</span>
                      </div>
                    </div>

                    {displayStatus === "approved" && (
                      <div className="space-y-3">
                        <p className="text-xs leading-relaxed text-foreground font-medium">{claim.summary.wordedReason}</p>
                        
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="rounded-lg bg-background/40 p-2 border border-border/20">
                            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Trigger Event</p>
                            <p className="text-[10px] font-black text-foreground">{claim.type} Crossed</p>
                          </div>
                          <div className="rounded-lg bg-background/40 p-2 border border-border/20">
                            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Event Window</p>
                            <p className="text-[10px] font-black text-foreground">{claim.date}</p>
                          </div>
                        </div>

                        <div className="border-t border-border/50 pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                              Policy clauses met
                            </p>
                            <span className="text-[8px] font-mono text-muted-foreground/50">Trace ID: {claim.id.slice(0, 8)}</span>
                          </div>
                          <ul className="grid grid-cols-1 gap-1.5 list-none">
                            {claim.summary.policyClauses.map((clause, itemIndex) => (
                              <li key={itemIndex} className="flex items-start gap-2 text-[11px] text-muted-foreground leading-snug">
                                <CheckCircle2 size={10} className="text-emerald-500 mt-0.5 shrink-0" />
                                {clause}
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        {claim.amount >= 400 && (
                          <div className="mt-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Max Coverage Applied</span>
                            <span className="text-[10px] font-bold text-emerald-600">Rs {claim.amount} Cap</span>
                          </div>
                        )}
                      </div>
                    )}

                    {displayStatus === "rejected" && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium leading-relaxed text-destructive">{claim.summary.wordedReason}</p>
                        <div className="border-t border-border/50 pt-2">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-destructive">
                            Technical reason
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">{claim.summary.technicalReason}</p>
                        </div>
                      </div>
                    )}

                    {displayStatus === "processing" && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium leading-relaxed text-amber-600">
                          {claim.summary.wordedReason}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Loader2 size={10} className="animate-spin text-amber-500" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-600/60">Simulating Event Twin...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {claim.status === "rejected" && (
                    <div className="relative z-10 mt-4 border-t border-border/50 pt-4 space-y-3">
                      <p className="mb-1 text-xs font-medium text-destructive">Reason: {claim.reason}</p>
                      <button
                        onClick={() => navigate(`/jep/${claim.id}`)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20"
                      >
                        <ShieldAlert size={16} /> View Forensic Evidence <ChevronRight size={16} />
                      </button>
                      <button
                        onClick={() => navigate(`/claim-evidence/${claim.id}`)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary/30 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                      >
                        {t.challenge} (Tier 3)
                      </button>
                    </div>
                  )}

                  {claim.status === "approved" && (
                    <div className="relative z-10 mt-4 border-t border-border/50 pt-4 space-y-3">
                      <button
                        onClick={() => navigate(`/payout-success/${claim.id}`)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                      >
                        <Zap size={16} /> {t.viewReceipt}
                      </button>
                      <button
                        onClick={() => navigate(`/jep/${claim.id}`)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary/50 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                      >
                        <FileText size={16} /> {t.viewEvidence}
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
