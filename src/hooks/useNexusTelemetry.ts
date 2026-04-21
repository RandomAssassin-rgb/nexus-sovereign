import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';

export type SignalProvenance = 'Live API' | 'Cached' | 'Derived' | 'Simulator';

export interface TelemetrySignal {
  value: number | string;
  label: string;
  impact: 'Stable' | 'Moderate' | 'Elevated' | 'Severe';
  source: string;
  provenance: SignalProvenance;
  lastUpdated: string | null;
}

export interface TelemetryState {
  weather: TelemetrySignal | null;
  aqi: TelemetrySignal | null;
  traffic: TelemetrySignal | null;
  observedAt: string | null;
  loading: boolean;
  rawJson: any;
}

export function useNexusTelemetry(lat: number | null, lon: number | null) {
  const [state, setState] = useState<TelemetryState>(() => {
    // Stage 1: Immediate hydration from cache
    const cached = localStorage.getItem('nexus_telemetry_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return { ...parsed, loading: false };
      } catch (e) { /* ignore */ }
    }
    return {
      weather: null,
      aqi: null,
      traffic: null,
      observedAt: null,
      loading: false,
      rawJson: null,
    };
  });

  const fetchTelemetry = useCallback(async () => {
    if (lat === null || lon === null) return;

    // Do NOT set loading: true if we have cached data, to avoid UI flickering/blocking
    // Only set loading if we have absolutely nothing
    const isInitialEmpty = !state.observedAt;
    if (isInitialEmpty) setState(prev => ({ ...prev, loading: true }));

    try {
      // Use the 5000ms approved timeout (handled by apiClient internally or explicitly here)
      const res = await apiClient.get(`/api/verify/forecast?lat=${lat}&lon=${lon}`, {
        timeout: 5000,
        headers: {
          'x-nexus-staged-fetch': 'true'
        }
      });
      const data = res.data || res;

      const signals = data.signals || {};
      const now = new Date().toISOString();

      const nextState: TelemetryState = {
        weather: {
          value: signals.weather?.temp_c !== undefined ? `${signals.weather?.temp_c}°C` : '--°C',
          label: signals.weather?.main || 'Clear',
          impact: (signals.weather?.score || 0) > 0.7 ? 'Severe' : (signals.weather?.score || 0) > 0.4 ? 'Moderate' : 'Stable',
          source: signals.weather?.source || 'OpenWeatherMap',
          provenance: signals.weather?.is_live ? 'Live API' : 'Simulator',
          lastUpdated: now,
        },
        aqi: {
          value: signals.aqi?.value ?? '--',
          label: 'AQI Index',
          impact: (signals.aqi?.score || 0) > 0.7 ? 'Severe' : (signals.aqi?.score || 0) > 0.4 ? 'Moderate' : 'Stable',
          source: signals.aqi?.source || 'WAQI',
          provenance: signals.aqi?.is_live ? 'Live API' : 'Simulator',
          lastUpdated: now,
        },
        traffic: {
          value: signals.traffic?.jam_factor ?? '--',
          label: 'Jam Factor',
          impact: (signals.traffic?.score || 0) > 0.7 ? 'Severe' : (signals.traffic?.score || 0) > 0.4 ? 'Moderate' : 'Stable',
          source: signals.traffic?.source || 'HERE Traffic',
          provenance: signals.traffic?.is_live ? 'Live API' : 'Simulator',
          lastUpdated: now,
        },
        observedAt: now,
        loading: false,
        rawJson: data,
      };

      setState(nextState);
      localStorage.setItem('nexus_telemetry_cache', JSON.stringify(nextState));
      window.dispatchEvent(new Event('nexus-signal-update'));
    } catch (e) {
      console.error('Telemetry fetch failed (falling back to cache):', e);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [lat, lon, state.observedAt]);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 60000); // Pulse every 60s
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  return { ...state, refresh: fetchTelemetry };
}
