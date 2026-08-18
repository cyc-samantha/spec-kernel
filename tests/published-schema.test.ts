import { describe, expect, it } from 'vitest';

import { publishedSchema } from '../kernel/published-schema.ts';
import { rules } from '../kernel/rules.ts';
import { SPEC_SCHEMA_VERSION } from '../kernel/version.ts';

const structuralSlots = rules.filter((rule) => rule.tier === 'structural').map((rule) => rule.slot);

describe('published schema', () => {
  it('states the version a consumer pins, not a snapshot of today', () => {
    expect(publishedSchema().specVersion).toBe(SPEC_SCHEMA_VERSION);
  });

  it('publishes every structural slot as a required property', () => {
    const { document } = publishedSchema();
    expect(Object.keys(document['properties'] as Record<string, unknown>).sort()).toEqual([...structuralSlots].sort());
    expect(document['required']).toEqual(structuralSlots);
  });

  /*
   * `acceptance.*.verification` is a path across criteria, not a key of the
   * document. Publishing it as a property would tell 1a to write a slot no rule
   * reads, and it would look correct until the first seal-check.
   */
  it('keeps relational paths out of the document properties', () => {
    const properties = publishedSchema().document['properties'] as Record<string, unknown>;
    expect(Object.keys(properties).filter((slot) => slot.includes('*'))).toEqual([]);
  });

  it('carries the question for every rule, so 1a can ask for what it must fill', () => {
    const published = publishedSchema().rules;
    expect(published.map((rule) => rule.id)).toEqual(rules.map((rule) => rule.id));
    expect(published.every((rule) => rule.question.trim().length > 0)).toBe(true);
  });

  it('names the dialect once, at the root, not inside every property', () => {
    const { document } = publishedSchema();
    expect(typeof document['$schema']).toBe('string');
    const properties = Object.values(document['properties'] as Record<string, Record<string, unknown>>);
    expect(properties.filter((property) => '$schema' in property)).toEqual([]);
  });
});
