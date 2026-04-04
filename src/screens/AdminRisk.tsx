import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

interface FraudAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  worker: string;
  location: string;
  time: string;
  status: 'open' | 'investigating' | 'dismissed' | 'blocked';
}

const typeIcon: Record<string, React.ReactNode> = {
  'Impossible Velocity': <Zap size={18} className="text-red-500" />,
  'Duplicate Claim': <Activity size={18} className="text-amber-500" />,
  'Biometric Mismatch': <Fingerprint size={18} className="text-purple-500" />,
  'Unusual Claim Pattern': <ArrowUpRight size={18} className="text-yellow-500" />,
  'Account Sharing': <MapPin size={18} className="text-blue-500" />,
};

const severityColor: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 border-red-500/30',
  high: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
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

export default function AdminRisk() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  const fetchAlerts = async () => {
    try {
      const { data } = await axios.get('/api/admin/risk-alerts');
      setAlerts(data);
    } catch (err) {
      console.error("Failed to fetch alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleAction = async (alertId: string, status: string, workerId?: string) => {
    try {
      await axios.post('/api/admin/risk/action', { alertId, status, workerId });
      // Update local state for instant feedback
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: status as any } : a));
    } catch (err) {
      console.error("Action failed");
    }
  };

  const filtered = selectedSeverity === 'all'
    ? alerts
    : alerts.filter(a => a.severity === selectedSeverity);

  return (
    <AdminLayout pageTitle="Risk & Fraud">
      {/* Risk Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {riskMetrics.map((metric, i) => {
          const Icon = metric.icon;
          return (
            <div key={i} className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0" />
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{metric.label}</p>
                  <p className="text-3xl font-black text-foreground tracking-tight">{metric.value}</p>
                  <p className="text-sm font-semibold text-emerald-600 mt-2">{metric.trend}</p>
                </div>
                <div className={`p-3 rounded-xl ${metric.color}`}><Icon size={22} /></div>
              </div>
            </div>
          );
        })}
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
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-border/50">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground font-medium">Scanning for threats...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-border/50">
            <Shield className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground font-medium">No alerts detected in this category.</p>
          </div>
        ) : (
          filtered.map((alert) => (
            <div
              key={alert.id}
              className={`bg-card rounded-2xl p-5 shadow-sm border hover:shadow-md transition-all cursor-pointer ${
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
                      onClick={(e) => { e.stopPropagation(); handleAction(alert.id, 'blocked', alert.worker_id); }}
                      className="px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-500/10 hover:bg-red-500/20 rounded-lg uppercase tracking-wider transition-colors border border-red-500/20"
                    >
                      Block
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAction(alert.id, 'dismissed'); }}
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
    </AdminLayout>
  );
}

