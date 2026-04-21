import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cloud,
  Droplets,
  Play,
  Shield,
  Thermometer,
  Users,
  Wind,
  XCircle,
  Zap,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

type TriggerTab = 'studio' | 'active' | 'history' | 'audit';

interface TriggerRule {
  id: string;
  name: string;
  type: string;
  condition: string;
  threshold: string;
  status: 'active' | 'paused' | 'disabled';
  fired_count: number;
  last_fired: string;
  icon: React.ReactNode;
  color: string;
}

const triggerRules: TriggerRule[] = [
  {
    id: 'TR-001',
    name: 'Heavy Rainfall Protocol',
    type: 'Weather',
    condition: 'Rainfall intensity > threshold',
    threshold: '20mm/hr',
    status: 'active',
    fired_count: 847,
    last_fired: '2 hours ago',
    icon: <Droplets size={20} />,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'TR-002',
    name: 'Extreme Heat Index',
    type: 'Weather',
    condition: 'Heat index > threshold',
    threshold: '40C',
    status: 'active',
    fired_count: 1203,
    last_fired: '45 mins ago',
    icon: <Thermometer size={20} />,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'TR-003',
    name: 'Platform Outage Detection',
    type: 'System',
    condition: 'Aggregator API response > threshold',
    threshold: '30s timeout',
    status: 'active',
    fired_count: 23,
    last_fired: '3 days ago',
    icon: <AlertTriangle size={20} />,
    color: 'text-red-500 bg-red-500/10 border-red-500/20',
  },
  {
    id: 'TR-004',
    name: 'Air Quality Hazard',
    type: 'Environment',
    condition: 'AQI exceeds hazardous threshold',
    threshold: 'AQI > 400',
    status: 'paused',
    fired_count: 56,
    last_fired: '1 week ago',
    icon: <Wind size={20} />,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  {
    id: 'TR-005',
    name: 'Civic Disruption Alert',
    type: 'Geo-political',
    condition: 'Route blockade or curfew detected',
    threshold: 'Manual / News API',
    status: 'active',
    fired_count: 12,
    last_fired: '2 weeks ago',
    icon: <Users size={20} />,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
  },
];

const triggerHistory = [
  { id: 'EVT-9921', rule: 'Heavy Rainfall Protocol', zone: 'Koramangala', workers: 142, amount: 'Rs 63,900', time: '2 hours ago', status: 'resolved' },
  { id: 'EVT-9920', rule: 'Extreme Heat Index', zone: 'Whitefield', workers: 89, amount: 'Rs 40,050', time: '45 mins ago', status: 'active' },
  { id: 'EVT-9919', rule: 'Heavy Rainfall Protocol', zone: 'HSR Layout', workers: 67, amount: 'Rs 30,150', time: '5 hours ago', status: 'resolved' },
  { id: 'EVT-9918', rule: 'Platform Outage Detection', zone: 'City-Wide', workers: 2104, amount: 'Rs 9,46,800', time: '3 days ago', status: 'resolved' },
  { id: 'EVT-9917', rule: 'Extreme Heat Index', zone: 'Electronic City', workers: 156, amount: 'Rs 70,200', time: '4 days ago', status: 'resolved' },
];

const statusBadge: Record<string, { bg: string; icon: React.ReactNode }> = {
  active: { bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: <CheckCircle2 size={12} /> },
  paused: { bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: <Clock size={12} /> },
  disabled: { bg: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <XCircle size={12} /> },
  resolved: { bg: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', icon: <CheckCircle2 size={12} /> },
  success: { bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: <CheckCircle2 size={12} /> },
  warning: { bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: <AlertTriangle size={12} /> },
  info: { bg: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <Activity size={12} /> },
  critical: { bg: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <AlertTriangle size={12} /> },
};

const scenarioOptions = [
  {
    key: 'monsoon-flood',
    label: 'Monsoon flood',
    legacyType: 'Heavy Rain/Flood',
    icon: <Cloud size={18} />,
    description: 'Rain-linked disruption corridors with dense worker overlap.',
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  {
    key: 'heatwave-corridor',
    label: 'Heatwave corridor',
    legacyType: 'Extreme Heat',
    icon: <Thermometer size={18} />,
    description: 'Thermal load spikes across delivery-heavy micro-zones.',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  },
  {
    key: 'severe-aqi-day',
    label: 'Severe AQI day',
    legacyType: 'Severe Pollution',
    icon: <Wind size={18} />,
    description: 'Hazardous pollution posture with assisted review pressure.',
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  {
    key: 'civic-disruption-band',
    label: 'Civic disruption band',
    legacyType: 'Civic Disruption',
    icon: <Users size={18} />,
    description: 'Route blockades and city-band disruption affecting large cohorts.',
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
  },
  {
    key: 'platform-outage-cluster',
    label: 'Platform outage cluster',
    legacyType: 'Platform Outage',
    icon: <Zap size={18} />,
    description: 'Aggregator downtime with concentrated payout and review pressure.',
    color: 'text-red-500 bg-red-500/10 border-red-500/20',
  },
];

export default function AdminTriggers() {
  const [selectedTab, setSelectedTab] = useState<TriggerTab>('studio');
  const [selectedScenario, setSelectedScenario] = useState<string>('monsoon-flood');
  const [scenarioPreview, setScenarioPreview] = useState<any>(null);
  const [scenarioCatalog, setScenarioCatalog] = useState<Record<string, any>>({});
  const [auditTrace, setAuditTrace] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [showConfirmBlast, setShowConfirmBlast] = useState(false);

  useEffect(() => {
    void apiClient
      .get('/api/admin/audit-trace')
      .then((response) => setAuditTrace(response.data || null))
      .catch(() => setAuditTrace(null));
  }, []);

  useEffect(() => {
    const loadCatalog = async () => {
      const entries = await Promise.all(
        scenarioOptions.map(async (scenario) => {
          try {
            const response = await apiClient.get(`/api/admin/simulations/scenario?scenarioType=${scenario.key}`);
            return [scenario.key, response.data] as const;
          } catch {
            return [scenario.key, null] as const;
          }
        })
      );
      setScenarioCatalog(Object.fromEntries(entries));
    };

    void loadCatalog();
  }, []);

  useEffect(() => {
    void apiClient
      .get(`/api/admin/simulations/scenario?scenarioType=${selectedScenario}`)
      .then((response) => setScenarioPreview(response.data || null))
      .catch(() => setScenarioPreview(null));
  }, [selectedScenario]);

  const selectedScenarioMeta = useMemo(
    () => scenarioOptions.find((scenario) => scenario.key === selectedScenario) || scenarioOptions[0],
    [selectedScenario]
  );

  const handleExecuteScenario = async () => {
    setShowConfirmBlast(false);
    setExecuting(true);
    setExecutionResult(null);
    try {
      const [previewRes, simulateRes] = await Promise.all([
        apiClient.post('/api/admin/simulations/scenario', {
          scenarioType: selectedScenario,
          execute: true,
        }),
        apiClient.post('/api/admin/simulate', { type: selectedScenarioMeta.legacyType }),
      ]);
      setScenarioPreview(previewRes.data || null);
      setExecutionResult({
        preview: previewRes.data || null,
        simulation: {
          ...simulateRes.data,
          count: Number(simulateRes.data?.count ?? previewRes.data?.workers_impacted ?? 0),
        },
      });
      void apiClient
        .get('/api/admin/audit-trace')
        .then((auditRes) => setAuditTrace(auditRes.data || null))
        .catch(() => {});
    } catch (error) {
      console.error('Scenario execution failed', error);
      setExecutionResult({
        error: 'Execution failed. The scenario preview is still available for review.',
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <AdminLayout pageTitle="Triggers">
      <section className="nexus-section-stack">
        <div className="nexus-section-heading">
          <div>
            <div className="nexus-section-eyebrow mb-2">Trigger governance</div>
            <h1 className="nexus-section-title">Scenario Studio, trigger rules, and audit trace in one operator rail.</h1>
          </div>
          <p className="nexus-section-copy">
            Preview reserve-aware scenarios, supervise live trigger rules, and inspect the audit story behind every operational decision. <span className="text-primary font-bold">Standardized to Tambaram Core, Chennai.</span>
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="nexus-kpi-card">
          <div className="relative z-10">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Active rules</p>
            <p className="text-4xl font-black text-foreground tracking-tight">{triggerRules.filter((rule) => rule.status === 'active').length}</p>
            <p className="text-xs font-medium text-muted-foreground mt-3">of {triggerRules.length} total configured</p>
          </div>
        </div>
        <div className="nexus-kpi-card">
          <div className="relative z-10">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Scenario clusters</p>
            <p className="text-4xl font-black text-primary tracking-tight">{Object.values(scenarioCatalog).filter(Boolean).length}</p>
            <p className="text-xs font-medium text-muted-foreground mt-3">Pre-modeled disruption studios ready for execution</p>
          </div>
        </div>
        <div className="nexus-kpi-card relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-20"><Shield size={48} /></div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Audit entries</p>
            <p className="text-4xl font-black text-emerald-500 tracking-tight">{auditTrace?.total ?? 0}</p>
            <p className="text-[10px] font-bold text-emerald-600 mt-2 bg-emerald-500/10 px-2 py-0.5 rounded uppercase w-max">Origin: {scenarioPreview?.origin || 'Hybrid'}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1.5 w-max">
        {(['studio', 'active', 'history', 'audit'] as TriggerTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all capitalize ${
              selectedTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {selectedTab === 'studio' && (
        <div className="space-y-6">
          <section className="nexus-panel rounded-3xl p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="nexus-section-eyebrow mb-2">Scenario Studio</div>
                <h2 className="text-2xl font-black tracking-[-0.04em]">Model a disruption, inspect the payout corridor, then fire the operator payload.</h2>
              </div>
              <span className="nexus-chip">{selectedScenarioMeta.label}</span>
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-5">
              {scenarioOptions.map((scenario) => {
                const preview = scenarioCatalog[scenario.key];
                return (
                  <button
                    key={scenario.key}
                    onClick={() => setSelectedScenario(scenario.key)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      selectedScenario === scenario.key
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border/50 bg-background/60 hover:border-primary/30'
                    }`}
                  >
                    <div className={`inline-flex rounded-xl border p-2 ${scenario.color}`}>{scenario.icon}</div>
                    <div className="mt-3 text-sm font-semibold">{scenario.label}</div>
                    <div className="flex gap-2 items-center mt-2">
                      <p className="text-xs leading-6 text-muted-foreground">{scenario.description}</p>
                      {preview?.origin && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-500/10 border border-zinc-500/20 uppercase">
                          {preview.origin}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {preview?.workers_impacted?.toLocaleString?.('en-IN') || 0} workers impacted
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-2xl border border-border/50 bg-background/60 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Shield size={16} className="text-primary" />
                  Scenario economics
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/40 bg-secondary/35 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Projected load</div>
                    <div className="mt-2 text-2xl font-black tracking-[-0.05em]">Rs {Number(scenarioPreview?.projected_payout_load || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-secondary/35 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Runway after event</div>
                    <div className="mt-2 text-2xl font-black tracking-[-0.05em]">{scenarioPreview?.runway_days_after_scenario || 0}d</div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-secondary/35 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Reserve drawdown</div>
                    <div className="mt-2 text-2xl font-black tracking-[-0.05em]">{scenarioPreview?.economics?.reserve_drawdown_pct || 0}%</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/40 bg-secondary/35 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Payout corridor</div>
                    <div className="mt-2 text-lg font-black">{scenarioPreview?.controls?.payout_corridor || 'Rs 29 - Rs 250'}</div>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">Replacement ratio {scenarioPreview?.controls?.replacement_ratio || '70%'} · {scenarioPreview?.controls?.review_mode || 'autonomous preferred'}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-secondary/35 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Geography</div>
                    <div className="mt-2 text-lg font-black">{scenarioPreview?.origin === 'simulated' ? 'Tambaram, Chennai' : 'Live Geofence'}</div>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">Radius: 5km · Resolution: H3 L8</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/60 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity size={16} className="text-primary" />
                  Execution trace
                </div>
                <div className="mt-4 space-y-3">
                  {(scenarioPreview?.audit_seed || []).map((step: string) => (
                    <div key={step} className="rounded-xl border border-border/40 bg-secondary/35 px-3 py-3 text-sm text-muted-foreground">
                      {step}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowConfirmBlast(true)}
                  disabled={executing}
                  className="nexus-button-primary mt-5 w-full"
                >
                  {executing ? 'Broadcasting scenario...' : 'Execute scenario'} <Play size={16} />
                </button>

                {executionResult && (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${executionResult.error ? 'border-red-500/20 bg-red-500/10 text-red-600' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                    {executionResult.error
                      ? executionResult.error
                      : `${executionResult.simulation?.count || 0} worker(s) were ${executionResult.simulation?.queued ? 'queued into' : 'targeted by'} the live simulation payout rail.`}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {selectedTab === 'active' && (
        <div className="space-y-4">
          {triggerRules.map((rule) => (
            <div
              key={rule.id}
              className="nexus-panel rounded-2xl p-5 flex items-center gap-5 hover:border-primary/30 transition-all group cursor-pointer"
            >
              <div className={`p-3 rounded-xl border ${rule.color}`}>{rule.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-sm font-bold text-foreground">{rule.name}</h3>
                  <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full border flex items-center gap-1 ${statusBadge[rule.status]?.bg}`}>
                    {statusBadge[rule.status]?.icon} {rule.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {rule.condition} · <span className="text-foreground font-semibold">{rule.threshold}</span>
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-black text-foreground">{rule.fired_count.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">times fired</p>
              </div>
              <div className="text-right flex-shrink-0 min-w-[100px]">
                <p className="text-xs text-muted-foreground font-medium">Last fired</p>
                <p className="text-sm font-semibold text-foreground">{rule.last_fired}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTab === 'history' && (
        <div className="nexus-table-shell">
          <div className="overflow-x-auto">
            <table className="nexus-data-table">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Event ID</th>
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Rule</th>
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Zone</th>
                  <th className="text-right px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Workers</th>
                  <th className="text-right px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="text-center px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody>
                {triggerHistory.map((evt) => (
                  <tr key={evt.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-foreground">{evt.id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{evt.rule}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-medium">{evt.zone}</td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-foreground">{evt.workers}</td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-primary">{evt.amount}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${statusBadge[evt.status]?.bg}`}>
                        {statusBadge[evt.status]?.icon} {evt.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-muted-foreground font-medium">{evt.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTab === 'audit' && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="nexus-panel rounded-3xl p-5 md:p-6">
            <div className="nexus-section-eyebrow mb-2">Audit summary</div>
            <h2 className="text-2xl font-black tracking-[-0.04em]">Every payout, claim decision, and risk action leaves a visible trail.</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/50 bg-secondary/35 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Visible entries</div>
                <div className="mt-2 text-3xl font-black">{auditTrace?.total ?? 0}</div>
                <p className="mt-2 text-xs text-muted-foreground">Latest operational events currently retained in the live admin rail.</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-secondary/35 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Latest category</div>
                <div className="mt-2 text-2xl font-black capitalize">{auditTrace?.traces?.[0]?.category?.replace('-', ' ') || 'Pending'}</div>
                <p className="mt-2 text-xs text-muted-foreground">The newest event type currently leading the audit stream.</p>
              </div>
            </div>
          </section>

          <section className="nexus-panel rounded-3xl p-5 md:p-6">
            <div className="nexus-section-eyebrow mb-2">Audit rail</div>
            <h2 className="text-2xl font-black tracking-[-0.04em]">Operational trace timeline</h2>
            <div className="mt-5 space-y-3">
              {(auditTrace?.traces || []).map((trace: any) => (
                <div key={trace.id} className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{trace.title}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{trace.detail}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full border ${statusBadge[trace.severity]?.bg || statusBadge.info.bg}`}>
                      {(statusBadge[trace.severity]?.icon || statusBadge.info.icon)} {trace.severity || 'info'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{trace.actor}</span>
                    <span>{trace.relative_time}</span>
                  </div>
                </div>
              ))}
              {!auditTrace?.traces?.length && (
                <div className="rounded-2xl border border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
                  Audit traces will appear here once claims, payouts, and risk actions start flowing.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {showConfirmBlast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-card/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-border/50 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 bg-secondary/50 px-6 py-5">
              <h2 className="flex items-center gap-2 text-xl font-bold text-destructive">
                <AlertTriangle /> Confirm Blast Operation
              </h2>
              <button
                className="rounded-full bg-secondary p-2 text-muted-foreground transition-colors hover:bg-secondary/80"
                onClick={() => setShowConfirmBlast(false)}
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm leading-7 text-muted-foreground mb-4">
                You are about to simulate a <strong className="text-foreground">{selectedScenarioMeta.label}</strong> to 
                <strong className="text-foreground"> {scenarioPreview?.workers_impacted?.toLocaleString?.('en-IN') || 0}</strong> active workers.
              </p>
              <p className="text-sm leading-7 text-muted-foreground mb-6">
                This will trigger zero-touch payout routing, push notifications to all simulated riders, and may draw down your reserve by an estimated <strong className="text-primary tracking-tight">Rs {Number(scenarioPreview?.projected_payout_load || 0).toLocaleString('en-IN')}</strong>. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                 <button
                   onClick={() => setShowConfirmBlast(false)}
                   className="nexus-button-secondary"
                 >
                   Cancel
                 </button>
                 <button
                   onClick={handleExecuteScenario}
                   className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-bold py-2.5 px-6 rounded-xl transition-all"
                 >
                   Confirm Blast Deployment
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
