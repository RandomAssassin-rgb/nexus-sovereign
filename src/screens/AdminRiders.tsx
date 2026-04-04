import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users,
  Star,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Shield,
  TrendingUp,
  Activity,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

interface Rider {
  id: string;
  name: string;
  platform: string;
  zone: string;
  status: 'active' | 'idle' | 'offline' | 'blocked';
  plan: string;
  claims: number;
  total_paid: number;
  rating: number;
  joined: string;
  risk: 'low' | 'medium' | 'high';
}

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  idle: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  offline: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  blocked: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const riskBadge: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-600',
  medium: 'bg-amber-500/10 text-amber-600',
  high: 'bg-red-500/10 text-red-600',
};

const platformColor: Record<string, string> = {
  Swiggy: 'text-orange-500',
  Zomato: 'text-red-500',
  Ola: 'text-yellow-500',
  Rapido: 'text-blue-500',
};

export default function AdminRiders() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const fetchRiders = async () => {
      try {
        const { data } = await axios.get('/api/admin/riders');
        setRiders(data);
      } catch (err) {
        console.error("Failed to fetch riders");
      } finally {
        setLoading(false);
      }
    };
    fetchRiders();
  }, []);

  const summaryCards = [
    { label: 'Total Riders', value: riders.length.toString(), icon: Users, color: 'text-primary bg-primary/10' },
    { label: 'Active Now', value: riders.filter(r => r.status === 'active').length.toString(), icon: Activity, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Premium Plan', value: riders.filter(r => r.plan === 'Premium').length.toString(), icon: Shield, color: 'text-violet-500 bg-violet-500/10' },
    { label: 'Avg. Rating', value: riders.length > 0 ? (riders.reduce((s, r) => s + r.rating, 0) / riders.length).toFixed(1) : '0.0', icon: Star, color: 'text-amber-500 bg-amber-500/10' },
  ];

  const filtered = riders.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.zone.toLowerCase().includes(search.toLowerCase()) ||
      r.platform.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });


  return (
    <AdminLayout pageTitle="Riders">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0" />
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{card.label}</p>
                  <p className="text-3xl font-black text-foreground tracking-tight">{card.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${card.color}`}><Icon size={22} /></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, zone, platform..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1.5">
          {['all', 'active', 'idle', 'offline'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                statusFilter === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Riders Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 bg-secondary/20 flex items-center justify-between">
          <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
            <Users size={20} className="text-primary" /> Rider Registry
          </h2>
          <span className="text-xs text-muted-foreground font-medium">{filtered.length} of {riders.length} riders</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Rider</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Platform</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Zone</th>
                <th className="text-center px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-center px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Plan</th>
                <th className="text-right px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Claims</th>
                <th className="text-right px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Paid</th>
                <th className="text-center px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Rating</th>
                <th className="text-center px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rider) => (
                <tr key={rider.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors cursor-pointer">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-bold text-foreground">{rider.name}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">{rider.id} · {rider.joined}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold ${platformColor[rider.platform] || 'text-foreground'}`}>{rider.platform}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <MapPin size={12} /> {rider.zone}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${statusBadge[rider.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${rider.status === 'active' ? 'bg-emerald-500 animate-pulse' : rider.status === 'idle' ? 'bg-amber-500' : 'bg-zinc-500'}`} />
                      {rider.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${rider.plan === 'Premium' ? 'bg-violet-500/10 text-violet-600' : 'bg-zinc-500/10 text-zinc-500'}`}>
                      {rider.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-foreground">{rider.claims}</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-primary">₹{rider.total_paid.toLocaleString()}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="flex items-center justify-center gap-1 text-sm font-bold text-foreground">
                      <Star size={12} className="text-amber-400 fill-amber-400" /> {rider.rating}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${riskBadge[rider.risk]}`}>{rider.risk}</span>
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
