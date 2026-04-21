# Skill: Build Signal Fabric

Objective:
Create a normalized evidence layer for disruptions.

Tasks:
- Reuse existing intelligence routes wherever possible.
- Normalize weather, AQI, traffic, activity, consensus, and verification signals.
- For every signal, surface:
  - source
  - observed_at
  - freshness_score
  - confidence_score
  - contradiction_result
- Persist event signal snapshots for auditability.
- Connect output to Event Twin creation.
