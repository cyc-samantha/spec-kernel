import type { Specification } from '../../kernel/specification.ts';

/** A complete document that every mutation-based seal-check test starts from. */
export function validSpecification(): Specification {
  return {
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
        text: 'A requester can observe that unsupported fields are rejected',
        verification: 'human_review',
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
