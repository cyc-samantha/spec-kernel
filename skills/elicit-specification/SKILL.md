---
name: elicit-specification
description: Elicit only the human answers that deterministic seal-check rules require, preserving authorship, authority handoffs, and blocking decisions. Use for non-technical or conversation-led specification intake where the requester starts from intent rather than a structured draft.
---

# Elicit a Specification

1. Read the repository's `.spec/project.yaml` and start a draft without inventing absent values.
2. Run `node bin/interview.ts <draft.json> <project.json> [attempts.json]`.
3. Ask exactly the `prompt` it returns. Never maintain or add to a question list.
4. Classify gaps correctly:
   - vocabulary gap: translate the question without changing its rule or slot;
   - authority gap: return the handoff; explaining harder cannot grant authority;
   - consequence gap: inspect an authoritative source rather than asking anyone to guess.
5. Record the answer and `answeredBy` only when the project declaration entitles that identity. Keep requester answers append-only.
6. Update only the answered slot, rerun the controller, and stop at `sealed`, `awaiting_technical_completion`, `blocking_decision`, or `refused`.

Never answer a question yourself. A value you supply is a proposal: it is held beside the draft, carries the reason it rests on, and becomes an answer only when an entitled person names the slot they accept. Slots marked `consequence: authority` need that confirmation one at a time. A terminal `awaiting_technical_completion` is successful, not an interview failure.

When the controller repeats a gap after a response, carry its `prompt` through as written and do not add a claim about why the gap is still open. The controller knows the slot is empty; it does not know whether the requester declined or you failed to record what they said, and blaming them is wrong in exactly the second case (S18).
