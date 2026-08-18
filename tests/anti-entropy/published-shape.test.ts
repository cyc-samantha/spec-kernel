/**
 * The published shape and the shape that adjudicates must be one shape.
 *
 * `specificationSchema` types the document; `rules` decides whether a document
 * may seal. They already describe the same object, and nothing has ever made
 * them prove it. Publishing raises the cost of that divergence from "an internal
 * inconsistency" to "layer 1a generates documents this layer refuses", which is
 * the exact failure the 1a/1b split exists to prevent — and it would arrive
 * silently, one slot at a time.
 */
import { describe, expect, it } from 'vitest';

import { publishedSchema } from '../../kernel/published-schema.ts';
import { rules } from '../../kernel/rules.ts';
import { specificationSchema } from '../../kernel/specification.ts';

/** A slot the document type insists on: `undefined` is not one of its values. */
function requiredSlots(): string[] {
  const shape = specificationSchema.shape as Record<string, { safeParse(value: unknown): { success: boolean } }>;
  return Object.entries(shape)
    .filter(([, slotSchema]) => !slotSchema.safeParse(undefined).success)
    .map(([slot]) => slot);
}

describe('published shape', () => {
  it('has slots to compare, so a rename cannot silently empty this test', () => {
    expect(requiredSlots().length).toBeGreaterThan(0);
  });

  it('publishes exactly the slots the document type requires', () => {
    expect((publishedSchema().document['required'] as string[]).slice().sort()).toEqual(requiredSlots().sort());
  });

  /*
   * A published slot no rule reads is worse than an absent one: it tells 1a to
   * write a field nothing adjudicates, which is how a value comes to look
   * authoritative without being checked. Ownership is what publishes a slot —
   * not the document type, and not either tier in particular.
   */
  it('publishes no slot that no rule owns', () => {
    const owned = new Set(rules.map((rule) => rule.slot));
    const published = Object.keys(publishedSchema().document['properties'] as Record<string, unknown>);
    expect(published.filter((slot) => !owned.has(slot))).toEqual([]);
  });
});
