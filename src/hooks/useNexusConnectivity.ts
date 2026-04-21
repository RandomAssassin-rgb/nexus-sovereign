import { useState, useEffect } from 'react';
import { getConnectionStatus } from '../lib/payoutStore';

export type SystemMode = 'Live' | 'Fallback' | 'Simulator';

export interface ConnectivityState {
  syncStatus: 'healthy' | 'degraded' | 'offline';
  lastSyncTime: string | null;
  signalStatus: 'fresh' | 'stale' | 'none';
  signalAgeSeconds: number | null;
  systemMode: SystemMode;
  modeReason: string | null;
}

export function useNexusConnectivity(signalObservedAt: string | null) {
  const [state, setState] = useState<ConnectivityState>({
    syncStatus: 'offline',
    lastSyncTime: null,
    signalStatus: 'none',
    signalAgeSeconds: null,
    systemMode: 'Simulator',
  });

  useEffect(() => {
    const update = () => {
      const connection = getConnectionStatus();
      const now = Date.now();
      
      // 1. Sync Health (based on Supabase Realtime/Poll status or raw internet)
      // For a robust presentation, if the device is online and polling works, we consider it healthy.
      const isOnline = window.navigator.onLine;
      const syncStatus = (connection === 'SUBSCRIBED' || isOnline) ? 'healthy' : connection === 'CONNECTING' ? 'degraded' : 'offline';
      
      // 2. Signal Freshness
      let signalAge = null;
      let signalStatus: 'fresh' | 'stale' | 'none' = 'none';
      
      if (signalObservedAt) {
        signalAge = Math.floor((now - new Date(signalObservedAt).getTime()) / 1000);
        signalStatus = signalAge < 60 ? 'fresh' : signalAge < 300 ? 'stale' : 'stale'; // > 5m is stale but we'll cap it
        if (signalAge >= 300) signalStatus = 'stale';
      }

      // 3. System Mode (Regulated Logic)
      let mode: SystemMode = 'Simulator';
      let modeReason: string | null = null;

      if (syncStatus === 'healthy' && signalStatus === 'fresh') {
        mode = 'Live';
      } else if (signalStatus === 'none' || signalAge! >= 300) {
        mode = 'Simulator';
        modeReason = signalStatus === 'none' ? 'No signal observed' : 'Signal stale (>5m)';
      } else {
        mode = 'Fallback';
        if (syncStatus === 'offline') modeReason = 'Sync offline';
        else if (syncStatus === 'degraded') modeReason = 'Degraded sync';
        else if (signalStatus === 'stale') modeReason = 'Stale signal (1m–5m)';
      }

      setState({
        syncStatus,
        lastSyncTime: signalObservedAt,
        signalStatus,
        signalAgeSeconds: signalAge,
        systemMode: mode,
        modeReason,
      });
    };

    update();
    const interval = setInterval(update, 10000);
    window.addEventListener('nexus-connection-update', update);
    window.addEventListener('nexus-signal-update', update);

    return () => {
      clearInterval(interval);
      window.removeEventListener('nexus-connection-update', update);
      window.removeEventListener('nexus-signal-update', update);
    };
  }, [signalObservedAt]);

  return state;
}
