---
name: verify-phase
description: Run unit tests, Phase 1–2 regression + Phase 3 Contract v1.2 scenarios, 3-night determinism, benchmark, and production build, saving real evidence to docs/evidence/phase3/.
---

# Verify Phase Skill (Phase 3 — Contract v1.2)

Use this skill before tagging `phase-3`.

## Steps
1. Run unit tests (`npm run test:unit`) — zero skipped tests allowed.
2. Run headless scenarios (`node tests/run-scenarios.js --save-evidence`) covering Phase 1–2 non-replaced regressions, Phase 3 fuel/refuel/relight/drain/capacity/dawn_survived mechanics, 3-night determinism, exit code 2, and performance benchmark.
3. Run production build (`npm run build`) and verify preview HTTP 200.
4. Confirm ADR (`docs/adr/001-lantern-fuel-and-dawn-win.md`), `CHANGELOG.md`, and `docs/phase3-report.md` document every breaking change and updated/removed test.
5. Never hand-edit proof logs; re-run commands if anything changes.
