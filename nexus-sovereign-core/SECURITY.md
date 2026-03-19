# 🔐 SECURITY POLICY — Nexus Sovereign Core

## OPSEC Classification: CONFIDENTIAL

---

## 1. Trusted Execution Environment (TEE) Rules

- All GAuth identity anchors MUST be validated within a hardware TEE (e.g., ARM TrustZone or Intel TDX).
- TEE attestation tokens are single-use and expire after 90 seconds.
- No plaintext credentials may reside outside the TEE boundary.
- TEE logs must be forwarded to the SIEM within 500ms of generation.

---

## 2. Android Privacy Sandbox Rules

- All mobile clients MUST comply with Android Privacy Sandbox attestation before accessing any Nexus Sovereign API.
- Device integrity is verified via **Play Integrity API** on every session initiation.
- No user PII may be transmitted without a valid sandbox attestation certificate.
- Attestation failures trigger an automatic **Strategic Blockade** (see `/4-compliance-and-opsec/strategic-blockade-rule-1.md`).

---

## 3. Data Classification

| Classification | Examples | Handling |
|---|---|---|
| **TOP SECRET** | TEE private keys, GAuth tokens | TEE-only, never logged |
| **CONFIDENTIAL** | Actuarial models, P-Max thresholds | Encrypted at rest & transit |
| **INTERNAL** | Risk dashboards, claim payloads | Role-based access (CODEOWNERS) |
| **PUBLIC** | Architecture diagrams (sanitized) | Standard git controls |

---

## 4. Incident Response

1. Isolate affected service tier immediately
2. Trigger autopilot remediation via `autopilot-remediation-trigger.json`
3. Notify security team and CODEOWNERS within 15 minutes
4. Log incident in SIEM with full TEE attestation chain

---

## 5. Reporting Vulnerabilities

Report security issues privately to the security contact listed in CODEOWNERS. Do **not** open public GitHub issues for security vulnerabilities.
