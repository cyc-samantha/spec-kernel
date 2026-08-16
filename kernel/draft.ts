import { sealCheck, type MissingItem } from './seal-check.ts';
import { specificationSchema, type Specification } from './specification.ts';

export type DraftAssessment =
  | { status: 'sealed'; specification: Specification; missing: readonly [] }
  | { status: 'incomplete'; draft: unknown; missing: readonly MissingItem[] }
  | { status: 'refused'; draft: unknown; reason: string };

/** Checks an asserted draft as written; this path asks nothing and supplies nothing. */
export function assessDraft(draft: unknown): DraftAssessment {
  const missing = sealCheck(draft);
  if (missing.length > 0) return { status: 'incomplete', draft, missing };

  const parsed = specificationSchema.safeParse(draft);
  if (!parsed.success) {
    // SAFETY: the rules and the document schema must agree. A divergence is not
    // a gap any question can fill — no rule owns it — so it refuses rather than
    // inventing a slot or returning an unchecked document as sealed.
    return {
      status: 'refused',
      draft,
      reason: 'the draft passed every rule but not the specification schema',
    };
  }
  return { status: 'sealed', specification: parsed.data, missing: [] };
}
