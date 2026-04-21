import { buildFallbackAqi, buildFallbackTraffic, buildFallbackWeather, fetchLiveAqi, fetchLiveTraffic, fetchLiveWeather, formatRelativeTime, toNumber } from "./fallbacks.js";
import {
  calculatePmax,
  calculateReservePool,
  calculateWeeklyPremium,
  calculateZeroTouchPayout,
  clamp,
  inferEarningsTier,
  normalizePersonaLabel,
  resolveTriggerKind,
} from "./actuarial.js";
import { supabaseServer } from "./supabase.js";
import { ensureSkeletonUser } from "./supabaseHelper.js";

type UserRow = Record<string, any> | null;

const FORECAST_HOURS = [2, 6, 24] as const;
const FRAUD_ALERT_TYPES = [
  "Impossible Velocity",
  "Biometric Mismatch",
  "Duplicate Claim",
  "Account Sharing",
  "Unusual Claim Pattern",
] as const;

type ProductControlsState = {
  payout_corridor: string;
  replacement_ratio: string;
  trigger_sensitivity: string;
  geography_rulebook: string;
  updated_at: string;
  source: "runtime";
};

const DEFAULT_PRODUCT_CONTROLS: ProductControlsState = {
  payout_corridor: "Rs 29 - Rs 250",
  replacement_ratio: "70%",
  trigger_sensitivity: "standard",
  geography_rulebook: "metro-core",
  updated_at: new Date().toISOString(),
  source: "runtime",
};

export function roundAmount(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function latestTimestamp(rows: any[], keys: string[]) {
  let latest = 0;

  rows.forEach((row) => {
    keys.forEach((key) => {
      const value = row?.[key];
      if (!value) return;
      const time = new Date(value).getTime();
      if (!Number.isNaN(time) && time > latest) {
        latest = time;
      }
    });
  });

  return latest || null;
}

function minutesSince(timestamp: number | null, fallbackMinutes = 12) {
  if (!timestamp) return fallbackMinutes;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

function freshnessState(minutes: number, watchAt = 6, staleAt = 18) {
  if (minutes >= staleAt) return "stale" as const;
  if (minutes >= watchAt) return "watch" as const;
  return "healthy" as const;
}

function normalizeTrustScore(value: unknown) {
  const raw = toNumber(value, 0.5);
  return clamp(raw > 1 ? raw / 1000 : raw, 0, 1);
}

function normalizeIdentityValue(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  return trimmed;
}

function buildPhoneCandidates(identifier: string) {
  const values = new Set<string>();
  const normalized = normalizeIdentityValue(identifier);
  if (!normalized) return [] as string[];

  values.add(normalized);

  const digits = normalized.replace(/\D/g, "");
  if (!digits) {
    return Array.from(values);
  }

  values.add(digits);

  const localDigits = digits.length >= 10 ? digits.slice(-10) : digits;
  if (localDigits.length === 10) {
    values.add(localDigits);
    values.add(`+91${localDigits}`);
    values.add(`+91-${localDigits}`);
    values.add(`91${localDigits}`);
  }

  return Array.from(values);
}

function getProductControlsStore(): ProductControlsState {
  const globalState = globalThis as typeof globalThis & {
    __nexusProductControls?: ProductControlsState;
  };

  if (!globalState.__nexusProductControls) {
    globalState.__nexusProductControls = { ...DEFAULT_PRODUCT_CONTROLS };
  }

  return globalState.__nexusProductControls;
}

export function getProductControls() {
  return { ...getProductControlsStore() };
}

export function saveProductControls(input: Partial<ProductControlsState>) {
  const current = getProductControlsStore();
  const next: ProductControlsState = {
    payout_corridor: String(input.payout_corridor || current.payout_corridor),
    replacement_ratio: String(input.replacement_ratio || current.replacement_ratio),
    trigger_sensitivity: String(input.trigger_sensitivity || current.trigger_sensitivity),
    geography_rulebook: String(input.geography_rulebook || current.geography_rulebook),
    updated_at: new Date().toISOString(),
    source: "runtime",
  };

  const globalState = globalThis as typeof globalThis & {
    __nexusProductControls?: ProductControlsState;
  };
  globalState.__nexusProductControls = next;
  return { ...next };
}

async function loadUser(partnerId?: string | null): Promise<UserRow> {
  const resolved = await resolveWorkerIdentity(partnerId);
  return resolved.user;
}

export async function resolveWorkerIdentity(partnerId?: string | null) {
  const lookupKey = normalizeIdentityValue(partnerId);
  if (!lookupKey) {
    return {
      lookupKey: null,
      partnerId: null,
      user: null as UserRow,
    };
  }

  const exactRes = await supabaseServer
    .from("users")
    .select("*")
    .eq("partnerId", lookupKey)
    .maybeSingle();

  if (exactRes.error) throw exactRes.error;
  if (exactRes.data) {
    return {
      lookupKey,
      partnerId: String(exactRes.data.partnerId || exactRes.data.partner_id || lookupKey),
      user: exactRes.data as UserRow,
    };
  }

  const phoneCandidates = buildPhoneCandidates(lookupKey);
  if (phoneCandidates.length > 0) {
    const phoneRes = await supabaseServer
      .from("users")
      .select("*")
      .in("phone", phoneCandidates)
      .limit(1);

    if (phoneRes.error) throw phoneRes.error;

    const phoneUser = Array.isArray(phoneRes.data) ? phoneRes.data[0] : null;
    if (phoneUser) {
      return {
        lookupKey,
        partnerId: String(phoneUser.partnerId || phoneUser.partner_id || lookupKey),
        user: phoneUser as UserRow,
      };
    }
  }

  return {
    lookupKey,
    partnerId: lookupKey,
    user: null as UserRow,
  };
}

let __reserveContextCache: { data: any; expiry: number } | null = null;
const RESERVE_CACHE_TTL = 60 * 1000;

async function loadReserveContext() {
  if (__reserveContextCache && __reserveContextCache.expiry > Date.now()) {
    return __reserveContextCache.data;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [usersRes, claimsRes] = await Promise.all([
    supabaseServer
      .from("users")
      .select("partnerId, platform, trust_score, balance, premium_until")
      .not("partnerId", "is", null)
      .order("last_seen", { ascending: false })
      .limit(1500)
      .abortSignal(AbortSignal.timeout(15000)) as any,
    supabaseServer
      .from("claims")
      .select("*")
      .gte("processed_at", since)
      .abortSignal(AbortSignal.timeout(15000)) as any,
  ]);

  const users = usersRes.data || [];
  const claims = claimsRes.data || [];
  const reservePool = calculateReservePool(
    users.reduce((sum, user: any) => sum + Number(user.balance || 0), 0)
  );

  const result = {
    users,
    claims,
    reservePool,
    activeWorkers: Math.max(1, users.length || 1),
  };

  __reserveContextCache = { data: result, expiry: Date.now() + RESERVE_CACHE_TTL };
  return result;
}

async function deriveSignalSnapshot(lat: number, lon: number) {
  const [liveWeather, liveAqi, liveTraffic] = await Promise.all([
    fetchLiveWeather(lat, lon),
    fetchLiveAqi(lat, lon),
    fetchLiveTraffic(lat, lon)
  ]);

  const weather = liveWeather || buildFallbackWeather(lat, lon);
  const aqi = liveAqi || buildFallbackAqi(lat, lon);
  const traffic = liveTraffic || buildFallbackTraffic(lat, lon);

  const tempC = Number(((weather.main?.temp || 273.15) - 273.15).toFixed(1));
  const weatherScore =
    weather.weather?.[0]?.main === "Rain"
      ? 0.88
      : tempC >= 37
        ? 0.62
        : weather.weather?.[0]?.main === "Clouds"
          ? 0.35
          : 0.18;
  const aqiScore = clamp((aqi.aqi || 0) / 260, 0, 1);
  const trafficScore = clamp((traffic.jamFactor || 0) / 10, 0, 1);

  return {
    weather,
    aqi,
    traffic,
    tempC,
    weatherScore,
    aqiScore,
    trafficScore,
  };
}

function deriveLikelyTrigger(snapshot: any, claimVelocity: number) {
  const candidates = [
    { trigger: "heavy_rain_flood", score: snapshot.weatherScore },
    { trigger: "severe_aqi", score: snapshot.aqiScore },
    { trigger: "civic_disruption", score: claimVelocity },
    { trigger: "platform_outage", score: claimVelocity * 0.72 },
    { trigger: "extreme_heat", score: snapshot.tempC >= 37 ? 0.7 : snapshot.tempC >= 33 ? 0.4 : 0.18 },
  ] as const;

  return [...candidates].sort((left, right) => right.score - left.score)[0];
}

function buildHorizonForecast(input: {
  hours: number;
  hourlyRate: number;
  incomeLossPct: number;
  riskScore: number;
  reservePool: number;
  activeWorkers: number;
  triggerWeight: number;
}) {
  const earningsAtRisk = roundAmount(
    input.hourlyRate * input.hours * input.incomeLossPct * (0.7 + input.riskScore * 0.3)
  );
  const pmax = calculatePmax({
    calculatedPayout: earningsAtRisk * 0.7,
    reservePool: input.reservePool,
    activeWorkers: input.activeWorkers,
    triggerWeight: input.triggerWeight,
  });

  return {
    label: `${input.hours}h`,
    hours: input.hours,
    earnings_at_risk: earningsAtRisk,
    suggested_payout: pmax.finalPayout,
    disruption_probability: Number((0.22 + input.riskScore * 0.68).toFixed(2)),
    p_max: pmax.p_max,
    circuit_breaker_active: pmax.circuit_breaker_active,
  };
}

export async function buildProtectionForecast(input: {
  partnerId?: string | null;
  lat?: number | string | null;
  lon?: number | string | null;
}) {
  const lat = toNumber(input.lat, 12.9716);
  const lon = toNumber(input.lon, 77.5946);
  const [user, reserveContext, snapshot] = await Promise.all([
    loadUser(input.partnerId), 
    loadReserveContext(),
    deriveSignalSnapshot(lat, lon)
  ]);
  const claimVelocity = clamp((reserveContext.claims.length || 0) / 18, 0, 1);
  const likelyTrigger = deriveLikelyTrigger(snapshot, claimVelocity);
  const riskScore = clamp(
    snapshot.weatherScore * 0.38 +
      snapshot.aqiScore * 0.22 +
      snapshot.trafficScore * 0.18 +
      claimVelocity * 0.22,
    0,
    1
  );

  const weeklyPremium = calculateWeeklyPremium({
    persona: user?.platform,
    trustScore: user?.trust_score ?? 0.5,
    zoneRisk: riskScore,
    season: likelyTrigger.trigger === "heavy_rain_flood" ? "monsoon" : undefined,
    weatherSeverity: snapshot.weatherScore,
    triggerType: likelyTrigger.trigger,
  });

  const payoutQuote = calculateZeroTouchPayout({
    persona: user?.platform,
    triggerType: likelyTrigger.trigger,
    declaredEarnings: user?.declared_earnings ?? user?.balance ?? 650,
    reservePool: reserveContext.reservePool,
    activeWorkers: reserveContext.activeWorkers,
    triggerWeight: 0.8 + riskScore * 0.35,
  });

  const confidence = Number((0.44 + riskScore * 0.5).toFixed(2));
  const horizons = FORECAST_HOURS.map((hours) =>
    buildHorizonForecast({
      hours,
      hourlyRate: payoutQuote.hourly_rate,
      incomeLossPct: payoutQuote.income_loss_pct,
      riskScore,
      reservePool: reserveContext.reservePool,
      activeWorkers: reserveContext.activeWorkers,
      triggerWeight: confidence,
    })
  );

  const recommendation =
    likelyTrigger.trigger === "heavy_rain_flood"
      ? "Keep rain-linked claims on zero-touch watch and reduce late-evening high-density routes."
      : likelyTrigger.trigger === "severe_aqi"
        ? "Air-quality pressure is climbing. Favor shorter loops and maintain assisted review readiness."
        : "Exposure is manageable, but reserve-aware release logic should stay primed for assisted flow.";

  return {
    success: true,
    partnerId: input.partnerId || null,
    worker_platform: normalizePersonaLabel(user?.platform),
    trust_score: Number((toNumber(user?.trust_score, 0.5) > 1
      ? toNumber(user?.trust_score, 0.5) / 1000
      : toNumber(user?.trust_score, 0.5)).toFixed(3)),
    likely_trigger: likelyTrigger.trigger,
    severity: riskScore >= 0.7 ? "elevated" : riskScore >= 0.45 ? "watch" : "stable",
    confidence,
    risk_score: Number(riskScore.toFixed(3)),
    premium: {
      weekly: weeklyPremium.weekly_premium,
      risk_tier: weeklyPremium.risk_tier,
      season: weeklyPremium.season,
    },
    payout: {
      readiness: confidence >= 0.72 ? "zero-touch ready" : "assisted preferred",
      suggested_final_payout: payoutQuote.final_payout,
      p_max: payoutQuote.p_max,
      circuit_breaker_active: payoutQuote.circuit_breaker_active,
    },
    horizons,
    shield_mode: {
      headline:
        likelyTrigger.trigger === "heavy_rain_flood"
          ? "Rain-linked exposure is forming across the next delivery window."
          : "Protection posture is shifting with live disruption pressure.",
      recommendation,
    },
    signals: {
      weather: {
        main: snapshot.weather.weather?.[0]?.main || "Clear",
        description: snapshot.weather.weather?.[0]?.description || "stable",
        temp_c: snapshot.tempC,
        humidity: snapshot.weather.main?.humidity || 0,
        score: Number(snapshot.weatherScore.toFixed(2)),
        provenance: snapshot.weather.provenance || "Simulator",
      },
      aqi: {
        value: snapshot.aqi.aqi,
        score: Number(snapshot.aqiScore.toFixed(2)),
        provenance: snapshot.aqi.provenance || "Simulator",
      },
      traffic: {
        jam_factor: snapshot.traffic.jamFactor,
        score: Number(snapshot.trafficScore.toFixed(2)),
        provenance: snapshot.traffic.provenance || "Simulator",
      },
      live_claim_velocity: reserveContext.claims.length,
    },
  };
}

export function buildDeviceTrustReport(payload: Record<string, any>) {
  const nativeApp = Boolean(payload.nativeApp);
  const biometricsAvailable = Boolean(payload.biometricsAvailable);
  const secureStorageReady = Boolean(payload.secureStorageReady);
  const pushReady = Boolean(payload.pushReady);
  const locationPermission = String(payload.locationPermission || "prompt");
  const faceMatchDrift = clamp(toNumber(payload.faceMatchDrift, 0.08), 0, 1);

  let score = 0.24;
  if (nativeApp) score += 0.18;
  if (biometricsAvailable) score += 0.2;
  if (secureStorageReady) score += 0.15;
  if (pushReady) score += 0.1;
  if (locationPermission === "granted") score += 0.13;
  if (locationPermission === "prompt") score += 0.05;
  score -= faceMatchDrift * 0.18;

  const normalizedScore = clamp(score, 0, 1);
  const flags: string[] = [];

  if (!nativeApp) flags.push("web-session-only");
  if (!biometricsAvailable) flags.push("biometrics-unavailable");
  if (!secureStorageReady) flags.push("secure-storage-missing");
  if (locationPermission !== "granted") flags.push("location-not-granted");
  if (faceMatchDrift >= 0.35) flags.push("face-match-drift");

  return {
    success: true,
    trust_score: Number(normalizedScore.toFixed(3)),
    tier: normalizedScore >= 0.78 ? "trusted" : normalizedScore >= 0.54 ? "review" : "elevated-risk",
    flags,
    actions: [
      !biometricsAvailable ? "Enable device biometrics before high-value claims." : null,
      locationPermission !== "granted" ? "Grant precise location to improve zero-touch confidence." : null,
      !pushReady ? "Register push notifications for payout alerts." : null,
    ].filter(Boolean),
  };
}

function calculateProofOfHustle(claims: any[], platform: string) {
  if (!claims || claims.length < 3) {
    return {
      score: 0.7,
      tier: "new",
      label: "Building History",
      discount_eligible: false,
      behavioral_analysis: "Not enough claim history to calculate hustler score"
    };
  }

  const weatherTriggers = ['heavy_rain', 'flood', 'storm', 'monsoon'];
  const lightRainTriggers = ['light_rain', 'drizzle'];
  
  const lightRainClaims = claims.filter((c: any) => 
    lightRainTriggers.some((t: string) => c.trigger_type?.toLowerCase().includes(t)) ||
    c.type?.toLowerCase().includes('rain')
  );
  
  const heavyRainClaims = claims.filter((c: any) =>
    weatherTriggers.some((t: string) => c.trigger_type?.toLowerCase().includes(t))
  );

  const lightRainClaimCount = lightRainClaims.length;
  const heavyRainClaimCount = heavyRainClaims.length;
  const totalClaimCount = claims.length;

  let hustleScore = 0.5;

  if (totalClaimCount > 0) {
    const claimRateDuringLightRain = lightRainClaimCount / totalClaimCount;
    
    if (claimRateDuringLightRain < 0.2) {
      hustleScore += 0.3;
    } else if (claimRateDuringLightRain < 0.4) {
      hustleScore += 0.1;
    } else {
      hustleScore -= 0.1;
    }

    if (heavyRainClaimCount > 0 && lightRainClaimCount === 0) {
      hustleScore += 0.15;
    }

    if (heavyRainClaimCount > 3) {
      hustleScore -= 0.1;
    }

    const recentClaims = claims.slice(0, 5);
    const recentClaimCount = recentClaims.length;
    if (recentClaimCount > 0) {
      const recentLightRain = recentClaims.filter((c: any) => 
        lightRainTriggers.some((t: string) => c.trigger_type?.toLowerCase().includes(t))
      ).length;
      
      if (recentLightRain === 0 && recentClaimCount > 0) {
        hustleScore += 0.1;
      }
    }
  }

  hustleScore = Math.max(0, Math.min(1, hustleScore));

  let tier: string;
  let label: string;
  let discountEligible = false;

  if (hustleScore >= 0.8) {
    tier = "platinum";
    label = "Certified Hustler";
    discountEligible = true;
  } else if (hustleScore >= 0.65) {
    tier = "gold";
    label = "Active Worker";
    discountEligible = true;
  } else if (hustleScore >= 0.5) {
    tier = "silver";
    label = "Moderate Activity";
  } else {
    tier = "bronze";
    label = "Low Activity";
  }

  return {
    score: Number(hustleScore.toFixed(3)),
    tier,
    label,
    discount_eligible: discountEligible,
    discount_percent: discountEligible ? (tier === "platinum" ? 25 : tier === "gold" ? 20 : 15) : 0,
    behavioral_analysis: {
      claims_during_light_rain: lightRainClaimCount,
      claims_during_heavy_rain: heavyRainClaimCount,
      total_claims: totalClaimCount,
      hustler_pattern: lightRainClaimCount < (totalClaimCount * 0.3) 
        ? "Files claims primarily during severe weather, not minor drizzle"
        : "Files claims during various weather conditions"
    },
    weekly_discount_estimate: discountEligible 
      ? Math.round(58 * (tier === "platinum" ? 0.25 : tier === "gold" ? 0.2 : 0.15))
      : 0
  };
}

export async function buildTrustPassport(partnerId?: string | null) {
  const user = await loadUser(partnerId);
  if (!user) {
    return {
      success: true,
      partnerId: partnerId || null,
      trust_score: 0,
      tier: "unverified",
      overview: {
        trust_score: 0,
        trend: "No worker account linked yet.",
        tier: "unverified",
      },
      verification: {
        face_verified: false,
        aadhaar_verified: false,
        profile_complete: false,
        confidence: 0,
      },
      payout_history: {
        approved_count: 0,
        total_paid: 0,
        payout_reliability: 0,
      },
      platform_consistency: {
        platform: "Unknown",
        consistency_score: 0,
        posture: "No activity",
      },
      anomaly_flags: [],
      recommendation: "Complete worker onboarding to generate a live trust passport.",
      ledger: [],
    };
  }

  const [claimsRes, txRes] = await Promise.all([
    supabaseServer.from("claims").select("*").eq("worker_id", user.partnerId).order("processed_at", { ascending: false }).limit(12),
    supabaseServer.from("transactions").select("*").eq("worker_id", user.partnerId).order("created_at", { ascending: false }).limit(12),
  ]);

  const claims = claimsRes.data || [];
  const transactions = txRes.data || [];
  const approvedClaims = claims.filter((claim: any) => claim.status === "approved");
  const rejectedClaims = claims.filter((claim: any) => claim.status === "rejected");
  const trustScore = normalizeTrustScore(user.trust_score);
  const verificationConfidence = clamp(
    (user.avatar_url ? 0.32 : 0) +
      (user.face_descriptor || user.face_descriptor_json ? 0.2 : 0) +
      ((user.aadhaarVerified || user.aadhaar_verified || user.aadhaar_number) ? 0.22 : 0) +
      (user.phone ? 0.14 : 0) +
      (user.platform ? 0.12 : 0),
    0,
    1
  );
  const payoutReliability = clamp(
    approvedClaims.length / Math.max(1, approvedClaims.length + rejectedClaims.length),
    0,
    1
  );
  const platformConsistency = clamp(
    0.48 +
      (user.platform ? 0.18 : 0) +
      Math.min(approvedClaims.length, 5) * 0.05 +
      (transactions.some((tx: any) => tx.type === "credit") ? 0.08 : 0) -
      Math.min(rejectedClaims.length, 3) * 0.04,
    0,
    1
  );
  const anomalyFlags = [
    verificationConfidence < 0.58 ? "Verification confidence below autonomous threshold" : null,
    rejectedClaims.length >= 3 ? "Frequent assisted or rejected claim posture" : null,
    !user.avatar_url ? "Missing persistent face capture" : null,
    !(user.aadhaarVerified || user.aadhaar_verified || user.aadhaar_number) ? "KYC trace incomplete" : null,
  ].filter(Boolean);

  const tier =
    trustScore >= 0.82 && verificationConfidence >= 0.74
      ? "trusted"
      : trustScore >= 0.6
        ? "review"
        : "elevated-risk";

  // Proof of Hustle - Behavioral Risk Analysis
  const proofOfHustle = calculateProofOfHustle(claims, user.platform);
  
  const totalPaid = approvedClaims.reduce((sum: number, claim: any) => sum + Number(claim.payout_inr || 0), 0);

  return {
    success: true,
    partnerId: user.partnerId,
    trust_score: Number(trustScore.toFixed(3)),
    tier,
    overview: {
      trust_score: roundAmount(trustScore * 1000),
      trend:
        approvedClaims.length >= rejectedClaims.length
          ? "Trust posture is compounding through verified claims and clean payout behavior."
          : "Trust posture is still recovering from recent assisted or rejected events.",
      tier,
    },
    verification: {
      face_verified: Boolean(user.avatar_url || user.face_descriptor || user.face_descriptor_json),
      aadhaar_verified: Boolean(user.aadhaarVerified || user.aadhaar_verified || user.aadhaar_number),
      profile_complete: Boolean(user.full_name && user.phone && user.platform),
      confidence: Number(verificationConfidence.toFixed(2)),
    },
    payout_history: {
      approved_count: approvedClaims.length,
      rejected_count: rejectedClaims.length,
      total_paid: roundAmount(totalPaid),
      payout_reliability: Number(payoutReliability.toFixed(2)),
      last_payout_at: approvedClaims[0]?.processed_at || null,
    },
    platform_consistency: {
      platform: normalizePersonaLabel(user.platform),
      consistency_score: Number(platformConsistency.toFixed(2)),
      posture:
        platformConsistency >= 0.8
          ? "High platform consistency"
          : platformConsistency >= 0.62
            ? "Stable cross-shift behavior"
            : "Needs more activity history",
    },
    anomaly_flags: anomalyFlags,
    proof_of_hustle: proofOfHustle,
    recommendation:
      anomalyFlags.length === 0
        ? "Passport is clean. Keep biometrics, precise location, and payout alerts active to preserve zero-touch eligibility."
        : "Resolve flagged verification and continuity gaps to improve autonomous payout confidence.",
    ledger: claims.slice(0, 4).map((claim: any) => ({
      id: claim.claim_id_str || String(claim.id),
      status: claim.status,
      amount: roundAmount(Number(claim.payout_inr || 0)),
      type: claim.type || "Claim",
      time: formatRelativeTime(claim.processed_at || claim.created_at),
    })),
  };
}

export async function buildPayoutExplanation(claimId: string) {
  let claim =
    (await supabaseServer.from("claims").select("*").eq("claim_id_str", claimId).maybeSingle()).data || null;

  if (!claim) {
    const numericId = Number(claimId);
    if (Number.isFinite(numericId)) {
      claim = (await supabaseServer.from("claims").select("*").eq("id", numericId).maybeSingle()).data || null;
    }
  }

  if (!claim) {
    throw new Error("Claim not found");
  }

  const [user, reserveContext] = await Promise.all([
    loadUser(claim.worker_id),
    loadReserveContext(),
  ]);

  const triggerType = claim.jep_data?.trigger_type || claim.type || claim.reason || "heavy_rain_flood";
  const payoutQuote = calculateZeroTouchPayout({
    persona: user?.platform,
    triggerType,
    declaredEarnings: user?.declared_earnings ?? user?.balance ?? 650,
    earningsTier: inferEarningsTier({
      persona: user?.platform,
      declaredEarnings: user?.declared_earnings ?? user?.balance ?? 650,
    }),
    reservePool: reserveContext.reservePool,
    activeWorkers: reserveContext.activeWorkers,
    triggerWeight: 1,
  });

  const settledAmount = roundAmount(Number(claim.payout_inr || claim.amount || payoutQuote.final_payout));
  const confidenceScore = Number(
    toNumber(claim.jep_data?.confidence_score ?? claim.jep_data?.confidence ?? 0.84, 0.84).toFixed(2)
  );

  return {
    success: true,
    claim_id: claim.claim_id_str || String(claim.id),
    worker_id: claim.worker_id,
    status: claim.status || "processing",
    confidence_score: confidenceScore,
    signal_chain: [
      {
        stage: "Event signal",
        detail: `${triggerType} was accepted as the dominant disruption pattern.`,
      },
      {
        stage: "Income loss",
        detail: `Rs ${payoutQuote.hourly_rate}/hr × ${(payoutQuote.income_loss_pct * 100).toFixed(0)}% × ${payoutQuote.duration_hours}h`,
      },
      {
        stage: "Replacement ratio",
        detail: "70% of estimated income loss routed toward the payout rail.",
      },
      {
        stage: "Reserve guardrail",
        detail: payoutQuote.circuit_breaker_active
          ? `Pmax reduced the release to Rs ${payoutQuote.final_payout}.`
          : `Release cleared under the current Pmax cap of Rs ${payoutQuote.p_max}.`,
      },
    ],
    breakdown: {
      persona: normalizePersonaLabel(user?.platform),
      trigger_kind: payoutQuote.trigger_kind,
      hourly_rate: payoutQuote.hourly_rate,
      income_loss_pct: payoutQuote.income_loss_pct,
      duration_hours: payoutQuote.duration_hours,
      income_lost: payoutQuote.income_lost,
      calculated_payout: payoutQuote.calculated_payout,
      p_max: payoutQuote.p_max,
      final_payout: payoutQuote.final_payout,
      settled_amount: settledAmount,
      circuit_breaker_active: payoutQuote.circuit_breaker_active,
    },
    graph: [
      { label: "Income lost", value: payoutQuote.income_lost },
      { label: "70% replacement", value: payoutQuote.calculated_payout },
      { label: "Pmax cap", value: payoutQuote.p_max },
      { label: "Final payout", value: settledAmount || payoutQuote.final_payout },
    ],
    narrative: `Claim ${claim.claim_id_str || claim.id} moved through the ${claim.status || "processing"} path with ${Math.round(
      confidenceScore * 100
    )}% confidence and a reserve-aware final payout of Rs ${settledAmount || payoutQuote.final_payout}.`,
  };
}

export async function buildReserveProjection() {
  const { users, claims, reservePool, activeWorkers } = await loadReserveContext();
  const burnToday = claims.reduce((sum, claim: any) => sum + Number(claim.payout_inr || 0), 0);
  const avgClaim = claims.length > 0 ? burnToday / claims.length : 0;
  const activePolicies = users.filter((user: any) => {
    if (!user.premium_until) return false;
    return new Date(user.premium_until).getTime() > Date.now();
  }).length;

  const pmax = calculatePmax({
    calculatedPayout: Math.max(avgClaim, 450),
    reservePool,
    activeWorkers,
    triggerWeight: 1,
  });

  const burnRatePerDay = burnToday || activeWorkers * 45;
  const runwayDays = burnRatePerDay > 0 ? reservePool / burnRatePerDay : 365;
  const horizons = [
    { label: "24h", projected_reserve: Math.max(0, reservePool - burnRatePerDay) },
    { label: "72h", projected_reserve: Math.max(0, reservePool - burnRatePerDay * 3) },
    { label: "7d", projected_reserve: Math.max(0, reservePool - burnRatePerDay * 7) },
  ].map((item) => ({
    ...item,
    projected_reserve: roundAmount(item.projected_reserve),
  }));

  return {
    success: true,
    reserve_pool: roundAmount(reservePool),
    active_workers: activeWorkers,
    active_policies: activePolicies,
    burn_today: roundAmount(burnToday),
    burn_rate_per_day: roundAmount(burnRatePerDay),
    runway_days: Number(runwayDays.toFixed(1)),
    p_max: pmax.p_max,
    circuit_breaker_active: pmax.circuit_breaker_active,
    reserve_guardrail: pmax.reserve_guardrail,
    horizons,
    stress_scenarios: [
      {
        label: "Monsoon surge",
        workers_impacted: Math.round(activeWorkers * 0.12),
        projected_payout_load: roundAmount(burnRatePerDay * 1.8),
      },
      {
        label: "AQI lockup day",
        workers_impacted: Math.round(activeWorkers * 0.08),
        projected_payout_load: roundAmount(burnRatePerDay * 1.35),
      },
      {
        label: "Platform outage cluster",
        workers_impacted: Math.round(activeWorkers * 0.18),
        projected_payout_load: roundAmount(burnRatePerDay * 2.1),
      },
    ],
  };
}

export async function buildOperationalFreshness() {
  const [claimsRes, txRes, alertsRes, usersRes] = await Promise.all([
    supabaseServer
      .from("claims")
      .select("status, created_at, processed_at, payout_inr")
      .order("processed_at", { ascending: false })
      .limit(120),
    supabaseServer
      .from("transactions")
      .select("type, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(120),
    supabaseServer
      .from("alerts")
      .select("status, created_at, type, severity")
      .order("created_at", { ascending: false })
      .limit(80),
    supabaseServer
      .from("users")
      .select("partnerId, platform, last_lat, last_lng, premium_until, balance")
      .limit(220),
  ]);

  const claims = claimsRes.data || [];
  const transactions = txRes.data || [];
  const alerts = alertsRes.data || [];
  const users = usersRes.data || [];
  const credits = transactions.filter((tx: any) => String(tx.type || "").toLowerCase() === "credit");
  const openAlerts = alerts.filter(
    (alert: any) => !["dismissed", "resolved", "blocked"].includes(String(alert.status || "").toLowerCase())
  );
  const approvedClaims = claims.filter((claim: any) => String(claim.status || "").toLowerCase() === "approved");
  const assistedClaims = claims.filter((claim: any) =>
    ["processing", "pending", "review", "assisted", "needs_review"].includes(
      String(claim.status || "").toLowerCase()
    )
  );
  const disputedClaims = claims.filter((claim: any) =>
    ["disputed", "rejected", "escalated"].includes(String(claim.status || "").toLowerCase())
  );
  const telemetryWorkers = users.filter((user: any) => user.last_lat && user.last_lng);
  const telemetryCoverage = telemetryWorkers.length / Math.max(1, users.length);

  const claimsFreshnessMinutes = minutesSince(latestTimestamp(claims, ["processed_at", "created_at"]), 8);
  const payoutsFreshnessMinutes = minutesSince(latestTimestamp(credits, ["created_at"]), 10);
  const alertsFreshnessMinutes = minutesSince(latestTimestamp(alerts, ["created_at"]), 14);
  const telemetryFreshnessMinutes =
    telemetryCoverage >= 0.7 ? 2 : telemetryCoverage >= 0.45 ? 6 : telemetryCoverage >= 0.2 ? 11 : 19;
  const forecastFreshnessMinutes = 1;

  const services = [
    {
      id: "claims-decision",
      label: "Claims decision rail",
      freshness_minutes: claimsFreshnessMinutes,
      status: freshnessState(claimsFreshnessMinutes, 5, 14),
      last_event: formatRelativeTime(
        new Date(Date.now() - claimsFreshnessMinutes * 60000).toISOString()
      ),
      metric: `${approvedClaims.length} autonomous / ${assistedClaims.length} assisted`,
      summary: "Decision engine flow is tracking worker-triggered and zero-touch claims in one queue.",
    },
    {
      id: "payout-ledger",
      label: "Payout ledger",
      freshness_minutes: payoutsFreshnessMinutes,
      status: freshnessState(payoutsFreshnessMinutes, 4, 12),
      last_event: formatRelativeTime(
        new Date(Date.now() - payoutsFreshnessMinutes * 60000).toISOString()
      ),
      metric: `${credits.length} settlement records`,
      summary: "Wallet credits and release traces remain aligned with the reserve rail.",
    },
    {
      id: "fraud-mesh",
      label: "Fraud mesh",
      freshness_minutes: alertsFreshnessMinutes,
      status: freshnessState(alertsFreshnessMinutes, 7, 18),
      last_event: formatRelativeTime(
        new Date(Date.now() - alertsFreshnessMinutes * 60000).toISOString()
      ),
      metric: `${openAlerts.length} open investigations`,
      summary: "Correlated anomaly clusters are feeding operator review without blocking the healthy lane.",
    },
    {
      id: "worker-telemetry",
      label: "Worker telemetry",
      freshness_minutes: telemetryFreshnessMinutes,
      status: freshnessState(telemetryFreshnessMinutes, 6, 15),
      last_event: formatRelativeTime(
        new Date(Date.now() - telemetryFreshnessMinutes * 60000).toISOString()
      ),
      metric: `${Math.round(telemetryCoverage * 100)}% live location coverage`,
      summary: "Field exposure posture is derived from currently reporting rider devices and H3 risk surfaces.",
    },
    {
      id: "forecast-engine",
      label: "Forecast engine",
      freshness_minutes: forecastFreshnessMinutes,
      status: freshnessState(forecastFreshnessMinutes, 3, 8),
      last_event: "Just now",
      metric: "2h / 6h / 24h horizons",
      summary: "Protection Digital Twin and Shield Mode are refreshed at request time for operator use.",
    },
  ];

  const payoutSuccessRate = clamp(
    credits.length / Math.max(1, credits.length + disputedClaims.length),
    0,
    1
  );
  const avgReleaseSeconds = roundAmount(
    clamp(68 + assistedClaims.length * 3 + openAlerts.length * 2 - approvedClaims.length * 0.4, 42, 184)
  );
  const straightThroughPct = clamp(
    approvedClaims.length / Math.max(1, approvedClaims.length + assistedClaims.length + disputedClaims.length),
    0,
    1
  );

  const queues = [
    {
      id: "autonomous",
      label: "Autonomous claims",
      count: approvedClaims.length,
      posture: approvedClaims.length >= assistedClaims.length ? "fluid" : "watch",
      target_sla: "< 90 sec",
      breach_risk: approvedClaims.length >= assistedClaims.length ? "low" : "medium",
      summary: "High-confidence claims that can clear without human intervention.",
    },
    {
      id: "assisted",
      label: "Assisted review",
      count: assistedClaims.length,
      posture: assistedClaims.length > 18 ? "elevated" : assistedClaims.length > 8 ? "watch" : "stable",
      target_sla: "< 15 min",
      breach_risk: assistedClaims.length > 18 ? "high" : assistedClaims.length > 8 ? "medium" : "low",
      summary: "Claims requiring operator review because the confidence band dipped below zero-touch certainty.",
    },
    {
      id: "disputes",
      label: "Dispute backlog",
      count: disputedClaims.length,
      posture: disputedClaims.length > 8 ? "watch" : "stable",
      target_sla: "< 24h",
      breach_risk: disputedClaims.length > 10 ? "high" : disputedClaims.length > 4 ? "medium" : "low",
      summary: "Escalated or rejected claims waiting for deeper evidence or adjudication.",
    },
    {
      id: "fraud",
      label: "Fraud investigations",
      count: openAlerts.length,
      posture: openAlerts.length > 10 ? "elevated" : openAlerts.length > 5 ? "watch" : "stable",
      target_sla: "< 30 min triage",
      breach_risk: openAlerts.length > 10 ? "high" : openAlerts.length > 5 ? "medium" : "low",
      summary: "Cross-signal anomaly clusters routed into the mesh without slowing the healthy payout path.",
    },
  ];

  const healthyServices = services.filter((service) => service.status === "healthy").length;
  const watchServices = services.filter((service) => service.status === "watch").length;
  const staleServices = services.filter((service) => service.status === "stale").length;

  return {
    success: true,
    refreshed_at: new Date().toISOString(),
    summary: {
      healthy_services: healthyServices,
      watch_services: watchServices,
      stale_services: staleServices,
      overall_posture: staleServices > 0 ? "watch" : watchServices > 1 ? "balanced" : "healthy",
    },
    services,
    queues,
    rails: {
      straight_through_pct: Number((straightThroughPct * 100).toFixed(1)),
      assisted_pct: Number((Math.max(0, 1 - straightThroughPct) * 100).toFixed(1)),
      avg_release_seconds: avgReleaseSeconds,
      payout_success_rate: Number((payoutSuccessRate * 100).toFixed(1)),
    },
    telemetry: {
      workers_reporting: telemetryWorkers.length,
      total_workers: users.length,
      coverage_pct: Number((telemetryCoverage * 100).toFixed(1)),
    },
  };
}

export async function buildPartnerAnalytics() {
  const [usersRes, claimsRes] = await Promise.all([
    supabaseServer.from("users").select("partnerId, platform, trust_score, premium_until"),
    supabaseServer.from("claims").select("worker_id, payout_inr, status"),
  ]);

  const users = usersRes.data || [];
  const claims = claimsRes.data || [];
  const groups = new Map<string, { workers: number; activePolicies: number; claims: number; payout: number; trustTotal: number }>();

  users.forEach((user: any) => {
    const key = normalizePersonaLabel(user.platform);
    const bucket = groups.get(key) || {
      workers: 0,
      activePolicies: 0,
      claims: 0,
      payout: 0,
      trustTotal: 0,
    };
    bucket.workers += 1;
    bucket.trustTotal += toNumber(user.trust_score, 0.5) > 1 ? toNumber(user.trust_score, 0.5) / 1000 : toNumber(user.trust_score, 0.5);
    if (user.premium_until && new Date(user.premium_until).getTime() > Date.now()) {
      bucket.activePolicies += 1;
    }
    groups.set(key, bucket);
  });

  claims.forEach((claim: any) => {
    const worker = users.find((user: any) => user.partnerId === claim.worker_id);
    const key = normalizePersonaLabel(worker?.platform);
    const bucket = groups.get(key);
    if (!bucket) return;
    bucket.claims += 1;
    bucket.payout += Number(claim.payout_inr || 0);
  });

  const platforms = Array.from(groups.entries()).map(([platform, bucket]) => ({
    platform,
    workers: bucket.workers,
    active_policies: bucket.activePolicies,
    coverage_penetration: Number((bucket.activePolicies / Math.max(1, bucket.workers)).toFixed(2)),
    claims: bucket.claims,
    average_payout: roundAmount(bucket.payout / Math.max(1, bucket.claims)),
    average_trust_score: Number((bucket.trustTotal / Math.max(1, bucket.workers)).toFixed(3)),
  }));

  return {
    success: true,
    totals: {
      workers: users.length,
      claims: claims.length,
      active_policies: platforms.reduce((sum, platform) => sum + platform.active_policies, 0),
    },
    platforms,
  };
}

export async function buildFraudMesh() {
  const [alertsRes, claimsRes, usersRes] = await Promise.all([
    supabaseServer.from("alerts").select("*").order("created_at", { ascending: false }).limit(40),
    supabaseServer.from("claims").select("*").order("processed_at", { ascending: false }).limit(60),
    supabaseServer.from("users").select("partnerId, platform, trust_score, last_lat, last_lng, avatar_url").limit(80),
  ]);

  const users = usersRes.data || [];
  const claims = claimsRes.data || [];
  let alerts = alertsRes.data || [];
  let provenance: "live" | "fallback" = "live";

  if (alerts.length === 0) {
    console.warn("[FraudMesh] No live alerts found, engaging fallback dataset.");
    const { mockRiskAlerts } = await import("./fallbacks.js");
    alerts = mockRiskAlerts.map(a => ({
      ...a,
      id: `fallback-${a.id}`,
      created_at: new Date(Date.now() - (Math.random() * 24 * 36e5)).toISOString()
    }));
    provenance = "fallback";
  }

  const byType = new Map<string, { count: number; severityScore: number; alerts: any[] }>();
  alerts.forEach((alert: any) => {
    const key = String(alert.type || "Unclassified");
    const current = byType.get(key) || { count: 0, severityScore: 0, alerts: [] };
    const severity = String(alert.severity || "medium").toLowerCase();
    current.count += 1;
    current.severityScore += severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : 1;
    current.alerts.push(alert);
    byType.set(key, current);
  });

  const correlatedClusters = Array.from(byType.entries())
    .map(([type, bucket], index) => ({
      id: `cluster-${index + 1}`,
      type,
      workers_impacted: bucket.count,
      confidence: Number(clamp(0.52 + bucket.severityScore * 0.08, 0, 0.98).toFixed(2)),
      severity:
        bucket.severityScore >= 8 ? "critical" : bucket.severityScore >= 5 ? "high" : bucket.severityScore >= 3 ? "medium" : "low",
      action:
        type === "Impossible Velocity"
          ? "Force assisted review and device trust challenge."
          : type === "Biometric Mismatch"
            ? "Escalate face verification drift to identity ops."
            : "Monitor cluster density and suppress duplicate payout paths.",
      signal_count: bucket.alerts.length * 3,
    }))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

  const watchlist = alerts.slice(0, 5).map((alert: any, index: number) => {
    const user = users.find((candidate: any) => candidate.partnerId === (alert.worker_id || alert.worker));
    const trust = normalizeTrustScore(user?.trust_score);
    return {
      worker_id: user?.partnerId || alert.worker_id || alert.worker || `WRK-${2000 + index}`,
      platform: normalizePersonaLabel(user?.platform),
      risk_score: Number(clamp(0.42 + index * 0.08 + (1 - trust) * 0.24, 0, 0.98).toFixed(2)),
      reasons: [
        alert.type || "Suspicious activity",
        alert.description || "Signal correlation elevated",
      ],
      posture:
        index < 2 ? "Escalate immediately" : index < 4 ? "Monitor for duplicate payout attempts" : "Keep under watch",
      last_seen: formatRelativeTime(alert.created_at || new Date().toISOString()),
    };
  });

  const approvedClaims = claims.filter((claim: any) => claim.status === "approved").length;

  return {
    success: true,
    summary: {
      investigations_open: alerts.filter((alert: any) => !["dismissed", "blocked"].includes(String(alert.status || "").toLowerCase())).length,
      correlated_clusters: correlatedClusters.length,
      impossible_travel: alerts.filter((alert: any) => String(alert.type).includes("Velocity")).length,
      face_drift_cases: alerts.filter((alert: any) => String(alert.type).includes("Biometric")).length,
      device_mismatch_cases: alerts.filter((alert: any) => String(alert.type).includes("Account")).length,
      duplicate_claim_pressure: alerts.filter((alert: any) => String(alert.type).includes("Duplicate")).length,
      payout_surface: approvedClaims,
      data_provenance: provenance,
    },
    clusters: correlatedClusters,
    watchlist,
    timeline: alerts.slice(0, 6).map((alert: any) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity || "medium",
      description: alert.description || "Fraud mesh event detected.",
      time: formatRelativeTime(alert.created_at || new Date().toISOString()),
    })),
  };
}

export async function buildUserInbox(partnerId?: string | null) {
  const resolved = await resolveWorkerIdentity(partnerId);
  const canonicalPartnerId = resolved.partnerId || normalizeIdentityValue(partnerId);

  if (!canonicalPartnerId) {
    return { success: true, unreadCount: 0, items: [], forecastHeadline: "Connect a worker account to load the protection inbox." };
  }

  const [syncRes, forecast] = await Promise.all([
    supabaseServer.from("claims").select("*").eq("worker_id", canonicalPartnerId).order("processed_at", { ascending: false }).limit(5),
    buildProtectionForecast({ partnerId: canonicalPartnerId }),
  ]);
  const txRes = await supabaseServer
    .from("transactions")
    .select("*")
    .eq("worker_id", canonicalPartnerId)
    .order("created_at", { ascending: false })
    .limit(5);

  const claimItems = (syncRes.data || []).map((claim: any) => ({
    id: `claim-${claim.claim_id_str || claim.id}`,
    title: claim.status === "approved" ? "Payout released" : "Claim status updated",
    body:
      claim.status === "approved"
        ? `Rs ${roundAmount(Number(claim.payout_inr || 0))} moved to your wallet for ${claim.type || "verified disruption"}.`
        : `Claim ${claim.claim_id_str || claim.id} is ${claim.status || "processing"} and waiting on the next decision step.`,
    kind: claim.status === "approved" ? "payout" : "review",
    severity: claim.status === "approved" ? "success" : claim.status === "rejected" ? "warning" : "info",
    createdAt: claim.processed_at || new Date().toISOString(),
    route: "/claims",
    metadata: { claimId: claim.claim_id_str || claim.id },
  }));

  const transactionItems = (txRes.data || []).slice(0, 3).map((tx: any) => ({
    id: `txn-${tx.id}`,
    title: tx.title || "Wallet movement",
    body: `${tx.type === "credit" ? "Credit" : "Debit"} of Rs ${roundAmount(Number(tx.amount || 0))} via ${tx.via || "Nexus Core"}.`,
    kind: "wallet" as const,
    severity: tx.type === "credit" ? "success" as const : "info" as const,
    createdAt: tx.created_at || new Date().toISOString(),
    route: "/wallet",
    metadata: {},
  }));

  const items: Array<{
    id: string;
    title: string;
    body: string;
    kind: string;
    severity: string;
    createdAt: string;
    route: string;
    metadata?: Record<string, unknown>;
  }> = [
    {
      id: "forecast-headline",
      title: "Protection forecast",
      body: forecast.shield_mode.headline,
      kind: "trigger" as const,
      severity: forecast.severity === "elevated" ? "warning" as const : "info" as const,
      createdAt: new Date().toISOString(),
      route: "/inbox",
      metadata: {},
    },
    ...claimItems,
    ...transactionItems,
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((item) => ({
      ...item,
      metadata: {
        ...(item.metadata || {}),
        relative_time: formatRelativeTime(item.createdAt),
      },
    }));

  return {
    success: true,
    unreadCount: items.length,
    items,
    forecastHeadline: forecast.shield_mode.headline,
  };
}

function mapClaimRowToLedgerClaim(claim: any) {
  if (!claim) return null;

  const jep = claim.jep_data || {};
  const claimDate = claim.processed_at || claim.created_at || new Date().toISOString();
  const claimId = String(claim.claim_id_str || claim.id || "").trim();
  const amount = Number(claim.payout_inr || claim.amount || 0);
  const status = String(claim.status || "processing").toLowerCase();
  const isManual =
    String(claim.type || "").toLowerCase().includes("manual") ||
    String(claim.reason || "").toLowerCase().includes("manual");

  return {
    id: claimId,
    date: new Date(claimDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    dateISO: claimDate,
    amount,
    status,
    type: claim.type || "Disruption payout",
    reason: claim.reason || "Automatic protection trigger detected.",
    tier: isManual ? "Tier 2 (Assisted)" : "Tier 1 (Autonomous)",
    tierColor: isManual ? "text-blue-500" : "text-emerald-500",
    tierBg: isManual ? "bg-blue-500/10" : "bg-emerald-500/10",
    summary: {
      type: status,
      wordedReason:
        jep.worded_summary ||
        claim.reason ||
        (status === "approved"
          ? "Claim approved and routed into the payout rail."
          : "Claim is still moving through the protection pipeline."),
      technicalReason:
        jep.technical_reason ||
        (status === "approved"
          ? "Verified via autonomous telemetry and payout confidence checks."
          : "Awaiting additional adjudication inputs."),
      policyClauses: jep.trigger_type ? ["Clause 5.1 (Autonomous Trigger)", `${jep.trigger_type} Coverage`] : ["Clause 5.1 (Autonomous Trigger)"],
      triggers: jep.trigger_type ? [jep.trigger_type] : [],
    },
    jepData: jep,
  };
}

function mapTransactionRowToLedgerTransaction(transaction: any) {
  if (!transaction) return null;

  const createdAt = transaction.created_at || transaction.processed_at || new Date().toISOString();
  return {
    id: String(transaction.id || transaction.reference_id || "").trim(),
    reference_id: String(transaction.reference_id || transaction.id || "").trim(),
    title: transaction.title || "Wallet movement",
    desc: transaction.description || "Transaction settled through Nexus Sovereign.",
    amount: Number(transaction.amount || 0),
    type: transaction.type === "debit" ? "debit" : "credit",
    status: transaction.status || "completed",
    dateISO: createdAt,
    date:
      new Date(createdAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }) + " IST",
    via: transaction.via || "Nexus Core",
  };
}

function readSnapshotString(local: Record<string, unknown>, key: string) {
  const value = local[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSnapshotNumber(local: Record<string, unknown>, key: string) {
  const value = readSnapshotString(local, key);
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readSnapshotBoolean(local: Record<string, unknown>, key: string) {
  const value = readSnapshotString(local, key);
  if (!value) return null;
  return value === "true";
}

function readSnapshotJsonArray<T = any>(local: Record<string, unknown>, key: string) {
  const raw = readSnapshotString(local, key);
  if (!raw) return [] as T[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function compactLocalState(local: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(local).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
  );
}

export async function buildWorkerStateSnapshot(partnerId?: string | null) {
  const resolved = await resolveWorkerIdentity(partnerId);
  const canonicalPartnerId = resolved.partnerId || normalizeIdentityValue(partnerId);

  if (!canonicalPartnerId) {
    return {
      success: true,
      partnerId: null,
      snapshot: {
        version: 1,
        capturedAt: new Date().toISOString(),
        partnerId: null,
        local: {},
      },
      persisted: {
        claims: 0,
        transactions: 0,
      },
    };
  }

  const user = resolved.user || await ensureSkeletonUser(canonicalPartnerId);
  const [claimsRes, txRes] = await Promise.all([
    supabaseServer
      .from("claims")
      .select("*")
      .eq("worker_id", canonicalPartnerId)
      .order("processed_at", { ascending: false })
      .limit(40)
      .abortSignal(AbortSignal.timeout(15000)) as any,
    supabaseServer
      .from("transactions")
      .select("*")
      .eq("worker_id", canonicalPartnerId)
      .order("created_at", { ascending: false })
      .limit(40)
      .abortSignal(AbortSignal.timeout(15000)) as any,
  ]);

  if (claimsRes.error) throw claimsRes.error;
  if (txRes.error) throw txRes.error;

  const claims = (claimsRes.data || []).map(mapClaimRowToLedgerClaim).filter(Boolean);
  const transactions = (txRes.data || []).map(mapTransactionRowToLedgerTransaction).filter(Boolean);
  const paymentMethods = Array.isArray(user?.payment_methods) ? user.payment_methods : [];

  const local = compactLocalState({
    partner_id: canonicalPartnerId,
    signin_phone: user?.phone ? String(user.phone) : null,
    signin_platform: user?.platform ? String(user.platform) : null,
    specific_platform: user?.platform ? String(user.platform) : null,
    nexus_profile_name: user?.full_name ? String(user.full_name) : null,
    nexus_profile_upi: user?.payout_upi ? String(user.payout_upi) : null,
    nexus_aadhaar_number: user?.aadhaar_number ? String(user.aadhaar_number) : null,
    nexus_last_lat:
      user?.last_lat !== undefined && user?.last_lat !== null ? String(user.last_lat) : null,
    nexus_last_lng:
      user?.last_lng !== undefined && user?.last_lng !== null ? String(user.last_lng) : null,
    nexus_wallet_balance:
      user?.balance !== undefined && user?.balance !== null ? String(user.balance) : null,
    nexus_payment_methods: paymentMethods.length > 0 ? JSON.stringify(paymentMethods) : JSON.stringify([]),
    nexus_claims: JSON.stringify(claims),
    nexus_transactions: JSON.stringify(transactions),
    nexus_premium_tier: user?.premium_tier ? String(user.premium_tier) : null,
    nexus_premium_until: user?.premium_until ? String(user.premium_until) : null,
    nexus_premium_upgraded:
      user?.premium_upgraded !== undefined && user?.premium_upgraded !== null
        ? String(Boolean(user.premium_upgraded))
        : null,
  });

  return {
    success: true,
    partnerId: canonicalPartnerId,
    snapshot: {
      version: 1,
      capturedAt: new Date().toISOString(),
      partnerId: canonicalPartnerId,
      local,
    },
    persisted: {
      claims: claims.length,
      transactions: transactions.length,
    },
  };
}

export async function persistWorkerStateSnapshot(input: {
  partnerId?: string | null;
  snapshot?: { local?: Record<string, unknown>; partnerId?: string | null } | null;
  reason?: string | null;
}) {
  const requestedPartnerId =
    normalizeIdentityValue(input.partnerId) || normalizeIdentityValue(input.snapshot?.partnerId);

  if (!requestedPartnerId) {
    return {
      success: false,
      partnerId: null,
      reason: input.reason || "unspecified",
      persisted: { user_updated: false, claims_added: 0, transactions_added: 0 },
    };
  }

  try {
    const resolved = await resolveWorkerIdentity(requestedPartnerId);
    const canonicalPartnerId = resolved.partnerId || requestedPartnerId;
    const local = (input.snapshot?.local && typeof input.snapshot.local === "object"
      ? input.snapshot.local
      : {}) as Record<string, unknown>;

    const updatePayload: Record<string, any> = {
      partnerId: canonicalPartnerId,
      last_seen: new Date().toISOString()
    };
    
    // Efficient extraction
    const phone = readSnapshotString(local, "signin_phone");
    const platform = readSnapshotString(local, "specific_platform") || readSnapshotString(local, "signin_platform");
    const fullName = readSnapshotString(local, "nexus_profile_name");
    const upi = readSnapshotString(local, "nexus_profile_upi");
    const balance = readSnapshotNumber(local, "nexus_wallet_balance");

    if (phone) updatePayload.phone = phone;
    if (platform) updatePayload.platform = platform;
    if (fullName) updatePayload.full_name = fullName;
    if (upi) updatePayload.payout_upi = upi;
    if (balance !== null) updatePayload.balance = balance;

    // 1. Update user (avoid upsert null constraint for phone)
    const { error: userError } = await supabaseServer
      .from("users")
      .update(updatePayload)
      .eq("partnerId", canonicalPartnerId)
      .abortSignal(AbortSignal.timeout(15000)) as any;

    if (userError) console.warn("[Snapshot] User upsert warning:", userError.message);

    // 2. High-performance batch claims upsert
    const claims = readSnapshotJsonArray<any>(local, "nexus_claims").slice(0, 30);
    let claimsAdded = 0;
    if (claims.length > 0) {
      const claimPayloads = claims.map(c => ({
        worker_id: canonicalPartnerId,
        claim_id_str: String(c.id || c.claim_id_str || "").trim(),
        payout_inr: Number(c.amount || 0),
        status: c.status || "processing",
        type: c.type || "Disruption payout",
        processed_at: c.dateISO || new Date().toISOString()
      })).filter(p => p.claim_id_str);

      const { error: claimErr } = await supabaseServer
        .from("claims")
        .upsert(claimPayloads, { onConflict: "claim_id_str" })
        .abortSignal(AbortSignal.timeout(15000)) as any;
      
      if (!claimErr) claimsAdded = claimPayloads.length;
    }

    // 3. High-performance batch transactions upsert
    const txs = readSnapshotJsonArray<any>(local, "nexus_transactions").slice(0, 30);
    let txsAdded = 0;
    if (txs.length > 0) {
      const txPayloads = txs.map(t => ({
        worker_id: canonicalPartnerId,
        reference_id: String(t.reference_id || t.id || "").trim(),
        amount: Number(t.amount || 0),
        type: t.type === "debit" ? "debit" : "credit",
        status: t.status || "completed",
        created_at: t.dateISO || new Date().toISOString()
      })).filter(p => p.reference_id);

      const { error: txErr } = await supabaseServer
        .from("transactions")
        .upsert(txPayloads, { onConflict: "reference_id" })
        .abortSignal(AbortSignal.timeout(15000)) as any;
      
      if (!txErr) txsAdded = txPayloads.length;
    }

    return {
      success: true,
      partnerId: canonicalPartnerId,
      persisted: {
        user_updated: !userError,
        claims_added: claimsAdded,
        transactions_added: txsAdded
      }
    };
  } catch (err: any) {
    console.error("[Snapshot] Critical persistence failure:", err.message);
    return { success: false, error: err.message, persisted: { user_updated: false, claims_added: 0, transactions_added: 0 } };
  }
}

export async function buildLatestPayoutSignal(input?: {
  partnerId?: string | null;
  afterClaimId?: string | null;
}) {
  const resolved = await resolveWorkerIdentity(input?.partnerId);
  const canonicalPartnerId = resolved.partnerId || normalizeIdentityValue(input?.partnerId);

  if (!canonicalPartnerId) {
    return {
      success: true,
      has_new: false,
      partnerId: null,
      latest_claim_id: null,
      claim: null,
      transaction: null,
      balance: null,
    };
  }

  const claimsRes = await supabaseServer
    .from("claims")
    .select("*")
    .eq("worker_id", canonicalPartnerId)
    .eq("status", "approved")
    .ilike("claim_id_str", "SIM-%")
    .order("processed_at", { ascending: false })
    .limit(1);

  if (claimsRes.error) throw claimsRes.error;

  const claimRow = Array.isArray(claimsRes.data) ? claimsRes.data[0] : null;
  let txRow: any = null;
  const claimTimestamp = claimRow ? new Date(claimRow.processed_at || claimRow.created_at || 0).getTime() : 0;
  const isRecentSimulationClaim =
    Number.isFinite(claimTimestamp) && Date.now() - claimTimestamp <= 15 * 60 * 1000;

  if (claimRow && isRecentSimulationClaim) {
    const txRes = await supabaseServer
      .from("transactions")
      .select("*")
      .eq("worker_id", canonicalPartnerId)
      .eq("type", "credit")
      .or(`reference_id.eq.${claimRow.id},reference_id.eq.${claimRow.claim_id_str}`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (txRes.error) throw txRes.error;
    txRow = Array.isArray(txRes.data) ? txRes.data[0] : null;
  }

  const latestClaimId =
    claimRow && isRecentSimulationClaim ? String(claimRow.claim_id_str || claimRow.id || "").trim() : null;
  const afterClaimId = normalizeIdentityValue(input?.afterClaimId);

  return {
    success: true,
    has_new: Boolean(latestClaimId && latestClaimId !== afterClaimId),
    partnerId: canonicalPartnerId,
    latest_claim_id: latestClaimId,
    balance: resolved.user ? Number(resolved.user.balance || 0) : null,
    claim: latestClaimId ? mapClaimRowToLedgerClaim(claimRow) : null,
    transaction: latestClaimId ? mapTransactionRowToLedgerTransaction(txRow) : null,
  };
}

export async function buildScenarioStudio(input?: { scenarioType?: string | null; execute?: boolean }) {
  const reserve = await buildReserveProjection();
  const productControls = getProductControls();
  const scenarioType = String(input?.scenarioType || "monsoon-flood").toLowerCase();

  const presets: Record<string, { label: string; workerImpactRatio: number; payoutMultiplier: number }> = {
    "monsoon-flood": { label: "Monsoon flood", workerImpactRatio: 0.14, payoutMultiplier: 1.9 },
    "heatwave-corridor": { label: "Heatwave corridor", workerImpactRatio: 0.09, payoutMultiplier: 1.4 },
    "severe-aqi-day": { label: "Severe AQI day", workerImpactRatio: 0.11, payoutMultiplier: 1.55 },
    "civic-disruption-band": { label: "Civic disruption band", workerImpactRatio: 0.16, payoutMultiplier: 1.75 },
    "platform-outage-cluster": { label: "Platform outage cluster", workerImpactRatio: 0.2, payoutMultiplier: 2.05 },
  };

  const scenario = presets[scenarioType] || presets["monsoon-flood"];
  const workersImpacted = Math.round(reserve.active_workers * scenario.workerImpactRatio);
  const projectedLoad = roundAmount(reserve.burn_rate_per_day * scenario.payoutMultiplier);

  return {
    success: true,
    execute: Boolean(input?.execute),
    scenario_key: scenarioType,
    scenario: scenario.label,
    workers_impacted: workersImpacted,
    projected_payout_load: projectedLoad,
    reserve_after_24h: Math.max(0, reserve.reserve_pool - projectedLoad),
    reserve_guardrail: reserve.reserve_guardrail,
    p_max: reserve.p_max,
    runway_days_after_scenario: Number(
      ((Math.max(0, reserve.reserve_pool - projectedLoad) || 1) / Math.max(1, reserve.burn_rate_per_day)).toFixed(1)
    ),
    controls: {
      payout_corridor: productControls.payout_corridor,
      replacement_ratio: productControls.replacement_ratio,
      trigger_sensitivity:
        productControls.trigger_sensitivity === "expansive" && workersImpacted > reserve.active_workers * 0.18
          ? "standard"
          : productControls.trigger_sensitivity,
      geography_rulebook: productControls.geography_rulebook,
      review_mode: workersImpacted > reserve.active_workers * 0.14 ? "assisted + autonomous" : "autonomous preferred",
    },
    economics: {
      reserve_drawdown_pct: Number(((projectedLoad / Math.max(1, reserve.reserve_pool)) * 100).toFixed(2)),
      average_worker_payout: roundAmount(projectedLoad / Math.max(1, workersImpacted)),
      solvency_posture:
        projectedLoad > reserve.reserve_pool * 0.18
          ? "Guardrail engagement likely"
          : projectedLoad > reserve.reserve_pool * 0.1
            ? "Monitor reserve posture"
            : "Healthy release window",
    },
    audit_seed: [
      "Scenario selected in studio",
      "Projected impact model generated",
      "Reserve and Pmax constraints applied",
      input?.execute ? "Execution payload prepared for broadcast" : "Preview only - no payout broadcast executed",
    ],
  };
}

export async function buildAuditTrace() {
  const [claimsRes, txRes, alertsRes] = await Promise.all([
    supabaseServer.from("claims").select("*").order("processed_at", { ascending: false }).limit(12),
    supabaseServer.from("transactions").select("*").order("created_at", { ascending: false }).limit(12),
    supabaseServer.from("alerts").select("*").order("created_at", { ascending: false }).limit(12),
  ]);

  const traces = [
    ...(claimsRes.data || []).map((claim: any) => ({
      id: `claim-${claim.claim_id_str || claim.id}`,
      category: "claim-decision",
      title: `${claim.type || "Claim"} moved to ${claim.status || "processing"}`,
      detail: claim.jep_data?.technical_reason || claim.reason || "Claim decision trace captured.",
      actor: claim.worker_id || "worker",
      time: claim.processed_at || claim.created_at || new Date().toISOString(),
      severity:
        claim.status === "rejected" ? "warning" : claim.status === "approved" ? "success" : "info",
    })),
    ...(txRes.data || []).map((tx: any) => ({
      id: `txn-${tx.id}`,
      category: "payout-trace",
      title: tx.title || "Wallet movement recorded",
      detail: `${tx.type === "credit" ? "Credit" : "Debit"} of Rs ${roundAmount(Number(tx.amount || 0))} via ${tx.via || "Nexus Core"}.`,
      actor: tx.worker_id || "wallet-rail",
      time: tx.created_at || new Date().toISOString(),
      severity: tx.type === "credit" ? "success" : "info",
    })),
    ...(alertsRes.data || []).map((alert: any) => ({
      id: `alert-${alert.id}`,
      category: "risk-action",
      title: `${alert.type || "Risk alert"} marked ${alert.status || "open"}`,
      detail: alert.description || "Fraud/risk escalation recorded.",
      actor: alert.worker_id || alert.worker || "risk-engine",
      time: alert.created_at || new Date().toISOString(),
      severity:
        String(alert.severity || "").toLowerCase() === "critical"
          ? "critical"
          : String(alert.severity || "").toLowerCase() === "high"
            ? "warning"
            : "info",
    })),
  ]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 18)
    .map((trace) => ({
      ...trace,
      relative_time: formatRelativeTime(trace.time),
    }));

  return {
    success: true,
    total: traces.length,
    traces,
  };
}
