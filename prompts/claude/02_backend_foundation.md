Implement the backend foundation for Event Twin only.

Add:
- event_instances
- event_exposure_snapshots
- claim_verification_traces
- audit_packs

Create:
- src/types/eventTwin.ts
- src/services/signalFabric.ts
- src/services/eventTwin.ts
- src/services/fraudScoring.ts
- src/services/auditPack.ts
- src/lib/signalMath.ts

Rules:
- preserve existing contracts
- no UI changes
- additive changes only
- summarize all new entry points at the end
