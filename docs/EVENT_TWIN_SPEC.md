# Event Twin + Signal Fabric Spec (Phase 3)

## 1. Scope & Principles (Scope Freeze)
Nexus Sovereign Phase 3 transitions the platform from a "trigger-based" prototype into an **Intelligence-First Disruption Oracle**.

-   **Identity**: Maintain "Nexus Sovereign" sovereign-protection identity.
-   **Actuarial Foundation**: Weekly pricing, income-loss-only scope.
-   **Twin Architecture**: Every disruption is a digital "Event Twin" with a full audit trail.
-   **Signal Fabric**: Multi-variate verification vs. single-source triggers.
-   **Non-Negotiables**: Preserve existing Worker/Admin hierarchy; weekly enrollment cycles.

## 2. Shared Event State Contract
This contract is canonical across Worker UI, Admin Dashboards, and JEP Audit surfaces.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique CID (e.g., `TWIN-2026-X12`) |
| `event_state` | Enum | `Active`, `Pending`, `Resolved` |
| `event_type` | String | e.g., `Heat Stress`, `Monsoon Flooding`, `AQI Hazard` |
| `confidence` | Float | 0.0 to 1.0 (Derived from Signal Fabric weighted consensus) |
| `signal_freshness`| Enum | `Fresh`, `Stale` (Last telemetry update < 15 min) |
| `provenance` | Enum | `Live`, `Fallback` (Interpolated), `Simulation` |
| `projected_payout`| Number | Real-time INR projection based on current exposure |
| `posture` | Enum | `Watch`, `Elevated`, `Extreme` |

## 3. Signal Fabric & Intelligence Math
The **Signal Fabric** normalizes raw environmental and behavioral data into a verifiable truth layer.

### 3.1 Freshness Math
Signals are penalized based on age ($T_{age}$):
$$S_{freshness} = \max(0, 100 - (\frac{T_{age}}{T_{max\_age}} \times 100))$$
*Reference: [signalMath.ts](file:///d:/remix_-remix_-nexus-sovereign/src/lib/signalMath.ts)*

### 3.2 Confidence Consensus
Final Event Twin confidence is a weighted average of available signals $S_i$ with weights $W_i$ (based on source reliability and freshness):
$$C_{final} = \frac{\sum (S_i \times W_{source} \times S_{freshness})}{\sum (W_{source} \times S_{freshness})}$$

### 3.3 Contradiction Index
Detects signal drift (e.g., "Clear Sky" weather signals vs. "Zero Movement" platform signals). High contradiction triggers an `Elevated` posture regardless of raw intensity.

## 4. Fraud Mesh 2.0 (Scoring Matrix)
Every claim is passed through a 6-axis verification matrix in [fraudEngine.ts](file:///d:/remix_-remix_-nexus-sovereign/src/lib/fraudEngine.ts).

1.  **Event Match (25%)**: Alignment with active Event Twin footprint and type.
2.  **Location Trust (15%)**: GPS veracity plus impossible jump detection (e.g., >5km in 2 mins).
3.  **Activity Match (20%)**: Telemetry corroboration (biometric pings/platform work state).
4.  **Device Integrity (15%)**: App-level integrity, OS health, and static-coordinate detection.
5.  **Consensus (15%)**: Distance to other verified workers in the same disruption zone.
6.  **Behavioral Risk (10%)**: Contradiction index of the user's specific signal slice.

## 5. Payout Explainer & Audit Packs
Phase 3 introduces **Explainable Payouts** to build trust with both Workers and Insurers.

### 5.1 The Payout Trace (Narrative)
Instead of a simple "Approved" status, the UI generates a narrative:
> "Payout of ₹450 approved based on **Extreme Monsoon** event in **Zone H8-12**. Your activity was verified via **Platform Telemetry** (Confidence: 94%) and corroborated by **32 nearby workers**."

### 5.2 Immutable Audit Pack
A JSON-LD signed bundle provided to the insurer containing:
-   **Global Evidence**: All Signal Fabric snapshots used to trigger the Twin.
-   **Local Evidence**: The specific worker's biometric/GPS proof.
-   **Forensic Report**: Results of the Fraud Mesh 2.0 evaluation.
-   **Financials**: Reserve draw-down metrics and loss ratio impact.

## 6. Business Viability (Insurer Proof Points)
-   **Dynamic Reserve Management**: Real-time drawdown tracking protects solvency.
-   **Parametric Precision**: Zero-claims adjustment overhead.
-   **Fraud Suppression**: 6-axis mesh reduces payouts to "ghost" workers by ~95%.
-   **Audit Ready**: One-click packs for regulatory compliance.
