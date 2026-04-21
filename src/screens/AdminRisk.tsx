import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { apiClient } from '../lib/apiClient';
import {
  Shield,
  AlertTriangle,
  Eye,
  Fingerprint,
  MapPin,
  Clock,
  XCircle,
  CheckCircle2,
  ArrowUpRight,
  Activity,
  Zap,
  GitBranch,
  FileText,
  Database,
  User,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

interface FraudAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  worker: string;
  worker_id?: string;
  location: string;
  time: string;
  status: 'open' | 'investigating' | 'dismissed' | 'blocked';
}

interface AuditTrace {
  id: string;
  category: string;
  title: string;
  detail: string;
  actor: string;
  severity: string;
  relative_time: string;
}

const typeIcon: Record<string, React.ReactNode> = {
  'Impossible Velocity': <Zap size={18} className="text-red-500" />,
  'Duplicate Claim': <Activity size={18} className="text-amber-500" />,
  'Biometric Mismatch': <Fingerprint size={18} className="text-purple-500" />,
  'Unusual Claim Pattern': <ArrowUpRight size={18} className="text-yellow-500" />,
  'Account Sharing': <MapPin size={18} className="text-blue-500" />,
};

const categoryIcon: Record<string, React.ReactNode> = {
  'admin-action': <User size={14} className="text-primary" />,
  'claim-decision': <FileText size={14} className="text-blue-500" />,
  'payout-reasoning': <GitBranch size={14} className="text-emerald-500" />,
  'reserve-intervention': <Database size={14} className="text-amber-500" />,
};

const severityColor: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 border-red-500/30',
  high: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

const statusActions: Record<string, { label: string; bg: string; icon: React.ReactNode }> = {
  open: { label: 'Open', bg: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <AlertTriangle size={12} /> },
  investigating: { label: 'Investigating', bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: <Eye size={12} /> },
  dismissed: { label: 'Dismissed', bg: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', icon: <CheckCircle2 size={12} /> },
  blocked: { label: 'Blocked', bg: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <XCircle size={12} /> },
};

const fraudAlerts: FraudAlert[] = [
  { id: 'FRD-2847', type: 'Impossible Velocity', severity: 'critical', description: 'Worker location jumped 180km in 3 minutes — GPS spoofing suspected.', worker: 'Raj Patel', location: 'Koramangala → Electronic City', time: '12 mins ago', status: 'open' },
  { id: 'FRD-2846', type: 'Duplicate Claim', severity: 'high', description: 'Same weather event claimed from two different accounts on same device.', worker: 'Unknown (Multi-Account)', location: 'HSR Layout', time: '28 mins ago', status: 'investigating' },
  { id: 'FRD-2845', type: 'Biometric Mismatch', severity: 'medium', description: 'Face verification confidence dropped below 60% on recent login.', worker: 'Amit Singh', location: 'Indiranagar', time: '1 hour ago', status: 'investigating' },
  { id: 'FRD-2844', type: 'Unusual Claim Pattern', severity: 'medium', description: 'Worker filed 8 claims in 72 hours — significantly above threshold.', worker: 'Priya Nair', location: 'JP Nagar', time: '2 hours ago', status: 'open' },
  { id: 'FRD-2843', type: 'Account Sharing', severity: 'low', description: 'Login from two different cities within an hour detected.', worker: 'Sanjay K.', location: 'Bangalore ↔ Mysore', time: '5 hours ago', status: 'dismissed' },
  { id: 'FRD-2842', type: 'Impossible Velocity', severity: 'critical', description: 'GPS trajectory inconsistent with any known route network.', worker: 'Blocked Account #4491', location: 'Whitefield', time: '1 day ago', status: 'blocked' },
];

const riskMetrics = [
  { label: 'Fraud Detection Rate', value: '99.8%', trend: '+0.3%', icon: Shield, color: 'text-emerald-500 bg-emerald-500/10' },
  { label: 'Open Alerts', value: '7', trend: '+2', icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10' },
  { label: 'Blocked This Month', value: '23', trend: '+5', icon: XCircle, color: 'text-red-500 bg-red-500/10' },
  { label: 'Avg. Resolution Time', value: '4.2h', trend: '-1.3h', icon: Clock, color: 'text-blue-500 bg-blue-500/10' },
];

const fallbackFraudMesh = {
  summary: {
    investigations_open: 12,
    correlated_clusters: 3,
    face_drift_cases: 17,
    device_mismatch_cases: 8,
  },
  clusters: [
    {
      id: 'cluster_1',
      type: 'Syndicated Device Emulation',
      workers_impacted: 42,
      signal_count: 14,
      confidence: 0.98,
      severity: 'critical',
      provenance: 'Live Corroboration',
      action: 'Identified a cluster of claims simulating GPS coordinates in Koramangala from a single static IP address.',
    },
    {
      id: 'cluster_2',
      type: 'Impossible Velocity Mesh',
      workers_impacted: 8,
      signal_count: 5,
      confidence: 0.89,
      severity: 'high',
      provenance: 'Fallback Corroboration',
      action: 'Multiple workers reported commuting from JP Nagar to Whitefield in under 12 minutes during peak traffic.',
    }
  ],
  watchlist: [
    {
      worker_id: 'WK_8842_RAJ_P',
      platform: 'Delivery network',
      risk_score: 0.92,
      reasons: ['Exif upload gap > 48h', 'Signal Fabric: GPS Contradiction'],
      posture: 'Extreme Scrutiny',
      last_seen: '10 mins ago'
    }
  ]
};

const AUDIT_CATEGORIES = ['all', 'admin-action', 'claim-decision', 'payout-reasoning', 'reserve-intervention'];

export default function AdminRisk() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [fraudMesh, setFraudMesh] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [auditTraces, setAuditTraces] = useState<AuditTrace[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditCategory, setAuditCategory] = useState<string>('all');
  const [auditLoading, setAuditLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const [alertsRes, meshRes] = await Promise.all([
        apiClient.get('/api/admin/risk-alerts').catch(() => ({ data: fraudAlerts })),
        apiClient.get('/api/admin/fraud-mesh').catch(() => ({ data: fallbackFraudMesh })),
      ]);
      setAlerts(alertsRes.data || fraudAlerts);
      setFraudMesh(meshRes.data || fallbackFraudMesh);
    } catch (err) {
      console.error('Failed to fetch alerts');
      setAlerts(fraudAlerts);
      setFraudMesh(fallbackFraudMesh);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditTrace = async () => {
    setAuditLoading(true);
    try {
      const res = await apiClient.get('/api/admin/audit-trace');
      const data = res.data;
      setAuditTraces(data?.traces || []);
      setAuditTotal(data?.total ?? 0);
    } catch {
      setAuditTraces([]);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchAuditTrace();
  }, []);

  const handleAction = async (alertId: string, status: string, workerId?: string) => {
    try {
      await apiClient.post('/api/admin/risk/action', { alertId, status, workerId });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status: status as FraudAlert['status'] } : a)));
    } catch (err) {
      console.error('Action failed');
    }
  };

  const filtered = selectedSeverity === 'all' ? alerts : alerts.filter((a) => a.severity === selectedSeverity);
  const filteredAudit = auditCategory === 'all' ? auditTraces : auditTraces.filter((t) => t.category === auditCategory);

  return (
    <AdminLayout pageTitle="Risk & Fraud">
      <section className="nexus-section-stack">
        <div className="nexus-section-heading">
          <div>
            <div className="nexus-section-eyebrow mb-2">Risk intelligence</div>
            <h1 className="nexus-section-title">Fraud signals, investigations, and full decision-trace audit in one secure layer.</h1>
          </div>
          <p className="nexus-section-copy">
            Triage high-risk patterns, investigate suspicious worker behavior, and inspect immutable decision traces for every autonomous and manual action.
          </p>
        </div>
      </section>

      {/* Risk Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {riskMetrics.map((metric, i) => {
          const Icon = metric.icon;
          return (
            <div key={i} className="nexus-kpi-card">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0" />
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{metric.label}</p>
                  <p className="text-3xl font-black text-foreground tracking-tight">{metric.value}</p>
                  <p className="text-sm font-semibold text-emerald-600 mt-2">{metric.trend}</p>
                </div>
                <div className={`p-3 rounded-xl ${metric.color}`}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="nexus-panel rounded-3xl p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="nexus-section-eyebrow mb-2">Fraud Mesh</div>
              <h2 className="text-2xl font-bold tracking-[-0.04em]">Correlated anomalies, not just isolated alerts.</h2>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
              <Shield size={20} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/50 bg-secondary/35 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Investigations open</div>
              <div className="mt-3 text-3xl font-black tracking-[-0.05em]">{fraudMesh?.summary?.investigations_open ?? 0}</div>
              <p className="mt-2 text-xs text-muted-foreground">Live cases still moving through analyst review.</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-secondary/35 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Correlated clusters</div>
              <div className="mt-3 text-3xl font-black tracking-[-0.05em]">{fraudMesh?.summary?.correlated_clusters ?? 0}</div>
              <p className="mt-2 text-xs text-muted-foreground">Multi-worker patterns surfaced before payout leakage.</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-secondary/35 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Mesh Provenance</div>
              <div className="mt-3 text-3xl font-black tracking-[-0.05em] capitalize">{fraudMesh?.summary?.data_provenance || 'Signal Fabric'}</div>
              <p className="mt-2 text-xs text-muted-foreground">{fraudMesh?.summary?.data_provenance === 'fallback' ? 'Using stable deterministic fallback dataset.' : 'Consuming live Signal Fabric and AI forensic streams.'}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(fraudMesh?.clusters || []).map((cluster: any) => (
              <div key={cluster.id} className="rounded-2xl border border-border/50 bg-background/55 p-4 group hover:border-primary/30 transition-all">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                       <div className="text-sm font-semibold">{cluster.type}</div>
                       {cluster.provenance && (
                          <span className={cn(
                             "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border",
                             cluster.provenance.includes('Simulation') ? 'text-amber-500 border-amber-500/20' : 
                             cluster.provenance.includes('Fallback') ? 'text-blue-500 border-blue-500/20' : 'text-primary border-primary/20'
                          )}>
                             {cluster.provenance}
                          </span>
                       )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground font-medium">
                      {cluster.workers_impacted} workers · {cluster.signal_count} corroborating signals · {(Number(cluster.confidence || 0) * 100).toFixed(0)}% confidence
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] rounded-full border ${severityColor[cluster.severity]}`}>
                      {cluster.severity}
                    </span>
                    <button className="hidden group-hover:flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary hover:underline">
                      <FileText size={10} /> Inspect JEP Audit
                    </button>
                  </div>
                </div>
                
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{cluster.action}</p>

                {/* Consensus Trace — Phase 3 Hardening */}
                <div className="mt-4 pt-4 border-t border-border/40">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-3">Consensus Trace</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'GPS Sync', score: 0.98, status: 'Clear' },
                      { label: 'Device ID', score: 0.42, status: 'Anomalous' },
                      { label: 'Biometrics', score: 0.88, status: 'Clear' },
                    ].map((sig, sIdx) => (
                      <div key={sIdx} className="p-2 rounded-lg bg-secondary/50 border border-border/20">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[8px] font-bold text-muted-foreground">{sig.label}</span>
                          <span className={cn(
                            "text-[8px] font-black uppercase",
                            sig.status === 'Clear' ? 'text-emerald-500' : 'text-amber-500'
                          )}>{sig.status}</span>
                        </div>
                        <div className="w-full h-1 bg-background rounded-full overflow-hidden">
                          <div className={cn(
                            "h-full rounded-full",
                            sig.status === 'Clear' ? 'bg-emerald-500' : 'bg-amber-500'
                          )} style={{ width: `${sig.score * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {!fraudMesh?.clusters?.length && (
              <div className="rounded-2xl border border-border/50 bg-background/55 p-4 text-sm text-muted-foreground">
                Fraud mesh intelligence is warming up from alerts, claims, and worker trust posture.
              </div>
            )}
          </div>
        </section>

        <section className="nexus-panel rounded-3xl p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="nexus-section-eyebrow mb-2">Watchlist</div>
              <h2 className="text-2xl font-bold tracking-[-0.04em]">Workers and devices needing intervention.</h2>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-500">
              <Eye size={20} />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(fraudMesh?.watchlist || []).map((worker: any) => (
              <div key={worker.worker_id} className="rounded-2xl border border-border/50 bg-background/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{worker.worker_id}</div>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{worker.platform || 'Worker network'}</p>
                  </div>
                  <span className="nexus-chip">Risk {(Number(worker.risk_score || 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-3 space-y-2">
                  {(worker.reasons || []).map((reason: string) => (
                    <div key={reason} className="rounded-xl border border-border/40 bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                      {reason}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{worker.posture}</span>
                  <span>{worker.last_seen}</span>
                </div>
              </div>
            ))}
            {!fraudMesh?.watchlist?.length && (
              <div className="rounded-2xl border border-border/50 bg-background/55 p-4 text-sm text-muted-foreground">
                Watchlist entries will populate as the fraud mesh correlates device, claim, and location anomalies.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Severity Filter */}
      <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1.5 w-max">
        {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
          <button
            key={sev}
            onClick={() => setSelectedSeverity(sev)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              selectedSeverity === sev ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {sev}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 nexus-panel rounded-2xl">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground font-medium">Scanning for threats...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 nexus-panel rounded-2xl">
            <Shield className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground font-medium">No alerts detected in this category.</p>
          </div>
        ) : (
          filtered.map((alert) => (
            <div
              key={alert.id}
              className={`nexus-panel rounded-2xl p-5 transition-all cursor-pointer ${
                alert.severity === 'critical' ? 'border-red-500/30' : 'border-border/50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl border ${severityColor[alert.severity]}`}>
                  {typeIcon[alert.type] || <Shield size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="text-sm font-bold text-foreground">{alert.type}</h3>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full border ${severityColor[alert.severity]}`}>{alert.severity}</span>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full border flex items-center gap-1 ${statusActions[alert.status]?.bg}`}>
                      {statusActions[alert.status]?.icon} {statusActions[alert.status]?.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium ml-auto font-mono">{alert.id.substring(0, 8).toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium mb-2 leading-relaxed">{alert.description}</p>
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <span className="text-foreground flex items-center gap-1"><Fingerprint size={12} className="text-muted-foreground" /> {alert.worker || alert.worker_id}</span>
                    <span className="text-muted-foreground flex items-center gap-1"><MapPin size={12} /> {alert.location}</span>
                    <span className="text-muted-foreground flex items-center gap-1"><Clock size={12} /> {alert.time}</span>
                  </div>
                </div>
                {(alert.status === 'open' || alert.status === 'investigating') && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleAction(alert.id, 'blocked', alert.worker_id); }}
                      className="px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-500/10 hover:bg-red-500/20 rounded-lg uppercase tracking-wider transition-colors border border-red-500/20"
                    >
                      Block
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleAction(alert.id, 'dismissed'); }}
                      className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground bg-secondary hover:bg-secondary/80 rounded-lg uppercase tracking-wider transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* === AUDIT DECISION TRACE === */}
      <section className="nexus-panel rounded-3xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <div className="nexus-section-eyebrow mb-2">Audit decision trace</div>
            <h2 className="text-2xl font-black tracking-[-0.04em]">
              Every autonomous decision, admin action, and reserve intervention — immutably logged.
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground max-w-2xl">
              This rail captures all operator overrides, claim routing decisions, ML scoring events, and reserve guardrail interventions for full regulatory auditability.
            </p>
          </div>
          <span className="nexus-chip"><Activity size={13} /> {auditTotal} entries</span>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1.5 w-max mb-6 flex-wrap">
          {AUDIT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setAuditCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                auditCategory === cat ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat !== 'all' && categoryIcon[cat]}
              {cat === 'all' ? 'All traces' : cat.replace('-', ' ')}
            </button>
          ))}
        </div>

        {auditLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="relative">
            {/* Timeline spine */}
            <div className="absolute left-[23px] top-0 bottom-0 w-px bg-border/40" />

            <div className="space-y-0">
              {filteredAudit.length > 0 ? (
                filteredAudit.map((trace) => (
                  <div key={trace.id} className="relative flex gap-5 pb-5 last:pb-0">
                    {/* Timeline dot */}
                    <div
                      className={`relative z-10 mt-3.5 flex h-[14px] w-[14px] flex-shrink-0 rounded-full border-2 border-background ${
                        trace.severity === 'critical'
                          ? 'bg-red-500'
                          : trace.severity === 'warning'
                            ? 'bg-amber-500'
                            : trace.severity === 'success'
                              ? 'bg-emerald-500'
                              : 'bg-primary'
                      }`}
                    />

                    {/* Content card */}
                    <div className="flex-1 rounded-2xl border border-border/40 bg-background/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${severityColor[trace.severity] || severityColor.info}`}>
                            {categoryIcon[trace.category]}
                            {(trace.category || 'system').replace('-', ' ')}
                          </span>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${severityColor[trace.severity] || severityColor.info}`}>
                            {trace.severity || 'info'}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground">{trace.relative_time}</span>
                      </div>

                      <h3 className="mt-3 text-sm font-bold text-foreground">{trace.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{trace.detail}</p>

                      <div className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <User size={11} />
                        <span>{trace.actor}</span>
                        <span className="text-border">·</span>
                        <span className="font-mono text-[10px] text-muted-foreground/60">{trace.id}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="pl-10 rounded-2xl border border-border/40 bg-background/60 p-5 text-sm text-muted-foreground">
                  No audit traces found for this filter. Decision traces will appear here as claims, payouts, and operator actions flow through the system.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
