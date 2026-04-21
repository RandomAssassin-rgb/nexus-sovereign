import { providerConfig } from "../config/providerConfig";
import { freshnessScore } from "../lib/signalMath";
import type { DisruptionType, SignalEvidence } from "../types/eventTwin";

export type BuildSignalFabricInput = {
  lat: number;
  lng: number;
  zoneIds: string[];
  disruptionType: DisruptionType;
  startedAt?: string;
};

async function safeJson<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function fetchSignal(
  name: SignalEvidence["name"],
  sourceLabel: string,
  baseUrl?: string,
  apiKey?: string,
  lat?: number,
  lng?: number
): Promise<SignalEvidence | null> {
  if (!baseUrl) return null;

  const url = new URL(baseUrl);
  if (typeof lat === "number") url.searchParams.set("lat", String(lat));
  if (typeof lng === "number") url.searchParams.set("lng", String(lng));

  const response = await fetch(url.toString(), {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });

  const payload = await safeJson<Record<string, unknown>>(response);
  if (!payload) return null;

  const observedAt = String(payload.observedAt ?? new Date().toISOString());

  return {
    name,
    source: sourceLabel,
    observedAt,
    freshnessScore: freshnessScore(observedAt),
    confidenceScore: 80,
    contradictionResult: "unknown",
    payload,
  };
}

export async function buildSignalFabric(input: BuildSignalFabricInput): Promise<SignalEvidence[]> {
  const [weather, aqi, traffic] = await Promise.all([
    fetchSignal("weather", providerConfig.weather.label, providerConfig.weather.baseUrl, providerConfig.weather.apiKey, input.lat, input.lng),
    fetchSignal("aqi", providerConfig.aqi.label, providerConfig.aqi.baseUrl, providerConfig.aqi.apiKey, input.lat, input.lng),
    fetchSignal("traffic", providerConfig.traffic.label, providerConfig.traffic.baseUrl, providerConfig.traffic.apiKey, input.lat, input.lng),
  ]);

  const signals = [weather, aqi, traffic].filter(Boolean) as SignalEvidence[];

  // TODO:
  // - reuse current /api/intelligence/verify/forecast
  // - reuse current /api/intelligence/verify/device-trust
  // - reuse current /api/intelligence/verify/multivariate-pulse
  // - reuse current /api/system/crowd-consensus
  // - add weather_history + activity normalized evidence
  return signals;
}
