---
name: verify-phase
description: Run unit tests, Phase 1 regression + Phase 2 headless scenarios, 3-night determinism, 21600-tick Night 3 benchmark, and production build, saving real evidence to docs/evidence/phase2/.
---

# Verify Phase Skill (Phase 2 — Contract v1.1)

Use this skill at every milestone and before tagging `phase-2`.

## Steps
1. Run unit tests (including Contract v1.1 tick order & physics): `npm run test:unit`
2. Run headless scenarios (Phase 1 regression + all Phase 2 mechanics + 3-night determinism + exit code 2): `npm run test:scenarios`
3. Run 21,600-tick Night 3 headless benchmark and assert elapsed wall time `<= 30 s`.
4. Run production build: `npm run build`
5. Save real command outputs and JSONL traces into `docs/evidence/phase2/` (never hand-edit proof files).
6. Verify every item in `docs/phase2-spec.md` has corresponding passing evidence.
