# spec-kernel

The specification layer. A human intent goes in; a contract an agent team can
claim comes out.

It executes nothing, holds no credentials, and calls no service. It decides only
one thing: whether a description of work is complete enough to hand to somebody
who was not in the conversation.

## The finish line is not defined here

A specification is finished when the execution layer will admit it — a document
`lite-harness/engine/contract-shape.ts` accepts, with every blocking decision
answered or explicitly deferred, and no proposed content left in it.

Defining "complete" locally would let this repository declare victory on its own
terms. It cannot; the layer that has to execute the work decides.

## It is a kernel

It holds the universal minimum and nothing else.

| | |
|---|---|
| **Kernel** | what is true of any work, in any domain |
| **Profile** | a domain's vocabulary and its extra mandatory semantics |
| **Shape** | what makes a particular kind of task falsifiable |
| **Project** | a codebase's own facts, declared in its `.spec/project.yaml` |

A new team adopts the standard by writing a project declaration — not by changing
anything here. `tests/anti-entropy/kernel-purity.test.ts` fails the build if the
kernel ever learns a project's or a domain's name.

Profile and Shape are deliberately empty. The second one arrives when a real
conflict demands it, not before.

## Two doors, one kernel

An engineer writes a draft and the kernel finds the holes. Someone who cannot
write a draft is asked, one question at a time. Same slots, same checks — only the
direction of information flow differs, and a finished specification does not
reveal which door it came through.

The questions are not authored. They are derived from the checks: a question
exists exactly when there is a downstream refusal it prevents.

## Status

Early. `docs/BUILD-PLAN.md` carries the decision ledger and the remaining slices.

```bash
npm install
npm run check
```
