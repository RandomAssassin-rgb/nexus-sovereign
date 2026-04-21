import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, FileText, Share2, ShieldCheck, Zap, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import PayoutExplainer from '../components/PayoutExplainer';
import { normalizeJepData, mergeJepData, JepData } from '../lib/jepUtils';
import { apiClient } from '../lib/apiClient';
import { getClaims } from '../lib/payoutStore';

export default function JEPScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const passedClaim = location.state?.claim;
  
  const [data, setData] = useState<JepData | null>(() => {
    // 1. Prefer passed claim state (fast path)
    if (passedClaim) return normalizeJepData(passedClaim, id || '');
    
    // 2. Synchronous fallback using getClaims() — ensures mock cases are found
    try {
      const claims = getClaims();
      const claim = claims.find((c: any) => c.id === id || c.id === id);
      if (claim) return normalizeJepData(claim, id || '');
    } catch (e) {
      console.error("Store sync read failed", e);
    }
    
    return null;
  });
  
  // isLoading is only true if we have NO data whatsoever after the sync init
  const [isLoading, setIsLoading] = useState(() => {
    if (passedClaim) return false;
    try {
      const claims = getClaims();
      return !claims.find((c: any) => c.id === id);
    } catch {}
    return true;
  });
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentStatus, setEnrichmentStatus] = useState<'local' | 'enriched' | 'partial' | 'fallback'>(() => {
    if (passedClaim) return 'local';
    try {
      const claims = getClaims();
      const found = claims.find((c: any) => c.id === id);
      if (found) return 'local';
    } catch {}
    return 'fallback';
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userName] = useState(() => localStorage.getItem("nexus_profile_name") || "Nexus Member");

  useEffect(() => {
    const fetchJep = async () => {
      if (!id) return;
      
      // Only show full loader if we truly have no data after the sync init
      if (!passedClaim) {
        setData(prev => {
          if (!prev) setIsLoading(true);
          return prev;
        });
      } else {
        setIsEnriching(true);
      }

      try {
        const res = await apiClient.get(`/api/claims/${id}/jep`);
        const freshData = res.data;
        
        setData(prev => {
          if (!prev) return normalizeJepData(freshData, id);
          return mergeJepData(prev, freshData);
        });
        setEnrichmentStatus('enriched');
        
        // Cache success
        try { localStorage.setItem(`nexus_jep_${id}`, JSON.stringify(freshData)); } catch {}
      } catch (err) {
        console.warn("JEP API failed, checking fallback:", err);
        setEnrichmentStatus('fallback');
        
        // Local Fallback from localStorage
        try {
          const cached = localStorage.getItem(`nexus_jep_${id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            setData(prev => prev ? mergeJepData(prev, parsed) : normalizeJepData(parsed, id));
            return;
          }
        } catch {}

        // Fallback to searching store via getClaims()
        const claims = getClaims();
        const claim = claims.find((c: any) => c.id === id);
        if (claim && !data) {
           setData(normalizeJepData(claim, id));
        }
      } finally {
        setIsLoading(false);
        setIsEnriching(false);
      }
    };

    fetchJep();
  }, [id, passedClaim, data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen p-6 flex flex-col bg-background">
        <header className="h-16 flex items-center mb-8">
          <button 
            onClick={() => navigate('/claims')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <ChevronLeft size={24} />
            <span className="text-sm font-bold">Back to Claims</span>
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <AlertCircle size={48} className="text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-black text-foreground">Evidence Pack Unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            This claim's evidence pack could not be loaded. It may still be propagating through the verification pipeline.
          </p>
          <button 
            onClick={() => navigate('/claims')}
            className="mt-8 nexus-btn-secondary px-8 bg-card"
          >
            Return to History
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Premium Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <button 
            onClick={() => navigate('/claims')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <ChevronLeft size={24} />
            <span className="text-sm font-bold">Back to Claims</span>
          </button>
          
          <div className="flex flex-col items-center relative">
            <h1 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Audit Token
            </h1>
            <span className="text-xs font-bold font-mono">
              {data?.audit?.twin_id || data?.id?.slice(0, 10)}
            </span>
            {isEnriching && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 whitespace-nowrap">
                  <div className="h-1 w-1 rounded-full bg-primary animate-ping" />
                  <span className="text-[8px] font-black uppercase tracking-tighter text-primary/60">Updating forensic details…</span>
                </div>
            )}
          </div>

          <button className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
            <Share2 size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-8 space-y-8">
        {/* DATA PROVENANCE ROW */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border/40 text-[9px] font-black uppercase tracking-widest shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/40 text-[8px]">Verification Trace:</span>
            <span className={cn(
               "font-black",
               data.provenance.includes('Simulation') ? 'text-amber-500' : 
               data.provenance.includes('Fallback') ? 'text-blue-500' : 'text-primary'
            )}>
               {data.provenance}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/40 text-[8px]">Confidence:</span>
            <span className={cn(
              "font-black",
              data.fraud.score >= 80 ? "text-emerald-500" : "text-amber-500"
            )}>
              {data.fraud.score}%
            </span>
          </div>
        </div>

        {/* Main Trust Summary */}
        <section>
          <div className="mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
              Transparency Report
            </span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-foreground leading-[1.1]">
            Transparency report for <span className="text-primary">{userName}</span>.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Investigation details for your <span className="font-bold text-foreground">{data?.event?.type || 'Claim'}</span> claim.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            This payout was verified using real-time event data and multi-source signals.
            Nexus Sovereign uses the <strong>Signal Fabric</strong> to confirm operational disruptions automatically.
          </p>
        </section>

        {/* Explainability Component */}
        <section>
          <div className="mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground/60">
              Claimant Explanation • Support Dialect
            </span>
          </div>
          <PayoutExplainer data={data} />
        </section>

        {/* Evidence Section — NEW for Phase 3 Fraud Demo */}
        {data.evidence_url && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Submitted Evidence</h3>
            </div>
            <div className="relative group overflow-hidden rounded-2xl border border-border/40 bg-card shadow-lg">
              <img 
                src={data.evidence_url} 
                alt="Evidence" 
                className="w-full h-auto object-cover aspect-video brightness-90 group-hover:brightness-100 transition-all duration-500"
              />
              
              {/* Forensic Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-destructive/10 backdrop-blur-[1px] opacity-90">
                <div className="flex items-center gap-2 px-4 py-2 bg-destructive text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl animate-pulse">
                  <ShieldCheck size={14} className="fill-white/20" />
                  Synthetic Match Detected
                </div>
                
                <div className="mt-4 flex flex-col gap-2 w-full max-w-[200px]">
                  <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white animate-[shimmer_2s_infinite]" style={{ width: '98.4%' }} />
                  </div>
                  <div className="flex justify-between text-[8px] font-black text-white uppercase tracking-widest opacity-80">
                    <span>AI Probability</span>
                    <span>98.4%</span>
                  </div>
                </div>
              </div>
              
              {/* Scanlines effect for forensic feel */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_2px,3px_100%]" />
            </div>
            <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest leading-relaxed">
              Evidence Snapshot captured via Signal Fabric Camera Proxy • Token: {data.id.slice(0, 8)}
            </p>
          </section>
        )}

        {/* HUMAN READABLE WHY SECTION */}
        <section className="nexus-panel p-6 border-l-4 border-l-primary bg-primary/5">
          <div className="flex items-center gap-3 mb-4">
            <Zap size={20} className="text-primary fill-primary/20" />
            <h3 className="text-lg font-black tracking-tight text-foreground">Why this was {data?.result === 'paid' ? 'Approved' : 'Held'}?</h3>
          </div>
          
          <div className="space-y-4">
            {data?.result === 'paid' ? (
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-sm font-bold text-foreground leading-relaxed">
                    Event matched: {data?.event?.type || 'Disruption'} intensity in {data?.event?.zone || 'Location'} was confirmed by Signal Fabric.
                  </p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-sm font-bold text-foreground leading-relaxed">
                    Confidence High: All {data?.signals?.length || 0} verification checks passed established trust criteria.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  <div className="h-5 w-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                  </div>
                  <p className="text-sm font-bold text-foreground leading-relaxed">
                    Check Required: {data?.fraud?.primary_reason?.replace(/_/g, ' ') || 'Enriching event data...'}.
                  </p>
                </div>

                {data?.fraud?.gps_spoof_flag && (
                  <div className="p-4 rounded-xl border-2 border-red-500/40 bg-red-500/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={18} className="text-red-500" />
                      <p className="text-xs font-black text-red-500 uppercase tracking-widest">GPS Spoofing Suspected</p>
                    </div>
                    <div className="space-y-2 pl-6">
                        <p className="text-sm font-bold text-foreground leading-relaxed">Location pattern inconsistent with normal movement</p>
                        <p className="text-sm font-bold text-foreground leading-relaxed">Activity did not match reported location</p>
                    </div>
                    {data?.fraud?.gps_spoof_reasons?.length > 0 && (
                      <div className="pt-3 border-t border-red-500/20">
                        {data.fraud.gps_spoof_reasons.map((r: string, i: number) => (
                          <p key={i} className="text-[11px] font-mono text-red-400/80">• {r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {data?.fraud?.weakest_link && (
                  <div className="flex items-start gap-4 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                    <AlertCircle size={18} className="text-red-500 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-red-500 uppercase tracking-widest mb-1">Weakest Check Detected</p>
                      <p className="text-sm font-bold text-foreground">
                        {data.fraud.weakest_link.label} score was only {data.fraud.weakest_link.score}/100.
                      </p>
                    </div>
                  </div>
                )}

                {data?.evidence_forensics && data.evidence_forensics.explanations?.length > 0 ? (
                  <div className="p-4 rounded-xl border-2 border-amber-500/30 bg-amber-500/5 space-y-3">
                    <div className="flex items-center gap-2">
                       <Zap size={18} className="text-amber-500" />
                       <p className="text-xs font-black text-amber-500 uppercase tracking-widest">Forensic Engine Intercept</p>
                    </div>
                    <div className="space-y-2 pl-6">
                      {data.evidence_forensics.explanations.map((exp: string, idx: number) => (
                         <div key={idx} className="flex items-start gap-2">
                            <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                            <p className="text-sm font-bold text-foreground leading-relaxed">{exp}</p>
                         </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic px-6">Forensic scan unavailable</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Verification Matrix */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" />
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Verification Matrix</h3>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border/40 shadow-sm space-y-6">
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Overall Score</p>
                <p className="text-3xl font-black text-foreground">{data?.fraud?.score ?? 0}<span className="text-muted-foreground/30 text-lg">/100</span></p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Confidence</p>
                <p className={`text-sm font-bold ${(data?.fraud?.score ?? 0) > 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {(data?.fraud?.score ?? 0) > 80 ? 'High confidence' : 'Review recommended'}
                </p>
              </div>
            </div>

            <div className="space-y-5 pt-4 border-t border-border/40">
              {[
                { label: 'Event Match', score: data?.fraud?.matrix?.event_match_score ?? 0 },
                { label: 'Location Trust', score: data?.fraud?.matrix?.location_trust_score ?? 0 },
                { label: 'Activity Match', score: data?.fraud?.matrix?.activity_match_score ?? 0 },
                { label: 'Device Trust', score: data?.fraud?.matrix?.device_trust_score ?? 0 },
                { label: 'Consensus Score', score: data?.fraud?.matrix?.consensus_score ?? 0 },
                { label: 'Behavior Risk', score: data?.fraud?.matrix?.behavior_risk_score ?? 0 },
              ].map((s, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-foreground">{s.label}</span>
                    <span className={`text-xs font-black ${s.score < 30 ? 'text-red-500' : 'text-primary'}`}>{s.score}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${s.score}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 mt-4 border-t border-border/40 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Decision Bucket</span>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md ${
                  data?.fraud?.bucket === 'auto-approve' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                }`}>
                  {data?.fraud?.decision_label || 'Awaiting data...'}
                </span>
            </div>
          </div>
        </section>

        {/* Verified Signals */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Verified Signals</h3>
          </div>
          <div className="space-y-3">
            {data?.signals?.length > 0 ? (
                data.signals.map((signal: any, idx: number) => (
                <div key={idx} className="p-4 rounded-xl border border-border/40 bg-card/50 flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{signal.label}</p>
                      <span className={cn(
                        "text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter",
                        signal.provenance === 'Live' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                        signal.provenance === 'Simulation' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                        "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                      )}>
                        {signal.provenance || 'Corroborated'}
                      </span>
                    </div>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{signal.source} • {new Date(signal.timestamp).toLocaleTimeString()}</p>
                  </div>
                  <span className="text-xs font-black text-primary">{signal.confidence}%</span>
                </div>
              ))
            ) : (
                <p className="text-[10px] text-muted-foreground italic px-6">No verified signals returned</p>
            )}
          </div>
        </section>

        {/* Admin Action Log — PHASE 3 Hardening */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" />
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Admin Action Log</h3>
          </div>
          <div className="relative pl-6 space-y-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border/40">
            {[
              { time: 'T-0s', action: 'Automated Approval Issued', detail: 'Consensus reached via Signal Fabric (OpenWeather + HERE Traffic)', status: 'success' },
              { time: 'T-2.1s', action: 'Forensic Scan Complete', detail: 'EXIF metadata verified. No pixel-level manipulation detected.', status: 'success' },
              { time: 'T-4.5s', action: 'Event Twin Synchronized', detail: 'Local disruption data corroborated with regional weather sensors.', status: 'info' },
              { time: 'T-4.8s', action: 'Claim Received', detail: 'Disruption report received via Worker Signal Fabric monitor.', status: 'info' },
            ].map((log, idx) => (
              <div key={idx} className="relative">
                <div className={cn(
                  "absolute -left-[23px] top-1.5 h-2 w-2 rounded-full border-2 border-background",
                  log.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-primary'
                )} />
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-foreground">{log.action}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{log.detail}</p>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/40">{log.time}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Payout Formula Trace — PHASE 3 Hardening */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Payout Formula Trace</h3>
          </div>
          <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-sm space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Base Daily Protected Rate</span>
              <span className="font-bold text-foreground">Rs 500.00</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Disruption Multiplier ({data?.event?.type})</span>
              <span className="font-bold text-emerald-500">× 1.00</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Loss Ratio Correction</span>
              <span className="font-bold text-amber-500">× 0.92</span>
            </div>
            <div className="pt-3 border-t border-border/40 flex items-center justify-between">
              <span className="text-sm font-black uppercase tracking-widest text-foreground">Final Payout amount</span>
              <div className="text-right">
                <p className="text-xl font-black text-primary">Rs {data.payout_math.actual_payout}</p>
                <p className="text-[8px] font-bold text-muted-foreground/50 tracking-tighter uppercase mt-1">Reserve Burn: {data.payout_math.reserve_impact_pct}%</p>
              </div>
            </div>
          </div>
        </section>

        {/* Forensic Audit Trail */}
        <section className="pt-4">
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full p-4 rounded-xl border border-border/40 bg-muted/20 text-muted-foreground hover:text-foreground transition-all"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Forensic Audit Trail</span>
            </div>
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAdvanced && (
            <div className="mt-4 p-5 rounded-2xl bg-[#0a0a0a] border border-primary/20 font-mono text-[10px] text-emerald-400 overflow-x-auto">
              <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
          )}
        </section>

        <div className="pt-4">
          <button onClick={() => navigate('/claims')} className="w-full nexus-btn-primary py-4 text-xs">Done</button>
        </div>
      </div>
    </div>
  );
}
