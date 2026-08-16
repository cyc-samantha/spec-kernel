import type { ProjectDeclaration } from '../ports/project.ts';

/*
 * Some slots have exactly one correct value given what is already declared.
 * Asking a person for them is theatre: it spends the requester's attention on
 * a value no answer of theirs could change, and invites a wrong one.
 */
export type Derivation =
  | { ok: true; value: unknown; reason: string }
  | { ok: false };

const UNDERIVABLE: Derivation = { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

function identifier(draft: unknown): Derivation {
  const title = isRecord(draft) ? draft['title'] : undefined;
  if (typeof title !== 'string' || !slug(title)) return UNDERIVABLE;
  return { ok: true, value: `SPEC-${slug(title)}`, reason: 'derived from the title of this work' };
}

function repository(_draft: unknown, project: ProjectDeclaration): Derivation {
  return {
    ok: true,
    value: project.target_repository,
    reason: 'the repository this project declaration names',
  };
}

const derivations = new Map<string, (draft: unknown, project: ProjectDeclaration) => Derivation>([
  ['id', identifier],
  ['target', repository],
]);

/** Whether a slot has a derivation at all, however it evaluates right now. */
export function hasDerivation(slot: string): boolean {
  return derivations.has(slot);
}

/** Returns the one correct value for a slot, or refuses so a person is asked. */
export function deriveSlot(slot: string, draft: unknown, project: ProjectDeclaration): Derivation {
  const derive = derivations.get(slot);
  if (!derive) return UNDERIVABLE;
  try {
    return derive(draft, project);
  } catch {
    // SAFETY: a derivation that cannot evaluate its input refuses, so the slot
    // falls back to a question rather than silently taking a wrong value.
    return UNDERIVABLE;
  }
}
