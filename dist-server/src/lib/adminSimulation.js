import { calculateReservePool, calculateZeroTouchPayout, normalizePersonaLabel } from "./actuarial.js";
import { SignalFabric } from "./signals.js";
import { EventTwinManager } from "./eventTwin.js";
import { FraudEngine } from "./fraudEngine.js";
export async function withTimeout(promise, ms, label = "Operation") {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}
export const SIMULATION_USER_SELECT = [
    "partnerId",
    "platform",
    "balance",
    "last_lat",
    "last_lng",
].join(",");
const SIMULATION_PAGE_SIZE = 500;
const SIMULATION_PAGE_BATCH = 1;
const DEMO_PARTICIPANTS = [
    { partnerId: "PARTNER-DEMO-01", platform: "Blinkit", balance: 1250, last_lat: 12.9716, last_lng: 77.5946, status: "active" },
    { partnerId: "PARTNER-DEMO-02", platform: "Swiggy", balance: 840, last_lat: 12.9249, last_lng: 80.1275, status: "active" },
    { partnerId: "PARTNER-DEMO-03", platform: "Zepto", balance: 2100, last_lat: 13.0827, last_lng: 80.2707, status: "active" },
    { partnerId: "PARTNER-DEMO-04", platform: "Blinkit", balance: 450, last_lat: 12.9716, last_lng: 77.5946, status: "active" },
    { partnerId: "PARTNER-DEMO-05", platform: "Amazon", balance: 1560, last_lat: 12.9345, last_lng: 77.6101, status: "active" },
    { partnerId: "PARTNER-DEMO-06", platform: "Blinkit", balance: 920, last_lat: 12.9249, last_lng: 80.1275, status: "active" },
    { partnerId: "PARTNER-DEMO-07", platform: "Swiggy", balance: 310, last_lat: 12.9716, last_lng: 77.5946, status: "active" },
    { partnerId: "PARTNER-DEMO-08", platform: "Uber", balance: 2400, last_lat: 13.0827, last_lng: 80.2707, status: "active" },
    { partnerId: "PARTNER-DEMO-09", platform: "Zomato", balance: 1100, last_lat: 12.9716, last_lng: 77.5946, status: "active" },
    { partnerId: "PARTNER-DEMO-10", platform: "Zepto", balance: 670, last_lat: 12.9345, last_lng: 77.6101, status: "active" },
    { partnerId: "dummy_user_123", platform: "Nexus Demo", balance: 420, last_lat: 12.9716, last_lng: 77.5946, status: "active" },
    { partnerId: "NEXUS-ADMIN-9812", platform: "Nexus Demo", balance: 120, last_lat: 12.9716, last_lng: 77.5946, status: "active" },
];
export function getSimulationPartnerId(user) {
    return String(user.partnerId || user.partner_id || "").trim();
}
export function getSimulationPreset(type) {
    const value = String(type || "").toLowerCase();
    if (value.includes("rain") || value.includes("flood")) {
        return {
            label: "Heavy Rain Disruption",
            description: "Rain-linked disruption payload routed into the payout engine.",
            impactRatio: 0.14,
        };
    }
    if (value.includes("heat")) {
        return {
            label: "Extreme Heat Alert",
            description: "Heat-index pressure corridor pushed into the payout rail.",
            impactRatio: 0.09,
        };
    }
    if (value.includes("outage")) {
        return {
            label: "Platform Outage Cover",
            description: "Aggregator outage cluster staged for straight-through compensation.",
            impactRatio: 0.2,
        };
    }
    if (value.includes("pollution") || value.includes("aqi")) {
        return {
            label: "Hazardous Air Quality Alert",
            description: "AQI-linked hazard posture moved into assisted plus autonomous review.",
            impactRatio: 0.11,
        };
    }
    if (value.includes("civic") || value.includes("disruption")) {
        return {
            label: "Civic Disturbance / Strike",
            description: "Civic-disruption band propagated across exposed worker cohorts.",
            impactRatio: 0.16,
        };
    }
    return {
        label: "Unexpected Disruption",
        description: "Unexpected disruption payload routed into the payout engine.",
        impactRatio: 0.12,
    };
}
export function selectSimulationUsers(users, type) {
    const uniqueUsers = users.filter((user, index, collection) => {
        const partnerId = getSimulationPartnerId(user);
        return partnerId && collection.findIndex((candidate) => getSimulationPartnerId(candidate) === partnerId) === index;
    });
    if (uniqueUsers.length === 0) {
        return [];
    }
    return [...uniqueUsers].sort((left, right) => {
        const leftActive = String(left.status || "").toLowerCase() === "active" ? 1 : 0;
        const rightActive = String(right.status || "").toLowerCase() === "active" ? 1 : 0;
        return rightActive - leftActive;
    });
}
export function countSimulationRecipients(users) {
    return users.reduce((count, user, index, collection) => {
        const partnerId = getSimulationPartnerId(user);
        if (!partnerId)
            return count;
        const firstIndex = collection.findIndex((candidate) => getSimulationPartnerId(candidate) === partnerId);
        return firstIndex === index ? count + 1 : count;
    }, 0);
}
export function buildSimulationAck(users, type, message) {
    const preset = getSimulationPreset(type);
    const impactedUsers = selectSimulationUsers(users, type);
    const reservePool = calculateReservePool(users.reduce((sum, user) => sum + Number(user.balance || 0), 0));
    const sampleResults = impactedUsers.slice(0, 5).map((user) => {
        const payoutQuote = calculateZeroTouchPayout({
            persona: String(user.platform || "Blinkit"),
            triggerType: type,
            declaredEarnings: Number(user.declared_earnings ?? user.declaredEarnings ?? 0),
            reservePool,
            activeWorkers: Math.max(1, impactedUsers.length),
        });
        return {
            partnerId: getSimulationPartnerId(user),
            payout: payoutQuote.final_payout,
            persona: normalizePersonaLabel(String(user.platform || "")),
            p_max: payoutQuote.p_max,
            circuit_breaker_active: payoutQuote.circuit_breaker_active,
        };
    });
    const projectedTotalPayout = sampleResults.reduce((sum, result) => sum + Number(result.payout || 0), 0);
    return {
        preset,
        impactedUsers,
        reservePool,
        sampleResults,
        projectedTotalPayout,
        averagePayout: impactedUsers.length > 0 ? Math.round(projectedTotalPayout / Math.max(1, sampleResults.length || impactedUsers.length)) : 0,
        message: message ||
            `${preset.label} queued for ${impactedUsers.length} worker${impactedUsers.length === 1 ? "" : "s"} with fast broadcast acknowledgement.`,
    };
}
export function buildSimulationBroadcastPayload({ type, message, ack, simulationId, twin = null, popupDelayMs = 3500, }) {
    const pulseTimestamp = new Date().toISOString();
    const popupDisplayAt = new Date(Date.now() + popupDelayMs).toISOString();
    const fallbackAmount = Math.max(1, Math.round(Number(ack.sampleResults[0]?.payout ??
        ack.averagePayout ??
        ack.projectedTotalPayout / Math.max(ack.impactedUsers.length || 1, 1) ??
        15)));
    return {
        type,
        simulation_id: simulationId,
        source: "admin_simulation",
        title: "Zero-Touch Trigger",
        preset_label: ack.preset.label,
        message: message || `${ack.preset.label} payout simulation broadcast initiated.`,
        pulse_timestamp: pulseTimestamp,
        popup_display_at: popupDisplayAt,
        popup_delay_ms: popupDelayMs,
        amount: fallbackAmount,
        average_payout: Number(ack.averagePayout || fallbackAmount),
        projected_total_payout: Number(ack.projectedTotalPayout || 0),
        workers_impacted: ack.impactedUsers.length,
        cta_label: "View Claim Status",
        twin,
    };
}
function getSimulationUserCacheStore() {
    const globalState = globalThis;
    if (!globalState.__nexusSimulationUserCache) {
        globalState.__nexusSimulationUserCache = {
            users: [],
            fetchedAt: 0,
            pending: null,
        };
    }
    return globalState.__nexusSimulationUserCache;
}
function normalizeCachedSimulationUser(userLike) {
    if (!userLike)
        return null;
    const partnerId = getSimulationPartnerId(userLike);
    if (!partnerId)
        return null;
    return {
        partnerId,
        partner_id: partnerId,
        platform: String(userLike.platform ??
            userLike.specific_platform ??
            userLike.signin_platform ??
            "Blinkit"),
        balance: Number(userLike.balance || 0),
        declared_earnings: Number(userLike.declared_earnings ?? userLike.declaredEarnings ?? 0),
        last_lat: userLike.last_lat ?? null,
        last_lng: userLike.last_lng ?? null,
        h3_cell: userLike.h3_cell ?? null,
        status: userLike.status ?? "active",
    };
}
export async function fetchSimulationUsers(supabaseClient) {
    const collected = [];
    for (let pageStart = 0;; pageStart += SIMULATION_PAGE_BATCH) {
        const pageResults = await Promise.all(Array.from({ length: SIMULATION_PAGE_BATCH }, (_, offset) => {
            const page = pageStart + offset;
            const from = page * SIMULATION_PAGE_SIZE;
            const to = from + SIMULATION_PAGE_SIZE - 1;
            return supabaseClient
                .from("users")
                .select(SIMULATION_USER_SELECT)
                .not("partnerId", "is", null)
                .range(from, to);
        }));
        let reachedEnd = false;
        for (const pageRes of pageResults) {
            if (pageRes.error) {
                throw pageRes.error;
            }
            const page = pageRes.data || [];
            collected.push(...page);
            if (page.length < SIMULATION_PAGE_SIZE) {
                reachedEnd = true;
                break;
            }
        }
        if (reachedEnd) {
            break;
        }
        // Add a short delay to yield for other requests (e.g., Admin Signup)
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return collected;
}
async function fetchAndCacheSimulationUsers(supabaseClient) {
    const store = getSimulationUserCacheStore();
    const users = await fetchSimulationUsers(supabaseClient);
    store.users = users;
    store.fetchedAt = Date.now();
    return users;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchSimulationUsersWithRetry(supabaseClient, attempts = 3, retryDelayMs = 900) {
    const store = getSimulationUserCacheStore();
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const users = await fetchAndCacheSimulationUsers(supabaseClient);
            if (users.length > 0 || attempt === attempts) {
                return users;
            }
        }
        catch (error) {
            lastError = error;
            if (attempt === attempts) {
                break;
            }
            await delay(retryDelayMs * attempt);
        }
    }
    if (store.users.length > 0) {
        console.warn("[Simulation] Falling back to stale worker audience cache after fetch failure.");
        return store.users;
    }
    // LAST RESORT: Return Demo Participants so the simulation doesn't crash 0-workers
    console.warn("[Simulation] Audience fetch failed and cache cold. Injecting DEMO_PARTICIPANTS for demo continuity.");
    store.users = DEMO_PARTICIPANTS;
    store.fetchedAt = Date.now();
    return DEMO_PARTICIPANTS;
}
export function upsertSimulationUserCacheEntry(userLike) {
    const normalized = normalizeCachedSimulationUser(userLike);
    if (!normalized)
        return null;
    const store = getSimulationUserCacheStore();
    const nextUsers = [...store.users];
    const existingIndex = nextUsers.findIndex((candidate) => getSimulationPartnerId(candidate) === normalized.partnerId);
    if (existingIndex >= 0) {
        nextUsers[existingIndex] = {
            ...nextUsers[existingIndex],
            ...normalized,
        };
    }
    else {
        nextUsers.unshift(normalized);
    }
    store.users = nextUsers;
    store.fetchedAt = Date.now();
    return normalized;
}
export function invalidateSimulationUserCache() {
    const store = getSimulationUserCacheStore();
    store.fetchedAt = 0;
}
export function getSimulationUserCacheSnapshot() {
    const store = getSimulationUserCacheStore();
    return {
        users: [...store.users],
        fetchedAt: store.fetchedAt,
        hasPendingRefresh: Boolean(store.pending),
    };
}
export async function getCachedSimulationUsers(supabaseClient, maxAgeMs = 60_000) {
    const store = getSimulationUserCacheStore();
    if (store.users.length > 0 && Date.now() - store.fetchedAt < maxAgeMs) {
        return store.users;
    }
    if (!store.pending) {
        const fetchWithResilience = async () => {
            try {
                // 1. Attempt to fetch from DB with a 20s hard timeout (to stay under the 30s axios limit)
                // using 15s here to be even safer
                const users = await withTimeout(fetchSimulationUsersWithRetry(supabaseClient), 15000, "Simulation audience fetch")
                    .catch((e) => {
                    console.warn("[Simulation] DB Fetch Failed or Timed Out (Demo Engine Override).", e.message);
                    return null;
                });
                if (users && users.length > 0) {
                    return users;
                }
                // 2. DEMO FALLBACK: If DB fails or is cold, inject a robust mock audience for presentation continuity
                if (store.users.length > 0) {
                    console.log("[Simulation] Using stale audience cache as fallback.");
                    return store.users;
                }
                console.log("[Simulation] Injecting 1,250 synthetic worker nodes for Demo Engine Resilience.");
                const demoUsers = Array.from({ length: 1250 }, (_, i) => ({
                    partnerId: `MOCK-WORKER-${1000 + i}`,
                    partner_id: `MOCK-WORKER-${1000 + i}`,
                    platform: i % 3 === 0 ? "Blinkit" : i % 3 === 1 ? "Uber" : "Zomato",
                    balance: 2500 + Math.random() * 5000,
                    declared_earnings: 15000 + Math.random() * 10000,
                    last_lat: 12.9716 + (Math.random() - 0.5) * 0.1,
                    last_lng: 77.5946 + (Math.random() - 0.5) * 0.1,
                    h3_cell: null,
                    status: "active",
                    jep_data: { source: "admin_simulation" }
                }));
                store.users = demoUsers;
                store.fetchedAt = Date.now();
                return demoUsers;
            }
            catch (err) {
                console.error("[Simulation] Critical audience recovery error:", err.message);
                return store.users.length > 0 ? store.users : [];
            }
            finally {
                store.pending = null;
            }
        };
        store.pending = fetchWithResilience();
    }
    return store.pending;
}
export function primeSimulationUsers(supabaseClient, maxAgeMs = 60_000) {
    return getCachedSimulationUsers(supabaseClient, maxAgeMs).catch((error) => {
        console.warn("[Simulation] Cache warm failed:", error?.message || error);
        const store = getSimulationUserCacheStore();
        return store.users;
    });
}
const SIGNAL_TTL_MS = 15 * 60 * 1000;
function getSimulationSignalStore() {
    const globalState = globalThis;
    if (!globalState.__nexusSimulationSignalStore) {
        globalState.__nexusSimulationSignalStore = new Map();
    }
    return globalState.__nexusSimulationSignalStore;
}
function cleanupSimulationSignals() {
    const store = getSimulationSignalStore();
    const now = Date.now();
    for (const [partnerId, entry] of store.entries()) {
        if (now - entry.createdAt > SIGNAL_TTL_MS) {
            store.delete(partnerId);
        }
    }
}
function formatLedgerDate(iso) {
    try {
        return new Date(iso).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    }
    catch {
        return new Date().toLocaleDateString("en-IN");
    }
}
function formatLedgerDateTime(iso) {
    try {
        return `${new Date(iso).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
        })} IST`;
    }
    catch {
        return `${new Date().toLocaleString("en-IN")} IST`;
    }
}
function buildSimulationWorkItems(users, type, message, context) {
    const preset = getSimulationPreset(type);
    const reservePool = context?.reservePool ??
        calculateReservePool(users.reduce((sum, user) => sum + Number(user.balance || 0), 0));
    const activeWorkers = Math.max(1, context?.activeWorkers ?? users.length);
    const twin = context?.twin;
    const broadcastPayload = context?.broadcastPayload ?? null;
    const fabric = SignalFabric.createDemoFabric(type.toLowerCase().includes('rain') ? 'monsoon' : 'heatwave');
    return users
        .map((user, index) => {
        const partnerId = getSimulationPartnerId(user);
        if (!partnerId)
            return null;
        const processedAt = new Date().toISOString();
        const claimId = `SIM-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const payoutQuote = calculateZeroTouchPayout({
            persona: String(user.platform || "Blinkit"),
            triggerType: type,
            declaredEarnings: Number(user.declared_earnings ?? user.declaredEarnings ?? user.balance ?? 0),
            reservePool,
            activeWorkers,
        });
        const payout = payoutQuote.final_payout;
        const partnerPlatform = normalizePersonaLabel(String(user.platform || ""));
        // 4. Fraud Scoring Pipeline
        const fraudMatrix = FraudEngine.evaluate({
            lat: Number(user.last_lat || 0),
            lng: Number(user.last_lng || 0),
            type: type,
            telemetryStatus: Math.random() > 0.1 ? 'Verified' : 'Simulated'
        }, fabric, twin);
        const jepData = {
            audit_token: `AUD-${claimId.split("-").pop()}`,
            payout_calculation: {
                base_rate: payoutQuote.p_max,
                duration_hrs: 4,
                multiplier: 1.0,
                total: payoutQuote.final_payout,
            },
            signals: fabric.getState().signals,
            fraud_matrix: fraudMatrix,
            verdict: {
                status: fraudMatrix.decision,
                reason_codes: fraudMatrix.reason_codes,
                timestamp: processedAt,
            },
        };
        return {
            partnerId,
            priorBalance: Number(user.balance || 0),
            nextBalance: Number(user.balance || 0) + payout,
            payout,
            processedAt,
            claimId,
            claimRow: {
                worker_id: partnerId,
                payout_inr: payout,
                status: fraudMatrix.decision === 'escalate' ? 'rejected' : 'approved',
                type,
                reason: message || `${preset.label} auto-triggered payout`,
                processed_at: processedAt,
                claim_id_str: claimId,
                lat: Number(user.last_lat || 12.9249),
                lng: Number(user.last_lng || 80.1275),
                h3_cell: String(user.h3_cell || "88618c4897fffff"),
                jep_data: {
                    ...jepData,
                    simulation_type: type,
                    source: "admin_simulation",
                    auto: true,
                    partnerPlatform,
                    hourly_rate: payoutQuote.hourly_rate,
                    income_loss_pct: payoutQuote.income_loss_pct,
                    duration_hours: payoutQuote.duration_hours,
                    calculated_payout: payoutQuote.calculated_payout,
                    p_max: payoutQuote.p_max,
                    circuit_breaker_active: payoutQuote.circuit_breaker_active,
                    formula: payoutQuote.formula,
                    telemetryStatus: "Simulated",
                    weatherStatus: type,
                    twin_id: context?.twin?.id || null,
                    simulation_id: broadcastPayload?.simulation_id || null,
                    pulse_timestamp: broadcastPayload?.pulse_timestamp || processedAt,
                    popup_display_at: broadcastPayload?.popup_display_at || processedAt,
                    popup_delay_ms: broadcastPayload?.popup_delay_ms || 0,
                    popup_title: broadcastPayload?.title || "Zero-Touch Trigger",
                    popup_cta_label: broadcastPayload?.cta_label || "View Claim Status",
                },
            },
        };
    })
        .filter(Boolean);
}
export function publishSimulationSignals(workItems, supabaseServer) {
    const store = getSimulationSignalStore();
    cleanupSimulationSignals();
    workItems.forEach((item) => {
        const claimReason = String(item.claimRow.reason || "Autonomous payout triggered.");
        const type = String(item.claimRow.type || "Simulation");
        const jepData = (typeof item.claimRow.jep_data === "object" && item.claimRow.jep_data !== null
            ? item.claimRow.jep_data
            : {});
        const payload = {
            id: item.claimId,
            amount: item.payout,
            type,
            reason: claimReason,
            dateISO: item.processedAt,
            balance: item.nextBalance,
            claim: {
                id: item.claimId,
                date: formatLedgerDate(item.processedAt),
                dateISO: item.processedAt,
                amount: item.payout,
                status: "approved",
                type,
                reason: claimReason,
                tier: "Tier 1 (Autonomous)",
                tierColor: "text-emerald-500",
                tierBg: "bg-emerald-500/10",
                summary: {
                    type: "approved",
                    wordedReason: claimReason,
                    technicalReason: "Simulation payout signal promoted before ledger reconciliation.",
                    policyClauses: ["Clause 5.1 (Autonomous Trigger)"],
                    triggers: [],
                },
                jepData: {
                    ...jepData,
                },
            },
            transaction: {
                id: `SIMTX-${item.claimId}`,
                title: "Zero-Touch Payout",
                desc: `${type} zero-touch payout`,
                amount: item.payout,
                type: "credit",
                date: formatLedgerDateTime(item.processedAt),
                via: "Admin Simulation",
            },
            simulation_id: String(jepData.simulation_id || "").trim() || undefined,
            popup_display_at: typeof jepData.popup_display_at === "string" ? jepData.popup_display_at : undefined,
            popup_delay_ms: Number.isFinite(Number(jepData.popup_delay_ms)) ? Number(jepData.popup_delay_ms) : undefined,
            cta_label: typeof jepData.popup_cta_label === "string" ? jepData.popup_cta_label : undefined,
        };
        store.set(item.partnerId, {
            claimId: item.claimId,
            createdAt: Date.now(),
            payload,
        });
        if (supabaseServer) {
            // Broadcast individual payout to the worker's dedicated channel
            void supabaseServer
                .channel(`nexus-realtime-${item.partnerId}`)
                .send({
                type: 'broadcast',
                event: 'payout',
                payload: payload
            })
                .catch((err) => {
                console.warn(`[Simulation] Broadcast failed for ${item.partnerId}:`, err?.message || err);
            });
        }
    });
}
export function readSimulationSignal(partnerId, afterClaimId) {
    cleanupSimulationSignals();
    const key = String(partnerId || "").trim();
    if (!key) {
        return { success: true, has_new: false, latest_claim_id: null, payload: null };
    }
    const entry = getSimulationSignalStore().get(key);
    if (!entry) {
        return { success: true, has_new: false, latest_claim_id: null, payload: null };
    }
    const latestClaimId = String(entry.claimId || "").trim();
    return {
        success: true,
        has_new: Boolean(latestClaimId && latestClaimId !== String(afterClaimId || "").trim()),
        latest_claim_id: latestClaimId,
        payload: entry.payload,
    };
}
/**
 * Orchestrates a Phase 3 "Finalist Grade" simulation with Signal Fabric and Event Twin.
 */
export async function orchestrateFinalistSimulation({ type, message, supabaseServer, activeWorkers, reservePool, }) {
    const logPrefix = "[Phase 3 Simulation]";
    console.log(`${logPrefix} Initiating for type: ${type}`);
    // 1. Create Signal Fabric
    const variant = type.toLowerCase().includes("rain") ? "monsoon" : (type.toLowerCase().includes("heat") ? "heatwave" : "monsoon");
    const fabric = SignalFabric.createDemoFabric(variant);
    // 2. Create Event Twin
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h TTL for demo
    const twin = await EventTwinManager.createFromSignal(type, fabric, {
        centerLat: 12.9249, // Tambaram Core, Chennai
        centerLng: 80.1275,
        radiusKm: 5,
        activeWorkers,
        reservePool,
        origin: "simulated",
        demo_tag: "chennai_monsoon_v3",
        scenario_id: `SCENARIO-${Date.now()}`,
        expires_at: expiresAt,
    });
    // 3. Check for Contradictions (Hardened Fraud)
    if (twin.signals.contradictionIndex > 40) {
        console.warn(`${logPrefix} High contradiction detected (${twin.signals.contradictionIndex}). Throttling payout velocity.`);
        // In a real scenario, we might change status to 'evaluating' or 'hold'
    }
    // 4. Persistence
    return executeSimulationPersistence({
        users: activeWorkers,
        type,
        message,
        supabaseServer,
        ensureSkeletonUser: async (pid) => pid,
        twin,
    });
}
export async function executeSimulationPersistence({ users, type, message, supabaseServer, ensureSkeletonUser: _ensureSkeletonUser, logPrefix = "[Simulation]", twin, broadcastPayload = null, }) {
    const workItems = [];
    const reservePool = calculateReservePool(users.reduce((sum, user) => sum + Number(user.balance || 0), 0));
    const activeWorkers = Math.max(1, users.length);
    const signalChunkSize = 320;
    for (let index = 0; index < users.length; index += signalChunkSize) {
        const chunkUsers = users.slice(index, index + signalChunkSize);
        const chunkWorkItems = buildSimulationWorkItems(chunkUsers, type, message, {
            reservePool,
            activeWorkers,
            twin: twin,
            broadcastPayload,
        });
        workItems.push(...chunkWorkItems);
        publishSimulationSignals(chunkWorkItems, supabaseServer);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (twin) {
        const projectedTotal = workItems.reduce((sum, item) => sum + item.payout, 0);
        twin.metrics.projected_load = projectedTotal;
        const twinInsert = await supabaseServer.from("event_twins").insert([twin]);
        if (twinInsert.error) {
            console.warn(`${logPrefix} EventTwin insert failed (table may not exist yet):`, twinInsert.error.message || twinInsert.error);
        }
    }
    let processedCount = 0;
    const insertedClaims = new Map();
    const insertChunkSize = 250;
    for (let index = 0; index < workItems.length; index += insertChunkSize) {
        const chunk = workItems.slice(index, index + insertChunkSize);
        const claimInsert = await supabaseServer
            .from("claims")
            .insert(chunk.map((item) => item.claimRow))
            .select("id, claim_id_str, worker_id");
        if (claimInsert.error) {
            console.error(`${logPrefix} Claim batch insert failed:`, claimInsert.error.message || claimInsert.error);
            continue;
        }
        const claimRows = claimInsert.data || [];
        processedCount += claimRows.length;
        claimRows.forEach((row) => {
            const workerId = String(row.worker_id || "").trim();
            if (!workerId)
                return;
            insertedClaims.set(workerId, {
                claimDbId: String(row.id || row.claim_id_str || "").trim(),
                claimPublicId: String(row.claim_id_str || row.id || "").trim(),
            });
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const transactionRows = workItems.map((item) => {
        const inserted = insertedClaims.get(item.partnerId);
        const referenceId = inserted?.claimDbId || item.claimId;
        return {
            worker_id: item.partnerId,
            amount: item.payout,
            type: "credit",
            status: "completed",
            reference_id: referenceId,
            description: `${type} zero-touch payout`,
            title: "Zero-Touch Payout",
            via: "Admin Simulation",
            created_at: item.processedAt,
        };
    });
    for (let index = 0; index < transactionRows.length; index += insertChunkSize) {
        const chunk = transactionRows.slice(index, index + insertChunkSize);
        const txInsert = await supabaseServer.from("transactions").insert(chunk);
        if (txInsert.error) {
            console.error(`${logPrefix} Transaction batch insert failed:`, txInsert.error.message || txInsert.error);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    void (async () => {
        const balanceUpdateChunkSize = 120;
        for (let index = 0; index < workItems.length; index += balanceUpdateChunkSize) {
            const chunk = workItems.slice(index, index + balanceUpdateChunkSize);
            await Promise.all(chunk.map(async (item) => {
                try {
                    await supabaseServer
                        .from("users")
                        .update({ balance: item.nextBalance })
                        .eq("partnerId", item.partnerId);
                }
                catch (error) {
                    console.error(`${logPrefix} Balance update failed for ${item.partnerId}:`, error?.message || error);
                }
            }));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        console.log(`${logPrefix} Balance updates complete for ${workItems.length}/${users.length} impacted workers.`);
    })();
    console.log(`${logPrefix} Claim and transaction persistence complete for ${processedCount}/${users.length} impacted workers.`);
    return processedCount;
}
//# sourceMappingURL=adminSimulation.js.map