/**
 * The shape layer 1a builds against.
 *
 * 1a authors both documents and cannot see this repository's types. Until now it
 * had nothing to generate against, and its own ledger says so: "there is no
 * published schema to build against yet. Do not invent a competing shape and
 * reconcile later — that is the failure the 1a/1b split was designed to avoid."
 *
 * So the artifact is derived from `rules`, never written out beside them. A
 * hand-maintained schema is a second list that must agree with the first, and
 * two lists that must agree will stop agreeing (D6). Adding a rule publishes its
 * slot; removing one unpublishes it; neither needs anyone to remember.
 *
 * It carries the questions as well as the slots, because 1a runs the interview:
 * a slot it cannot ask for is a slot it cannot fill.
 */
import { rules, type Rule } from './rules.ts';
import { SPEC_SCHEMA_VERSION } from './version.ts';

type JsonSchema = Record<string, unknown>;

/*
 * The dialect is read off what zod emitted rather than written here. The one
 * place this repository may not name a URL is its own source — `no-model-runtime`
 * scans for them — and hoisting the emitted value keeps the published artifact
 * honest without putting a literal in the tree.
 */
const DIALECT = '$schema';

export interface PublishedRule {
  id: string;
  slot: string;
  question: string;
  entitlement: string;
  authorship: string;
  consequence: string;
  tier: string;
  valueSchema: JsonSchema;
}

export interface PublishedSchema {
  specVersion: string;
  document: JsonSchema;
  rules: readonly PublishedRule[];
}

function asJsonSchema(valueSchema: unknown): JsonSchema {
  return typeof valueSchema === 'object' && valueSchema !== null ? (valueSchema as JsonSchema) : {};
}

function withoutDialect(valueSchema: unknown): JsonSchema {
  const copy = { ...asJsonSchema(valueSchema) };
  delete copy[DIALECT];
  return copy;
}

function dialectOf(structural: readonly Rule[]): JsonSchema {
  const declared = structural
    .map((rule) => asJsonSchema(rule.valueSchema)[DIALECT])
    .find((dialect) => typeof dialect === 'string');
  return declared === undefined ? {} : { [DIALECT]: declared };
}

function publishRule(rule: Rule): PublishedRule {
  return {
    id: rule.id,
    slot: rule.slot,
    question: rule.question,
    entitlement: rule.entitlement,
    authorship: rule.authorship,
    consequence: rule.consequence,
    tier: rule.tier,
    valueSchema: withoutDialect(rule.valueSchema),
  };
}

/*
 * A relational rule reads across slots it does not own — `acceptance.*.verification`
 * is not a property of the document. Publishing it as one would tell 1a to write a
 * key no rule reads.
 */
function documentOf(structural: readonly Rule[]): JsonSchema {
  return {
    ...dialectOf(structural),
    type: 'object',
    properties: Object.fromEntries(structural.map((rule) => [rule.slot, withoutDialect(rule.valueSchema)])),
    required: structural.map((rule) => rule.slot),
  };
}

export function publishedSchema(): PublishedSchema {
  const structural = rules.filter((rule) => rule.tier === 'structural');
  // WHY: an empty rule set would publish `{}` — a document shape that admits
  // anything, under this repository's name. Refusing beats publishing a lie.
  if (structural.length === 0) {
    throw new Error('no structural rule declares a slot, so there is no document shape to publish');
  }
  return {
    specVersion: SPEC_SCHEMA_VERSION,
    document: documentOf(structural),
    rules: rules.map(publishRule),
  };
}
