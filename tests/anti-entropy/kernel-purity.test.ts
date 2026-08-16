/**
 * The one test that keeps "works for any project" from becoming a claim nobody
 * checks.
 *
 * Every pressure on a specification layer pushes the same way: one team's work
 * needs a field nobody else needs, the fastest fix is a branch in the kernel, and
 * a year later the kernel is a pile of one team's vocabulary that no new team can
 * be added to. The rule survives only if breaking it fails the build.
 *
 * The kernel is the universal minimum. A domain's vocabulary belongs in a
 * profile, a task type's falsifiability requirements belong in a shape, and a
 * codebase's own facts belong in that codebase's `.spec/project.yaml`. Nothing
 * that names one of those three may appear here.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const KERNEL = join(import.meta.dirname, '../../kernel');

/**
 * Concrete projects in this ecosystem. The kernel may be pointed at any of them
 * and must recognise none of them.
 */
const PROJECT_NAMES = ['factory-map', 'algo-trading', 'ticket-system', 'lite-harness', 'spec-kernel'];

/**
 * Vocabulary belonging to a domain rather than to specification itself. A kernel
 * that knows what a refund is has started being one team's kernel.
 *
 * `ticket` is on the list deliberately: it is the word that arrives first and
 * carries a whole workflow model with it. The kernel says contract, criterion,
 * and decision, because those are what it can actually reason about.
 */
const DOMAIN_WORDS = ['refund', 'payment', 'invoice', 'trading', 'portfolio', 'ticket', 'sprint'];

async function kernelSources(): Promise<{ name: string; text: string }[]> {
  const names = (await readdir(KERNEL)).filter((name) => name.endsWith('.ts'));
  return Promise.all(
    names.map(async (name) => ({ name, text: await readFile(join(KERNEL, name), 'utf8') })),
  );
}

describe('kernel purity', () => {
  it('has sources to check, so a rename cannot silently empty this test', async () => {
    await expect(kernelSources()).resolves.not.toHaveLength(0);
  });

  it('never names a project', async () => {
    const offenders = (await kernelSources()).flatMap(({ name, text }) =>
      PROJECT_NAMES.filter((project) => text.includes(project)).map((project) => `${name}: ${project}`),
    );
    expect(offenders).toEqual([]);
  });

  it('never names a domain', async () => {
    const offenders = (await kernelSources()).flatMap(({ name, text }) =>
      DOMAIN_WORDS.filter((word) => new RegExp(`\\b${word}`, 'i').test(text)).map(
        (word) => `${name}: ${word}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('never hardcodes a host to talk to', async () => {
    const offenders = (await kernelSources())
      .filter(({ text }) => /https?:\/\/(?!\S*example)/.test(text))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
