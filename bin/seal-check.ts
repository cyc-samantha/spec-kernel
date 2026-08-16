import { readFile } from 'node:fs/promises';

import { assessDraft } from '../kernel/draft.ts';

const path = process.argv[2];
if (!path) throw new Error('usage: node bin/seal-check.ts <draft.json>');

try {
  const draft = JSON.parse(await readFile(path, 'utf8')) as unknown;
  const result = assessDraft(draft);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'sealed' ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
