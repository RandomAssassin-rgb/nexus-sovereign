// ─── PREMIUM PLAN DEFINITIONS ────────────────────────────────────────────────
// Single source of truth for all plan-based values across the app.
// Import this everywhere instead of hardcoding plan features.

export const PREMIUM_PLANS = {
  basic: {
    id: "basic",
    name: "Basic",
    price: 39,
    maxPayout: 200,
    actuarialPerHr: 1.80,
    payoutRange: [50, 200] as [number, number],
    claimsPerWeek: 2,
    settlementTime: "Under 90 seconds",
    triggerThreshold: "45 minutes",
  },
  standard: {
    id: "standard",
    name: "Standard",
    price: 59,
    maxPayout: 350,
    actuarialPerHr: 2.80,
    payoutRange: [100, 350] as [number, number],
    claimsPerWeek: 3,
    settlementTime: "Under 90 seconds",
    triggerThreshold: "30 minutes",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 89,
    maxPayout: 500,
    actuarialPerHr: 4.20,
    payoutRange: [150, 500] as [number, number],
    claimsPerWeek: 4,
    settlementTime: "Under 60 seconds",
    triggerThreshold: "20 minutes",
  },
} as const;

export type PlanTier = keyof typeof PREMIUM_PLANS;

/** Returns the plan config for the given tier, or null if no plan / invalid. */
export function getActivePlan(tier: string | null | undefined) {
  if (!tier || !(tier in PREMIUM_PLANS)) return null;
  return PREMIUM_PLANS[tier as PlanTier];
}

/** Returns the next upgradeable tiers above the current one. */
export function getUpgradeTiers(currentTier: string | null | undefined): PlanTier[] {
  if (!currentTier || !(currentTier in PREMIUM_PLANS)) return ["basic", "standard", "pro"];
  if (currentTier === "basic") return ["standard", "pro"];
  if (currentTier === "standard") return ["pro"];
  return []; // pro — no upgrades
}

/** Checks localStorage whether premium is currently active (within the 7-day window). */
export function isPremiumActive(): boolean {
  const until = localStorage.getItem("nexus_premium_until");
  if (!until) return false;
  return new Date(until) > new Date();
}

/** Returns the active tier if still valid, else null. */
export function getActiveStoredTier(): PlanTier | null {
  if (!isPremiumActive()) return null;
  const tier = localStorage.getItem("nexus_premium_tier");
  if (!tier || !(tier in PREMIUM_PLANS)) return null;
  return tier as PlanTier;
}

/** Persist plan purchase to localStorage for 7 days. */
export function savePlanToLocalStorage(planId: PlanTier, expiresAt?: string) {
  const until = expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  localStorage.setItem("nexus_premium_tier", planId);
  localStorage.setItem("nexus_premium_until", until);
  localStorage.setItem("nexus_premium_upgraded", "true");
}

/** Rehydrate plan from Supabase sync response. Overwrites local only if server is authoritative. */
export function rehydratePlanFromServer(serverTier: string | null, serverUntil: string | null) {
  if (!serverTier || !serverUntil) return;
  const serverActive = new Date(serverUntil) > new Date();
  if (!serverActive) return; // expired on server — don't persist

  // Always trust server as source of truth
  savePlanToLocalStorage(serverTier as PlanTier, serverUntil);
}
