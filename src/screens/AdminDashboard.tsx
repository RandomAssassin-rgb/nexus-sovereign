import React, { useMemo, useEffect, useState } from 'react';
import { Activity, Shield, Map as MapIcon, Users, AlertTriangle, Cloud, Zap, Send, X, CheckCircle2 } from 'lucide-react';
import Map, { Source, Layer, Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cellToBoundary, latLngToCell, gridDisk } from 'h3-js';
import axios from 'axios';
import { supabase } from '../lib/supabase';
import AdminLayout from '../components/AdminLayout';

interface DashboardStats {
  activePolicies: number;
  liveClaims: number;
  reservePool: number;
  activeTriggers: number;
}

interface RecentClaim {
  id: string;
  zone: string;
  trigger: string;
  amount: string;
  time: string;
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

const SIMULATION_URL = "/api/admin/simulate";

export default function AdminDashboard() {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  
  const [revenueData, setRevenueData] = useState<any>(null);
  const [pmaxData, setPmaxData] = useState<any>(null);
  const [workers, setWorkers] = useState<WorkerLocation[]>([]);
  const [viewState, setViewState] = useState({
    longitude: 77.5946,
    latitude: 12.9716,
    zoom: 10.8
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([]);
  const [riskDistribution, setRiskDistribution] = useState<Record<string, number>>({});
  const [newsTiles, setNewsTiles] = useState<NewsItem[]>([]);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [traffic, setTraffic] = useState<TrafficInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulation State
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulationType, setSimulationType] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [revRes, statsRes, claimsRes, riskRes, inputsRes] = await Promise.all([
        axios.get('/api/actuarial/revenue-projection').catch(() => ({ data: null })),
        axios.get('/api/admin/stats').catch(() => ({ data: null })),
        axios.get('/api/admin/recent-claims').catch(() => ({ data: [] })),
        axios.get('/api/admin/risk-distribution').catch(() => ({ data: {} })),
        axios.get('/api/actuarial/inputs').catch(() => ({ data: {} })),
      ]);

      setRevenueData(revRes.data);
      setStats(statsRes.data);
      setRecentClaims(claimsRes.data);
      setRiskDistribution(riskRes.data);

      const { b_res, n_active } = inputsRes.data || {};
      try {
        const pmaxRes = await axios.post('/api/actuarial/pmax', {
          w_base: 500,
          income_loss_pct: 100,
          b_res: b_res || 1250000,
          n_active: n_active || 8405,
          t_w: 1
        });
        setPmaxData(pmaxRes.data);
      } catch (e) { console.warn("Pmax failed", e); }
      
      try {
        const newsRes = await axios.get('/api/admin/news');
        setNewsTiles(newsRes.data);
        const weatherRes = await axios.get('/api/weather');
        setWeather({
          temp: Math.round(weatherRes.data.main.temp - 273.15),
          condition: weatherRes.data.weather[0].main,
          humidity: weatherRes.data.main.humidity
        });
        const trafficRes = await axios.get('/api/traffic');
        setTraffic({
          jamFactor: Number(trafficRes.data.jamFactor.toFixed(1)),
          status: trafficRes.data.jamFactor > 7 ? "Severe Congestion" : trafficRes.data.jamFactor > 4 ? "Moderate" : "Fluid"
        });
      } catch (envError) {
        console.warn("Failed to fetch environmental data", envError);
      }
      
      setIsLoading(false);
    } catch (e) {
      console.error("Failed to fetch dashboard data", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // 1 minute interval to reduce spam
    return () => clearInterval(interval);
  }, []);

  // Real-time Workers Telemetry
  useEffect(() => {
    const fetchInitialWorkers = async () => {
      try {
        const res = await axios.get('/api/admin/workers/locations');
        const workerData = res.data || [];
        setWorkers(workerData);
        
        // Auto-center on workers if they exist
        if (workerData.length > 0) {
          const lats = workerData.map((w: any) => Number(w.last_lat));
          const lngs = workerData.map((w: any) => Number(w.last_lng));
          const avgLat = lats.reduce((a: number, b: number) => a + b, 0) / lats.length;
          const avgLng = lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length;
          setViewState(prev => ({
            ...prev,
            latitude: avgLat,
            longitude: avgLng,
            zoom: 11
          }));
        }
      } catch (err) {
        console.error("Failed to fetch workers", err);
      }
    };

    fetchInitialWorkers();

    const channel = supabase
      .channel('admin_telemetry')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          const updatedUser = payload.new as WorkerLocation;
          if (updatedUser.last_lat && updatedUser.last_lng) {
            setWorkers(prev => {
              const index = prev.findIndex(w => w.id === updatedUser.id);
              if (index !== -1) {
                const newWorkers = [...prev];
                newWorkers[index] = { ...newWorkers[index], ...updatedUser };
                return newWorkers;
              }
              return [...prev, updatedUser];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const triggerSimulation = async () => {
    if (!simulationType) return;
    setIsSimulating(true);
    setSimulationResult(null);

    try {
      const response = await axios.post(SIMULATION_URL, { type: simulationType });
      setSimulationResult(response.data);
      // Quickly re-fetch to update dashboard numbers
      setTimeout(fetchData, 500); 
    } catch (err) {
      console.error("Failed to simulate", err);
      // Removed the mocking that was hiding backend failures
      alert("Simulation failed: " + (err.response?.data?.error || err.message));
    } finally {
      setIsSimulating(false);
    }
  };

  const closeSimulationModal = () => {
    setIsSimulateModalOpen(false);
    setSimulationType(null);
    setSimulationResult(null);
  };

  const hexData = useMemo(() => {
    const centerLat = 12.9716;
    const centerLng = 77.5946;
    const resolution = 7;
    try {
      const centerHex = latLngToCell(centerLat, centerLng, resolution);
      const hexes = gridDisk(centerHex, 6);
      const features = hexes.map(hex => {
        const boundary = cellToBoundary(hex, true);
        boundary.push(boundary[0]);
        const density = riskDistribution[hex] || 0;
        const normalizedDensity = Math.min(density / 5, 1);
        return {
          type: "Feature",
          properties: { hexId: hex, risk: density > 0 ? normalizedDensity : Math.random() * 0.2 },
          geometry: { type: "Polygon", coordinates: [boundary] }
        };
      });
      return { type: "FeatureCollection", features };
    } catch (e) {
      return null;
    }
  }, [riskDistribution]);

  return (
    <>
    <AdminLayout pageTitle="Bengaluru Core" onSimulateClick={() => setIsSimulateModalOpen(true)}>
          
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full transition-transform group-hover:scale-150 duration-500 opacity-50 z-0"/>
              <div className="relative z-10">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Active Accounts</p>
                <p className="text-4xl font-black text-foreground tracking-tight">{stats?.activePolicies ? stats.activePolicies.toLocaleString() : '12,450'}</p>
                <div className="flex items-center gap-1.5 mt-3 text-sm font-semibold text-emerald-600 bg-emerald-50 w-max px-2 py-0.5 rounded-full">
                  <Activity size={14} /> +12% from last week
                </div>
              </div>
            </div>
            
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-transparent hover:border-primary/50 transition-colors relative overflow-hidden">
              <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none"/>
              <div className="relative z-10">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Riders In Crisis Zones</p>
                <p className="text-4xl font-black text-amber-600 tracking-tight">{stats?.activeTriggers ? stats.activeTriggers.toLocaleString() : '842'}</p>
                <div className="mt-3 text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={14} /> High Alert: Traffic Corridor
                </div>
              </div>
            </div>
            
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Total Payouts Released</p>
                <p className="text-4xl font-black text-primary tracking-tight">₹{(stats?.liveClaims ? stats.liveClaims * 450 : 2854000).toLocaleString()}</p>
                <p className="text-xs font-medium text-muted-foreground mt-3 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-indigo-400" /> Settled this month
                </p>
              </div>
            </div>
            
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Premium Pool Balance</p>
                <p className="text-4xl font-black text-foreground tracking-tight">₹{stats?.reservePool ? (stats.reservePool).toLocaleString() : '4,20,50,000'}</p>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5 mt-4">
                <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '85%' }}></div>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold mt-2 flex justify-between">
                <span>Reserves at 85% Limit</span>
                <span className="text-emerald-500">Optimum Stable</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Live Map Area */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-secondary/20">
                  <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                    <MapIcon size={20} className="text-destructive"/> Live Exposure Map
                  </h2>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-[10px] font-bold text-destructive uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-primary/100 animate-pulse" /> Live Telemetry
                  </span>
                </div>
                
                <div className="h-[450px] bg-card relative">
                  <div className="absolute top-4 left-4 z-10 bg-card/95 backdrop-blur-md p-4 rounded-xl border border-border/50 shadow-xl max-w-xs transition-all hover:shadow-2xl">
                    <h3 className="text-sm font-black text-foreground mb-1">Nexus Live Telemetry</h3>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-500/20">
                        {workers.length} Active Workers
                      </span>
                      {traffic && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${traffic.status === 'Fluid' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                          {traffic.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium leading-tight">
                      Streaming aggregate risk data and individual worker positioning via Supabase Realtime mesh.
                    </p>
                  </div>
                  
                  {mapboxToken ? (
                    <Map
                      {...viewState}
                      onMove={evt => setViewState(evt.viewState)}
                      mapboxAccessToken={mapboxToken}
                      mapStyle="mapbox://styles/mapbox/dark-v11"
                      style={{ width: '100%', height: '100%' }}
                    >
                      {/* Active Workers Layer */}
                      {workers.map(worker => (
                        <Marker
                          key={worker.id}
                          latitude={Number(worker.last_lat)}
                          longitude={Number(worker.last_lng)}
                          anchor="bottom"
                        >
                          <div className="relative group cursor-pointer">
                            {/* Outer Pulse */}
                            <div className="absolute -inset-2 bg-primary/30 rounded-full animate-pulse-nexus blur-sm" />
                            {/* Inner Dot */}
                            <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg relative z-10 ${
                              worker.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`} />
                            
                            {/* Tooltip on Hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg text-[10px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-20 text-foreground">
                              {worker.full_name || 'Anonymous Worker'}
                            </div>
                          </div>
                        </Marker>
                      ))}

                      {hexData && (
                        <Source id="h3-hexagons" type="geojson" data={hexData as any}>
                        <Layer
                          id="hex-fill"
                          type="fill"
                          paint={{
                            'fill-color': [
                              'interpolate', ['linear'], ['get', 'risk'],
                              0, '#10b981', 
                              0.5, '#f59e0b', 
                              1, '#ef4444' 
                            ],
                            'fill-opacity': ['interpolate', ['linear'], ['get', 'risk'], 0, 0.05, 1, 0.4]
                          }}
                        />
                        <Layer id="hex-line" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.1 }} />
                      </Source>
                    )}
                  </Map>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <MapIcon size={48} className="mb-4 opacity-50 text-indigo-500" />
                      <p className="font-semibold text-sm">Visualizing H3 Risk Topology...</p>
                      <p className="text-xs opacity-70 mt-1">Connecting to tracking stream</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Activity and Triggers */}
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 flex flex-col">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="font-bold text-lg text-foreground">Recent Activity</h2>
                <a href="#" className="text-sm font-bold text-primary hover:text-primary transition-colors">View All</a>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {recentClaims.length > 0 ? recentClaims.slice(0,5).map((claim, i) => (
                  <div key={i} className="flex gap-4 p-4 rounded-xl hover:bg-secondary/50 border border-transparent hover:border-border/50 transition-all cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Activity className="text-blue-500" size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">Payout Processed: ₹{claim.amount}</p>
                      <p className="text-xs text-muted-foreground font-medium">Claim ID: {claim.id} • {claim.time}</p>
                      <span className="inline-block mt-1.5 px-2 py-0.5 bg-secondary text-zinc-600 text-[9px] font-bold uppercase rounded-md tracking-wider">
                        SUCCESS
                      </span>
                    </div>
                  </div>
                )) : (
                  <>
                    <div className="flex gap-4 p-4 rounded-xl border border-border/50">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                         <Send className="text-indigo-500" size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">Batch Payout Initiated</p>
                        <p className="text-xs text-muted-foreground font-medium">142 Payouts • ₹54,200 total • 4 mins ago</p>
                      </div>
                    </div>
                    <div className="flex gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="text-amber-600" size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">Trigger: High Heat</p>
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">Bengaluru-Koramangala Sector • 12 mins ago</p>
                        <p className="text-xs text-amber-700 font-medium italic">"Automatic protection active for 8 riders"</p>
                      </div>
                    </div>
                    <div className="flex gap-4 p-4 rounded-xl border border-border/50">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Shield className="text-destructive" size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">High-Risk Fraud Alert</p>
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">Impossible Velocity detected • 1 hr ago</p>
                        <div className="flex gap-2">
                          <button className="text-[10px] font-bold text-primary uppercase">Block Account</button>
                          <button className="text-[10px] font-bold text-muted-foreground uppercase">Dismiss</button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
      </AdminLayout>
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
                    Select a disruption event to fire across all connected gig worker clients. This will simulate the environmental payload and trigger immediate zero-touch payouts.
                  </p>
                  
                  <div className="space-y-3 mb-6">
                    {[
                      { id: "Heavy Rain/Flood", icon: <Cloud size={18}/>, desc: "Triggers rainfall > 20mm/hr protocol", color: "text-blue-500 bg-blue-500/10" },
                      { id: "Extreme Heat", icon: <Zap size={18}/>, desc: "Triggers heat index > 40°C protocol", color: "text-amber-500 bg-amber-500/10" },
                      { id: "Platform Outage", icon: <AlertTriangle size={18}/>, desc: "Simulates aggregator downtime", color: "text-destructive bg-destructive/10" },
                      { id: "Severe Pollution", icon: <Activity size={18}/>, desc: "Triggers AQI > 400 hazard protocol", color: "text-purple-500 bg-purple-500/10" },
                      { id: "Civic Disruption", icon: <Users size={18}/>, desc: "Simulates riot or route blockades", color: "text-indigo-500 bg-indigo-500/10" },
                    ].map(option => (
                      <label 
                        key={option.id} 
                        className={`flex items-start p-3 rounded-xl border-2 cursor-pointer transition-all ${simulationType === option.id ? 'border-primary bg-primary/10 shadow-sm' : 'border-border/50 hover:border-border/100 bg-card hover:bg-secondary/20'}`}
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
                            <p className={`text-sm font-bold ${simulationType === option.id ? 'text-primary' : 'text-foreground'}`}>{option.id}</p>
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
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Broadcasting...
                        </>
                      ) : (
                        "Fire Payload"
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
                    Successfully injected <strong>{simulationType}</strong> anomaly.<br/>
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
    </>
  );
}
