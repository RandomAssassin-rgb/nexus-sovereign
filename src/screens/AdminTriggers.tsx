import React, { useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  Zap,
  Activity,
  Users,
  Shield,
  Thermometer,
  Wind,
  Droplets,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

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

export default function AdminTriggers() {
  const [selectedTab, setSelectedTab] = useState<'active' | 'history'>('active');

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
      threshold: '40°C',
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
      type: 'Geo-Political',
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
    { id: 'EVT-9921', rule: 'Heavy Rainfall Protocol', zone: 'Koramangala', workers: 142, amount: '₹63,900', time: '2 hours ago', status: 'resolved' },
    { id: 'EVT-9920', rule: 'Extreme Heat Index', zone: 'Whitefield', workers: 89, amount: '₹40,050', time: '45 mins ago', status: 'active' },
    { id: 'EVT-9919', rule: 'Heavy Rainfall Protocol', zone: 'HSR Layout', workers: 67, amount: '₹30,150', time: '5 hours ago', status: 'resolved' },
    { id: 'EVT-9918', rule: 'Platform Outage Detection', zone: 'City-Wide', workers: 2104, amount: '₹9,46,800', time: '3 days ago', status: 'resolved' },
    { id: 'EVT-9917', rule: 'Extreme Heat Index', zone: 'Electronic City', workers: 156, amount: '₹70,200', time: '4 days ago', status: 'resolved' },
  ];

  const statusBadge: Record<string, { bg: string; icon: React.ReactNode }> = {
    active: { bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: <CheckCircle2 size={12} /> },
    paused: { bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: <Clock size={12} /> },
    disabled: { bg: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <XCircle size={12} /> },
    resolved: { bg: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', icon: <CheckCircle2 size={12} /> },
  };

  return (
    <AdminLayout pageTitle="Triggers">
      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0" />
          <div className="relative z-10">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Active Rules</p>
            <p className="text-4xl font-black text-foreground tracking-tight">{triggerRules.filter(t => t.status === 'active').length}</p>
            <p className="text-xs font-medium text-muted-foreground mt-3">of {triggerRules.length} total configured</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0" />
          <div className="relative z-10">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Fired (Lifetime)</p>
            <p className="text-4xl font-black text-primary tracking-tight">{triggerRules.reduce((sum, t) => sum + t.fired_count, 0).toLocaleString()}</p>
            <p className="text-xs font-medium text-muted-foreground mt-3">Across all trigger rules</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0" />
          <div className="relative z-10">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Auto-Payout Success</p>
            <p className="text-4xl font-black text-emerald-500 tracking-tight">99.4%</p>
            <p className="text-xs font-medium text-muted-foreground mt-3">Zero-touch fulfillment rate</p>
          </div>
        </div>
      </div>

      {/* Tab Switch */}
      <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1.5 w-max">
        <button
          onClick={() => setSelectedTab('active')}
          className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${selectedTab === 'active' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Active Rules
        </button>
        <button
          onClick={() => setSelectedTab('history')}
          className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${selectedTab === 'history' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Trigger History
        </button>
      </div>

      {selectedTab === 'active' ? (
        <div className="space-y-4">
          {triggerRules.map((rule) => (
            <div
              key={rule.id}
              className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 flex items-center gap-5 hover:border-primary/30 transition-all group cursor-pointer"
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
                  {rule.condition} • <span className="text-foreground font-semibold">{rule.threshold}</span>
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
      ) : (
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
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
    </AdminLayout>
  );
}
