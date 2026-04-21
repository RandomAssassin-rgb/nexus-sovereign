/**
 * Haversine distance between two lat/lng pairs, in kilometres.
 * Lightweight — no external dependencies.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export class FraudEngine {
    /**
     * Evaluates a claim against environmental and behavioral signals.
     * Finalist-grade logic with "Weakest Link" sensitivity, terminology alignment,
     * and Anti-GPS Spoofing detection.
     */
    static evaluate(claim, fabric, twin, forensics) {
        const state = fabric.getState();
        const reason_codes = [];
        // ══════════════════════════════════════════════════
        //  ANTI-GPS SPOOFING ANALYSIS (runs before scoring)
        // ══════════════════════════════════════════════════
        let location_jump_violation = false;
        let static_coordinates_anomaly = false;
        let activity_location_mismatch = false;
        const spoof_reasons = [];
        const samples = claim.locationSamples || [];
        // CHECK 1 — Impossible Location Jump
        // If distance change > 5 km within < 2 min → physically impossible
        if (samples.length >= 2) {
            for (let i = 1; i < samples.length; i++) {
                const prev = samples[i - 1];
                const curr = samples[i];
                const distKm = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
                const deltaMinutes = Math.abs(curr.ts - prev.ts) / 60_000;
                if (distKm > 5 && deltaMinutes < 2) {
                    location_jump_violation = true;
                    spoof_reasons.push(`Impossible jump detected: ${distKm.toFixed(1)} km in ${deltaMinutes.toFixed(1)} min`);
                    break;
                }
            }
        }
        // CHECK 2 — Static Coordinates Anomaly (repeated identical GPS readings)
        // Real devices always have micro-drift; identical readings suggest spoofing or "Sensors" mock.
        if (samples.length >= 3) {
            const uniqueCoords = new Set(samples.map((s) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`));
            // Phase 3 Adjustment: Tightened threshold to 0.6 for demo (more sensitive to static mocks)
            if (uniqueCoords.size === 1 || (uniqueCoords.size / samples.length < 0.6)) {
                static_coordinates_anomaly = true;
                spoof_reasons.push('GPS readings show zero variance — natural device drift absent (Mock Detected)');
            }
        }
        // CHECK 3 — Activity vs Location Mismatch
        // User claims they are inside the disruption zone BUT telemetry shows no activity
        const isInsideDisruptionZone = twin && twin.footprint;
        const showsLowActivity = claim.telemetryStatus !== 'Verified';
        if (isInsideDisruptionZone && showsLowActivity) {
            activity_location_mismatch = true;
            spoof_reasons.push('Location indicates disruption zone but activity logs show no matching work');
        }
        const is_gps_spoof_suspected = location_jump_violation || static_coordinates_anomaly || activity_location_mismatch;
        const gpsSpoofResult = {
            is_gps_spoof_suspected,
            location_jump_violation,
            static_coordinates_anomaly,
            activity_location_mismatch,
            spoof_reasons,
        };
        // ══════════════════════════════════════════════════
        //  SCORING LOGIC
        // ══════════════════════════════════════════════════
        // Event Match Score
        const weatherIntensity = fabric.getIntensity('weather');
        const trafficIntensity = fabric.getIntensity('traffic');
        let eventMatch = 50;
        if (claim.type.toLowerCase().includes('rain')) {
            eventMatch = Math.min(100, weatherIntensity + 15);
        }
        else if (claim.type.toLowerCase().includes('traffic')) {
            eventMatch = Math.min(100, trafficIntensity + 10);
        }
        let event_match_score = Math.floor(eventMatch);
        // Location Trust Score — sharply reduced if spoof suspected
        let locationTrust = 90;
        if (twin && twin.footprint)
            locationTrust = 95;
        if (is_gps_spoof_suspected) {
            // Sharp penalty: location data is untrustworthy
            locationTrust = location_jump_violation ? 8 : 18;
            reason_codes.push('GPS_SPOOF_SUSPECTED');
        }
        let location_trust_score = locationTrust;
        // Activity Match Score — penalised on activity–location mismatch
        let activityMatch = claim.telemetryStatus === 'Verified' ? 100 : 40;
        if (activity_location_mismatch) {
            activityMatch = Math.min(activityMatch, 22);
        }
        if (activityMatch < 50)
            reason_codes.push('HOLD_ACTIVITY_UNCERTAIN');
        const activity_match_score = activityMatch;
        // Device Trust Score — reduced if static coordinates detected
        const deviceSignal = state.signals.find((s) => s.type === 'device');
        let deviceTrust = deviceSignal ? deviceSignal.value : 85;
        if (static_coordinates_anomaly) {
            deviceTrust = Math.min(deviceTrust, 15);
        }
        if (is_gps_spoof_suspected && !static_coordinates_anomaly) {
            // General spoof penalty even without static coords
            deviceTrust = Math.min(deviceTrust, 35);
        }
        if (deviceTrust < 70)
            reason_codes.push('HOLD_DEVICE_INTEGRITY_LOW');
        let device_trust_score = deviceTrust;
        // Consensus Score — reduced if Event Twin shows high disruption but user is normal
        let consensusBase = twin ? Math.min(100, 70 + twin.exposure / 50) : 60;
        if (twin && !showsLowActivity === false && is_gps_spoof_suspected) {
            // Signal contradiction: twin shows disruption, user behaviour normal + spoofing suspected
            consensusBase = Math.min(consensusBase, 25);
        }
        let consensus_score = Math.floor(consensusBase);
        // Behavior Risk Score
        let behavior_risk_score = 100 - state.contradictionIndex;
        if (state.contradictionIndex > 40)
            reason_codes.push('HOLD_BEHAVIORAL_ANOMALY');
        // ══════════════════════════════════════════════════
        //  EVIDENCE FORENSICS PENALTIES (additive layer)
        //  Applied after base scoring so they can cap/reduce
        //  scores without conflicting with GPS spoof logic.
        // ══════════════════════════════════════════════════
        if (forensics) {
            // Duplicate image → behavior + event match penalty
            if (forensics.duplicate_image_flag) {
                behavior_risk_score = Math.min(behavior_risk_score, 5); // Severely drop behavior
                event_match_score = Math.min(event_match_score, 10); // Evidence is a lie
                forensics.reason_codes.forEach(c => {
                    if (!reason_codes.includes(c))
                        reason_codes.push(c);
                });
            }
            // Geo mismatch → location trust penalty
            if (forensics.evidence_geo_mismatch_flag) {
                location_trust_score = Math.min(location_trust_score, 12); // Hard drop trust
                forensics.reason_codes.forEach(c => {
                    if (!reason_codes.includes(c))
                        reason_codes.push(c);
                });
            }
            // Timestamp mismatch → event match + behavior penalty
            if (forensics.evidence_timestamp_mismatch_flag) {
                event_match_score = Math.min(event_match_score, 8); // Out of window image is invalid
                behavior_risk_score = Math.max(0, behavior_risk_score - 40);
                forensics.reason_codes.forEach(c => {
                    if (!reason_codes.includes(c))
                        reason_codes.push(c);
                });
            }
        }
        // Scores are already updated above as mutable variables.
        const final_event_match_score = event_match_score;
        const final_location_trust_score = location_trust_score;
        const final_device_trust_score = device_trust_score; // NO forensics-based device trust penalty
        // ══════════════════════════════════════════════════
        //  AGGREGATION & WEAKEST LINK
        // ══════════════════════════════════════════════════
        // NOTE: Threshold 30 is intentional for demo clarity to show system sensitivity.
        // In production, this can be tuned dynamically via Product Controls.
        const WEAKEST_LINK_THRESHOLD = 30;
        const scores = [
            { label: 'Event Match', score: final_event_match_score, isOptional: false },
            { label: 'Location Trust', score: final_location_trust_score, isOptional: false },
            { label: 'Activity Match', score: activity_match_score, isOptional: false },
            { label: 'Device Trust', score: final_device_trust_score, isOptional: true },
            { label: 'Consensus', score: consensus_score, isOptional: true },
            { label: 'Behavior Risk', score: behavior_risk_score, isOptional: false },
        ];
        // Phase 3 Rule: Missing optional signals MUST NOT trigger weakest-link rejection
        const weakest = scores.reduce((prev, curr) => {
            // If current is optional and high-score (90+), ignore it as a "weak link" candidate
            if (curr.isOptional && curr.score > 80)
                return prev;
            return curr.score < prev.score ? curr : prev;
        });
        const isWeakestLinkTriggered = weakest.score < WEAKEST_LINK_THRESHOLD && !weakest.isOptional;
        const verification_score = Math.floor(final_event_match_score * 0.25 +
            final_location_trust_score * 0.15 +
            activity_match_score * 0.2 +
            final_device_trust_score * 0.15 +
            consensus_score * 0.15 +
            behavior_risk_score * 0.1);
        // ══════════════════════════════════════════════════
        //  DECISION ENGINE
        // ══════════════════════════════════════════════════
        let decision = 'auto-approve';
        let decision_label = 'AUTO APPROVED ✅';
        let confidence_label = 'High confidence — all checks passed';
        if (is_gps_spoof_suspected || isWeakestLinkTriggered || verification_score < 50) {
            decision = 'escalate';
            decision_label = 'HIGH RISK 🚨';
            confidence_label = 'Low confidence — key verification checks failed';
            if (is_gps_spoof_suspected)
                reason_codes.push('GPS_SPOOF_SUSPECTED');
            if (isWeakestLinkTriggered)
                reason_codes.push(`ESCALATE_WEAKEST_LINK_${weakest.label.toUpperCase().replace(' ', '_')}`);
            if (!is_gps_spoof_suspected && !isWeakestLinkTriggered)
                reason_codes.push('ESCALATE_HIGH_FRAUD_PRESSURE');
        }
        else if (verification_score < 80 || reason_codes.length > 0) {
            decision = 'hold';
            decision_label = 'REVIEW REQUIRED ⚠️';
            confidence_label = 'Medium confidence — partial verification gaps';
            if (reason_codes.length === 0)
                reason_codes.push('HOLD_MARGINAL_TRUST_THRESHOLD');
        }
        const primary_reason = reason_codes.length > 0 ? reason_codes[0] : 'AUTO_VERIFIED_FABRIC';
        return {
            event_match_score: final_event_match_score,
            location_trust_score: final_location_trust_score,
            activity_match_score,
            device_trust_score: final_device_trust_score,
            consensus_score,
            behavior_risk_score,
            verification_score,
            decision,
            decision_label,
            confidence_label,
            primary_reason,
            reason_codes: Array.from(new Set(reason_codes)),
            weakest_link: isWeakestLinkTriggered ? weakest : undefined,
            gps_spoof: gpsSpoofResult,
            evidence_forensics: forensics,
        };
    }
}
//# sourceMappingURL=fraudEngine.js.map