import type { Specification } from '../../kernel/specification.ts';

/** A complete document that every mutation-based seal-check test starts from. */
export function validSpecification(): Specification {
  return {
    intent: { kind: 'change' },
    id: 'WC-0001',
    title: 'Reject an unsupported export field',
    target: 'example-repository',
    scope: {
      include: ['src/export/**'],
      exclude: ['src/export/legacy/**'],
    },
    constraints: ['preserve the existing wire format'],
    acceptance: [
      {
        id: 'AC-01',
        text: 'The rejection names the unsupported field and what to send instead',
        verification: 'rubric',
        rubricRationale:
          'a test can assert the field name appears; whether the instruction is followable is a judgement about wording',
        provenance: 'human_authored',
      },
      {
        id: 'AC-02',
        text: 'The named rejection test passes',
        verification: 'executable_test',
        targetTest: {
          file: 'tests/export.test.ts',
          name: 'rejects unsupported fields',
        },
        provenance: 'derived',
        derivedFrom: 'AC-01',
      },
    ],
    context: [
      {
        uri: 'specs/export.md',
        contentSha: 'b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c',
        retrievedAt: '2026-08-18T09:00:00Z',
        why: 'defines the supported fields',
      },
    ],
    authority: {
      allowed: ['edit implementation', 'add tests'],
      requiresHuman: [],
      automationLevel: 'agent-with-review',
    },
    irreversibility: 'refactor',
    risk: 'low',
    dependsOn: [],
    blockingDecisions: [],
  };
}
