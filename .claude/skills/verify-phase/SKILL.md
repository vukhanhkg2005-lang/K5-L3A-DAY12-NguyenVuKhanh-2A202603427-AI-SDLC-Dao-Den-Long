---
name: verify-phase
description: Run all unit tests, headless scenarios, determinism checks, and production build, then save fresh real evidence to docs/proof/.
---

# Verify Phase Skill

Use this skill at the end of every implementation milestone and before tagging `phase-N`.

## Steps
1. Run unit tests: `npm run test:unit`
2. Run headless contract scenarios & determinism check: `npm run test:scenarios`
3. Run production build: `npm run build`
4. Capture real command output and scenario results into `docs/proof/phase-N/`.
5. Confirm `game.contract.json` tuning values match simulation behavior and every requirement in the phase checklist has verifiable evidence.
6. Never edit output logs manually; if any check fails, fix the code and re-run.
