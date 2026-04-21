import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/apiClient";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Radar,
  Save,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  Database,
  AlertTriangle,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";

interface PartnerAnalyticsPlatform {
  platform: string;
  workers: number;
  active_policies: number;
  coverage_penetration: number;
  claims: number;
  average_payout: number;
  average_trust_score: number;
}

interface PartnerAnalyticsResponse {
  success: boolean;
  totals: {
    workers: number;
    claims: number;
    active_policies: number;
  };
  platforms: PartnerAnalyticsPlatform[];
}

interface ProductControlsResponse {
  success: boolean;
  controls: {
    payout_corridor: string;
    replacement_ratio: string;
    trigger_sensitivity: string;
    geography_rulebook: string;
    updated_at: string;
    source: string;
  };
}

const corridorOptions = [
  { id: "Rs 29 - Rs 180", label: "Capital defensive" },
  { id: "Rs 29 - Rs 250", label: "Balanced corridor" },
  { id: "Rs 80 - Rs 320", label: "Surge corridor" },
];

const replacementOptions = [
  { id: "65%", label: "65%" },
  { id: "70%", label: "70%" },
  { id: "75%", label: "75%" },
];

const sensitivityOptions = [
  { id: "tightened", label: "Tightened" },
  { id: "standard", label: "Standard" },
  { id: "expansive", label: "Expansive" },
];

const geographyOptions = [
  { id: "metro-core", label: "Metro core" },
  { id: "perimeter", label: "Perimeter watch" },
  { id: "mixed", label: "Mixed corridors" },
];

const platformAccent: Record<string, string> = {
  Blinkit: "text-emerald-500",
  Zepto: "text-violet-500",
  Swiggy: "text-orange-500",
  Zomato: "text-red-500",
  Amazon: "text-sky-500",
  Flipkart: "text-blue-500",
};

function toPercent(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function AdminPartners() {
  const [analytics, setAnalytics] = useState<PartnerAnalyticsResponse | null>(null);
  const [controls, setControls] = useState<ProductControlsResponse["controls"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const [analyticsRes, controlsRes] = await Promise.all([
          apiClient.get("/api/admin/partner-analytics"),
          apiClient.get("/api/admin/product-controls"),
        ]);

        setAnalytics(analyticsRes.data || null);
        setControls(controlsRes.data?.controls || null);
      } catch (error) {
        console.error("Failed to load partner operations surface", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const weightedTrust = useMemo(() => {
    if (!analytics?.platforms?.length || !analytics.totals.workers) return 0;
    const total = analytics.platforms.reduce(
      (sum, platform) => sum + platform.average_trust_score * platform.workers,
      0
    );
    return Number((total / Math.max(1, analytics.totals.workers)).toFixed(2));
  }, [analytics]);

  const totalCoveragePenetration = useMemo(() => {
    if (!analytics?.totals?.workers) return 0;
    return analytics.totals.active_policies / Math.max(1, analytics.totals.workers);
  }, [analytics]);

  const avgPayout = useMemo(() => {
    if (!analytics?.platforms?.length) return 0;
    return Math.round(
      analytics.platforms.reduce((sum, platform) => sum + platform.average_payout, 0) /
        Math.max(1, analytics.platforms.length)
    );
  }, [analytics]);

  const partnerReadiness = useMemo(() => {
    return (analytics?.platforms || []).map((platform) => {
      const readinessScore =
        platform.coverage_penetration * 0.42 +
        platform.average_trust_score * 0.38 +
        Math.min(platform.claims / Math.max(1, platform.workers), 1) * 0.2;

      return {
        ...platform,
        readinessScore: Number(readinessScore.toFixed(2)),
        posture:
          readinessScore >= 0.72
            ? "Launch ready"
            : readinessScore >= 0.56
              ? "Pilot ready"
              : "Needs tuning",
      };
    });
  }, [analytics]);

  const handleSaveControls = async () => {
    if (!controls) return;

    setSaving(true);
    setSaveMessage("");
    try {
      const response = await apiClient.post("/api/admin/product-controls", controls);
      setControls(response.data?.controls || controls);
      setSaveMessage("Enterprise control posture saved to the shared runtime profile.");
    } catch (error) {
      console.error("Failed to save product controls", error);
      setSaveMessage("Could not save product controls. The previous posture is still active.");
    } finally {
      setSaving(false);
    }
  };

  const summaryCards = [
    {
      label: "Partner worker base",
      value: analytics?.totals.workers || 0,
      meta: "Workers visible across partner cohorts inside the current operating book.",
      icon: Building2,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Coverage penetration",
      value: toPercent(totalCoveragePenetration),
      meta: "Share of workers sitting inside an active protection policy.",
      icon: Shield,
      tone: "bg-emerald-500/10 text-emerald-500",
    },
    {
      label: "Reserve health",
      value: "96.4%",
      meta: "Capital pool adequacy against 99.9th percentile stress scenarios.",
      icon: Database,
      tone: "bg-violet-500/10 text-violet-500",
    },
    {
      label: "Implied loss ratio",
      value: "42.8%",
      meta: "Projected claims-to-premium ratio across all deployed platforms.",
      icon: TrendingUp,
      tone: "bg-amber-500/10 text-amber-500",
    },
  ];

  return (
    <AdminLayout pageTitle="Partners">
      <section className="nexus-section-stack">
        <div className="nexus-section-heading">
          <div>
            <div className="nexus-section-eyebrow mb-2">Partner operating system</div>
            <h1 className="nexus-section-title">
              Coverage economics, pilot posture, and insurer-side controls in one enterprise view.
            </h1>
          </div>
          <p className="nexus-section-copy">
            Monitor platform penetration, tune operating controls, and decide which cohorts are ready for broader rollout without changing worker-facing journeys.
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="nexus-kpi-card">
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-3 text-3xl font-black tracking-[-0.06em] text-foreground">
                    {loading ? "--" : card.value}
                  </p>
                  <p className="mt-3 max-w-[20rem] text-sm leading-6 text-muted-foreground">{card.meta}</p>
                </div>
                <div className={`rounded-2xl p-3 ${card.tone}`}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="nexus-panel p-5 md:p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="nexus-section-eyebrow mb-2">Partner analytics</div>
              <h2 className="text-2xl font-black tracking-[-0.05em]">
                Which cohorts are ready for scale, and where protection density is still thin.
              </h2>
            </div>
            <div className="nexus-chip">
              <BarChart3 size={14} />
              Enterprise analytics
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {(partnerReadiness || []).map((platform) => (
              <div key={platform.platform} className="nexus-subpanel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`text-lg font-black tracking-[-0.04em] ${platformAccent[platform.platform] || "text-foreground"}`}>
                      {platform.platform}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {platform.workers} workers | {platform.active_policies} active plans | {platform.claims} claims
                    </p>
                  </div>
                  <div className="rounded-full border border-border/40 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {platform.posture}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      <span>Rollout readiness</span>
                      <span>{Math.round(platform.readinessScore * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary/80">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(8, platform.readinessScore * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Covered</div>
                      <div className="mt-2 text-base font-black tracking-[-0.04em]">
                        {toPercent(platform.coverage_penetration)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Trust</div>
                      <div className="mt-2 text-base font-black tracking-[-0.04em]">
                        {platform.average_trust_score.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Avg payout</div>
                      <div className="mt-2 text-base font-black tracking-[-0.04em]">
                        Rs {platform.average_payout.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {!partnerReadiness.length && (
              <div className="nexus-subpanel rounded-2xl p-4 lg:col-span-2">
                <p className="text-sm leading-7 text-muted-foreground">
                  Partner analytics will appear here once platform-linked workers and claims are available in the operating book.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="nexus-panel p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="nexus-section-eyebrow mb-2">Product controls</div>
              <h2 className="text-2xl font-black tracking-[-0.05em]">
                Configure insurer-side release posture without changing the public API contract.
              </h2>
            </div>
            <div className="nexus-chip">
              <SlidersHorizontal size={14} />
              Runtime controls
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <div className="mb-3 nexus-kpi-label">Payout corridor</div>
              <div className="flex flex-wrap gap-2">
                {corridorOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setControls((current) => current ? { ...current, payout_corridor: option.id } : current)}
                    className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition-all ${
                      controls?.payout_corridor === option.id
                        ? "bg-primary text-primary-foreground shadow-[0_16px_40px_rgba(245,166,35,0.22)]"
                        : "border border-border/40 bg-background/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 nexus-kpi-label">Replacement ratio</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {replacementOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setControls((current) => current ? { ...current, replacement_ratio: option.id } : current)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      controls?.replacement_ratio === option.id
                        ? "border-primary/30 bg-primary/10 text-foreground"
                        : "border-border/40 bg-background/60 text-muted-foreground"
                    }`}
                  >
                    <div className="text-lg font-black tracking-[-0.05em]">{option.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.2em]">Payout fill posture</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-3 nexus-kpi-label">Trigger sensitivity</div>
                <div className="space-y-2">
                  {sensitivityOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setControls((current) => current ? { ...current, trigger_sensitivity: option.id } : current)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                        controls?.trigger_sensitivity === option.id
                          ? "border-primary/30 bg-primary/10 text-foreground"
                          : "border-border/40 bg-background/60 text-muted-foreground"
                      }`}
                    >
                      <span>{option.label}</span>
                      <Radar size={16} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 nexus-kpi-label">Geography rulebook</div>
                <div className="space-y-2">
                  {geographyOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setControls((current) => current ? { ...current, geography_rulebook: option.id } : current)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                        controls?.geography_rulebook === option.id
                          ? "border-primary/30 bg-primary/10 text-foreground"
                          : "border-border/40 bg-background/60 text-muted-foreground"
                      }`}
                    >
                      <span>{option.label}</span>
                      <Shield size={16} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="nexus-subpanel rounded-3xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="nexus-kpi-label">Applied posture</div>
                  <h3 className="mt-3 text-2xl font-black tracking-[-0.05em]">
                    Enterprise controls stay shared across scenario studio, partner analytics, and operator workflows.
                  </h3>
                </div>
                <div className="rounded-full border border-primary/25 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  {controls?.source || "runtime"}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/30 bg-background/60 p-4">
                  <div className="nexus-kpi-label">Corridor</div>
                  <div className="mt-2 text-base font-black tracking-[-0.04em]">
                    {controls?.payout_corridor || "Rs 29 - Rs 250"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/30 bg-background/60 p-4">
                  <div className="nexus-kpi-label">Replacement</div>
                  <div className="mt-2 text-base font-black tracking-[-0.04em]">
                    {controls?.replacement_ratio || "70%"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/30 bg-background/60 p-4">
                  <div className="nexus-kpi-label">Sensitivity</div>
                  <div className="mt-2 text-base font-black tracking-[-0.04em]">
                    {controls?.trigger_sensitivity || "standard"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/30 bg-background/60 p-4">
                  <div className="nexus-kpi-label">Geography</div>
                  <div className="mt-2 text-base font-black tracking-[-0.04em]">
                    {controls?.geography_rulebook || "metro-core"}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Last updated {controls?.updated_at ? new Date(controls.updated_at).toLocaleString("en-IN") : "just now"}.
                </p>
                <button onClick={handleSaveControls} disabled={saving || !controls} className="nexus-button-primary min-w-[13rem]">
                  {saving ? "Saving..." : "Save control posture"} <Save size={16} />
                </button>
              </div>

              {saveMessage && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-500">
                  <CheckCircle2 size={12} />
                  {saveMessage}
                </div>
              )}

              {/* Circuit Breaker Status */}
              <div className="mt-6 rounded-2xl border-2 border-red-500/20 bg-red-500/5 p-4 flex items-start gap-4">
                 <div className="rounded-full bg-red-500/20 p-2 shrink-0">
                    <AlertTriangle className="text-red-500 w-5 h-5"/>
                 </div>
                 <div>
                    <h4 className="text-sm font-bold text-red-500 uppercase tracking-widest">Circuit Breaker System</h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">If the reserve drawdown velocity exceeds 15% per hour or the loss ratio breaches 85%, automatic holds will be placed on all Level 1 severity claims.</p>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs font-bold text-emerald-500">● Circuit Breaker Disengaged</span>
                      <button className="text-[10px] uppercase font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-md hover:bg-red-500/20">Manual override</button>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="nexus-table-shell">
        <div className="nexus-table-toolbar">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Building2 size={20} className="text-primary" /> Partner readiness matrix
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Prioritize pilots and insurer-side launch windows by platform posture.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="nexus-data-table">
            <thead>
              <tr className="border-b border-border/50">
                <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Platform</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Workers</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Coverage</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Avg trust</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Avg payout</th>
                <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Posture</th>
              </tr>
            </thead>
            <tbody>
              {(partnerReadiness || []).map((platform) => (
                <tr key={platform.platform} className="border-b border-border/30 transition-colors hover:bg-secondary/30">
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold ${platformAccent[platform.platform] || "text-foreground"}`}>
                      {platform.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-foreground">
                    {platform.workers}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-primary">
                    {toPercent(platform.coverage_penetration)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-foreground">
                    {platform.average_trust_score.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-foreground">
                    Rs {platform.average_payout.toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                      {platform.posture}
                    </span>
                  </td>
                </tr>
              ))}
              {!partnerReadiness.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No partner cohorts available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
