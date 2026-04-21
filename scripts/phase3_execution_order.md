# Phase 3 Execution Order

## 1. Planning
- Run Antigravity workflow: `/nexusphase3`
- Review `docs/EVENT_TWIN_SPEC.md`

## 2. Backend foundation
- apply SQL migration
- wire `src/types/eventTwin.ts`
- wire `src/services/*`
- connect grouped `/api/*` routes

## 3. UI upgrades
- AdminTriggers.tsx
- AdminRisk.tsx
- Claims.tsx
- JEPScreen.tsx
- AdminDashboard.tsx
- Home.tsx
- AdminPartners.tsx

## 4. Demo hardening
- use `docs/DEMO_SCRIPT_TEMPLATE.md`
- validate one valid claim path
- validate one suspicious hold path
- validate audit pack visibility

## 5. Fallback lane
If Antigravity quota/rate slows down:
- use `prompts/claude/01_repo_map.md`
- then `prompts/claude/02_backend_foundation.md`
- continue prompt-by-prompt with local `qwen3.5`
