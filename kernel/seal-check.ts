import { rules, type Entitlement, type RuleId } from './rules.ts';

export interface MissingItem {
  ruleId: RuleId;
  slot: string;
  question: string;
  entitlement: Entitlement;
  message: string;
}

function checkWith(rule: (typeof rules)[number], specification: unknown): MissingItem[] {
  try {
    return rule.check(specification).map((problem) => ({
      ruleId: rule.id,
      slot: problem.slot ?? rule.slot,
      question: rule.question,
      entitlement: rule.entitlement,
      message: problem.message,
    }));
  } catch {
    // SAFETY: a rule that cannot evaluate its input refuses it. Treating an
    // exception as no findings would turn malformed input into a sealed spec.
    return [{
      ruleId: rule.id,
      slot: rule.slot,
      question: rule.question,
      entitlement: rule.entitlement,
      message: 'the rule could not be evaluated',
    }];
  }
}

/** Returns every reason the document cannot yet cross the execution boundary. */
export function sealCheck(specification: unknown): MissingItem[] {
  const structural = checkWith(rules[0]!, specification);
  // A malformed document cannot be evaluated safely by rules that inspect its
  // relationships. Report its own holes, not a cascade caused by those holes.
  if (structural.length > 0) return structural;
  return rules.slice(1).flatMap((rule) => checkWith(rule, specification));
}
