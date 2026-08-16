import { readFile } from 'node:fs/promises';

import { advanceInterview, type InterviewAttempt } from '../kernel/interview.ts';
import { loadProjectDeclaration } from '../ports/project.ts';

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const draftPath = process.argv[2];
const projectPath = process.argv[3];
const attemptsPath = process.argv[4];
if (!draftPath || !projectPath) {
  throw new Error('usage: node bin/interview.ts <draft.json> <project.json> [attempts.json]');
}

try {
  const project = loadProjectDeclaration(await json(projectPath));
  if (!project.ok) throw new Error(JSON.stringify(project.problems));
  const attempts = attemptsPath ? (await json(attemptsPath) as InterviewAttempt[]) : [];
  console.log(JSON.stringify(advanceInterview(await json(draftPath), project.declaration, attempts), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
