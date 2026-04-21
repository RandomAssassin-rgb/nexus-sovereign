---
description: Upgrade Nexus Sovereign into a finalist-grade Phase 3 Event Twin + Signal Fabric build
---

When the user types `/nexusphase3`, orchestrate this sequence using `.agents/agents.md`,
`.agents/rules/`, and `.agents/skills/`.

Execution order:
1. Apply `nexus-sovereign-core.md`.
2. Act as @pm and execute `01_write_phase3_spec.md`.
3. Pause to review architecture decisions before code changes.
4. Act as @signals and execute `02_build_signal_fabric.md`.
5. Act as @fraud and execute `04_harden_fraud.md`.
6. Act as @payout and execute `05_build_payout_explainer.md`.
7. Act as @dashboard and map UI changes to:
   - AdminTriggers.tsx
   - AdminRisk.tsx
   - AdminDashboard.tsx
   - Claims.tsx
   - JEPScreen.tsx
   - Home.tsx
   - AdminPartners.tsx
8. Act as @biz and execute `07_build_business_model.md`.
9. Act as @qa and execute `08_prepare_final_demo.md`.
10. Generate a final implementation checklist and dependency order.
