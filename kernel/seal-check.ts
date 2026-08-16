import { rules, type Authorship, type Consequence, type Entitlement, type RuleId } from './rules.ts';

export interface MissingItem {
  ruleId: RuleId;
  slot: string;
  question: string;
  entitlement: Entitlement;
  authorship: Authorship;
  consequence: Consequence;
  valueSchema: unknown;
  message: string;
}

function gap(rule: (typeof rules)[number], slot: string, message: string): MissingItem {
  return {
    ruleId: rule.id,
    slot,
    question: rule.question,
    entitlement: rule.entitlement,
    authorship: rule.authorship,
    consequence: rule.consequence,
    valueSchema: rule.valueSchema,
    message,
  };
}

function checkWith(rule: (typeof rules)[number], specification: unknown): MissingItem[] {
  try {
    return rule.check(specification).map((problem) => gap(rule, problem.slot ?? rule.slot, problem.message));
  } catch {
    // SAFETY: a rule that cannot evaluate its input refuses it. Treating an
    // exception as no findings would turn malformed input into a sealed spec.
    return [gap(rule, rule.slot, 'the rule could not be evaluated')];
  }
}

/** Returns every reason the document cannot yet cross the execution boundary. */
export function sealCheck(specification: unknown): MissingItem[] {
  const structural = rules
    .filter((rule) => rule.tier === 'structural')
    .flatMap((rule) => checkWith(rule, specification));
  // A malformed document cannot be evaluated safely by rules that inspect its
  // relationships. Report its own holes, not a cascade caused by those holes.
  if (structural.length > 0) return structural;
  return rules.filter((rule) => rule.tier === 'relational').flatMap((rule) => checkWith(rule, specification));
}
