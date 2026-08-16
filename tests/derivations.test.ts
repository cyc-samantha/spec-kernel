import { describe, expect, it } from 'vitest';

import { deriveSlot, hasDerivation } from '../kernel/derivations.ts';
import { loadProjectDeclaration, type ProjectDeclaration } from '../ports/project.ts';

function project(): ProjectDeclaration {
  const loaded = loadProjectDeclaration({
    version: 1,
    target_repository: 'example/repository',
    slot_entitlements: { requester: ['local-user'], technical_author: ['local-user'] },
    signing_identity: 'local-user',
  });
  if (!loaded.ok) throw new Error('invalid fixture');
  return loaded.declaration;
}

describe('slots nobody should be asked about', () => {
  it('takes the target repository from the declaration that already names it', () => {
    expect(deriveSlot('target', {}, project())).toEqual({
      ok: true,
      value: 'example/repository',
      reason: 'the repository this project declaration names',
    });
  });

  it('derives an identifier from the title once a title exists', () => {
    expect(deriveSlot('id', { title: 'Map source columns onto the target system' }, project())).toEqual(
      expect.objectContaining({ ok: true, value: 'SPEC-map-source-columns-onto-the-target-system' }),
    );
  });

  it('refuses an identifier while the work has no title to derive it from', () => {
    expect(deriveSlot('id', {}, project())).toEqual({ ok: false });
  });

  it('refuses a slot it has no derivation for, so a person is asked instead', () => {
    expect(hasDerivation('risk')).toBe(false);
    expect(deriveSlot('risk', {}, project())).toEqual({ ok: false });
  });
});

describe('fail-closed behaviour', () => {
  /*
   * Revert the try/catch in deriveSlot and this goes red: the throw escapes
   * into the conversation instead of falling back to a question.
   */
  it('refuses input it cannot evaluate rather than taking a wrong value', () => {
    const unreadable = new Proxy({}, { get: () => { throw new Error('unreadable'); } });
    expect(deriveSlot('id', unreadable, project())).toEqual({ ok: false });
  });

  it('refuses a title that slugifies to nothing', () => {
    expect(deriveSlot('id', { title: '   ---   ' }, project())).toEqual({ ok: false });
  });
});
