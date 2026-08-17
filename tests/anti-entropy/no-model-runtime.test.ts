/**
 * The test that keeps layer 1a out of layer 1b.
 *
 * 1a is an agent in a session: it runs the interview and writes both documents.
 * 1b — this repository — defines what may be asked and adjudicates the result.
 * A model runtime reachable from here is not a convenience, it is a second and
 * weaker interviewer competing with the one that already holds the whole
 * conversation, and the pressure to add one arrives dressed as "just a fallback
 * for when something is missing" (D36).
 *
 * `kernel-purity` already forbids this inside `kernel/`. That was the right
 * boundary while an application shell was allowed to hold a port. There is no
 * shell now, so the boundary is the repository.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const REPO = new URL('../../', import.meta.url).pathname;

/**
 * Two exemptions, one reason: a rule has to be able to say what it forbids.
 * `docs/` records why the runtime was removed, and `tests/anti-entropy/` holds
 * the lists of forbidden names — scanning either makes the prohibition
 * unwritable rather than enforced.
 */
function scannedPaths(): string[] {
  const tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' });
  const exempt = (path: string): boolean =>
    path.startsWith('docs/') || path.startsWith('tests/anti-entropy/') || path === 'package-lock.json';
  return tracked.split('\n').filter((path) => path.length > 0 && !exempt(path));
}

/*
 * `CLAUDE.md` is a filename this harness reserves, not a provider this
 * repository reaches. Exempting the literal filename keeps the vendor on the
 * list, so "call the Claude API" still fails; dropping the vendor to make the
 * filename pass would be fixing the threshold instead of the code.
 */
function withoutReservedFilename(text: string): string {
  return text.replaceAll('CLAUDE.md', '');
}

async function scannedSources(): Promise<{ path: string; text: string }[]> {
  return Promise.all(
    scannedPaths().map(async (path) => ({
      path,
      text: withoutReservedFilename(await readFile(REPO + path, 'utf8')),
    })),
  );
}

/** Runtimes and providers. The bare word "model" is not on the list — it names the role, not a dependency. */
const RUNTIME_NAMES = ['ollama', 'openai', 'anthropic', 'claude', 'llama', 'qwen', 'mistral', 'gemini'];

/** The shapes a reintroduced port would take, whatever it ended up being called. */
const PORT_SHAPES = [/\bModelPort\b/, /\bmodelPort\b/, /\bports\/model\b/, /\badapters\//];

describe('no model runtime', () => {
  it('has sources to check, so a rename cannot silently empty this test', async () => {
    await expect(scannedSources()).resolves.not.toHaveLength(0);
  });

  it('names no model provider or runtime outside docs', async () => {
    const offenders = (await scannedSources()).flatMap(({ path, text }) =>
      RUNTIME_NAMES.filter((name) => new RegExp(`\\b${name}`, 'i').test(text)).map(
        (name) => `${path}: ${name}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('carries no model port, under that name or another', async () => {
    const offenders = (await scannedSources())
      .filter(({ text }) => PORT_SHAPES.some((shape) => shape.test(text)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('reaches no runtime endpoint from any tracked source', async () => {
    const offenders = (await scannedSources())
      .filter(({ path }) => path !== 'package.json')
      .filter(({ text }) => /https?:\/\/(?!\S*example)/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
