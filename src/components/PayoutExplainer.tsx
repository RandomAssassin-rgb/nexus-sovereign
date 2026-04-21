import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Calculator, Info, Languages, ShieldCheck, Zap, Search, AlertTriangle, CheckCircle2, Clock, MapPin } from 'lucide-react';

interface PayoutExplainerProps {
  data: {
    result: string;
    provenance: string;
    fraud: {
      score: string | number;
      bucket: string;
      reason_labels: string[];
    };
    evidence_forensics?: any;
    payout: {
      plan: string;
      estimated_loss: number;
      payout_calculation: string;
      breakdown: {
        hourly_rate: number;
        duration: number;
        multiplier: number;
      };
    };
    event: {
      type: string;
      zone: string;
      duration: string;
      affected_workers: number;
    };
  };
}

const LOCALES: Record<string, any> = {
  en: {
    title: "Why was this paid?",
    payout_approved: "AUTO APPROVED ✅",
    payout_held: "REVIEW REQUIRED ⚠️",
    payout_escalate: "HIGH RISK 🚨",
    trust_statement: "This payout was verified using real-time event data and multi-source signals.",
    status_sub: "Claim verified through automated logic",
    trust_score: "Verification Score",
    signals_verified: "Signals Verified",
    math_title: "Calculation Breakdown",
    rate: "Base Rate",
    duration: "Event Duration",
    multiplier: "Loss Multiplier",
    total: "Total Approved",
    formula: "{rate} × {duration} × {multiplier}",
    impact: "Event impact in {zone} affected {count} workers.",
  },
  hi: {
    title: "यह भुगतान क्यों किया गया?",
    payout_approved: "AUTO APPROVED ✅",
    payout_held: "REVIEW REQUIRED ⚠️",
    payout_escalate: "HIGH RISK 🚨",
    trust_statement: "यह भुगतान रीयल-टाइम इवेंट डेटा और मल्टी-सोर्स सिग्नल्स का उपयोग करके सत्यापित किया गया था।",
    status_sub: "आपका दावा सत्यापित किया गया है",
    trust_score: "सत्यापन स्कोर",
    signals_verified: "सिग्नल्स सत्यापित",
    math_title: "गणना विवरण",
    rate: "आधार दर",
    duration: "ईवेंट अवधि",
    multiplier: "नुकसान गुणक",
    total: "कुल स्वीकृत",
    formula: "{rate} × {duration} × {multiplier}",
    impact: "{zone} में ईवेंट के प्रभाव ने {count} श्रमिकों को प्रभावित किया।",
  },
  kn: {
    title: "ಇದನ್ನು ಏಕೆ ಪಾವತಿಸಲಾಯಿತು?",
    payout_approved: "AUTO APPROVED ✅",
    payout_held: "REVIEW REQUIRED ⚠️",
    payout_escalate: "HIGH RISK 🚨",
    trust_statement: "ನೈಜ-ಸಮಯದ ಈವೆಂಟ್ ಡೇಟಾ ಮತ್ತು ಬಹು-ಮೂಲ ಸಂಕೇತಗಳನ್ನು ಬಳಸಿಕೊಂಡು ಈ ಪಾವತಿಯನ್ನು ದೃಢೀಕರಿಸಲಾಗಿದೆ.",
    status_sub: "ನಿಮ್ಮ ದಾವೆ ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
    trust_score: "ಪರಿಶೀಲನಾ ಸ್ಕೋರ್",
    signals_verified: "ಸಿಗ್ನಲ್\u200Cಗಳು ದೃಢೀಕರಿಸಲ್ಪಟ್ಟಿವೆ",
    math_title: "ಲೆಕ್ಕಾಚಾರದ ವಿವರ",
    rate: "ಮೂಲ ದರ",
    duration: "ಘಟನೆಯ ಅವಧಿ",
    multiplier: "ನಷ್ಟದ ಗುಣಕ",
    total: "ಒಟ್ಟು ಅನುಮೋದಿಸಲಾಗಿದೆ",
    formula: "{rate} × {duration} × {multiplier}",
    impact: "{zone} ನಲ್ಲಿನ ಘಟನೆಯವು {count} ಕಾರ್ಮಿಕರ ಮೇಲೆ ಪರಿಣಾಮ ಬೀರಿದೆ.",
  }
};

export default function PayoutExplainer({ data }: PayoutExplainerProps) {
  const [lang, setLang] = useState<'en' | 'hi' | 'kn'>('en');
  const t = LOCALES[lang];

  const formatCurrency = (val: number) => `₹${Number(val).toLocaleString('en-IN')}`;

  const getStatusLabel = () => {
    if (data.result === 'paid') return t.payout_approved;
    if (data.fraud.bucket === 'escalate') return t.payout_escalate;
    return t.payout_held;
  };

  return (
    <div className="space-y-6">
      {/* Header & Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${data.result === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight">{getStatusLabel()}</h3>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{t.status_sub}</p>
          </div>
        </div>
        
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
          {(['en', 'hi', 'kn'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1 text-[10px] font-black uppercase rounded ${lang === l ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Human Readable Explanation */}
      <div className="nexus-panel p-5 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="mt-1 text-primary">
            <Info size={18} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold leading-relaxed text-foreground">
              {data.result === 'paid' 
                ? "Multiple independent sensors in your geofence confirmed the event, validating your claim instantly."
                : "The Signal Fabric is still corroborating forensic data from your area to ensure a fair payout."}
            </p>
            <p className="text-xs leading-5 text-muted-foreground italic">
              {t.impact.replace('{zone}', data.event?.zone || 'Tambaram Core').replace('{count}', (data.event?.affected_workers || 1420).toLocaleString())}
            </p>
          </div>
        </div>
      </div>

      {/* Verification & Signal Provenance Section */}
      <div className="grid grid-cols-2 gap-4">
        <div className="nexus-subpanel p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{t.trust_score}</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-foreground">{data.fraud.score}</span>
            <span className="text-xs font-bold text-muted-foreground pb-1">/ 100</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.fraud.reason_labels.slice(0, 2).map((label, idx) => (
              <span key={idx} className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="nexus-subpanel p-4 border-l-4 border-l-primary/40">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Signal Provenance</div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className={cn(
               data.provenance.includes('Simulation') ? 'text-amber-500' : 'text-emerald-500'
            )} />
            <span className={cn(
              "text-base font-black uppercase tracking-tight leading-none",
              data.provenance.includes('Simulation') ? 'text-amber-500' : 
              data.provenance.includes('Fallback') ? 'text-blue-500' : 'text-primary'
            )}>
              {data.provenance}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
            {data.result === 'paid' 
              ? `Verification logic correlated signals using ${data.provenance.toLowerCase()} for immediate release.`
              : `Signal correlation ${data.provenance.includes('Simulation') ? 'requires live' : 'awaiting higher-fidelity'} corroboration.`}
          </p>
        </div>
      </div>

      {/* Evidence Forensics Section */}
      {data.evidence_forensics && (
        <div className="nexus-panel p-5 border-amber-500/30">
          <div className="flex items-center gap-2 mb-4">
            <Search size={16} className="text-amber-500" />
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Advanced Forensics</h4>
          </div>
          <div className="space-y-3">
            {(!data.evidence_forensics || data.evidence_forensics.status === 'passed') ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span>Forensic integrity checks passed. Signal clarity is high.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {data.evidence_forensics.duplicate_detail?.classification === 'hard_contradiction' && (
                  <div className="flex items-start gap-2 text-xs bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-red-500 font-bold">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>Exact duplicate image detected in the Nexus cluster.</span>
                  </div>
                )}
                {data.evidence_forensics.duplicate_detail?.classification === 'anomaly' && (
                  <div className="flex items-start gap-2 text-xs bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-amber-500 font-bold">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>Significant image similarity found with historical evidence.</span>
                  </div>
                )}
                {data.evidence_forensics.geo_detail?.classification === 'hard_contradiction' && (
                  <div className="flex items-start gap-2 text-xs bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-red-500 font-bold">
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    <span>Location contradiction: Evidence GPS does not match event zone.</span>
                  </div>
                )}
                {data.evidence_forensics.timestamp_detail?.classification === 'hard_contradiction' && (
                  <div className="flex items-start gap-2 text-xs bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-red-500 font-bold">
                    <Clock size={14} className="mt-0.5 shrink-0" />
                    <span>Time contradiction: Image captured outside the event window.</span>
                  </div>
                )}
                {data.evidence_forensics.status === 'review' && (
                   <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                      <Search size={14} />
                      <span>Heuristic anomalies detected. Pending manual corroboration.</span>
                   </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Math Breakdown */}
      <div className="nexus-panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator size={16} className="text-primary" />
          <h4 className="text-xs font-black uppercase tracking-widest text-foreground">{t.math_title}</h4>
        </div>
        
        <div className="space-y-4">
          <div className="bg-muted/30 p-4 rounded-xl text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Calculation Logic</div>
            <div className="text-sm font-bold text-foreground">
              {formatCurrency(data.payout?.breakdown?.hourly_rate || 0)} × {data.payout?.breakdown?.duration || 0}h × {data.payout?.breakdown?.multiplier || 1}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs py-1">
              <span className="text-muted-foreground">{t.rate}</span>
              <span className="font-bold text-foreground">{formatCurrency(data.payout?.breakdown?.hourly_rate || 0)}/hr</span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-muted-foreground">{t.duration}</span>
              <span className="font-bold text-foreground">{data.payout?.breakdown?.duration || 0}h</span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-muted-foreground">{t.multiplier}</span>
              <span className="font-bold text-foreground">x{data.payout?.breakdown?.multiplier || 1}</span>
            </div>
            <div className="mt-4 flex justify-between pt-4 border-t border-border">
              <span className="text-sm font-black text-foreground uppercase tracking-widest">{t.total}</span>
              <span className="text-lg font-black text-primary">{formatCurrency(data.payout?.estimated_loss || 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

  );
}
