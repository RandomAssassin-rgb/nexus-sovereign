# Anti-GPS Spoofing — Implementation Summary

> **"We don't just check location — we verify whether the movement itself is physically possible."**

## Overview

This document describes the anti-GPS spoofing mechanism added to the Nexus Sovereign Fraud Engine. The implementation is lightweight, zero-dependency, and fully integrated with the existing Verification Score and Weakest Link pipeline.

---

## Detection Checks

### 1. Impossible Location Jump (PRIMARY)
- Computes **Haversine distance** between consecutive location samples.
- If distance > **5 km** within < **2 minutes** → flagged as `location_jump_violation`.
- This catches teleportation-style GPS spoofing (e.g., fake GPS apps).

### 2. Static Coordinates Anomaly
- Real mobile devices always exhibit micro-drift in GPS readings (±2–10m).
- If **80%+** of location samples share identical coordinates (to 6 decimal places) → flagged as `static_coordinates_anomaly`.
- This catches "pin-drop" spoofing where a user sets a fixed fake location.

### 3. Activity–Location Mismatch
- If the worker's GPS places them **inside the disruption zone** (confirmed by Event Twin footprint) BUT platform telemetry shows **no matching work activity** → flagged as `activity_location_mismatch`.
- This catches scenarios where a user spoofs into a high-payout zone without actually working.

---

## Scoring Impact

When `is_gps_spoof_suspected = true`:

| Score | Effect |
|---|---|
| `location_trust_score` | Reduced to **8** (jump) or **18** (other spoof) |
| `device_trust_score` | Capped at **15** (static coords) or **35** (general spoof) |
| `activity_match_score` | Capped at **22** (activity mismatch) |
| `consensus_score` | Capped at **25** (signal contradiction) |

These reductions **guarantee** the Weakest Link threshold (30) is breached, triggering automatic `HIGH RISK 🚨` escalation.

---

## Reason Code

| Code | UI Label |
|---|---|
| `GPS_SPOOF_SUSPECTED` | "Location pattern inconsistent — possible GPS spoofing detected" |

This code is injected into the `reason_codes[]` array and mapped to a human-readable label in the API response.

---

## API Response Shape

### `/api/claims/:id/jep` — fraud object

```json
{
  "fraud": {
    "verification_score": 23,
    "bucket": "escalate",
    "decision_label": "HIGH RISK 🚨",
    "gps_spoof_flag": true,
    "gps_spoof_reasons": [
      "Impossible jump detected: 12.3 km in 1.2 min",
      "GPS readings show zero variance — natural device drift absent"
    ],
    "reason_codes": ["GPS_SPOOF_SUSPECTED", "ESCALATE_WEAKEST_LINK_LOCATION_TRUST"],
    "reason_labels": ["Location pattern inconsistent — possible GPS spoofing detected", "..."],
    "weakest_link": { "label": "Location Trust", "score": 8 }
  }
}
```

### `/api/claims/explain/:id`

```json
{
  "gps_spoof_flag": true,
  "verification_score": 23
}
```

---

## UI Behaviour (JEPScreen.tsx)

When `gps_spoof_flag === true`, the "Why" section renders:

```
⚠ Location pattern inconsistent with normal movement
⚠ Activity did not match reported location
⚠ Possible GPS spoofing detected

Forensic Detail:
• Impossible jump detected: 12.3 km in 1.2 min
• GPS readings show zero variance — natural device drift absent
```

Plus the existing Weakest Check panel highlights the failing sensor (e.g., "Location Trust score was only 8/100").

---

## Files Modified

| File | Change |
|---|---|
| `src/lib/fraudEngine.ts` | Added `GpsSpoofAnalysis` interface, haversine helper, 3 detection checks, score penalties, `gps_spoof` field on `FraudMatrix` |
| `server_dev.ts` | Added `GPS_SPOOF_SUSPECTED` to reason map, `gps_spoof_flag` and `gps_spoof_reasons` to JEP and explain API responses |
| `src/screens/JEPScreen.tsx` | Added conditional GPS Spoofing Alert panel with forensic detail expansion |

---

## Design Decisions

1. **No external dependencies** — Haversine is implemented inline (~10 lines).
2. **Additive only** — All new fields are optional; existing consumers are unaffected.
3. **Demo-optimised** — Score penalties are aggressive to clearly demonstrate detection in live simulations.
4. **Explainability first** — Every detection produces a human-readable reason string that flows from engine → API → UI.

---

## Demo Script

1. Trigger a simulation with a "GPS Spoof" profile (or manually inject `locationSamples` with impossible jumps).
2. Open the JEP screen for the resulting claim.
3. The "Why" section will show the red **GPS Spoofing Suspected** alert with forensic details.
4. The Verification Matrix will show Location Trust and Device Trust bars in red (<30%).
5. The Decision Bucket will read **HIGH RISK 🚨**.

> This demonstrates that Nexus Sovereign performs physics-based movement validation — not just coordinate matching.
