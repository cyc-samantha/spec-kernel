import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { interviewState, recordAnswer } from '../kernel/answers.ts';
import { rules } from '../kernel/rules.ts';
import { loadProjectDeclaration } from '../ports/project.ts';
import type { ProjectDeclaration } from '../ports/project.ts';

const HERE = import.meta.dirname;

function project(): ProjectDeclaration {
  const loaded = loadProjectDeclaration({
    version: 1,
    target_repository: 'example/repository',
    boundary_source: '.harness/project.yaml',
    slot_entitlements: {
      requester: ['requester@example.test'],
      technical_author: ['engineer@example.test'],
    },
    signing_identity: 'maintainer@example.test',
  });
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  return loaded.declaration;
}

describe('project declaration port', () => {
  it.each(['harness-factory-map.project.yaml', 'cfd-advisor.project.yaml'])(
    'loads the unrelated example %s without a kernel edit',
    (name) => {
      const raw = JSON.parse(readFileSync(join(HERE, '../examples', name), 'utf8')) as unknown;
      expect(loadProjectDeclaration(raw).ok).toBe(true);
    },
  );

  it('covers every entitlement class used by a rule', () => {
    const declaration = project();
    for (const rule of rules) {
      expect(declaration.slot_entitlements[rule.entitlement]).not.toHaveLength(0);
    }
  });

  it('refuses an unsupported declaration version', () => {
    expect(loadProjectDeclaration({ version: 99 })).toEqual({
      ok: false,
      problems: [expect.objectContaining({ path: 'version' })],
    });
  });

  it('refuses unevaluable input', () => {
    expect(loadProjectDeclaration(null)).toEqual({
      ok: false,
      problems: [expect.objectContaining({ path: '(root)' })],
    });
  });
});

describe('slot entitlement', () => {
  const requesterGap = {
    ruleId: 'scope-bounded' as const,
    slot: 'scope',
    question: 'What is inside this change, and what is explicitly outside it?',
    entitlement: 'requester' as const,
    message: 'missing',
  };

  it('records an answer and who supplied it when they are entitled', () => {
    const result = recordAnswer([], requesterGap, {
      value: ['generated/**'],
      answeredBy: 'requester@example.test',
    }, project());

    expect(result).toEqual({
      kind: 'recorded',
      history: [expect.objectContaining({ slot: 'scope', answeredBy: 'requester@example.test', source: 'human' })],
    });
  });

  it('turns an unentitled answer into a handoff without recording it', () => {
    const result = recordAnswer([], requesterGap, {
      value: ['generated/**'],
      answeredBy: 'engineer@example.test',
    }, project());

    expect(result).toEqual({
      kind: 'handoff',
      history: [],
      slot: 'scope',
      required: 'requester',
      answeredBy: 'engineer@example.test',
    });
  });

  it('keeps requester answers append-only and refuses a technical rewrite', () => {
    const first = recordAnswer([], requesterGap, {
      value: ['generated/**'],
      answeredBy: 'requester@example.test',
    }, project());
    if (first.kind !== 'recorded') throw new Error('fixture answer was not recorded');

    const technicalGap = { ...requesterGap, entitlement: 'technical_author' as const };
    const rewrite = recordAnswer(first.history, technicalGap, {
      value: [],
      answeredBy: 'engineer@example.test',
    }, project());
    expect(rewrite.kind).toBe('handoff');
    expect(rewrite.history).toEqual(first.history);

    const reanswer = recordAnswer(first.history, requesterGap, {
      value: [],
      answeredBy: 'requester@example.test',
    }, project());
    expect(reanswer.kind).toBe('recorded');
    expect(reanswer.history).toHaveLength(2);
    expect(first.history).toHaveLength(1);
  });
});

describe('interview terminal state', () => {
  it('treats a technical-only handoff as successful completion', () => {
    expect(interviewState([{ entitlement: 'technical_author' }])).toEqual({
      status: 'awaiting_technical_completion',
      successful: true,
    });
  });

  it('does not call requester-owned gaps complete', () => {
    expect(interviewState([{ entitlement: 'requester' }])).toEqual({
      status: 'in_progress',
      successful: false,
    });
  });

  it('calls a zero-gap specification sealed', () => {
    expect(interviewState([])).toEqual({ status: 'sealed', successful: true });
  });
});
