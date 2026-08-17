# spec-kernel

The specification layer. A human intent goes in; a contract an agent team can
claim comes out.

This repository is **layer 1b**. It executes no target work, holds no
credentials, calls no service, and reaches no model runtime from anywhere in the
tree. It is a library and a set of deterministic CLIs.

## 1a authors, 1b adjudicates

**Layer 1a is an agent in a session.** It runs the interview, elicits what the
requester wants, and writes the technical half itself — that is a task an agent
does. **This repository writes nothing.** It defines what may be asked, what
shape each document takes, who may fill which slot, and every verdict; the agent
calls `bin/` to learn what is still missing and whether it is finished.

That division is the dual of a rule this repository already held in the other
direction: anything a program can check is not checked by a model. It is also
why there is no model port here. A runtime reachable from 1b would be a second,
weaker interviewer competing with the one that already holds the whole
conversation — and `tests/anti-entropy/no-model-runtime.test.ts` fails the build
if one reappears.

## Two documents, one specification

| | |
|---|---|
| **Human spec** | intent, outcome, metric, and the acceptance claims a person can read |
| **Technical spec** | target, scope, context, constraints, and the executable criteria that prove them |

Each is verified by a different question, and both are required. The human spec
is verified by **sign-off**: a named, entitled person says this is what they
want. The technical spec is verified by **no drift**: every human claim still has
technical criteria tracing to the exact text that was signed. Signed beside
drifted is not partial progress — it is refused.

`risk`, `irreversibility`, and `authority` are human-spec slots without
exception. They decide how much damage an agent may do unsupervised, and 1a
writes the technical half; put them there and it would be granting itself its
own blast radius.

An **outcome** says what the work is for. A **metric** is the predefined data
that would settle whether it happened. Neither is an acceptance criterion — no
branch can show that churn moved — but a seal with no metric is refused, because
a metric named afterwards is chosen to flatter the result and reads as evidence
while being its opposite.

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

## The questions are not authored

They are derived from the checks: a question exists exactly when there is a
downstream refusal it prevents, and each rule owns exactly one slot and one
wording. A rule and the question that fills it are one object, so the two cannot
drift apart.

Slots with a single correct value are derived and never asked — nobody is made to
invent an identifier. A value 1a drafts is not an answer: it is held beside the
document until an entitled person accepts it, and the slots that decide what an
agent may do unsupervised must be accepted one at a time.

## What ships

| Surface | Purpose |
|---|---|
| `kernel/specification.ts` | the slot schema handed toward execution |
| `kernel/rules.ts` | each deterministic check, question, entitlement, and authorship in one object |
| `kernel/derivations.ts` | the slots nobody is asked about, because one value is already correct |
| `kernel/seal-check.ts` | the complete missing-item verdict |
| `kernel/interview.ts` | the next question, the stall, and the terminal states |
| `kernel/answers.ts` | the append-only answer ledger and its entitlement check |
| `kernel/outcomes.ts` | append-only green-but-wrong learning signal |
| `kernel/split.ts` | split proposal validation by dependence and repository boundary |
| `ports/project.ts` | repository boundary, entitlement identities, and signer |
| `skills/draft-specification/` | what 1a reads for assert-first intake |
| `skills/elicit-specification/` | what 1a reads for elicit-first intake, driven only by missing items |

## Run it

```bash
npm install
npm run check
```

Check a structured draft directly:

```bash
node bin/seal-check.ts examples/engineer-draft.output.json
```

The command exits zero only for a sealed specification and prints every missing
item otherwise. `bin/interview.ts`, `bin/record-outcome.ts`, and `bin/split.ts`
expose the other deterministic surfaces; run any without arguments to see its
required files.

`.ts` runs directly under Node's type stripping. There is no build step, and
adding one would be a regression.

## Status

Slices S0–S19 are implemented and recorded in `docs/BUILD-PLAN.md`. The two-document
split (S20), the no-drift check (S21), and the outcome loop back (S22) are
specified there and not yet built — until they land, one schema still carries both
halves. Profile and Shape deliberately ship with no mechanism; they wait for a
real cross-project conflict.
