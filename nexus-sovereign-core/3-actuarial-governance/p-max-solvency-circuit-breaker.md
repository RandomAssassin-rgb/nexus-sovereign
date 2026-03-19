# P-Max Solvency Circuit Breaker

**Classification:** ACTUARIAL GOVERNANCE — CONFIDENTIAL
**Tier:** 3 — Actuarial Governance
**Owner:** Saloni, Nexus Core Team

---

## 1. Purpose

The **P-Max Solvency Circuit Breaker** is a regulatory and actuarial safeguard that prevents premium scaling from breaching the insurer's solvency margin. When the projected premium-to-claims ratio threatens the solvency floor, this circuit breaker halts all automated rating actions and escalates to underwriting leadership.

---

## 2. Trigger Conditions

The circuit breaker activates when **any** of the following thresholds are breached:

| Condition | Threshold | Action |
|---|---|---|
| Solvency ratio drops below floor | < 1.25x | **HALT** rating engine |
| Weekly premium increase exceeds cap | > 15% | **HALT** & alert underwriters |
| Cumulative claims liability > reserve | Reserve breach | **HALT** & escalate |
| Autopilot anomaly detection confidence | > 0.85 | **PAUSE** & human review |

---

## 3. Circuit Breaker States

```
CLOSED (Normal) → OPEN (Tripped) → HALF-OPEN (Recovery Test) → CLOSED
```

- **CLOSED**: All automated rating proceeds normally.
- **OPEN**: All rating halted. Only manual overrides by senior underwriters permitted.
- **HALF-OPEN**: A single test batch is processed. If stable, moves to CLOSED; if not, returns to OPEN.

---

## 4. Remediation on Trip

1. Sentinel Edge Kernel publishes anomaly event
2. `autopilot-remediation-trigger.json` is fired automatically
3. PolicyCenter rating engine paused
4. CODEOWNERS notified within 15 minutes
5. SIEM audit entry created with full actuarial snapshot
6. Manual clearance by Saloni or delegated underwriter required to reset

---

## 5. Regulatory Alignment

This circuit breaker aligns with:
- **Solvency II** — Article 45 Own Risk and Solvency Assessment (ORSA)
- **NAIC RBC (Risk-Based Capital)** standards
- **Guidewire PolicyCenter** solvency API controls
