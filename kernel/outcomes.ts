import { z } from 'zod';

const nonBlank = z.string().trim().min(1);

export const outcomeRecordSchema = z.object({
  specification_version: nonBlank,
  requester_verdict: z.literal('wrong'),
  missing_rule: nonBlank,
});

export type OutcomeRecord = z.infer<typeof outcomeRecordSchema>;

export type OutcomeAppend =
  | { ok: true; record: OutcomeRecord; text: string }
  | { ok: false; problems: string[] };

function recordsIn(text: string): OutcomeRecord[] | undefined {
  if (text === '') return [];
  if (!text.endsWith('\n')) return undefined;
  const lines = text.slice(0, -1).split('\n');
  const records: OutcomeRecord[] = [];
  for (const line of lines) {
    if (!line.trim()) return undefined;
    try {
      const parsed = outcomeRecordSchema.safeParse(JSON.parse(line) as unknown);
      if (!parsed.success) return undefined;
      records.push(parsed.data);
    } catch {
      return undefined;
    }
  }
  return records;
}

/** Returns a new log whose existing bytes are an untouched prefix. */
export function appendOutcome(existing: string, raw: unknown): OutcomeAppend {
  if (recordsIn(existing) === undefined) {
    return { ok: false, problems: ['the existing outcome log could not be evaluated'] };
  }
  const parsed = outcomeRecordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((issue) => issue.message) };
  return {
    ok: true,
    record: parsed.data,
    text: `${existing}${JSON.stringify(parsed.data)}\n`,
  };
}

/** The candidate rule ids S2 must eventually make load-bearing. */
export function learningCandidates(log: string): string[] {
  const records = recordsIn(log);
  if (!records) throw new Error('the outcome log could not be evaluated');
  return [...new Set(records.map((record) => record.missing_rule))];
}
