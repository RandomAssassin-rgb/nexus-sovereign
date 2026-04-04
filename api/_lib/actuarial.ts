export type PersonaGroup = "blinkit_zepto" | "swiggy_zomato" | "amazon_flipkart";
export type RiskTier = "low" | "medium" | "high";
export type Season = "dry" | "monsoon";
export type EarningsTier = "low" | "average" | "high";
export type DurationProfile = "minimum" | "average" | "maximum";
export type TriggerKind =
  | "heavy_rain_flood"
  | "extreme_heat"
  | "severe_aqi"
  | "civic_disruption"
  | "platform_outage";

export const PREMIUM_RANGE = {
  min: 29,
  max: 99,
  commonMin: 45,
  commonMax: 75,
  average: 58,
} as const;

export const PAYOUT_REPLACEMENT_RATIO = 0.7;
export const PAYOUT_RESERVE_RATIO = 0.15;
export const RESERVE_POOL_BUFFER = 50_000_000;

const TRUST_CURVE_EXPONENT = 1.1;

const PREMIUM_CURVES: Record<
  PersonaGroup,
  Record<Season, Record<RiskTier, { starter: number; loyal: number }>>
> = {
  blinkit_zepto: {
    dry: {
      low: { starter: 62, loyal: 34 },
      medium: { starter: 73, loyal: 46 },
      high: { starter: 84, loyal: 58 },
    },
    monsoon: {
      low: { starter: 73, loyal: 46 },
      medium: { starter: 84, loyal: 57 },
      high: { starter: 99, loyal: 74 },
    },
  },
  swiggy_zomato: {
    dry: {
      low: { starter: 51, loyal: 29 },
      medium: { starter: 58, loyal: 38 },
      high: { starter: 66, loyal: 47 },
    },
    monsoon: {
      low: { starter: 60, loyal: 39 },
      medium: { starter: 71, loyal: 48 },
      high: { starter: 82, loyal: 60 },
    },
  },
  amazon_flipkart: {
    dry: {
      low: { starter: 39, loyal: 29 },
      medium: { starter: 44, loyal: 33 },
      high: { starter: 49, loyal: 37 },
    },
    monsoon: {
      low: { starter: 50, loyal: 38 },
      medium: { starter: 57, loyal: 45 },
      high: { starter: 65, loyal: 55 },
    },
  },
};

const PERSONA_HOURLY_RATES: Record<PersonaGroup, Record<EarningsTier, number>> = {
  blinkit_zepto: {
    low: 45,
    average: 65,
    high: 90,
  },
  swiggy_zomato: {
    low: 38,
    average: 55,
    high: 75,
  },
  amazon_flipkart: {
    low: 55,
    average: 75,
    high: 110,
  },
};

const TRIGGER_LOSS_PCT: Record<TriggerKind, Record<PersonaGroup, number>> = {
  heavy_rain_flood: {
    blinkit_zepto: 1.0,
    swiggy_zomato: 0.65,
    amazon_flipkart: 0.4,
  },
  extreme_heat: {
    blinkit_zepto: 0.6,
    swiggy_zomato: 0.7,
    amazon_flipkart: 0.5,
  },
  severe_aqi: {
    blinkit_zepto: 0.8,
    swiggy_zomato: 0.75,
    amazon_flipkart: 0.6,
  },
  civic_disruption: {
    blinkit_zepto: 1.0,
    swiggy_zomato: 1.0,
    amazon_flipkart: 0.8,
  },
  platform_outage: {
    blinkit_zepto: 1.0,
    swiggy_zomato: 0.8,
    amazon_flipkart: 0.7,
  },
};

const TRIGGER_DURATIONS: Record<TriggerKind, Record<DurationProfile, number>> = {
  heavy_rain_flood: {
    minimum: 1.5,
    average: 3.5,
    maximum: 8,
  },
  extreme_heat: {
    minimum: 4,
    average: 6,
    maximum: 10,
  },
  severe_aqi: {
    minimum: 6,
    average: 9,
    maximum: 24,
  },
  civic_disruption: {
    minimum: 3,
    average: 5,
    maximum: 12,
  },
  platform_outage: {
    minimum: 0.75,
    average: 1.5,
    maximum: 4,
  },
};

function roundCurrency(value: number) {
  return Math.round(value);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeTrustScore(value: unknown, fallback = 0.5) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric > 1 ? numeric / 1000 : numeric, 0, 1);
}

export function normalizePersonaGroup(input?: string | null): PersonaGroup {
  const value = String(input || "").toLowerCase();

  if (value.includes("amazon") || value.includes("flipkart")) {
    return "amazon_flipkart";
  }

  if (value.includes("swiggy") || value.includes("zomato") || value.includes("instamart")) {
    return "swiggy_zomato";
  }

  return "blinkit_zepto";
}

export function normalizePersonaLabel(input?: string | null) {
  const group = normalizePersonaGroup(input);
  if (group === "amazon_flipkart") return "Amazon / Flipkart";
  if (group === "swiggy_zomato") return "Swiggy / Zomato";
  return "Blinkit / Zepto";
}

export function normalizeRiskTier(input?: string | number | null): RiskTier {
  if (typeof input === "string") {
    const value = input.toLowerCase();
    if (value.includes("high")) return "high";
    if (value.includes("medium") || value.includes("moderate")) return "medium";
    if (value.includes("low") || value.includes("safe")) return "low";
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    if (input >= 0.67) return "high";
    if (input >= 0.34) return "medium";
  }

  return "low";
}

export function inferSeason(input: {
  season?: string | null;
  weatherSeverity?: number | null;
  triggerType?: string | null;
}): Season {
  const explicit = String(input.season || "").toLowerCase();
  if (explicit.includes("monsoon") || explicit.includes("rain")) return "monsoon";
  if (explicit.includes("dry")) return "dry";

  const trigger = String(input.triggerType || "").toLowerCase();
  if (trigger.includes("rain") || trigger.includes("flood") || trigger.includes("monsoon")) {
    return "monsoon";
  }

  const weatherSeverity = clamp(Number(input.weatherSeverity || 0), 0, 1);
  return weatherSeverity >= 0.55 ? "monsoon" : "dry";
}

export function resolveTriggerKind(input?: string | null): TriggerKind {
  const value = String(input || "").toLowerCase();

  if (value.includes("rain") || value.includes("flood") || value.includes("monsoon")) {
    return "heavy_rain_flood";
  }
  if (value.includes("heat") || value.includes("temperature")) {
    return "extreme_heat";
  }
  if (value.includes("aqi") || value.includes("pollution") || value.includes("smog")) {
    return "severe_aqi";
  }
  if (value.includes("civic") || value.includes("riot") || value.includes("curfew") || value.includes("bandh") || value.includes("strike")) {
    return "civic_disruption";
  }
  if (value.includes("outage") || value.includes("platform")) {
    return "platform_outage";
  }

  return "heavy_rain_flood";
}

export function inferEarningsTier(input: {
  persona?: string | null;
  declaredEarnings?: number | string | null;
  tier?: string | null;
}): EarningsTier {
  const explicit = String(input.tier || "").toLowerCase();
  if (explicit === "low" || explicit === "average" || explicit === "high") {
    return explicit;
  }

  const declaredRaw =
    typeof input.declaredEarnings === "number"
      ? input.declaredEarnings
      : typeof input.declaredEarnings === "string"
        ? Number(input.declaredEarnings)
        : Number.NaN;

  if (!Number.isFinite(declaredRaw) || declaredRaw <= 0) {
    return "average";
  }

  const group = normalizePersonaGroup(input.persona);
  const rates = PERSONA_HOURLY_RATES[group];
  const inferredHourly = declaredRaw > 150 ? declaredRaw / 10 : declaredRaw;
  const entries = Object.entries(rates) as Array<[EarningsTier, number]>;

  return entries.reduce((closest, current) => {
    const [, closestRate] = closest;
    const [, currentRate] = current;
    return Math.abs(currentRate - inferredHourly) < Math.abs(closestRate - inferredHourly)
      ? current
      : closest;
  })[0];
}

export function calculateWeeklyPremium(input: {
  persona?: string | null;
  trustScore?: number | string | null;
  zoneRisk?: number | string | null;
  season?: string | null;
  weatherSeverity?: number | null;
  triggerType?: string | null;
}) {
  const personaGroup = normalizePersonaGroup(input.persona);
  const trustScore = normalizeTrustScore(input.trustScore, 0.5);
  const riskTier = normalizeRiskTier(input.zoneRisk);
  const season = inferSeason({
    season: input.season,
    weatherSeverity: input.weatherSeverity,
    triggerType: input.triggerType,
  });

  const curve = PREMIUM_CURVES[personaGroup][season][riskTier];
  const trustWeight = Math.pow(trustScore, TRUST_CURVE_EXPONENT);
  const rawPremium = curve.starter - (curve.starter - curve.loyal) * trustWeight;
  const premium = clamp(roundCurrency(rawPremium), PREMIUM_RANGE.min, PREMIUM_RANGE.max);

  return {
    premium,
    weekly_premium: premium,
    persona_group: personaGroup,
    risk_tier: riskTier,
    season,
    trust_score: Number(trustScore.toFixed(3)),
  };
}

export function calculateReservePool(totalBalance: number) {
  const safeBalance = Number.isFinite(totalBalance) ? Math.max(0, totalBalance) : 0;
  return safeBalance + RESERVE_POOL_BUFFER;
}

export function calculatePmax(input: {
  calculatedPayout?: number;
  wBase?: number;
  incomeLossPct?: number;
  reservePool: number;
  activeWorkers: number;
  triggerWeight?: number;
}) {
  const fallbackCalculatedPayout =
    Math.max(0, Number(input.wBase || 0)) * Math.max(0, Number(input.incomeLossPct || 0));
  const calculatedPayout =
    typeof input.calculatedPayout === "number" && Number.isFinite(input.calculatedPayout)
      ? Math.max(0, input.calculatedPayout)
      : fallbackCalculatedPayout;
  const triggerWeight = Math.max(0, Number(input.triggerWeight || 1));
  const activeWorkers = Math.max(1, Math.round(Number(input.activeWorkers || 1)));
  const reservePool = Math.max(0, Number(input.reservePool || 0));
  const pMax = (reservePool * PAYOUT_RESERVE_RATIO / activeWorkers) * triggerWeight;
  const finalPayout = Math.min(calculatedPayout, pMax);

  return {
    calculatedPayout: roundCurrency(calculatedPayout),
    p_max: roundCurrency(pMax),
    finalPayout: roundCurrency(finalPayout),
    reserve_guardrail: roundCurrency((reservePool * PAYOUT_RESERVE_RATIO) / activeWorkers),
    circuit_breaker_active: pMax < calculatedPayout,
    formula: "P_payout = min(calculated_payout, (B_res * 0.15 / N_active) * T_w)",
  };
}

export function calculateZeroTouchPayout(input: {
  persona?: string | null;
  triggerType?: string | null;
  declaredEarnings?: number | string | null;
  earningsTier?: EarningsTier | null;
  durationProfile?: DurationProfile;
  reservePool: number;
  activeWorkers: number;
  triggerWeight?: number;
}) {
  const personaGroup = normalizePersonaGroup(input.persona);
  const triggerKind = resolveTriggerKind(input.triggerType);
  const earningsTier = inferEarningsTier({
    persona: input.persona,
    declaredEarnings: input.declaredEarnings,
    tier: input.earningsTier || undefined,
  });
  const durationProfile = input.durationProfile || "average";
  const hourlyRate = PERSONA_HOURLY_RATES[personaGroup][earningsTier];
  const incomeLossPct = TRIGGER_LOSS_PCT[triggerKind][personaGroup];
  const durationHours = TRIGGER_DURATIONS[triggerKind][durationProfile];
  const incomeLost = hourlyRate * incomeLossPct * durationHours;
  const calculatedPayout = incomeLost * PAYOUT_REPLACEMENT_RATIO;
  const pmax = calculatePmax({
    calculatedPayout,
    reservePool: input.reservePool,
    activeWorkers: input.activeWorkers,
    triggerWeight: input.triggerWeight,
  });

  return {
    persona_group: personaGroup,
    trigger_kind: triggerKind,
    earnings_tier: earningsTier,
    hourly_rate: hourlyRate,
    income_loss_pct: Number(incomeLossPct.toFixed(2)),
    duration_hours: durationHours,
    income_lost: roundCurrency(incomeLost),
    calculated_payout: roundCurrency(calculatedPayout),
    p_max: pmax.p_max,
    final_payout: pmax.finalPayout,
    circuit_breaker_active: pmax.circuit_breaker_active,
    reserve_guardrail: pmax.reserve_guardrail,
    formula: pmax.formula,
  };
}

export function calculateCoverageCap(persona?: string | null) {
  const personaGroup = normalizePersonaGroup(persona);
  const triggerKinds: TriggerKind[] = [
    "heavy_rain_flood",
    "extreme_heat",
    "severe_aqi",
    "civic_disruption",
    "platform_outage",
  ];

  const cap = Math.max(
    ...triggerKinds.map((triggerKind) =>
      calculateZeroTouchPayout({
        persona: personaGroup,
        triggerType: triggerKind,
        earningsTier: "high",
        reservePool: Number.MAX_SAFE_INTEGER,
        activeWorkers: 1,
      }).calculated_payout
    )
  );

  return Math.round(cap / 10) * 10;
}
