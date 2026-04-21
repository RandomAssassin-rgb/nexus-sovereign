import axios from 'axios';
import { calculateCoverageCap, calculateWeeklyPremium } from './actuarial';

export const DEFAULT_COORDS = {
  lat: 12.9249,
  lon: 80.1275,
};

export function toNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function seededUnit(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453123;
  return raw - Math.floor(raw);
}

// ---------- Live API Fetchers ----------

export async function fetchLiveWeather(lat: number, lon: number) {
  const key = process.env.VITE_OPENWEATHER_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}`;
    const resp = await axios.get(url);
    const d = resp.data;
    return {
      weather: d.weather,
      main: d.main,
      wind: d.wind,
      mock: false,
      is_live: true,
      provenance: 'Live API'
    };
  } catch (e) {
    console.warn('[Telemetry] Live weather failed, falling back.');
    return null;
  }
}

export async function fetchLiveAqi(lat: number, lon: number) {
  const token = process.env.AQI_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${token}`;
    const resp = await axios.get(url);
    if (resp.data?.status === 'ok') {
      return {
        aqi: resp.data.data.aqi,
        mock: false,
        is_live: true,
        provenance: 'Live API'
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function fetchLiveTraffic(lat: number, lon: number) {
  const key = process.env.HERE_TRAFFIC_API_KEY;
  if (!key) return null;
  try {
    // Basic HERE Traffic flow/incidents for a point
    const url = `https://traffic.ls.hereapi.com/traffic/6.3/flow.json?prox=${lat},${lon},1000&apiKey=${key}`;
    const resp = await axios.get(url);
    // Simplified mapping to Nexus Sovereign schema (jamFactor)
    // Real mapping would parse RWS segments, but for demo we aggregate
    const flow = resp.data?.RWS?.[0]?.RW?.[0]?.FIS?.[0]?.FI?.[0]?.CF?.[0];
    const jamFactor = flow ? Number(flow.JF) : 2.5;
    return {
      jamFactor,
      trafficDensity: Number((jamFactor / 10).toFixed(2)),
      mock: false,
      is_live: true,
      provenance: 'Live API'
    };
  } catch (e) {
    return null;
  }
}

export function buildFallbackWeather(lat: number, lon: number) {
  const seed = lat * 100 + lon * 10;
  const rainChance = seededUnit(seed);
  const cloudChance = seededUnit(seed + 13);

  let main = 'Clear';
  let description = 'clear sky';

  if (rainChance > 0.62) {
    main = 'Rain';
    description = rainChance > 0.82 ? 'heavy rain' : 'moderate rain';
  } else if (cloudChance > 0.48) {
    main = 'Clouds';
    description = 'scattered clouds';
  }

  const tempC = 24 + seededUnit(seed + 7) * 12;
  const humidity = Math.round(48 + seededUnit(seed + 11) * 36);
  const wind = Number((2.2 + seededUnit(seed + 17) * 5.6).toFixed(1));

  return {
    weather: [{ main, description }],
    main: {
      temp: Number((tempC + 273.15).toFixed(2)),
      humidity,
    },
    wind: { speed: wind },
    mock: true,
    is_live: false,
    provenance: 'Simulator'
  };
}

export function buildFallbackAqi(lat: number, lon: number) {
  const seed = lat * 31 + lon * 17;
  const aqi = Math.round(42 + seededUnit(seed) * 118);
  return { aqi, mock: true, is_live: false, provenance: 'Simulator' };
}

export function buildFallbackTraffic(lat: number, lon: number) {
  const seed = lat * 19 + lon * 23;
  const jamFactor = Number((2.1 + seededUnit(seed) * 6.4).toFixed(1));
  const trafficDensity = Number((0.6 + jamFactor * 0.14).toFixed(2));
  return { jamFactor, trafficDensity, mock: true, is_live: false, provenance: 'Simulator' };
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return 'Just now';

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Just now';

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));

  if (minutes < 60) return `${minutes} mins ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function buildRiskInsight(input: {
  weatherData?: any;
  aqiData?: any;
  trafficData?: any;
  location?: any;
}) {
  const weatherMain = String(input.weatherData?.weather?.[0]?.main || 'Clear');
  const aqi = Number(input.aqiData?.aqi || 0);
  const jamFactor = Number(input.trafficData?.jamFactor || 0);

  const flags: string[] = [];
  if (weatherMain === 'Rain') flags.push('rain-loaded micro-climate');
  if (aqi >= 150) flags.push('pollution drag');
  if (jamFactor >= 6.5) flags.push('traffic drag');

  if (flags.length === 0) {
    return 'Telemetry-verified conditions remain stable. Your current parametric cover is aligned with the live risk delta for today.';
  }

  return `Telemetry-verified ${flags.join(' and ')} is raising your delivery risk. Maintain active cover so sudden disruption payouts remain zero-touch.`;
}

export function estimatePremium(input: {
  persona?: string;
  trust_score?: number;
  weather_severity?: number;
  traffic_density?: number;
  aqi_severity?: number;
  weeks_enrolled?: number;
  declared_earnings?: number;
  zoneRisk?: number;
  season?: string;
  trigger_type?: string;
}) {
  const weatherSeverity = Math.min(1, Math.max(0, toNumber(input.weather_severity, 0.1)));
  const trafficDensity = Math.min(1, Math.max(0, toNumber(input.traffic_density, 0.2)));
  const aqiSeverity = Math.min(1, Math.max(0, toNumber(input.aqi_severity, 0.12)));
  const zoneRisk = Math.min(1, Math.max(0, toNumber(input.zoneRisk, 0.15)));
  const blendedRisk =
    weatherSeverity * 0.4 +
    trafficDensity * 0.2 +
    aqiSeverity * 0.15 +
    zoneRisk * 0.25;

  const premiumQuote = calculateWeeklyPremium({
    persona: input.persona,
    trustScore: input.trust_score,
    zoneRisk,
    season: input.season,
    weatherSeverity,
    triggerType: input.trigger_type,
  });
  const coverageCap = calculateCoverageCap(input.persona);

  return {
    premium: premiumQuote.weekly_premium,
    weekly_premium: premiumQuote.weekly_premium,
    coverage_cap: coverageCap,
    risk_score: Number(blendedRisk.toFixed(3)),
    zone_risk: Number(zoneRisk.toFixed(3)),
    risk_tier: premiumQuote.risk_tier,
    season: premiumQuote.season,
    persona_group: premiumQuote.persona_group,
    trust_score: premiumQuote.trust_score,
  };
}

export const mockNews = [
  {
    title: 'Chennai rain cells expected to disrupt evening delivery corridors in Tambaram',
    link: '#',
    source_id: 'Nexus Desk',
    pubDate: new Date().toISOString(),
    description: 'Internal telemetry suggests higher disruption probability near the Tambaram Core and Chromepet clusters.',
  },
  {
    title: 'Gig worker safety advisory issued for heat and congestion overlap zones in Chennai',
    link: '#',
    source_id: 'Field Monitor',
    pubDate: new Date().toISOString(),
    description: 'High heat and slow-moving traffic are likely to depress trip throughput in core Tambaram sectors.',
  },
  {
    title: 'Platform resilience watch remains elevated ahead of the weekend peak',
    link: '#',
    source_id: 'Ops Pulse',
    pubDate: new Date().toISOString(),
    description: 'The payout engine is monitoring outage and delay signals across partner platforms.',
  },
];

export const mockRiskAlerts = [
  {
    id: 'FRD-2847',
    type: 'Impossible Velocity',
    severity: 'critical',
    description: 'Worker location jumped 180km in 3 minutes. GPS spoofing suspected.',
    worker: 'Raj Patel',
    worker_id: 'BLK-7781',
    location: 'East Tambaram -> Chromepet',
    time: '12 mins ago',
    status: 'open',
  },
  {
    id: 'FRD-2846',
    type: 'Duplicate Claim',
    severity: 'high',
    description: 'The same disruption signature was claimed by multiple accounts from one device.',
    worker: 'Unknown',
    worker_id: 'MULTI-1002',
    location: 'Pallavaram',
    time: '28 mins ago',
    status: 'investigating',
  },
  {
    id: 'FRD-2845',
    type: 'Biometric Mismatch',
    severity: 'medium',
    description: 'Biometric confidence dropped below the configured verification threshold.',
    worker: 'Amit Singh',
    worker_id: 'ZEP-4402',
    location: 'Vandalur',
    time: '1h ago',
    status: 'investigating',
  },
];

export const mockRecentClaims = [
  {
    id: 'CLM-8201',
    worker_name: 'Zepto_QDMNKXRC',
    amount: 1200,
    trigger_type: 'Heavy Rain/Flood',
    trigger: 'Heavy Rain/Flood',
    status: 'completed',
    created_at: '4 mins ago',
    time: '4 mins ago',
    zone: 'Tambaram Core',
  },
  {
    id: 'CLM-8200',
    worker_name: 'PARTNER-123',
    amount: 950,
    trigger_type: 'Platform Outage',
    trigger: 'Platform Outage',
    status: 'completed',
    created_at: '12 mins ago',
    time: '12 mins ago',
    zone: 'Chromepet',
  },
];

