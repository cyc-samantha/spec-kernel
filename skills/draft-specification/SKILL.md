---
name: draft-specification
description: Turn an engineer's prose or structured draft into the kernel specification shape and report deterministic seal-check gaps without interviewing or inventing answers. Use when an author wants assert-first specification intake, draft validation, or a sealed-spec readiness report.
---

# Draft Specification

1. Read the repository's `.spec/project.yaml` declaration and the supplied draft.
2. Preserve every asserted requirement. Record system suggestions only as `provenance: proposed`; never silently promote them to requirements.
3. Shape the asserted content as the contract in `kernel/specification.ts`. Leave unavailable values absent rather than guessing.
4. Run `node bin/seal-check.ts <draft.json>` from this repository.
5. If it exits zero, return the specification unchanged. Otherwise report every emitted missing item concisely, grouped by `ruleId`.

Do not start an interview. Do not maintain a question list: any question text shown in a missing item comes from its Rule object. Do not decide whether a criterion is verifiable; the deterministic seal-check owns that decision.
