import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assessDraft } from '../kernel/draft.ts';

const GOLDEN = join(import.meta.dirname, '../examples/engineer-draft.output.json');

describe('the assert-first path', () => {
  it('admits the hand-written golden specification unchanged', () => {
    const draft = JSON.parse(readFileSync(GOLDEN, 'utf8')) as unknown;
    expect(assessDraft(draft)).toEqual({ status: 'sealed', specification: draft, missing: [] });
  });

  it('reports holes without filling or interviewing for them', () => {
    const draft = { title: 'An assertion, not a complete contract' };
    const result = assessDraft(draft);
    expect(result.status).toBe('incomplete');
    expect(result).toEqual(expect.objectContaining({ draft }));
    expect(result.status === 'incomplete' && result.missing.length).toBeGreaterThan(0);
  });

  it('does not accept its own proposal as a requirement', () => {
    const draft = JSON.parse(readFileSync(GOLDEN, 'utf8')) as {
      acceptance: { provenance: string }[];
    };
    draft.acceptance[0]!.provenance = 'proposed';
    expect(assessDraft(draft)).toEqual(
      expect.objectContaining({
        status: 'incomplete',
        missing: expect.arrayContaining([
          expect.objectContaining({ ruleId: 'proposals-resolved' }),
        ]),
      }),
    );
  });
});
