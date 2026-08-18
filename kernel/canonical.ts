/**
 * One text for one document, so a hash of it means something.
 *
 * Keys are sorted; array order is preserved. The asymmetry is deliberate: key
 * order is an accident of whichever serialiser wrote the file, and array order
 * is content — reordering acceptance criteria changes what was agreed.
 *
 * The layer that queues contracts canonicalises the same way, and it has to stay
 * that way. Two layers that hash the same document differently cannot agree on
 * whether it changed, which is the only question a content hash is asked.
 */
import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

export function contentSha(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/**
 * The hash a signature binds to: everything except the signature itself.
 *
 * A signature that covered its own bytes could never verify, so the signed text
 * is the document with the signature removed. That also means adding a signature
 * is not an edit — the same document signed twice by two people is the same
 * document.
 */
export function signableContentSha(specification: unknown): string {
  if (typeof specification !== 'object' || specification === null) return contentSha(specification);
  const { signature, ...signable } = specification as Record<string, unknown>;
  void signature;
  return contentSha(signable);
}
