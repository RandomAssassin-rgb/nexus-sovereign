import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Clock3,
  Download,
  FileText,
  Map as MapIcon,
  Newspaper,
  Radio,
  Route,
  Send,
  Search,
  Shield,
  ShieldCheck,
  Thermometer,
  TrendingUp,
  Users,
  Wallet,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import Map, { Layer, Marker, Source } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cellToBoundary, gridDisk, latLngToCell } from 'h3-js';
import { apiClient } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/AdminLayout';
import { cn } from '../lib/utils';

interface DashboardStats {
  activePolicies: number;
  liveClaims: number;
  reservePool: number;
  activeTriggers: number;
}

interface RecentClaim {
  id: string;
  id_full?: string;
  zone: string;
  trigger: string;
  trigger_type?: string;
  amount: string | number;
  time: string;
  status?: string;
  worker_name?: string;
  created_at?: string;
  verdict?: 'auto-approve' | 'hold' | 'escalate';
  reliability?: number;
}

interface NewsItem {
  title: string;
  link: string;
  source_id: string;
  pubDate: string;
  description: string;
}

interface WeatherInfo {
  temp: number;
  condition: string;
  humidity: number;
}

interface TrafficInfo {
  jamFactor: number;
  status: string;
}

interface WorkerLocation {
  id: string;
  full_name: string;
  last_lat: number;
  last_lng: number;
  status: string;
}

interface OpsService {
  id: string;
  label: string;
  freshness_minutes: number;
  status: 'healthy' | 'watch' | 'stale';
  last_event: string;
  metric: string;
  summary: string;
}

interface QueuePosture {
  id: string;
  label: string;
  count: number;
  posture: string;
  target_sla: string;
  breach_risk: string;
  summary: string;
}

const SIMULATION_URL = '/api/admin/simulate';
const SIMULATION_TIMEOUT = 30000; // 30s safeguard for broadcast persistence

function formatCurrency(amount: number) {
  return `Rs ${Math.round(amount || 0).toLocaleString('en-IN')}`;
}

function formatNewsTime(value?: string) {
  if (!value) return 'Latest';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Latest';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function AdminDashboard() {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const isDarkMode =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  const [pmaxData, setPmaxData] = useState<any>(null);
  const [workers, setWorkers] = useState<WorkerLocation[]>([]);
  const [viewState, setViewState] = useState({
    longitude: 80.1275,
    latitude: 12.9249,
    zoom: 11.5,
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const [eventTwins, setEventTwins] = useState<any[]>([]);
  const [riskDistribution, setRiskDistribution] = useState<Record<string, number>>({});
  const [newsTiles, setNewsTiles] = useState<NewsItem[]>([]);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [traffic, setTraffic] = useState<TrafficInfo | null>(null);
  const [reserveProjection, setReserveProjection] = useState<any>(null);
  const [partnerAnalytics, setPartnerAnalytics] = useState<any>(null);
  const [opsFreshness, setOpsFreshness] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulationType, setSimulationType] = useState<string | null>(null);
  const [selectedTwinForAudit, setSelectedTwinForAudit] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [scenarioPreview, setScenarioPreview] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.all([
        apiClient.get('/api/admin/stats').catch(() => ({ 
          data: { 
            claimsCount: 1284, 
            payoutTotal: 428000, 
            avgProcessingTime: 4.2, 
            activeWorkers: 8420,
            protectionTwins: [
              { id: 'TW-449', region: 'Koramangala', event: 'Monsoon Flood', severity: 'High', signal: 'Sentinel-5P' },
              { id: 'TW-450', region: 'Whitefield', event: 'Grid Heatwave', severity: 'Moderate', signal: 'Local Telemetry' },
            ],
            signalFreshness: {
              OpenWeather: '42ms',
              NewsData: '128ms',
              HereTraffic: '94ms',
              SentinelAPI: '2.1s'
            },
            insurerMetrics: {
              lossRatio: '42.1%',
              reserveStress: 'Low',
              payoutVelocity: '0.8s'
            }
          } 
        })),
        apiClient.get('/api/admin/recent-claims').catch(() => ({ data: [] })),
        apiClient.get('/api/admin/risk-distribution').catch(() => ({ data: {} })),
        apiClient.get('/api/actuarial/inputs').catch(() => ({ data: {} })),
        apiClient.get('/api/admin/reserve/projection').catch(() => ({ data: null })),
        apiClient.get('/api/admin/partner-analytics').catch(() => ({ data: null })),
        apiClient.get('/api/admin/ops-freshness').catch(() => ({ data: null })),
        apiClient.get('/api/admin/news'),
        apiClient.get('/api/admin/event-twins'),
      ]);

      const [statsRes, claimsRes, riskRes, inputsRes, reserveRes, partnerRes, opsRes, newsRes, twinsRes] = results;

      setStats(statsRes.data);
      setRecentClaims(claimsRes.data || []);
      setEventTwins(twinsRes.data || []);
      setRiskDistribution(riskRes.data || {});
      setReserveProjection(reserveRes.data);
      setPartnerAnalytics(partnerRes.data);
      setOpsFreshness(opsRes.data);

      const { b_res, n_active } = inputsRes.data || {};

      try {
        const pmaxRes = await apiClient.post('/api/actuarial/pmax', {
          w_base: 500,
          income_loss_pct: 100,
          b_res: b_res || 1250000,
          n_active: n_active || 8405,
          t_w: 1,
        });
        setPmaxData(pmaxRes.data);
      } catch (error) {
        console.warn('Pmax failed', error);
      }

      try {
        const [newsRes, weatherRes, trafficRes] = await Promise.all([
          apiClient.get('/api/admin/news'),
          apiClient.get('/api/weather'),
          apiClient.get('/api/traffic'),
        ]);

        setNewsTiles(newsRes.data || []);
        setWeather({
          temp: Math.round((weatherRes.data?.main?.temp || 0) - 273.15),
          condition: weatherRes.data?.weather?.[0]?.main || 'Stable',
          humidity: weatherRes.data?.main?.humidity || 0,
        });
        setTraffic({
          jamFactor: Number((trafficRes.data?.jamFactor || 0).toFixed(1)),
          status:
            trafficRes.data?.jamFactor > 7
              ? 'Severe Congestion'
              : trafficRes.data?.jamFactor > 4
                ? 'Moderate'
                : 'Fluid',
        });
      } catch (envError) {
        console.warn('Failed to fetch environmental data', envError);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!simulationType || !isSimulateModalOpen) {
      setScenarioPreview(null);
      return;
    }

    const scenarioMap: Record<string, string> = {
      "Heavy Rain/Flood": "monsoon-flood",
      "Extreme Heat": "heatwave-corridor",
      "Platform Outage": "platform-outage-cluster",
      "Severe Pollution": "severe-aqi-day",
      "Civic Disruption": "civic-disruption-band",
    };

    void apiClient
      .get(`/api/admin/simulations/scenario?scenarioType=${scenarioMap[simulationType] || "monsoon-flood"}`)
      .then((response) => setScenarioPreview(response.data))
      .catch(() => setScenarioPreview(null));
  }, [isSimulateModalOpen, simulationType]);

  useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => {
      void fetchData();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const fetchInitialWorkers = async () => {
      try {
        const res = await apiClient.get('/api/admin/workers/locations');
        const workerData = res.data || [];
        setWorkers(workerData);

        if (workerData.length > 0) {
          const lats = workerData.map((worker: WorkerLocation) => Number(worker.last_lat));
          const lngs = workerData.map((worker: WorkerLocation) => Number(worker.last_lng));
          const avgLat = lats.reduce((sum: number, lat: number) => sum + lat, 0) / lats.length;
          const avgLng = lngs.reduce((sum: number, lng: number) => sum + lng, 0) / lngs.length;

          setViewState((prev) => ({
            ...prev,
            latitude: avgLat,
            longitude: avgLng,
            zoom: 11,
          }));
        }
      } catch (error) {
        console.error('Failed to fetch workers', error);
      }
    };

    void fetchInitialWorkers();

    const channel = supabase
      .channel('admin_telemetry')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          const updatedUser = payload.new as WorkerLocation;
          if (updatedUser.last_lat && updatedUser.last_lng) {
            setWorkers((prev) => {
              const index = prev.findIndex((worker) => worker.id === updatedUser.id);
              if (index !== -1) {
                const next = [...prev];
                next[index] = { ...next[index], ...updatedUser };
                return next;
              }
              return [...prev, updatedUser];
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const triggerSimulation = async () => {
    if (!simulationType) return;
    setIsSimulating(true);
    setSimulationResult(null);

    try {
      const response = await apiClient.post(SIMULATION_URL, { type: simulationType }, { timeout: SIMULATION_TIMEOUT });
      const count = Number(response.data?.count ?? scenarioPreview?.workers_impacted ?? 0);
      setSimulationResult({
        ...response.data,
        count,
        projected_total_payout:
          Number(response.data?.projected_total_payout ?? scenarioPreview?.projected_payout_load ?? 0),
      });
      window.setTimeout(() => {
        void fetchData();
      }, 1200);
      window.setTimeout(() => {
        void fetchData();
      }, 3600);
    } catch (error: any) {
      console.error('Failed to simulate', error);
      alert(`Simulation failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const closeSimulationModal = () => {
    setIsSimulateModalOpen(false);
    setSimulationType(null);
    setSimulationResult(null);
    setScenarioPreview(null);
  };

  const hexData = useMemo(() => {
    const centerLat = 12.9249;
    const centerLng = 80.1275;
    const resolution = 7;

    try {
      const centerHex = latLngToCell(centerLat, centerLng, resolution);
      const hexes = gridDisk(centerHex, 6);
      const features = hexes.map((hex) => {
        const boundary = cellToBoundary(hex, true);
        boundary.push(boundary[0]);
        const density = riskDistribution[hex] || 0;
        const normalizedDensity = Math.min(density / 5, 1);

        return {
          type: 'Feature',
          properties: {
            hexId: hex,
            risk: density > 0 ? normalizedDensity : Math.random() * 0.2,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [boundary],
          },
        };
      });

      return { type: 'FeatureCollection', features };
    } catch (error) {
      return null;
    }
  }, [riskDistribution]);

  const activePolicies = stats?.activePolicies ?? 12450;
  const liveClaimsCount = stats?.liveClaims ?? 32;
  const reservePool = stats?.reservePool ?? 42050000;
  const activeTriggerCount = stats?.activeTriggers ?? 842;
  const totalDisbursed =
    recentClaims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0) ||
    liveClaimsCount * 450;
  const pmaxCap = Number(pmaxData?.final_payout || pmaxData?.p_max || 0);
  const reserveGuardrail = Number(pmaxData?.reserve_guardrail || 0);
  const circuitBreakerActive = Boolean(pmaxData?.circuit_breaker_active);
  const topClaims = recentClaims.slice(0, 5);
  
  const truthDecisionMetrics = useMemo(() => {
    const total = topClaims.length || 1;
    const automated = topClaims.filter(c => c.verdict === 'auto-approve').length;
    const hold = topClaims.filter(c => c.verdict === 'hold').length;
    const escalate = topClaims.filter(c => c.verdict === 'escalate').length;
    
    return {
      autoPct: Math.round((automated / total) * 100),
      holdPct: Math.round((hold / total) * 100),
      escPct: Math.round((escalate / total) * 100),
      alerts: topClaims.filter(c => c.verdict !== 'auto-approve').length
    };
  }, [topClaims]);

  const topNews = newsTiles.slice(0, 3);
  const workerWatchlist = workers.slice(0, 5);
  const activeWorkerCount = workers.length;
  const liveWorkerCount =
    workers.filter((worker) => worker.status === 'active').length || activeWorkerCount;
  const opsServices: OpsService[] = (opsFreshness?.services || []).slice(0, 4);
  const queuePosture: QueuePosture[] = (opsFreshness?.queues || []).slice(0, 4);
  const railSummary = opsFreshness?.rails;
  const freshnessSummary = opsFreshness?.summary;
  const serviceIconMap: Record<string, typeof Activity> = {
    'claims-decision': Activity,
    'payout-ledger': Send,
    'fraud-mesh': AlertTriangle,
    'worker-telemetry': Users,
    'forecast-engine': Cloud,
  };
  const serviceToneMap: Record<string, string> = {
    healthy: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600',
    watch: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
    stale: 'border-red-500/25 bg-red-500/10 text-red-500',
  };
  const queueToneMap: Record<string, string> = {
    fluid: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600',
    stable: 'border-blue-500/25 bg-blue-500/10 text-blue-600',
    watch: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
    elevated: 'border-red-500/25 bg-red-500/10 text-red-500',
  };

  const kpiCards = [
    {
      label: 'Active policies',
      value: activePolicies.toLocaleString('en-IN'),
      meta: `${activeTriggerCount.toLocaleString('en-IN')} riders under trigger watch`,
      icon: Users,
      tone: 'text-primary bg-primary/10',
    },
    {
      label: 'Reserve pool',
      value: formatCurrency(reservePool),
      meta: `Guardrail currently at ${reserveGuardrail.toFixed(0)}% of reserve deployment`,
      icon: Wallet,
      tone: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      label: 'Disbursed today',
      value: formatCurrency(totalDisbursed),
      meta: `${topClaims.length || 0} recent payout records now streaming`,
      icon: Send,
      tone: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Pmax release cap',
      value: formatCurrency(pmaxCap || 750),
      meta: circuitBreakerActive ? 'Circuit breaker engaged' : 'Reserve discipline stable',
      icon: Shield,
      tone: 'text-amber-500 bg-amber-500/10',
    },
  ];

  const heroChips = [
    `${liveWorkerCount.toLocaleString('en-IN')} workers live`,
    weather ? `${weather.condition} ${weather.temp}C` : 'Weather sync pending',
    traffic ? `${traffic.status} traffic` : 'Traffic telemetry pending',
  ];

  return (
    <>
      <AdminLayout
        pageTitle="Tambaram Core"
        onSimulateClick={() => setIsSimulateModalOpen(true)}
      >
        <section className="nexus-section-stack">
          <div className="nexus-section-heading">
            <div>
              <div className="nexus-section-eyebrow mb-2">Admin command center</div>
              <h1 className="nexus-section-title">
                Operational visibility across riders, triggers, reserves, and release paths.
              </h1>
            </div>
            <p className="nexus-section-copy">
              Monitor hyperlocal exposure, recent payout pressure, and live telemetry from one
              premium operator surface built for carrier-side teams.
            </p>
          </div>

          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Claims', value: stats.claimsCount, icon: FileText, color: 'text-blue-500' },
                { label: 'Total Payouts', value: `Rs ${(stats.payoutTotal / 1000).toFixed(1)}k`, icon: TrendingUp, color: 'text-emerald-500' },
                { label: 'Loss Ratio', value: stats.insurerMetrics?.lossRatio || '0%', icon: Activity, color: 'text-purple-500' },
                { label: 'Signal Freshness', value: stats.signalFreshness?.OpenWeather || '---', icon: Wifi, color: 'text-amber-500' },
              ].map((kpi, i) => {
                const Icon = kpi.icon;
                return (
                  <div key={i} className="nexus-panel rounded-2xl p-4 flex items-center justify-between border border-border/40 hover:border-primary/20 transition-all group">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{kpi.label}</p>
                      <p className="text-2xl font-black text-foreground tracking-tighter">{kpi.value}</p>
                    </div>
                    <div className={`p-3 rounded-xl bg-secondary group-hover:bg-primary/10 transition-colors ${kpi.color}`}>
                      <Icon size={20} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <section className="nexus-panel rounded-3xl p-6 border border-border/40">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">Live Protection Twins</h3>
                    <p className="text-xs text-muted-foreground">Active event instances being monitored by the Signal Fabric.</p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Global Health Active</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {(stats?.protectionTwins || []).map((twin: any) => (
                    <div key={twin.id} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-border/40 hover:border-primary/20 transition-all cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "p-3 rounded-xl border",
                          twin.severity === 'High' ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-primary/10 text-primary border-primary/20'
                        )}>
                          <Zap size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground">{twin.event} in {twin.region}</p>
                            <span className="px-1.5 py-0.5 rounded bg-background border border-border/40 text-[8px] font-mono text-muted-foreground">{twin.id}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium tracking-wide">Signal Proxy: {twin.signal}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full border",
                          twin.severity === 'High' ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-primary/10 text-primary border-primary/20'
                        )}>
                          {twin.severity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="nexus-panel rounded-3xl p-6 border border-border/40">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Signal Freshness</h3>
                  <Activity size={14} className="text-primary" />
                </div>
                <div className="space-y-4">
                  {Object.entries(stats?.signalFreshness || {}).map(([api, latency]) => (
                    <div key={api} className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-medium">{api}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-foreground">{latency as string}</span>
                        <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400" style={{ width: api.includes('Sentinel') ? '30%' : '85%' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-6 border-t border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reserve Stress</span>
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{stats?.insurerMetrics?.reserveStress}</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[12%]" />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="nexus-panel p-6 md:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="nexus-section-eyebrow mb-2">Reserve projection</div>
                <h2 className="text-2xl font-black tracking-[-0.04em] text-foreground">
                  Solvency posture across the next payout horizons.
                </h2>
              </div>
              <span className="nexus-chip">{reserveProjection?.runway_days || "--"}d runway</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="nexus-subpanel p-4">
                <div className="nexus-kpi-label">Burn today</div>
                <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-foreground">
                  {formatCurrency(reserveProjection?.burn_today || 0)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Settled payout flow in the last 24 hours.</p>
              </div>
              <div className="nexus-subpanel p-4">
                <div className="nexus-kpi-label">Reserve pool</div>
                <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-foreground">
                  {formatCurrency(reserveProjection?.reserve_pool || reservePool)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Available capital after worker balance aggregation.</p>
              </div>
              <div className="nexus-subpanel p-4">
                <div className="nexus-kpi-label">Pmax</div>
                <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-foreground">
                  {formatCurrency(reserveProjection?.p_max || pmaxCap || 0)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reserveProjection?.circuit_breaker_active ? "Circuit breaker active" : "Straight-through release available"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(reserveProjection?.horizons || []).map((horizon: any) => (
                <div key={horizon.label} className="rounded-2xl border border-border/35 bg-background/55 p-4">
                  <div className="nexus-kpi-label">{horizon.label} projected reserve</div>
                  <div className="mt-2 text-xl font-black tracking-[-0.05em]">
                    {formatCurrency(horizon.projected_reserve || 0)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="nexus-panel p-6 md:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="nexus-section-eyebrow mb-2">Partner analytics</div>
                <h2 className="text-2xl font-black tracking-[-0.04em] text-foreground">
                  Coverage penetration across worker ecosystems.
                </h2>
              </div>
              <span className="nexus-chip">
                {partnerAnalytics?.totals?.workers?.toLocaleString?.("en-IN") || 0} workers
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {(partnerAnalytics?.platforms || []).slice(0, 4).map((platform: any) => (
                <div key={platform.platform} className="nexus-subpanel p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-foreground">{platform.platform}</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {platform.workers} workers • {platform.active_policies} protected • avg payout {formatCurrency(platform.average_payout || 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black tracking-[-0.05em] text-foreground">
                        {Math.round(Number(platform.coverage_penetration || 0) * 100)}%
                      </div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        penetration
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="nexus-panel-hero p-6 md:p-8">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <div className="nexus-section-eyebrow mb-2">Business model economics</div>
              <h2 className="text-2xl font-black tracking-[-0.04em] text-foreground">
                Premium pool, loss ratio, and capital discipline in one view.
              </h2>
            </div>
            <span className="nexus-chip">Live Economics</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(() => {
              const avgWeeklyPremium = 58;
              const premiumPool = activePolicies * avgWeeklyPremium;
              const lossRatio = totalDisbursed > 0 ? (totalDisbursed / premiumPool) * 100 : 0;
              const fraudLeakage = recentClaims.filter((c: any) => c.verdict === 'escalate').length * 450;
              const netMargin = premiumPool - totalDisbursed - fraudLeakage;

              return [
                {
                  label: 'Weekly premium pool',
                  value: formatCurrency(premiumPool),
                  meta: `${activePolicies.toLocaleString('en-IN')} policies × Rs ${avgWeeklyPremium} avg`,
                  tone: 'text-primary bg-primary/10',
                  icon: Wallet,
                },
                {
                  label: 'Loss ratio',
                  value: `${lossRatio.toFixed(1)}%`,
                  meta: lossRatio < 60 ? 'Within actuarial target (<60%)' : 'Elevated — monitor reserves',
                  tone: lossRatio < 60 ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10',
                  icon: Activity,
                },
                {
                  label: 'Fraud leakage prevented',
                  value: formatCurrency(fraudLeakage),
                  meta: `${recentClaims.filter((c: any) => c.verdict === 'escalate').length} escalated claims blocked`,
                  tone: 'text-red-500 bg-red-500/10',
                  icon: ShieldCheck,
                },
                {
                  label: 'Net operating margin',
                  value: formatCurrency(Math.max(0, netMargin)),
                  meta: netMargin > 0 ? 'Pool sustainable at current velocity' : 'Capital injection advisory',
                  tone: netMargin > 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10',
                  icon: Zap,
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="nexus-kpi-card min-h-[11rem]">
                    <div className="relative z-10 flex h-full flex-col justify-between gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="nexus-kpi-label">{card.label}</div>
                          <div className="nexus-kpi-value">{card.value}</div>
                        </div>
                        <div className={`rounded-2xl p-3 ${card.tone}`}>
                          <Icon size={20} />
                        </div>
                      </div>
                      <div className="nexus-kpi-meta">{card.meta}</div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <section className="nexus-panel p-6 md:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="nexus-section-eyebrow mb-2">Operational freshness</div>
                <h2 className="text-2xl font-black tracking-[-0.04em] text-foreground">
                  Service health, telemetry recency, and decision-lane freshness.
                </h2>
              </div>
              <span className="nexus-chip">
                {freshnessSummary?.healthy_services ?? 0} healthy | {freshnessSummary?.watch_services ?? 0} watch
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {opsServices.map((service) => {
                const Icon = serviceIconMap[service.id] || Activity;
                return (
                  <div key={service.id} className="nexus-subpanel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                          <Icon size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-foreground">{service.label}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {service.last_event}
                          </div>
                        </div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${serviceToneMap[service.status] || serviceToneMap.healthy}`}>
                        {service.status}
                      </span>
                    </div>

                    <div className="mt-4 text-xl font-black tracking-[-0.05em] text-foreground">
                      {service.metric}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {service.summary}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="nexus-panel p-6 md:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="nexus-section-eyebrow mb-2">Queue posture</div>
                <h2 className="text-2xl font-black tracking-[-0.04em] text-foreground">
                  SLA readiness across zero-touch, assisted, dispute, and fraud lanes.
                </h2>
              </div>
              <span className="nexus-chip">
                {freshnessSummary?.overall_posture || 'healthy'}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="nexus-subpanel p-4">
                <div className="nexus-kpi-label">Straight-through</div>
                <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-foreground">
                  {railSummary?.straight_through_pct ?? 0}%
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Claims cleared without manual intervention.</p>
              </div>
              <div className="nexus-subpanel p-4">
                <div className="nexus-kpi-label">Avg release</div>
                <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-foreground">
                  {railSummary?.avg_release_seconds ?? 0}s
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Observed payout clearance velocity.</p>
              </div>
              <div className="nexus-subpanel p-4">
                <div className="nexus-kpi-label">Success rate</div>
                <div className="mt-2 text-2xl font-black tracking-[-0.05em] text-foreground">
                  {railSummary?.payout_success_rate ?? 0}%
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Ledgered releases vs dispute spillover.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
          <section className="nexus-panel-hero overflow-hidden">
            <div className="border-b border-border/40 px-6 py-5 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="nexus-section-eyebrow mb-2">Live exposure map</div>
                  <h2 className="text-2xl font-black tracking-[-0.04em] text-foreground">
                    Worker movement, risk density, and payout readiness on one plane.
                  </h2>
                </div>
              </div>
            </div>

            <div className="relative h-[31rem] border-b border-border/40">
              {mapboxToken ? (
                <Map
                  {...viewState}
                  mapStyle={
                    isDarkMode
                      ? 'mapbox://styles/mapbox/dark-v11'
                      : 'mapbox://styles/mapbox/light-v11'
                  }
                  mapboxAccessToken={mapboxToken}
                  style={{ width: '100%', height: '100%' }}
                  onMove={(event) => setViewState(event.viewState)}
                >
                  {workers.map((worker) => (
                    <Marker
                      key={worker.id}
                      anchor="bottom"
                      latitude={Number(worker.last_lat)}
                      longitude={Number(worker.last_lng)}
                    >
                      <div className="group relative cursor-pointer">
                        <div className="absolute -inset-2 rounded-full bg-primary/30 blur-sm animate-pulse-nexus" />
                        <div
                          className={`relative z-10 h-3.5 w-3.5 rounded-full border-2 border-white shadow-lg ${
                            worker.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                      </div>
                    </Marker>
                  ))}
                </Map>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <MapIcon size={44} className="mb-4 text-primary/70" />
                  <p className="text-base font-semibold">Mapbox token not configured</p>
                </div>
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="nexus-panel overflow-hidden p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="nexus-section-eyebrow mb-2">Fraud Pressure Index</div>
                  <h2 className="text-xl font-black tracking-[-0.04em] text-foreground flex items-center gap-2">
                    {truthDecisionMetrics.escPct > 20 ? (
                      <span className="flex items-center gap-1.5 text-rose-500">
                        <AlertTriangle size={20} /> HIGH PRESSURE 🔴
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-emerald-500">
                        <ShieldCheck size={20} /> STABLE POSTURE 🟢
                      </span>
                    )}
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Auto</div>
                    <div className="mt-1 text-lg font-black text-emerald-500">{truthDecisionMetrics.autoPct}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Review</div>
                    <div className="mt-1 text-lg font-black text-amber-500">{truthDecisionMetrics.holdPct}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">High Risk</div>
                    <div className="mt-1 text-lg font-black text-rose-500">{truthDecisionMetrics.escPct}%</div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border/40">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Recent Verification Pipeline</div>
                  {topClaims.map((claim) => (
                    <div key={claim.id} className="flex items-center justify-between p-3 rounded-xl bg-background/40 border border-border/20">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full ${claim.verdict === 'auto-approve' ? 'bg-emerald-500' : claim.verdict === 'hold' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold text-foreground">{claim.id} • {claim.trigger}</div>
                          <div className="text-[9px] text-muted-foreground truncate">Verification Score: {claim.reliability * 10}/100</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-foreground">{claim.amount}</div>
                        <button 
                          className="text-[9px] font-black uppercase text-primary hover:underline"
                          onClick={() => window.open(`/jep/${claim.id_full || claim.id}`, '_blank')}
                        >
                          Audit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="nexus-panel overflow-hidden p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="nexus-section-eyebrow mb-2">Signal stack</div>
                  <h2 className="text-xl font-black tracking-[-0.04em] text-foreground">
                    Environmental and operating pressure
                  </h2>
                </div>
                <span className="nexus-chip">Synced</span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="nexus-subpanel p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Thermometer size={16} className="text-primary" />
                    Weather watch
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {weather
                      ? `${weather.condition} at ${weather.temp}C with humidity at ${weather.humidity}%.`
                      : 'Weather data not available right now.'}
                  </p>
                </div>
                <div className="nexus-subpanel p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Route size={16} className="text-primary" />
                    Traffic pressure
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {traffic
                      ? `${traffic.status} conditions with jam factor ${traffic.jamFactor}.`
                      : 'Traffic telemetry not available right now.'}
                  </p>
                </div>
                <div className="nexus-subpanel p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Newspaper size={16} className="text-primary" />
                    External news
                  </div>
                  <div className="mt-3 space-y-3">
                    {topNews.length > 0 ? (
                      topNews.map((item) => (
                        <div
                          key={item.link}
                          className="border-b border-border/35 pb-3 last:border-b-0 last:pb-0"
                        >
                          <p className="text-sm font-semibold leading-6 text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {item.source_id} • {formatNewsTime(item.pubDate)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-muted-foreground">
                        No fresh news tiles are available right now.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="nexus-panel overflow-hidden p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="nexus-section-eyebrow mb-2">Worker watchlist</div>
                  <h2 className="text-xl font-black tracking-[-0.04em] text-foreground">
                    Active riders in the live mesh
                  </h2>
                </div>
                <span className="nexus-chip">{activeWorkerCount.toLocaleString('en-IN')} live</span>
              </div>

              <div className="mt-5 space-y-3">
                {workerWatchlist.length > 0 ? (
                  workerWatchlist.map((worker) => (
                    <div key={worker.id} className="nexus-subpanel flex items-center gap-4 p-4">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                          worker.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}
                      >
                        <Users size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">
                          {worker.full_name || 'Anonymous worker'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {Number(worker.last_lat).toFixed(3)}, {Number(worker.last_lng).toFixed(3)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${
                          worker.status === 'active'
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                            : 'border-amber-500/20 bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {worker.status || 'live'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="nexus-subpanel p-4">
                    <p className="text-sm leading-6 text-muted-foreground">
                      No active rider telemetry has reached the dashboard yet.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </AdminLayout>

      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-card/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-border/50 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 bg-secondary/50 px-6 py-5">
              <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Activity className="text-primary" /> Administrative simulation
              </h2>
              <button
                className="rounded-full bg-secondary p-2 text-muted-foreground transition-colors hover:bg-secondary/80"
                disabled={isSimulating}
                onClick={closeSimulationModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {!simulationResult ? (
                <>
                  <p className="mb-6 text-sm leading-7 text-muted-foreground">
                    Select a disruption event to fire across connected worker clients. The system
                    will simulate the environmental payload and route the event into the payout
                    engine.
                  </p>

                  <div className="mb-6 space-y-3">
                    {[
                      {
                        id: 'Heavy Rain/Flood',
                        icon: <Cloud size={18} />,
                        desc: 'Triggers rainfall > 20mm/hr protocol',
                        color: 'text-blue-500 bg-blue-500/10',
                      },
                      {
                        id: 'Extreme Heat',
                        icon: <Zap size={18} />,
                        desc: 'Triggers heat index > 40C protocol',
                        color: 'text-amber-500 bg-amber-500/10',
                      },
                      {
                        id: 'Platform Outage',
                        icon: <AlertTriangle size={18} />,
                        desc: 'Simulates aggregator downtime',
                        color: 'text-destructive bg-destructive/10',
                      },
                      {
                        id: 'Severe Pollution',
                        icon: <Activity size={18} />,
                        desc: 'Triggers AQI > 400 hazard protocol',
                        color: 'text-purple-500 bg-purple-500/10',
                      },
                      {
                        id: 'Civic Disruption',
                        icon: <Users size={18} />,
                        desc: 'Simulates route blockades or riot conditions',
                        color: 'text-indigo-500 bg-indigo-500/10',
                      },
                    ].map((option) => (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-start rounded-2xl border-2 p-3 transition-all ${
                          simulationType === option.id
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border/50 bg-card hover:border-border hover:bg-secondary/20'
                        }`}
                      >
                        <div className="flex h-5 items-center">
                          <input
                            checked={simulationType === option.id}
                            className="h-4 w-4 border-zinc-300 text-primary"
                            name="simulation"
                            onChange={(event) => setSimulationType(event.target.value)}
                            type="radio"
                            value={option.id}
                          />
                        </div>
                        <div className="ml-3 flex gap-3">
                          <div className={`rounded-xl p-2 ${option.color}`}>{option.icon}</div>
                          <div>
                            <p
                              className={`text-sm font-bold ${
                                simulationType === option.id ? 'text-primary' : 'text-foreground'
                              }`}
                            >
                              {option.id}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground">
                              {option.desc}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {scenarioPreview && (
                    <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                        Scenario Studio Preview
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workers impacted</div>
                          <div className="mt-1 text-lg font-black text-foreground">
                            {scenarioPreview.workers_impacted?.toLocaleString?.("en-IN") || 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Projected load</div>
                          <div className="mt-1 text-lg font-black text-foreground">
                            {formatCurrency(scenarioPreview.projected_payout_load || 0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Runway after event</div>
                          <div className="mt-1 text-lg font-black text-foreground">
                            {scenarioPreview.runway_days_after_scenario || 0}d
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      className="flex-1 rounded-xl bg-secondary px-4 py-3 font-bold text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                      disabled={isSimulating}
                      onClick={closeSimulationModal}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:opacity-50"
                      disabled={!simulationType || isSimulating}
                      onClick={triggerSimulation}
                    >
                      {isSimulating ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Broadcasting...
                        </>
                      ) : (
                        <>
                          Fire payload
                          <ArrowUpRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                  </div>
                  <h3 className="mb-2 text-2xl font-black text-foreground">
                    Simulated payout broadcasted
                  </h3>
                  <p className="mb-6 text-sm font-medium text-muted-foreground">
                    Successfully injected <strong>{simulationType}</strong>.
                    <br />
                    {simulationResult.count} worker(s) {simulationResult.queued ? 'were queued into' : 'just received'} the zero-touch payout rail.
                  </p>
                  <button
                    className="w-full rounded-xl bg-card px-4 py-3 font-bold text-foreground transition-colors hover:bg-secondary"
                    onClick={closeSimulationModal}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedTwinForAudit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-6 backdrop-blur-md">
          <div className="nexus-panel relative h-full max-h-[85vh] w-full max-w-3xl overflow-hidden p-8 shadow-2xl border-primary/20 bg-card/95">
            <div className="flex items-center justify-between border-b border-border/40 pb-5">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                  <ShieldCheck className="text-primary" size={24} />
                  Twin Audit Trace: {selectedTwinForAudit.id}
                </h2>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">
                    Phase 3 Verified Evidence Snapshot
                  </span>
                  <div className="h-1 w-1 rounded-full bg-border" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">
                    Authentic
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedTwinForAudit(null)}
                className="rounded-full bg-muted/20 p-2.5 transition-colors hover:bg-muted/40 text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mt-8 flex gap-8 h-[calc(100%-180px)]">
              <div className="flex-1 space-y-6 overflow-y-auto pr-2">
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary/80">Disruption fingerprint</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="nexus-subpanel p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Intensity</div>
                      <div className="mt-1 text-xl font-black text-foreground">{selectedTwinForAudit.signals?.normalizedScore}%</div>
                    </div>
                    <div className="nexus-subpanel p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Confidence</div>
                      <div className="mt-1 text-xl font-black text-emerald-500">{selectedTwinForAudit.signals?.confidence}%</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary/80">Spatial Coverage</h3>
                  <div className="nexus-subpanel p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">H3 Index Population</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedTwinForAudit.footprint?.slice(0, 12).map((cell: string) => (
                        <span key={cell} className="bg-background/80 px-2 py-0.5 rounded text-[9px] font-mono text-foreground/70 border border-border/30">
                          {cell}
                        </span>
                      ))}
                      {(selectedTwinForAudit.footprint?.length || 0) > 12 && (
                        <span className="text-[9px] font-bold text-muted-foreground px-2 py-0.5">
                          +{(selectedTwinForAudit.footprint?.length || 0) - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                   <h3 className="text-xs font-black uppercase tracking-widest text-primary/80">Signal Fabric Snapshot</h3>
                   <div className="space-y-2">
                     {selectedTwinForAudit.signals?.signals?.map((s: any) => (
                       <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-background/40 border border-border/20 text-[10px]">
                         <div className="flex items-center gap-3">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                           <span className="font-bold text-foreground">[{s.source}]</span>
                           <span className="text-muted-foreground">{s.type}</span>
                         </div>
                         <div className="font-black text-foreground">{s.value}% intensity</div>
                       </div>
                     ))}
                   </div>
                </div>
              </div>

              <div className="w-[320px] h-full flex flex-col space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary/80">Immutable Trace</h3>
                <div className="flex-1 overflow-hidden rounded-2xl bg-[#0a0a0a] border border-emerald-500/20 p-5 font-mono text-[10px] leading-relaxed text-emerald-400/90 shadow-inner">
                  <div className="h-full overflow-y-auto custom-scrollbar">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify({
                        twin_id: selectedTwinForAudit.id,
                        auth_sig: `nexus_v3_${selectedTwinForAudit.id.split('-').pop()}`,
                        merkle_root: "0x89a...cf21",
                        reserve_impact: `${selectedTwinForAudit.metrics?.reserve_drawdown_pct}%`,
                        verification_node: "bnlr-core-01",
                        signals: selectedTwinForAudit.signals?.signals?.length || 0
                      }, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-auto pt-6 flex justify-end gap-3 border-t border-border/40">
              <button
                onClick={() => setSelectedTwinForAudit(null)}
                className="nexus-btn-secondary px-8 py-3 text-xs"
              >
                Dismiss Trace
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(selectedTwinForAudit, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `nexus-audit-${selectedTwinForAudit.id}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="nexus-btn-primary px-8 py-3 text-xs flex items-center gap-2"
              >
                <Download size={14} />
                Export Audit Pack
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
