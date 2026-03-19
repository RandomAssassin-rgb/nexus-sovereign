# Android Privacy Sandbox Attestation Policy

**Classification:** COMPLIANCE & OPSEC — CONFIDENTIAL
**Tier:** 4 — Compliance & OPSEC
**Owner:** Anjali, Nexus Core Team

---

## 1. Purpose

This document defines the attestation requirements for all Android clients accessing any Nexus Sovereign API endpoint. Compliance with the **Android Privacy Sandbox** and **Google Play Integrity API** is mandatory.

---

## 2. Attestation Requirements

### 2.1 Play Integrity API

All API calls from Android devices MUST include a valid **Play Integrity token** in the request header:

```
X-Play-Integrity-Token: <INTEGRITY_TOKEN>
```

The integrity token MUST assert:
- `appRecognitionVerdict`: `PLAY_RECOGNIZED`
- `deviceRecognitionVerdict`: `MEETS_DEVICE_INTEGRITY` or `MEETS_STRONG_INTEGRITY`
- `accountDetails.appLicensingVerdict`: `LICENSED`

### 2.2 TEE Binding

The Play Integrity token MUST be bound to the active TEE session. Any mismatch between the Play Integrity device fingerprint and the TEE attestation chain triggers **Strategic Blockade Rule 1**.

---

## 3. Privacy Sandbox Compliance

| Privacy Sandbox Feature | Requirement |
|---|---|
| Topics API | Consent obtained before any ad-linked risk profiling |
| Attribution Reporting API | Only aggregate attribution; no cross-site individual tracking |
| FLEDGE/Protected Audience | Not used for claims or policy decisions |
| Private Aggregation API | Used only for anonymized H3 risk aggregation |

---

## 4. Data Minimization

- No raw device identifiers (IMEI, GAID) are transmitted or stored
- Only attested, pseudonymous device hashes are used
- All mobile telemetry is aggregated at H3 Resolution-11 before storage

---

## 5. Attestation Lifecycle

```
App Launch
  ↓
Request Play Integrity Token (fresh, max age: 60 seconds)
  ↓
Send token + TEE attestation chain to /auth/tee/attest
  ↓
Server validates token authenticity + TEE binding
  ├── PASS → Issue short-lived API access token (TTL: 90s)
  └── FAIL → Trigger Strategic Blockade Rule 1
```

---

## 6. Non-Compliance Consequences

- Immediate API access termination
- Strategic Blockade Rule 1 activated
- Incident logged to SIEM
- User notified with error code `ATTESTATION_FAILED_403`
