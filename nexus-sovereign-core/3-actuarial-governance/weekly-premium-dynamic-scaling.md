# Weekly Premium Dynamic Scaling

**Classification:** ACTUARIAL GOVERNANCE — CONFIDENTIAL
**Tier:** 3 — Actuarial Governance
**Owner:** Saloni, Nexus Core Team
**Schedule:** Every Monday at 00:00 UTC

---

## 1. Purpose

The **Weekly Premium Dynamic Scaling** system re-prices all active policies every Monday using a multi-factor actuarial model that incorporates real-time H3 geospatial risk data, Sentinel Edge anomaly scores, historical claims data, and market indices.

---

## 2. Scaling Algorithm

### Input Factors & Weights

| Factor | Weight | Source |
|---|---|---|
| H3 Resolution-11 Geospatial Risk | 35% | Nexus Oracle Matrix |
| Sentinel Edge Anomaly Score | 25% | Sentinel Edge Kernel |
| Historical Claims Velocity | 20% | ClaimCenter STP Data |
| Market Index (CAT/Reinsurance) | 20% | External Data Feed |

### Formula

```
Adjusted_Premium = Base_Premium × (1 + Σ(Factor_i × Weight_i)) × Business_Cycle_Modifier
```

Where `Business_Cycle_Modifier` is bounded by the **P-Max Solvency Circuit Breaker**.

---

## 3. Constraints & Guardrails

- Maximum single-week premium increase: **+15%**
- Maximum single-week premium decrease: **-10%**
- Minimum solvency floor ratio: **1.25x**
- Any change > 10% requires **dual underwriter approval** before application

---

## 4. Execution Flow

```
Monday 00:00 UTC
  ↓
1. Pull H3 Risk Mask (Resolution 11) for all policy locations
2. Fetch Sentinel Edge anomaly scores (last 7 days)
3. Aggregate ClaimCenter STP claims data
4. Fetch market index feed
5. Run actuarial scaling formula per policy
6. Apply P-Max Circuit Breaker checks
   ├── PASS → Push scaled premiums to PolicyCenter
   └── FAIL → HALT, notify underwriters, await manual clearance
7. Log all changes to SIEM audit trail
8. Notify CODEOWNERS of weekly run summary
```

---

## 5. Audit & Compliance

- Every premium change is logged with full actuarial trace to the SIEM
- Quarterly review by actuarial governance board
- Changes are immutable once applied — corrections require a new adjustment cycle
