# Strategic Blockade Rule 1 — Identity & Access Breach Response

**Classification:** COMPLIANCE & OPSEC — TOP SECRET
**Tier:** 4 — Compliance & OPSEC
**Owner:** Anjali, Saloni, Nexus Core Team

---

## 1. Definition

A **Strategic Blockade** is a full or partial access freeze imposed on one or more system tiers when a critical identity, attestation, or access violation is detected. It is the highest-severity OPSEC response, second only to a full system shutdown.

---

## 2. Blockade Trigger Conditions

Any of the following events triggers an **immediate Strategic Blockade**:

| Event | Severity | Scope |
|---|---|---|
| TEE attestation failure (3 consecutive) | CRITICAL | Full API access freeze |
| Android Play Integrity check failed | HIGH | Mobile tier blockade |
| GAuth UID mismatch with TEE token | CRITICAL | User session terminated + API freeze |
| Unauthorized CODEOWNERS change | HIGH | Repository write access suspended |
| Solvency circuit breaker tripped + API calls continue | CRITICAL | Full system blockade |
| Sentinel anomaly confidence > 0.95 | CRITICAL | Autopilot + manual blockade |

---

## 3. Blockade Actions (Ordered)

1. **Terminate** all active sessions for affected identity/tier
2. **Revoke** all TEE attestation tokens for affected scope
3. **Suspend** API access at the gateway level
4. **Alert** Anjali + Saloni + Security SIEM within **60 seconds**
5. **Preserve** immutable forensic snapshot (logs, TEE chain, request history)
6. **Initiate** incident response checklist (see `SECURITY.md`)

---

## 4. Blockade Clearance

- Clearance requires **dual approval**: Anjali AND Saloni (or designated deputies)
- New TEE attestation must be performed on a verified clean device
- Post-incident review mandatory within **48 hours**
- Full incident report filed with compliance team within **5 business days**

---

## 5. Escalation Matrix

| Time Since Trigger | Action |
|---|---|
| 0–60 seconds | Auto-blockade + automated alerts |
| 60s–15 minutes | Anjali/Saloni manual review |
| 15–60 minutes | Escalate to CISO |
| > 1 hour unresolved | Regulatory notification (if PII affected) |
