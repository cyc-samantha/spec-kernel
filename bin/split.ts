import { readFile } from 'node:fs/promises';

import { validateSplitProposal } from '../kernel/split.ts';

const intentPath = process.argv[2];
const proposalPath = process.argv[3];
if (!intentPath || !proposalPath) {
  throw new Error('usage: node bin/split.ts <parent-intent.json> <proposal.json>');
}

try {
  const intent = JSON.parse(await readFile(intentPath, 'utf8')) as unknown;
  const proposal = JSON.parse(await readFile(proposalPath, 'utf8')) as unknown;
  const result = validateSplitProposal(intent, proposal);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
