/**
 * Everything the kernel may know about the repository receiving a specification.
 * A new project is a declaration here, never a condition inside the kernel.
 */
import { z } from 'zod';

const nonBlank = z.string().trim().min(1);
export const PROJECT_DECLARATION_VERSION = 1;

export const projectDeclarationSchema = z
  .object({
    version: z.literal(PROJECT_DECLARATION_VERSION),
    target_repository: nonBlank,
    boundary_source: nonBlank.optional(),
    slot_entitlements: z
      .object({
        requester: z.array(nonBlank).min(1),
        technical_author: z.array(nonBlank).min(1),
      })
      .strict(),
    signing_identity: nonBlank,
  })
  .strict();

export type ProjectDeclaration = z.infer<typeof projectDeclarationSchema>;

export interface DeclarationProblem {
  path: string;
  message: string;
}

export type DeclarationLoad =
  | { ok: true; declaration: ProjectDeclaration }
  | { ok: false; problems: DeclarationProblem[] };

function pathOf(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

function declaredVersion(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)['version'];
}

/** Parses a declaration fail-closed, including against future schema versions. */
export function loadProjectDeclaration(raw: unknown): DeclarationLoad {
  if (typeof raw !== 'object' || raw === null) {
    return {
      ok: false,
      problems: [{ path: '(root)', message: 'project declaration is empty or not a mapping' }],
    };
  }

  const version = declaredVersion(raw);
  if (version !== PROJECT_DECLARATION_VERSION) {
    return {
      ok: false,
      problems: [{
        path: 'version',
        message: `unsupported project declaration version: ${JSON.stringify(version)}`,
      }],
    };
  }

  const parsed = projectDeclarationSchema.safeParse(raw);
  if (parsed.success) return { ok: true, declaration: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => ({
      path: pathOf(issue.path),
      message: issue.message,
    })),
  };
}
