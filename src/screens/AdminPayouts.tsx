import React, { useEffect, useState } from 'react';
import {
  Send,
  Activity,
  Cloud,
  Zap,
  AlertTriangle,
  Users,
  CheckCircle2,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  DollarSign,
  TrendingUp,
  Filter,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import axios from 'axios';

interface PayoutRecord {
  id: string;
  worker_name: string;
  amount: number;
  trigger_type: string;
  status: string;
  created_at: string;
}

export default function AdminPayouts() {
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulationType, setSimulationType] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [filter, setFilter] = useState<string>('all');

  // Fetch recent payouts
  useEffect(() => {
    const fetchPayouts = async () => {
      try {
        const res = await axios.get('/api/admin/recent-claims');
        setPayouts(res.data || []);
      } catch (e) {
        console.warn('Failed to fetch payouts', e);
      }
    };
    fetchPayouts();
    const interval = setInterval(fetchPayouts, 30000);
    return () => clearInterval(interval);
  }, []);

  const triggerSimulation = async () => {
    if (!simulationType) return;
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const response = await axios.post('/api/admin/simulate', { type: simulationType });
      setSimulationResult(response.data);
    } catch (err: any) {
      console.error('Failed to simulate', err);
      alert('Simulation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSimulating(false);
    }
  };

  const closeSimulationModal = () => {
    setIsSimulateModalOpen(false);
    setSimulationType(null);
    setSimulationResult(null);
  };

  // Mock summary data (will be replaced by actual API once stats endpoint supports payout-specific data)
  const summaryCards = [
    {
      title: 'Total Disbursed',
      value: '₹28,54,000',
      change: '+18.2%',
      positive: true,
      icon: DollarSign,
      color: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      title: 'Payouts Today',
      value: '142',
      change: '+24',
      positive: true,
      icon: Send,
      color: 'text-primary bg-primary/10',
    },
    {
      title: 'Avg. Processing Time',
      value: '2.4s',
      change: '-0.8s',
      positive: true,
      icon: Clock,
      color: 'text-blue-500 bg-blue-500/10',
    },
    {
      title: 'Success Rate',
      value: '99.7%',
      change: '+0.2%',
      positive: true,
      icon: TrendingUp,
      color: 'text-violet-500 bg-violet-500/10',
    },
  ];

  const activePayouts: PayoutRecord[] = payouts;
  const statusColor: Record<string, string> = {
    completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    processing: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  const triggerColor: Record<string, string> = {
    'Heavy Rain/Flood': 'text-blue-500',
    'Extreme Heat': 'text-amber-500',
    'Platform Outage': 'text-red-500',
    'Severe Pollution': 'text-purple-500',
    'Civic Disruption': 'text-indigo-500',
  };

  return (
    <AdminLayout
      pageTitle="Payouts"
      onSimulateClick={() => setIsSimulateModalOpen(true)}
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden group hover:border-primary/30 transition-all duration-300"
            >
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0" />
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    {card.title}
                  </p>
                  <p className="text-3xl font-black text-foreground tracking-tight">
                    {card.value}
                  </p>
                  <div className={`flex items-center gap-1 mt-3 text-sm font-semibold ${card.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                    {card.positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {card.change}
                  </div>
                </div>
                <div className={`p-3 rounded-xl ${card.color}`}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payouts Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-secondary/20">
          <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
            <Send size={20} className="text-primary" /> Recent Payouts
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-secondary/50 rounded-lg p-1">
              {['all', 'completed', 'processing', 'failed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                    filter === f
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payout ID</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Worker</th>
                <th className="text-left px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Trigger</th>
                <th className="text-right px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-center px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              {activePayouts
                .filter((p) => filter === 'all' || p.status === filter)
                .map((payout, i) => (
                  <tr
                    key={payout.id}
                    className="border-b border-border/30 hover:bg-secondary/30 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 text-sm font-bold text-foreground">{payout.id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{payout.worker_name}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-semibold ${triggerColor[payout.trigger_type] || 'text-foreground'}`}>
                        {payout.trigger_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-foreground">₹{payout.amount}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${statusColor[payout.status] || 'bg-secondary text-foreground'}`}>
                        {payout.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-muted-foreground font-medium">{payout.created_at}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulation Modal */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/40 backdrop-blur-sm">
          <div className="bg-card rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-border/50">
            <div className="px-6 py-5 border-b border-border/50 flex justify-between items-center bg-secondary/50">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Activity className="text-primary" /> Administrative Simulation
              </h2>
              <button
                onClick={closeSimulationModal}
                className="p-2 bg-secondary hover:bg-secondary/80 text-muted-foreground rounded-full transition-colors"
                disabled={isSimulating}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {!simulationResult ? (
                <>
                  <p className="text-sm text-muted-foreground mb-6 font-medium leading-relaxed">
                    Select a disruption event to fire across all connected gig worker clients.
                    This will simulate the environmental payload and trigger immediate zero-touch payouts.
                  </p>

                  <div className="space-y-3 mb-6">
                    {[
                      { id: 'Heavy Rain/Flood', icon: <Cloud size={18} />, desc: 'Triggers rainfall > 20mm/hr protocol', color: 'text-blue-500 bg-blue-500/10' },
                      { id: 'Extreme Heat', icon: <Zap size={18} />, desc: 'Triggers heat index > 40°C protocol', color: 'text-amber-500 bg-amber-500/10' },
                      { id: 'Platform Outage', icon: <AlertTriangle size={18} />, desc: 'Simulates aggregator downtime', color: 'text-destructive bg-destructive/10' },
                      { id: 'Severe Pollution', icon: <Activity size={18} />, desc: 'Triggers AQI > 400 hazard protocol', color: 'text-purple-500 bg-purple-500/10' },
                      { id: 'Civic Disruption', icon: <Users size={18} />, desc: 'Simulates riot or route blockades', color: 'text-indigo-500 bg-indigo-500/10' },
                    ].map((option) => (
                      <label
                        key={option.id}
                        className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          simulationType === option.id
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border/50 hover:border-border/100 bg-card hover:bg-secondary/20'
                        }`}
                      >
                        <div className="flex h-5 items-center">
                          <input
                            name="simulation"
                            type="radio"
                            value={option.id}
                            checked={simulationType === option.id}
                            onChange={(e) => setSimulationType(e.target.value)}
                            className="h-4 w-4 text-primary border-zinc-300 focus:ring-violet-500"
                          />
                        </div>
                        <div className="ml-3 flex gap-3">
                          <div className={`p-2 rounded-lg ${option.color}`}>{option.icon}</div>
                          <div>
                            <p className={`text-sm font-bold ${simulationType === option.id ? 'text-primary' : 'text-foreground'}`}>
                              {option.id}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground">{option.desc}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={closeSimulationModal}
                      disabled={isSimulating}
                      className="flex-1 px-4 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={triggerSimulation}
                      disabled={!simulationType || isSimulating}
                      className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                      {isSimulating ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Broadcasting...
                        </>
                      ) : (
                        'Fire Payload'
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-black text-foreground mb-2">Simulated Payout Broadcasted!</h3>
                  <p className="text-sm font-medium text-muted-foreground mb-6">
                    Successfully injected <strong>{simulationType}</strong> anomaly.
                    <br />
                    {simulationResult.count} worker(s) just received a zero-touch payout.
                  </p>
                  <button
                    onClick={closeSimulationModal}
                    className="w-full px-4 py-3 bg-card hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
