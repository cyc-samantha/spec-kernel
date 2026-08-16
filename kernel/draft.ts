import { sealCheck, type MissingItem } from './seal-check.ts';
import { specificationSchema, type Specification } from './specification.ts';

export type DraftAssessment =
  | { status: 'sealed'; specification: Specification; missing: readonly [] }
  | { status: 'incomplete'; draft: unknown; missing: readonly MissingItem[] };

/** Checks an asserted draft as written; this path asks nothing and supplies nothing. */
export function assessDraft(draft: unknown): DraftAssessment {
  const missing = sealCheck(draft);
  if (missing.length > 0) return { status: 'incomplete', draft, missing };

  const parsed = specificationSchema.safeParse(draft);
  if (!parsed.success) {
    // SAFETY: seal-check and the slot schema must agree. Refuse if a future edit
    // makes them diverge rather than returning an unchecked document as sealed.
    return {
      status: 'incomplete',
      draft,
      missing: [{
        ruleId: 'required-slots',
        slot: '(root)',
        question: 'What value belongs in each missing required specification slot?',
        entitlement: 'requester',
        message: 'the draft passed its rules but not the specification schema',
      }],
    };
  }
  return { status: 'sealed', specification: parsed.data, missing: [] };
}
