import { appendFile, readFile } from 'node:fs/promises';

import { appendOutcome } from '../kernel/outcomes.ts';

const logPath = process.argv[2];
const recordPath = process.argv[3];
if (!logPath || !recordPath) {
  throw new Error('usage: node bin/record-outcome.ts <outcomes.jsonl> <record.json>');
}

async function existing(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

try {
  const before = await existing(logPath);
  const raw = JSON.parse(await readFile(recordPath, 'utf8')) as unknown;
  const result = appendOutcome(before, raw);
  if (!result.ok) throw new Error(result.problems.join('; '));
  await appendFile(logPath, result.text.slice(before.length), 'utf8');
  console.log(JSON.stringify(result.record));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
