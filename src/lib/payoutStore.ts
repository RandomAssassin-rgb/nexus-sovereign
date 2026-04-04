import { supabase } from "./supabase";
import { calculateReservePool, calculateZeroTouchPayout, normalizePersonaLabel } from "./actuarial";
import { getActivePlan, rehydratePlanFromServer } from "./premiumPlans";
import { parseJsonOrThrow } from "./fetchJson";

// ---------- Types ----------
export interface PayoutClaim {
  id: string;               // CLM-XXXX
  date: string;             // "24 Mar 2026"
  dateISO: string;          // full ISO for sorting
  amount: number;
  status: "approved" | "rejected" | "processing";
  type: string;             // "Heavy Rain (>20mm/hr)"
  reason: string;           // human readable disruption
  tier: string;
  tierColor: string;
  tierBg: string;
  summary: {
    type: string;
    wordedReason: string;
    technicalReason: string;
    policyClauses: string[];
    triggers: string[];
  };
  lat?: number;
  lng?: number;
  h3_cell?: string;
  jepData: {
    trigger_type: string;
    worded_summary: string;
    technical_reason: string;
    confidence: number;
    ai_probability: number;
    reserveLevel: number;
    processingTime: string;
    partnerPlatform: string;
    telemetryStatus: string;
    weatherStatus: string;
    hourly_rate?: number;
    income_loss_pct?: number;
    duration_hours?: number;
    calculated_payout?: number;
    p_max?: number;
  };
}

export interface WalletTransaction {
  id: string;          // TXN-XXXX
  title: string;
  desc: string;
  amount: number;
  type: "credit" | "debit";
  date: string;
  via: string;
}

export interface PaymentMethod {
  id: string;
  type: "upi" | "card" | "bank";
  label: string;
  verified: boolean;
  isDefault?: boolean;
}

// ---------- Disruption catalog ----------
const DISRUPTION_CATALOG = [
  {
    type: "Heavy Rain (>20mm/hr)",
    reasons: [
      "Heavy Rain Disruption",
      "Torrential Downpour Alert",
      "Monsoon Surge Detected",
      "Flash Flood Warning Zone",
    ],
    technicalReasons: [
      "Telemetry data from HERE Traffic API indicated rain intensity of 24mm/hr, exceeding the 20mm/hr threshold.",
      "Real-time weather sensors recorded 31mm/hr precipitation in partner's active delivery zone.",
      "Meteorological data cross-referenced with IMD API showed sustained rainfall of 28mm/hr for 45 minutes.",
      "Satellite imagery and ground sensors confirmed 22mm/hr rainfall with 94% spatial accuracy.",
    ],
    clauses: ["Clause 4.2 (Parametric Rainfall)", "Clause 5.1 (Autonomous Trigger)"],
    triggers: ["Rainfall intensity > 20mm/hr"],
    weatherStatus: "Heavy Rain (>20mm/hr)",
    amountRange: [150, 450] as [number, number],
  },
  {
    type: "Extreme Heat (>40°C)",
    reasons: [
      "Extreme Heat Alert",
      "Heatwave Disruption",
      "Thermal Overload Warning",
      "Heat Index Breach Detected",
    ],
    technicalReasons: [
      "IMD temperature sensors recorded 43.2°C in partner's zone, exceeding the 40°C parametric threshold.",
      "Real-time thermal data from OpenWeather API confirmed sustained 41.8°C over a 2-hour delivery window.",
      "Satellite thermal imagery verified ground temperature of 44.1°C with 97% confidence.",
      "Cross-referenced heat index data from 3 independent weather stations confirmed 42.5°C ambient temperature.",
    ],
    clauses: ["Clause 9.1 (Extreme Heat Coverage)", "Clause 5.1 (Autonomous Trigger)"],
    triggers: ["Temperature > 40°C"],
    weatherStatus: "Extreme Heat (43°C)",
    amountRange: [120, 350] as [number, number],
  },
  {
    type: "Platform Outage (>2hrs)",
    reasons: [
      "Platform Outage Disruption",
      "App Server Downtime Detected",
      "Partner Platform Crash",
      "Service Unavailability Alert",
    ],
    technicalReasons: [
      "StatusPage API confirmed Blinkit platform outage lasting 3h 12m, exceeding the 2-hour threshold.",
      "Heartbeat monitoring detected Swiggy Instamart downtime of 2h 45m with 99.9% verification certainty.",
      "Platform health check failed continuously for 2h 30m across all partner API endpoints.",
      "Server status monitoring confirmed complete platform unavailability for 4h 10m across the NCR region.",
    ],
    clauses: ["Clause 8.3 (Platform Outage Coverage)", "Clause 5.1 (Autonomous Trigger)"],
    triggers: ["Platform downtime > 2 hours"],
    weatherStatus: "Clear",
    amountRange: [80, 250] as [number, number],
  },
  {
    type: "Traffic Congestion (>80%)",
    reasons: [
      "Severe Traffic Congestion",
      "Route Gridlock Detected",
      "Traffic Index Breach",
      "Urban Congestion Emergency",
    ],
    technicalReasons: [
      "HERE Traffic API congestion index reached 87% in partner's delivery radius, exceeding the 80% threshold.",
      "Real-time TomTom data showed a traffic congestion index of 92% sustained for 90 minutes.",
      "Multi-source traffic telemetry confirmed 85% congestion with average speed dropping below 8 km/h.",
      "GPS trajectory analysis showed 3x normal delivery time due to 88% route saturation.",
    ],
    clauses: ["Clause 7.1 (Traffic Disruption)", "Clause 5.1 (Autonomous Trigger)"],
    triggers: ["Traffic congestion index > 80%"],
    weatherStatus: "Clear",
    amountRange: [150, 400] as [number, number],
  },
  {
    type: "Air Quality Emergency (AQI>400)",
    reasons: [
      "Hazardous Air Quality Alert",
      "AQI Emergency Shutdown",
      "Toxic Smog Disruption",
      "Severe Pollution Warning",
    ],
    technicalReasons: [
      "CPCB real-time sensors recorded AQI of 456 in partner's zone, exceeding the 400 threshold for hazardous conditions.",
      "IQAir monitoring confirmed sustained AQI of 421 with PM2.5 levels at 380 µg/m³.",
      "Cross-referenced AQI data from SAFAR and CPCB stations confirmed hazardous air quality index of 438.",
      "Government-mandated delivery suspension triggered by AQI exceeding 400 for 3 consecutive hours.",
    ],
    clauses: ["Clause 10.2 (Air Quality Emergency)", "Clause 5.1 (Autonomous Trigger)"],
    triggers: ["AQI > 400"],
    weatherStatus: "Hazardous AQI (450+)",
    amountRange: [200, 550] as [number, number],
  },
];

const PARTNER_PLATFORMS = ["Blinkit", "Swiggy Instamart", "Zepto", "Zomato", "Dunzo", "BigBasket"];

// ---------- Helpers ----------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Returns an amount weighted so ₹2000 is very rare (<5%) */
function generateAmount(min: number, max: number): number {
  const roll = Math.random();
  if (roll < 0.03) {
    // 3% chance of a ₹2000 payout (the absolute max)
    return 2000;
  }
  // Weighted toward lower-mid range
  const base = min + Math.pow(Math.random(), 1.4) * (max - min);
  // Round to nearest 50
  return Math.min(Math.round(base / 50) * 50, 2000);
}

function generateClaimId(): string {
  return `CLM-${randomInt(1000, 9999)}`;
}

function generateTxnId(): string {
  return `TXN-${randomInt(1000, 9999)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

// ---------- Store Keys ----------
const CLAIMS_KEY = "nexus_claims";
const TRANSACTIONS_KEY = "nexus_transactions";
const BALANCE_KEY = "nexus_wallet_balance";
const PAYMENT_METHODS_KEY = "nexus_payment_methods";
const PREMIUM_UNTIL_KEY = "nexus_premium_until";
const LAST_SEEN_CLAIM_ID = "nexus_last_seen_claim_id";
const PENDING_NOTIF_PAYLOAD = "nexus_pending_payout_notif";

/**
 * Clears ALL user-scoped data from localStorage.
 * Call this BEFORE writing a new user's partner_id so sessions never overlap.
 */
export function clearUserSession(): void {
  const keysToRemove = [
    CLAIMS_KEY,
    TRANSACTIONS_KEY,
    BALANCE_KEY,
    PAYMENT_METHODS_KEY,
    PREMIUM_UNTIL_KEY,
    LAST_SEEN_CLAIM_ID,
    PENDING_NOTIF_PAYLOAD,
    "partner_id",
    "dummy_session",
    "signin_method",
    "signin_phone",
    "signin_platform",
    "specific_platform",
    "nexus_premium_upgraded",
    "nexus_notifications",
    "nexus_profile_name",
    "nexus_profile_upi",
  ];
  keysToRemove.forEach(k => localStorage.removeItem(k));
  console.log("[Session] 🔒 User session cleared — all local data wiped for new login.");
}

// ---------- Default seed data ----------
const SEED_CLAIMS: PayoutClaim[] = [
  {
    id: "CLM-8923",
    date: "24 Mar 2026",
    dateISO: "2026-03-24T14:32:00",
    amount: 159,
    status: "approved",
    type: "Heavy Rain (>20mm/hr)",
    reason: "Heavy Rain Disruption",
    tier: "Tier 1 (Autonomous)",
    tierColor: "text-emerald-500",
    tierBg: "bg-emerald-500/10",
    summary: {
      type: "approved",
      wordedReason: "Claim approved based on real-time weather telemetry showing rain intensity > 20mm/hr.",
      technicalReason: "Telemetry data from HERE Traffic API indicated rain intensity of 22mm/hr, exceeding the 20mm/hr threshold.",
      policyClauses: ["Clause 4.2 (Parametric Rainfall)", "Clause 5.1 (Autonomous Trigger)"],
      triggers: ["Rainfall intensity > 20mm/hr"],
    },
    jepData: {
      trigger_type: "Heavy Rain",
      worded_summary: "Claim approved based on real-time weather telemetry showing rain intensity > 20mm/hr.",
      technical_reason: "Telemetry data from HERE Traffic API indicated rain intensity of 22mm/hr, exceeding the 20mm/hr threshold.",
      confidence: 96.2,
      ai_probability: 2.1,
      reserveLevel: 142,
      processingTime: "Under 47 Seconds",
      partnerPlatform: "Blinkit",
      telemetryStatus: "Verified (GPS/Speed)",
      weatherStatus: "Heavy Rain (>20mm/hr)",
    },
  },
  {
    id: "CLM-8920",
    date: "22 Mar 2026",
    dateISO: "2026-03-22T11:15:00",
    amount: 68,
    status: "rejected",
    type: "Platform Outage",
    reason: "Outage duration under 2 hours",
    tier: "Tier 2 (Assisted)",
    tierColor: "text-blue-500",
    tierBg: "bg-blue-500/10",
    summary: {
      type: "rejected",
      wordedReason: "The platform outage did not meet the minimum 2-hour duration requirement for policy coverage.",
      technicalReason: "Outage duration verified as 1.5 hours, which is below the 2-hour policy threshold.",
      policyClauses: ["Clause 8.3 (Minimum Outage Duration)"],
      triggers: [],
    },
    jepData: {
      trigger_type: "Platform Outage",
      worded_summary: "The platform outage did not meet the minimum 2-hour duration requirement for policy coverage.",
      technical_reason: "Outage duration verified as 1.5 hours, which is below the 2-hour policy threshold.",
      confidence: 88.5,
      ai_probability: 0,
      reserveLevel: 142,
      processingTime: "Under 90 Seconds",
      partnerPlatform: "Swiggy Instamart",
      telemetryStatus: "Verified (API Status)",
      weatherStatus: "Clear",
    },
  },
  {
    id: "CLM-8915",
    date: "15 Mar 2026",
    dateISO: "2026-03-15T13:10:00",
    amount: 164,
    status: "approved",
    type: "Extreme Heat (>40°C)",
    reason: "Extreme Heat Alert",
    tier: "Tier 1 (Autonomous)",
    tierColor: "text-emerald-500",
    tierBg: "bg-emerald-500/10",
    summary: {
      type: "approved",
      wordedReason: "Claim approved based on real-time temperature data showing ambient temperature exceeding 40°C.",
      technicalReason: "IMD temperature sensors recorded 43.2°C in partner's zone, exceeding the 40°C parametric threshold.",
      policyClauses: ["Clause 9.1 (Extreme Heat Coverage)", "Clause 5.1 (Autonomous Trigger)"],
      triggers: ["Temperature > 40°C"],
    },
    jepData: {
      trigger_type: "Extreme Heat",
      worded_summary: "Claim approved based on real-time temperature data showing ambient temperature exceeding 40°C.",
      technical_reason: "IMD temperature sensors recorded 43.2°C in partner's zone, exceeding the 40°C parametric threshold.",
      confidence: 94.7,
      ai_probability: 1.8,
      reserveLevel: 142,
      processingTime: "Under 47 Seconds",
      partnerPlatform: "Zepto",
      telemetryStatus: "Verified (GPS/Speed)",
      weatherStatus: "Extreme Heat (43°C)",
    },
  },
];

const SEED_TRANSACTIONS: WalletTransaction[] = [
  {
    id: "TXN-9021",
    title: "Tier 1 Auto-Payout",
    desc: "Heavy Rain Disruption • Claim CLM-8923",
    amount: 159.00,
    type: "credit",
    date: "24 Mar 2026, 14:32 IST",
    via: "Razorpay Auto-Payout",
  },
  {
    id: "TXN-9018",
    title: "Weekly Premium Deducted",
    desc: "Sovereign Shield • Week 3 of 12",
    amount: 120.00,
    type: "debit",
    date: "23 Mar 2026, 09:00 IST",
    via: "Wallet Balance",
  },
  {
    id: "TXN-8990",
    title: "Wallet Top-up",
    desc: "Added via UPI",
    amount: 500.00,
    type: "credit",
    date: "20 Mar 2026, 18:45 IST",
    via: "Razorpay Gateway",
  },
  {
    id: "TXN-8945",
    title: "Tier 1 Auto-Payout",
    desc: "Extreme Heat Alert • Claim CLM-8915",
    amount: 164.00,
    type: "credit",
    date: "15 Mar 2026, 13:10 IST",
    via: "Razorpay Auto-Payout",
  },
];

const DEFAULT_BALANCE = 3450.00;

// ---------- Store functions ----------

export function getClaims(): PayoutClaim[] {
  try {
    const raw = localStorage.getItem(CLAIMS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // First run: seed defaults
  localStorage.setItem(CLAIMS_KEY, JSON.stringify(SEED_CLAIMS));
  return SEED_CLAIMS;
}

/**
 * Immediately adds a new claim to localStorage so it shows up in the UI
 * without waiting for a server sync. Fires 'nexus-payout-update' to
 * trigger any listening components to re-render.
 */
export function addClaimLocally(claim: PayoutClaim): void {
  try {
    const existing = getClaims();
    // Avoid duplicates if somehow called twice
    const deduped = existing.filter(c => c.id !== claim.id);
    const updated = [claim, ...deduped];
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("nexus-payout-update"));
    console.log("[Store] ✅ Claim added locally:", claim.id, "→", claim.status);
  } catch (e) {
    console.error("[Store] ❌ addClaimLocally failed:", e);
  }
}

/**
 * Persists claims locally and triggers background cloud sync.
 */
export async function saveClaims(claims: PayoutClaim[], syncToServer = true) {
  localStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
  if (syncToServer && claims.length > 0) {
    const latest = claims[0];
    const partnerId = localStorage.getItem("partner_id");
    if (partnerId) {
      try {
        const response = await fetch("/api/user/sync/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId, claim: latest })
        });
        if (!response.ok) throw new Error("Backend claim sync failed");
        console.log("[Sync] Claim persisted via backend proxy.");
      } catch (e: any) {
        console.error("❌ Claim sync failed:", e.message);
      }
    }
  }
}

export function getClaimById(claimId: string): PayoutClaim | undefined {
  return getClaims().find(c => c.id === claimId);
}

export function getTransactions(): WalletTransaction[] {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(SEED_TRANSACTIONS));
  return SEED_TRANSACTIONS;
}

/**
 * Persists transactions locally and triggers background cloud sync.
 */
export async function saveTransactions(txns: WalletTransaction[], syncToServer = true) {
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txns));
  if (syncToServer && txns.length > 0) {
    const latest = txns[0];
    const partnerId = localStorage.getItem("partner_id");
    if (partnerId) {
      try {
        const response = await fetch("/api/user/sync/transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId, transaction: latest })
        });
        if (!response.ok) throw new Error("Backend transaction sync failed");
        console.log("[Sync] Transaction persisted via backend proxy.");
      } catch (e: any) {
        console.error("❌ Transaction sync failed:", e.message);
      }
    }
  }
}

export function getBalance(): number {
  try {
    const raw = localStorage.getItem(BALANCE_KEY);
    if (raw) return parseFloat(raw);
  } catch {}
  localStorage.setItem(BALANCE_KEY, String(DEFAULT_BALANCE));
  return DEFAULT_BALANCE;
}

/**
 * Updates balance locally and triggers background cloud sync.
 */
export async function setBalance(val: number, syncToServer = true) {
  localStorage.setItem(BALANCE_KEY, String(val));
  if (syncToServer) {
    const partnerId = localStorage.getItem("partner_id");
    if (partnerId) {
      try {
        const response = await fetch("/api/user/sync/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId, balance: val })
        });
        if (!response.ok) throw new Error("Backend balance sync failed");
        console.log("[Sync] Balance persisted via backend proxy.");
      } catch (e: any) {
        console.error("❌ Balance sync failed:", e.message);
      }
    }
  }
}

export function getPaymentMethods(): PaymentMethod[] {
  try {
    const raw = localStorage.getItem(PAYMENT_METHODS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const defaults: PaymentMethod[] = [
    { id: "upi-1", type: "upi", label: "UPI: user@okhdfcbank", verified: true, isDefault: true },
    { id: "card-1", type: "card", label: "Visa •••• 4242", verified: true },
  ];
  localStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(defaults));
  return defaults;
}

export function savePaymentMethods(methods: PaymentMethod[], syncToServer = true) {
  localStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(methods));
  if (syncToServer) {
    const partnerId = localStorage.getItem("partner_id");
    if (partnerId) {
      fetch("/api/user/update-payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, paymentMethods: methods })
      }).catch(err => console.warn("Background payment methods sync failed", err));
    }
  }
}

/** Explicitly sync a premium plan upgrade to Supabase */
export async function pushPlanUpdate(partnerId: string, tier: string, until: string) {
  if (!partnerId) return;
  return fetch("/api/user/update-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partnerId, tier, until })
  }).catch(err => console.warn("Background plan sync failed", err));
}

export async function pushWalletUpdate(balance?: number, transaction?: WalletTransaction) {
  const partnerId = localStorage.getItem("partner_id");
  if (!partnerId) return;

  return fetch("/api/wallet/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      partnerId, 
      balance, 
      transaction: transaction ? {
        amount: transaction.amount,
        type: transaction.type,
        title: transaction.title,
        desc: transaction.desc,
        via: transaction.via
      } : undefined
    })
  }).catch(err => console.warn("Background wallet sync failed", err));
}

export async function pushClaimCreate(claim: PayoutClaim) {
  const partnerId = localStorage.getItem("partner_id");
  if (!partnerId) return;

  return fetch("/api/claims/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partnerId, claim })
  }).catch(err => console.warn("Background claim sync failed", err));
}

export function getPolicyStatus() {
  const isUpgraded = localStorage.getItem("nexus_premium_upgraded") === "true";
  const until = localStorage.getItem(PREMIUM_UNTIL_KEY);
  if (!until) return { isActive: isUpgraded, validTill: "N/A", daysLeft: 0, isUpgraded };
  
  const expiry = new Date(until);
  const now = new Date();
  const diffTime = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const isActive = diffTime > 0 || isUpgraded;

  return {
    isActive,
    validTill: expiry.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    daysLeft: Math.max(0, diffDays),
    isUpgraded
  };
}

export const getTotalProtectedEarnings = () => {
  const txns = getTransactions();
  // Base declared income goal (Logical for dynamic rider: ₹24,850)
  // We add successful payouts as "recovered" earnings on top of the base shielded income
  const recovered = txns.filter(t => t.type === 'credit' && t.via?.includes('Payout')).reduce((sum, t) => sum + t.amount, 0);
  return 24850 + recovered;
};

// ---------- Cloud Sync Helpers ----------

/**
 * Pulls the absolute source of truth from Supabase and overwrites local cache.
 * Call this on login or app start.
 */
export async function syncWithServer(partnerId: string, source: string = "poll") {
  if (!partnerId) return;
  // MASTER DIAGNOSTIC: Visual signal that the NEW engine is active
  if (source === "init") {
    console.log("%c🚀 NEXUS ENGINE V2.0: RELIABILITY MODE ACTIVE", "background: #3b82f6; color: white; font-weight: bold; padding: 10px; border-radius: 8px;");
  }
  
  console.log(`[Sync] 🔄 Sync Initiated for ${partnerId} (Source: ${source})...`);
  try {
    const res = await fetch(`/api/user/sync?partnerId=${partnerId}`);
    const data = await parseJsonOrThrow<any>(res, "Sync failed");
    console.log("[Sync] Data received from server:", data);
    
    // Update local cache from server truth
    if (data.user) {
      const serverBalance = Number(data.user.balance);
      if (Number.isFinite(serverBalance)) {
        localStorage.setItem(BALANCE_KEY, String(serverBalance));
      }
      // Sync other profile fields
      if (data.user.premium_upgraded !== undefined) 
        localStorage.setItem("nexus_premium_upgraded", String(data.user.premium_upgraded));
      
      // Update platform and phone if available
      if (data.user.platform) localStorage.setItem("signin_platform", data.user.platform);
      if (data.user.phone) localStorage.setItem("signin_phone", data.user.phone);
      if (data.user.aadhaar_number) localStorage.setItem("nexus_aadhaar_number", data.user.aadhaar_number);
      // ── PREMIUM PLAN REHYDRATION (server is always source of truth) ──
      // This ensures plan persists across login/logout for the full 7-day window
      rehydratePlanFromServer(
        data.user.premium_tier ?? null,
        data.user.premium_until ?? null
      );
      if (Array.isArray(data.user.payment_methods))
        localStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(data.user.payment_methods));
      if (data.user.last_lat) localStorage.setItem("nexus_last_lat", data.user.last_lat);
      if (data.user.last_lng) localStorage.setItem("nexus_last_lng", data.user.last_lng);
    }
    
    if (data.transactions && data.transactions.length > 0) {
      const mappedTxns = data.transactions.map((t: any) => ({
        id: t.id,
        title: t.title,
        desc: t.description,
        amount: Number(t.amount),
        type: t.type,
        date: new Date(t.created_at || t.processed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + " IST",
        via: t.via
      }));
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(mappedTxns));
    }
    
    let newClaimsFound: PayoutClaim[] = [];

    if (data.claims && data.claims.length > 0) {
      const existingRaw = localStorage.getItem(CLAIMS_KEY);
      const existingClaims = existingRaw ? JSON.parse(existingRaw) : [];
      const existingIds = new Set(existingClaims.map((c: any) => c.id));

      const mappedClaims = data.claims.map((c: any) => {
        const jep = c.jep_data || {};
        const claimAmount = c.amount || c.payout_inr;
        const claimDate = c.created_at || c.processed_at;
        
        const isManual = String(c.type || "").toLowerCase().includes("manual") || 
                        String(c.reason || "").toLowerCase().includes("manual");
        const tier = isManual ? "Tier 2 (Assisted)" : "Tier 1 (Autonomous)";
        
        return {
          id: c.claim_id_str || String(c.id),
          date: new Date(claimDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          dateISO: claimDate,
          amount: Number(claimAmount),
          status: c.status,
          type: c.type,
          reason: c.reason,
          jepData: jep,
          tier: tier,
          tierColor: isManual ? "text-blue-500" : "text-emerald-500",
          tierBg: isManual ? "bg-blue-500/10" : "bg-emerald-500/10",
          summary: {
            type: c.status || "approved",
            wordedReason: jep.worded_summary || c.reason || (isManual ? "Manual claim filed for review." : "Claim processed by the system."),
            technicalReason: jep.technical_reason || (isManual ? "Pending multi-layer forensic corroboration." : "Verified via autonomous telemetry."),
            policyClauses: jep.trigger_type 
              ? [`Clause 5.1 (Autonomous Trigger)`, `${jep.trigger_type} Coverage`]
              : ["Clause 5.1 (Autonomous Trigger)"],
            triggers: jep.trigger_type ? [jep.trigger_type] : [],
          },
        };
      });

      // MERGE: Keep local-only claims not yet on server, then put server claims first
      const existingRaw2 = localStorage.getItem(CLAIMS_KEY);
      const localClaims: PayoutClaim[] = existingRaw2 ? JSON.parse(existingRaw2) : [];
      const serverIds = new Set(mappedClaims.map((c: any) => c.id));
      // Only keep local claims that are NOT yet on the server (e.g. just submitted)
      const localOnlyClaims = localClaims.filter((c: PayoutClaim) => !serverIds.has(c.id) && !SEED_CLAIMS.some(s => s.id === c.id));
      const mergedClaims = [...mappedClaims, ...localOnlyClaims];
      localStorage.setItem(CLAIMS_KEY, JSON.stringify(mergedClaims));
      console.log(`[Sync] Claims: ${mappedClaims.length} from server, ${localOnlyClaims.length} local-only → ${mergedClaims.length} total`);

      // Swap mappedClaims reference for notification logic below
      const finalMappedClaims = mergedClaims;

      // FIRE POPUP: The "Stateless" trigger
      if (finalMappedClaims && finalMappedClaims.length > 0) {
        const latestClaim = finalMappedClaims[0]; 
        const lastSeenId = localStorage.getItem(LAST_SEEN_CLAIM_ID);
        
        const isActuallyNew = String(latestClaim.id) !== String(lastSeenId || "");
        const status = latestClaim.status?.toLowerCase();
        const isApproved = ["approved", "success", "paid", "completed", "processed"].includes(status || "");
        const claimTime = new Date(latestClaim.dateISO).getTime();
        const now = new Date().getTime();
        const isRecent = (now - claimTime) < (6 * 60 * 60 * 1000);

        if (isActuallyNew && isApproved && isRecent) {
            console.group("%c👑 [NEXUS PERSISTENCE] Queuing Payout Event", "color: #10b981; font-weight: bold;");
            console.log("Transmission Key:", latestClaim.id);
            
            const payoutPayload = {
               id: String(latestClaim.id),
               amount: Number(latestClaim.amount),
               type: latestClaim.type || "Weather Update",
               reason: latestClaim.reason || "Automatic trigger activated.",
               dateISO: latestClaim.dateISO,
               claim: latestClaim 
            };
            
            localStorage.setItem(PENDING_NOTIF_PAYLOAD, JSON.stringify(payoutPayload));
            window.dispatchEvent(new CustomEvent("nexus-zero-touch-payout", { detail: payoutPayload }));
            localStorage.setItem(LAST_SEEN_CLAIM_ID, String(latestClaim.id));
            console.groupEnd();
        } 
      }
    }

    console.log(`[Sync] ✅ Database synchronized successfully.`);
    window.dispatchEvent(new Event("nexus-payout-update"));
    return data;
  } catch (error) {
    console.error("Cloud sync failed, using local cache:", error);
    return null;
  }
}

// ---------- Generate a fresh zero-touch payout ----------

export interface GeneratedPayout {
  claim: PayoutClaim;
  transaction: WalletTransaction;
  amount: number;
  reason: string;
}

/**
 * Creates a brand-new unique payout. Call this each time the
 * zero-touch auto-trigger fires on the Home screen.
 * Automatically persists to the store.
 */
export function generateZeroTouchPayout(lat?: number, lng?: number): GeneratedPayout {
  const now = new Date();
  const disruption = pickRandom(DISRUPTION_CATALOG);
  const reason = pickRandom(disruption.reasons);
  const techReason = pickRandom(disruption.technicalReasons);

  // ── PLAN-AWARE PAYOUT RANGE ──────────────────────────────────────────────
  // Use the active plan's payout range so Pro users get higher payouts.
  const platformSource =
    localStorage.getItem("specific_platform") ||
    localStorage.getItem("signin_platform") ||
    pickRandom(PARTNER_PLATFORMS);
  const payoutQuote = calculateZeroTouchPayout({
    persona: platformSource,
    triggerType: disruption.type,
    reservePool: calculateReservePool(0),
    activeWorkers: 1,
  });
  const amount = payoutQuote.final_payout;
  // ─────────────────────────────────────────────────────────────────────────

  const claimId = generateClaimId();
  const txnId = generateTxnId();
  const platform = normalizePersonaLabel(platformSource);
  const confidence = +(90 + Math.random() * 9.5).toFixed(1);
  const aiProb = +(Math.random() * 4).toFixed(1);
  const reserveLevel = randomInt(135, 155);
  const processingSeconds = randomInt(18, 47);

  const claim: PayoutClaim = {
    id: claimId,
    date: formatDate(now),
    dateISO: now.toISOString(),
    amount,
    status: "approved",
    type: disruption.type,
    reason,
    tier: "Tier 1 (Autonomous)",
    tierColor: "text-emerald-500",
    tierBg: "bg-emerald-500/10",
    summary: {
      type: "approved",
      wordedReason: `Claim approved based on real-time telemetry confirming ${disruption.type.toLowerCase()}. ${reason} verified autonomously.`,
      technicalReason: `${techReason} ${payoutQuote.formula}`,
      policyClauses: disruption.clauses,
      triggers: disruption.triggers,
    },
    jepData: {
      trigger_type: disruption.type.split(" (")[0],
      worded_summary: `Claim approved based on real-time telemetry confirming ${disruption.type.toLowerCase()}. ${reason} verified autonomously.`,
      technical_reason: `${techReason} ${payoutQuote.formula}`,
      confidence,
      ai_probability: aiProb,
      reserveLevel,
      processingTime: `Under ${processingSeconds} Seconds`,
      partnerPlatform: platform,
      telemetryStatus: "Verified (GPS/Speed)",
      weatherStatus: disruption.weatherStatus,
      hourly_rate: payoutQuote.hourly_rate,
      income_loss_pct: payoutQuote.income_loss_pct,
      duration_hours: payoutQuote.duration_hours,
      calculated_payout: payoutQuote.calculated_payout,
      p_max: payoutQuote.p_max,
    },
    lat,
    lng
  };

  const transaction: WalletTransaction = {
    id: txnId,
    title: "Tier 1 Auto-Payout",
    desc: `${reason} • Claim ${claimId}`,
    amount,
    type: "credit",
    date: formatDateTime(now) + " IST",
    via: "Razorpay Auto-Payout",
  };

  // Persist changes
  const claims = getClaims();
  claims.unshift(claim);
  saveClaims(claims); // This triggers background sync

  const txns = getTransactions();
  txns.unshift(transaction);
  saveTransactions(txns, false); // Don't push txn separately, we'll push it with wallet update below or let the claim take priority

  const bal = getBalance();
  const newBal = bal + amount;
  setBalance(newBal); // This triggers background sync for balance + recent txn if we passed it

  // Re-push transaction explicitly to be safe
  pushWalletUpdate(newBal, transaction);

  // Notify listeners
  window.dispatchEvent(new Event("nexus-payout-update"));

  return { claim, transaction, amount, reason };
}

// ---------- Notifications ----------

export interface NexusNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "payout" | "system" | "threat" | "wallet";
  isRead: boolean;
}

const NOTIFICATIONS_READ_KEY = "nexus_notifications_read_ids";

export function getNotifications(): NexusNotification[] {
  const claims = getClaims();
  const txns = getTransactions();
  const readIds = JSON.parse(localStorage.getItem(NOTIFICATIONS_READ_KEY) || "[]") as string[];

  const notifications: NexusNotification[] = [];

  // 1. Derive from Claims
  claims.forEach(c => {
    notifications.push({
      id: `notif-clm-${c.id}`,
      title: c.status === 'approved' ? "Instant Payout Approved" : "Claim Status Update",
      description: c.status === 'approved' 
        ? `₹${c.amount} has been credited to your wallet for ${c.reason}.`
        : `Your claim ${c.id} for ${c.type} is ${c.status}.`,
      time: c.date,
      type: "payout",
      isRead: readIds.includes(`notif-clm-${c.id}`)
    });
  });

  // 2. Derive from Wallet Transactions (non-payout ones)
  txns.forEach(t => {
    if (!t.title || !t.title.includes("Payout")) {
      notifications.push({
        id: `notif-txn-${t.id}`,
        title: t.title,
        description: `Status: Success • Amount: ₹${t.amount}`,
        time: t.date,
        type: "wallet",
        isRead: readIds.includes(`notif-txn-${t.id}`)
      });
    }
  });

  // 3. System Defaults
  const status = getPolicyStatus();
  if (status.isActive) {
    notifications.push({
      id: "notif-sys-active",
      title: "Sovereign Shield Active",
      description: `Your income is protected until ${status.validTill}. Rain and heat alerts enabled.`,
      time: "System",
      type: "system",
      isRead: readIds.includes("notif-sys-active")
    });
  }

  // Sort by time
  return notifications.sort((a, b) => {
    if (a.time === "System") return -1;
    if (b.time === "System") return 1;
    try {
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    } catch {
      return 0;
    }
  });
}

export function markNotificationsAsRead() {
  const notifs = getNotifications();
  const allIds = notifs.map(n => n.id);
  localStorage.setItem(NOTIFICATIONS_READ_KEY, JSON.stringify(allIds));
  window.dispatchEvent(new Event("nexus-payout-update"));
}

export function getUnreadCount(): number {
  return getNotifications().filter(n => !n.isRead).length;
}

/**
 * TRUE REALTIME: Subscribes to Supabase table changes.
 * Pings the sync engine instantly on any server-side change.
 */
export function initRealtimeSubscription(partnerId: string) {
  if (!partnerId) return;
  console.log(`🔌 Initializing Realtime for Partner: ${partnerId}`);

  const channel = supabase.channel(`nexus-realtime-${partnerId}`)
    // 1. Listen for profile/balance updates
    .on('broadcast', { event: 'balance-update' }, (payload) => {
        console.log('📬 [Realtime] User Profile Update (Broadcast):', payload);
        syncWithServer(partnerId, "realtime-profile");
    })
    // 2. Listen for new automated/manual claims
    .on('broadcast', { event: 'claim-update' }, (payload) => {
        console.log('📬 [Realtime] NEW CLAIM DETECTED (Broadcast):', payload);
        syncWithServer(partnerId, "realtime-claim");
    })
    // 3. Listen for new wallet transactions
    .on('broadcast', { event: 'transaction-update' }, (payload) => {
        console.log('📬 [Realtime] NEW TRANSACTION DETECTED (Broadcast):', payload);
        syncWithServer(partnerId, "realtime-transaction");
    })
    .subscribe((status, err) => {
      console.log(`📡 [Realtime] Status: ${status}`);
      if (err) console.error(`📡 [Realtime] Error:`, err);
    });

  return () => {
    console.log("🔌 Disconnecting Realtime...");
    supabase.removeChannel(channel);
  };
}
