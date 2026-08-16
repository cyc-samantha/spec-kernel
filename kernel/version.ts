/**
 * What a reader has to agree with before a sealed specification means anything.
 *
 * A specification sealed this year is read by an execution layer shipped next
 * year, and "can that still honour this?" is only answerable if both said so.
 * The execution layer already carries the mirror of this — a schema version for
 * the contract it admits, and a protocol version for what a run consumes and
 * produces. This is the upstream half of the same handshake.
 */

/**
 * Bumped when what a sealed specification *means* changes — a slot added, a slot
 * removed, a rule that admits documents it used to refuse. Not bumped when code
 * moves.
 */
export const SPEC_SCHEMA_VERSION = '1';
