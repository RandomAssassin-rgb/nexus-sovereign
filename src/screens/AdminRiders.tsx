import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/apiClient";
import {
  Activity,
  MapPin,
  Search,
  Shield,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";

interface Rider {
  id: string;
  name: string;
  platform: string;
  zone: string;
  status: "active" | "idle" | "offline" | "blocked";
  plan: string;
  claims: number;
  total_paid: number;
  rating: number;
  joined: string;
  risk: "low" | "medium" | "high";
}

interface PartnerAnalyticsPlatform {
  platform: string;
  workers: number;
  active_policies: number;
  coverage_penetration: number;
  claims: number;
  average_payout: number;
  average_trust_score: number;
}

interface PartnerAnalytics {
  success: boolean;
  totals: {
    workers: number;
    claims: number;
    active_policies: number;
  };
  platforms: PartnerAnalyticsPlatform[];
}

const statusBadge: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  idle: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  offline: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  blocked: "bg-red-500/10 text-red-600 border-red-500/20",
};

const riskBadge: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600",
  medium: "bg-amber-500/10 text-amber-600",
  high: "bg-red-500/10 text-red-600",
};

const platformColor: Record<string, string> = {
  Blinkit: "text-emerald-500",
  Zepto: "text-violet-500",
  Swiggy: "text-orange-500",
  Zomato: "text-red-500",
  Amazon: "text-sky-500",
  Flipkart: "text-blue-500",
  Ola: "text-yellow-500",
  Rapido: "text-cyan-500",
};

const corridorOptions = [
  { id: "Rs 29 - Rs 250", label: "Balanced corridor", value: "Rs 29 - Rs 250" },
  { id: "Rs 80 - Rs 320", label: "Monsoon surge", value: "Rs 80 - Rs 320" },
  { id: "Rs 29 - Rs 180", label: "Capital defensive", value: "Rs 29 - Rs 180" },
];

const replacementOptions = [
  { id: "65%", label: "65%", detail: "carrier-first posture" },
  { id: "70%", label: "70%", detail: "default release ratio" },
  { id: "75%", label: "75%", detail: "worker-retention emphasis" },
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

function buildFallbackAnalytics(riders: Rider[]): PartnerAnalytics {
  const byPlatform = new Map<string, PartnerAnalyticsPlatform>();

  riders.forEach((rider) => {
    const current = byPlatform.get(rider.platform) || {
      platform: rider.platform,
      workers: 0,
      active_policies: 0,
      coverage_penetration: 0,
      claims: 0,
      average_payout: 0,
      average_trust_score: 0,
    };

    current.workers += 1;
    current.active_policies += rider.plan === "Premium" ? 1 : 0;
    current.claims += rider.claims;
    current.average_payout += rider.total_paid;
    current.average_trust_score += rider.risk === "low" ? 0.86 : rider.risk === "medium" ? 0.69 : 0.51;
    byPlatform.set(rider.platform, current);
  });

  const platforms = Array.from(byPlatform.values()).map((platform) => ({
    ...platform,
    coverage_penetration: Number((platform.active_policies / Math.max(1, platform.workers)).toFixed(2)),
    average_payout: Math.round(platform.average_payout / Math.max(1, platform.claims || platform.workers)),
    average_trust_score: Number((platform.average_trust_score / Math.max(1, platform.workers)).toFixed(3)),
  }));

  return {
    success: true,
    totals: {
      workers: riders.length,
      claims: riders.reduce((sum, rider) => sum + rider.claims, 0),
      active_policies: riders.filter((rider) => rider.plan === "Premium").length,
    },
    platforms,
  };
}

export default function AdminRiders() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [analytics, setAnalytics] = useState<PartnerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [corridorPreset, setCorridorPreset] = useState("Rs 29 - Rs 250");
  const [replacementRatio, setReplacementRatio] = useState<number>(70);
  const [triggerSensitivity, setTriggerSensitivity] = useState(50);
  const [geographyPreset, setGeographyPreset] = useState("metro-core");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ridersRes, analyticsRes, controlsRes] = await Promise.allSettled([
          apiClient.get("/api/admin/riders"),
          apiClient.get("/api/admin/partner-analytics"),
          apiClient.get("/api/admin/product-controls"),
        ]);

        if (ridersRes.status === "fulfilled") {
          setRiders(ridersRes.value.data || []);
        }

        if (analyticsRes.status === "fulfilled") {
          setAnalytics(analyticsRes.value.data || null);
        }

        if (controlsRes.status === "fulfilled") {
          const controls = controlsRes.value.data?.controls;
          if (controls?.payout_corridor) setCorridorPreset(controls.payout_corridor);
          if (controls?.replacement_ratio) setReplacementRatio(parseInt(controls.replacement_ratio?.replace('%', '')) || 70);
          if (controls?.trigger_sensitivity) {
            setTriggerSensitivity(controls.trigger_sensitivity === 'tightened' ? 25 : controls.trigger_sensitivity === 'expansive' ? 75 : 50);
          }
          if (controls?.geography_rulebook) setGeographyPreset(controls.geography_rulebook);
        }
      } catch (error) {
        console.error("Failed to fetch rider operations data", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  const analyticsView = useMemo(
    () => analytics || buildFallbackAnalytics(riders),
    [analytics, riders]
  );

  const filteredRiders = riders.filter((rider) => {
    const query = search.toLowerCase();
    const matchesSearch =
      rider.name.toLowerCase().includes(query) ||
      rider.zone.toLowerCase().includes(query) ||
      rider.platform.toLowerCase().includes(query) ||
      rider.id.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || rider.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const coveragePenetration = analyticsView.totals.workers
    ? Math.round((analyticsView.totals.active_policies / analyticsView.totals.workers) * 100)
    : 0;

  const weightedTrustScore = analyticsView.platforms.length
    ? (
        analyticsView.platforms.reduce(
          (sum, platform) => sum + platform.average_trust_score * platform.workers,
          0
        ) / Math.max(1, analyticsView.totals.workers)
      ).toFixed(2)
    : "0.00";

  const topPlatform = [...analyticsView.platforms].sort((left, right) => right.workers - left.workers)[0];

  const summaryCards = [
    {
      label: "Worker base",
      value: analyticsView.totals.workers.toString(),
      meta: "Total workers across active platform cohorts.",
      icon: Users,
      color: "text-primary bg-primary/10",
    },
    {
      label: "Coverage penetration",
      value: `${coveragePenetration}%`,
      meta: "Workers currently sitting inside an active protection plan.",
      icon: Shield,
      color: "text-emerald-500 bg-emerald-500/10",
    },
    {
      label: "Claims footprint",
      value: analyticsView.totals.claims.toString(),
      meta: "Total protection events processed across partner cohorts.",
      icon: Activity,
      color: "text-amber-500 bg-amber-500/10",
    },
    {
      label: "Trust baseline",
      value: weightedTrustScore,
      meta: "Weighted average trust score across the operating book.",
      icon: Star,
      color: "text-violet-500 bg-violet-500/10",
    },
  ];

  const selectedCorridor = corridorOptions.find((option) => option.id === corridorPreset);
  const selectedGeography = geographyOptions.find((option) => option.id === geographyPreset);

  const postureHeadline =
    triggerSensitivity < 35
      ? "Carrier discipline is favored with tighter trigger admission."
      : triggerSensitivity > 65
        ? "Worker continuity is favored with broader autonomous admissions."
        : "Balanced release discipline across worker and carrier interests.";

  const postureMetrics = [
    {
      label: "Target corridor",
      value: selectedCorridor?.value || "Rs 29 - Rs 250",
    },
    {
      label: "Replacement ratio",
      value: `${replacementRatio}% payout fill`,
    },
    {
      label: "Geo posture",
      value: selectedGeography?.label || "Metro core",
    },
  ];

  return (
    <AdminLayout pageTitle="Riders & Partners">
      <section className="nexus-section-stack">
        <div className="nexus-section-heading">
          <div>
            <div className="nexus-section-eyebrow mb-2">Partner command layer</div>
            <h1 className="nexus-section-title">
              Portfolio analytics, worker visibility, and product controls in one insurer-grade surface.
            </h1>
          </div>
          <p className="nexus-section-copy">
            Operate protection across worker cohorts, platform penetration, and configurable payout posture without leaving the admin stack.
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
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">{card.label}</p>
                  <p className="mt-3 text-3xl font-black tracking-[-0.06em] text-foreground">{card.value}</p>
                  <p className="mt-3 max-w-[20rem] text-sm leading-6 text-muted-foreground">{card.meta}</p>
                </div>
                <div className={`rounded-2xl p-3 ${card.color}`}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="nexus-panel p-5 md:p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="nexus-section-eyebrow mb-2">Partner analytics</div>
              <h2 className="text-2xl font-black tracking-[-0.05em]">Coverage penetration and cohort quality by platform.</h2>
            </div>
            <div className="nexus-chip">
              <TrendingUp size={14} />
              Live operating book
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="nexus-kpi-label">Lead platform</div>
              <div className={`mt-3 text-2xl font-black tracking-[-0.05em] ${platformColor[topPlatform?.platform || ""] || "text-foreground"}`}>
                {topPlatform?.platform || "Blinkit"}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Largest active cohort with {topPlatform?.workers || 0} workers in the protection network.
              </p>
            </div>
            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="nexus-kpi-label">Avg. payout footprint</div>
              <div className="mt-3 text-2xl font-black tracking-[-0.05em] text-primary">
                Rs{" "}
                {Math.round(
                  analyticsView.platforms.reduce((sum, platform) => sum + platform.average_payout, 0) /
                    Math.max(1, analyticsView.platforms.length)
                ).toLocaleString("en-IN")}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Average worker release level across current partner platform cohorts.
              </p>
            </div>
            <div className="nexus-subpanel rounded-2xl p-4">
              <div className="nexus-kpi-label">High-confidence posture</div>
              <div className="mt-3 text-2xl font-black tracking-[-0.05em] text-foreground">
                {analyticsView.platforms.filter((platform) => platform.average_trust_score >= 0.75).length}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Platform cohorts currently positioned for stronger autonomous payout eligibility.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {analyticsView.platforms.map((platform) => (
              <div key={platform.platform} className="nexus-subpanel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`text-lg font-black tracking-[-0.04em] ${platformColor[platform.platform] || "text-foreground"}`}>
                      {platform.platform}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {platform.workers} workers, {platform.active_policies} active plans, {platform.claims} processed claims.
                    </p>
                  </div>
                  <div className="rounded-full border border-border/40 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {(platform.coverage_penetration * 100).toFixed(0)}% covered
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      <span>Coverage penetration</span>
                      <span>{(platform.coverage_penetration * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary/80">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(8, platform.coverage_penetration * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Avg. trust</div>
                      <div className="mt-2 text-xl font-black tracking-[-0.05em]">{platform.average_trust_score.toFixed(2)}</div>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/60 p-3">
                      <div className="nexus-kpi-label">Avg. payout</div>
                      <div className="mt-2 text-xl font-black tracking-[-0.05em]">
                        Rs {platform.average_payout.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="nexus-panel p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="nexus-section-eyebrow mb-2">Product configurability</div>
              <h2 className="text-2xl font-black tracking-[-0.05em]">Tune insurer posture without breaking worker-facing behavior.</h2>
            </div>
            <div className="nexus-chip">
              <Shield size={14} />
              Pilot controls
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <div className="mb-3 nexus-kpi-label">Payout corridor preset</div>
              <div className="flex flex-wrap gap-2">
                {corridorOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCorridorPreset(option.id)}
                    className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition-all ${
                      corridorPreset === option.id
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
              <div className="mb-3 nexus-kpi-label flex items-center justify-between">
                <span>Replacement ratio</span>
                <span className="text-primary font-bold">{replacementRatio}%</span>
              </div>
              <div className="rounded-2xl border border-border/40 bg-background/60 p-5">
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={replacementRatio}
                  onChange={(e) => setReplacementRatio(Number(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-4 font-bold uppercase tracking-wider">
                  <span>Carrier defensive (50%)</span>
                  <span>Worker retention (100%)</span>
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-3 nexus-kpi-label flex items-center justify-between">
                  <span>Trigger sensitivity limit</span>
                  <span className="text-primary font-bold">{triggerSensitivity}%</span>
                </div>
                <div className="rounded-2xl border border-border/40 bg-background/60 p-5 h-[116px] flex flex-col justify-center">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="1"
                    value={triggerSensitivity}
                    onChange={(e) => setTriggerSensitivity(Number(e.target.value))}
                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground mt-4 font-bold uppercase tracking-wider">
                    <span>Tight</span>
                    <span>Standard</span>
                    <span>Expansive</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 nexus-kpi-label">Geography rulebook</div>
                <div className="space-y-2">
                  {geographyOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setGeographyPreset(option.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                        geographyPreset === option.id
                          ? "border-primary/30 bg-primary/10 text-foreground"
                          : "border-border/40 bg-background/60 text-muted-foreground"
                      }`}
                    >
                      <span>{option.label}</span>
                      <MapPin size={16} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="nexus-subpanel rounded-3xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="nexus-kpi-label">Applied operating posture</div>
                  <h3 className="mt-3 text-2xl font-black tracking-[-0.05em]">Balanced enterprise controls with worker-safe release paths.</h3>
                </div>
                <div className="rounded-full border border-primary/25 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  Preview only
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-muted-foreground">{postureHeadline}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {postureMetrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-border/30 bg-background/60 p-4">
                    <div className="nexus-kpi-label">{metric.label}</div>
                    <div className="mt-2 text-base font-black tracking-[-0.04em]">{metric.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-border/30 bg-background/60 p-4">
                <div className="nexus-kpi-label">Pilot narrative</div>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {selectedCorridor?.label || "Balanced corridor"} and {replacementRatio}% replacement are paired with{" "}
                  {triggerSensitivity < 35 ? "tightened" : triggerSensitivity > 65 ? "expansive" : "standard"} admissions for {selectedGeography?.label.toLowerCase() || "metro core"} exposures.
                  This keeps public worker flows unchanged while giving insurer-side teams a configurable operating book for pilots and partner launches.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, zone, platform..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-border/50 bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-secondary/50 p-1.5">
          {["all", "active", "idle", "offline", "blocked"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                statusFilter === status
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="nexus-table-shell">
        <div className="nexus-table-toolbar">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Users size={20} className="text-primary" /> Rider registry
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {filteredRiders.length} of {riders.length} riders visible in the current filter set.
            </p>
          </div>
          {!loading && (
            <div className="rounded-full border border-border/40 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {topPlatform?.platform || "Blinkit"} leads the book
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="nexus-data-table">
            <thead>
              <tr className="border-b border-border/50">
                <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rider</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Platform</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Zone</th>
                <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plan</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Claims</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Paid</th>
                <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rating</th>
                <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Risk</th>
              </tr>
            </thead>
            <tbody>
              {filteredRiders.map((rider) => (
                <tr
                  key={rider.id}
                  className="cursor-pointer border-b border-border/30 transition-colors hover:bg-secondary/30"
                >
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-bold text-foreground">{rider.name}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{rider.id} | {rider.joined}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold ${platformColor[rider.platform] || "text-foreground"}`}>
                      {rider.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                      <MapPin size={12} /> {rider.zone}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadge[rider.status]}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          rider.status === "active"
                            ? "bg-emerald-500 animate-pulse"
                            : rider.status === "idle"
                              ? "bg-amber-500"
                              : rider.status === "blocked"
                                ? "bg-red-500"
                                : "bg-zinc-500"
                        }`}
                      />
                      {rider.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                        rider.plan === "Premium"
                          ? "bg-violet-500/10 text-violet-600"
                          : "bg-zinc-500/10 text-zinc-500"
                      }`}
                    >
                      {rider.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-foreground">{rider.claims}</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-primary">
                    Rs {rider.total_paid.toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="flex items-center justify-center gap-1 text-sm font-bold text-foreground">
                      <Star size={12} className="fill-amber-400 text-amber-400" /> {rider.rating}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${riskBadge[rider.risk]}`}>
                      {rider.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
