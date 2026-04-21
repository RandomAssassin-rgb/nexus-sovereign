import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert, CheckCircle2, Loader2, Database, Zap } from 'lucide-react';
import { apiClient } from '../lib/apiClient';

interface HealthState {
  status: 'READY' | 'DB_TABLES_MISSING' | 'DB_SCHEMA_MISMATCH' | 'DB_ACCESS_DENIED' | 'SUPABASE_CONFIG_INVALID' | 'AUTH_QUERY_FAILED' | 'LOADING' | 'OFFLINE';
  details?: string;
}

export default function SystemIntegrityStatus() {
  const [health, setHealth] = useState<HealthState>({ status: 'LOADING' });

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await apiClient.get('/api/admin/auth/health');
        if (response.data?.success) {
          setHealth({ status: response.data.status, details: response.data.details });
        } else {
            setHealth({ status: response.data?.status || 'AUTH_QUERY_FAILED', details: response.data?.details });
        }
      } catch (error: any) {
        console.error('Integrity check failed:', error);
        setHealth({ 
            status: 'OFFLINE', 
            details: error.response?.data?.message || 'Backend unreachable or gateway blocked.' 
        });
      }
    };

    checkHealth();
    
    // Initial rapid check (every 6s for first 2 mins) for faster first-boot recovery
    let checkCount = 0;
    const interval = setInterval(() => {
        checkCount++;
        checkHealth();
        if (checkCount > 20) {
            clearInterval(interval);
            // Switch to standard 30s interval
            const longInterval = setInterval(checkHealth, 30000);
            return () => clearInterval(longInterval);
        }
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  if (health.status === 'LOADING') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/40 bg-background/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
        <Loader2 size={12} className="animate-spin text-primary" />
        Integrity Prob...
      </div>
    );
  }

  if (health.status === 'READY') {
    const isDemo = health.details?.includes('Demo-Resilient');
    return (
      <div 
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
          isDemo 
            ? 'border-cyan-500/30 bg-cyan-500/5 text-cyan-600' 
            : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600'
        } text-[10px] font-bold uppercase tracking-wider cursor-help`}
        title={health.details}
      >
        {isDemo ? <Zap size={12} className="text-cyan-500 animate-pulse" /> : <ShieldCheck size={12} className="text-emerald-500" />}
        {isDemo ? 'Demo Engine' : 'System Aligned'}
        
        {isDemo && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 p-2 rounded-lg bg-card border border-border/50 shadow-xl opacity-0 hover:opacity-100 transition-opacity pointer-events-none z-50 text-[10px] normal-case tracking-normal">
            <p className="text-muted-foreground leading-relaxed">{health.details}</p>
          </div>
        )}
      </div>
    );
  }

  const isCritical = ['DB_TABLES_MISSING', 'DB_SCHEMA_MISMATCH', 'DB_ACCESS_DENIED', 'SUPABASE_CONFIG_INVALID', 'OFFLINE'].includes(health.status);

  return (
    <div 
      className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-full border animate-pulse ${
        isCritical 
          ? 'border-destructive/30 bg-destructive/10 text-destructive' 
          : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
      } text-[10px] font-bold uppercase tracking-wider cursor-help`}
      title={health.details}
    >
      {isCritical ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
      <span>{health.status.replace(/_/g, ' ')}</span>
      
      {/* Tooltip detail */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-2 rounded-lg bg-card border border-border/50 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-[10px] normal-case tracking-normal">
        <div className="font-bold flex items-center gap-1 mb-1 text-foreground">
            <Database size={10} /> Infrastructure Insight
        </div>
        <p className="text-muted-foreground leading-relaxed">{health.details || 'Reconcile infrastructure via migrate.js.'}</p>
      </div>
    </div>
  );
}
