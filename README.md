# spec-kernel

The specification layer. A human intent goes in; a contract an agent team can
claim comes out.

It executes no target work, holds no credentials, and calls no service. Its
authoritative verdict is whether a description of work is complete enough to
hand to somebody who was not in the conversation. Local deterministic CLIs
expose that verdict and append learning records; none invokes a model.

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

The workflow packaging is model- and vendor-neutral: each door is a plain
`SKILL.md`, while every verdict remains TypeScript that can run without a model.

## What ships

| Surface | Purpose |
|---|---|
| `kernel/specification.ts` | the slot schema handed toward execution |
| `kernel/rules.ts` | each deterministic check, question, and entitlement in one object |
| `kernel/seal-check.ts` | the complete missing-item verdict |
| `ports/project.ts` | repository boundary, entitlement identities, and signer |
| `skills/draft-specification/` | assert-first intake |
| `skills/elicit-specification/` | elicit-first intake driven only by missing items |
| `kernel/outcomes.ts` | append-only green-but-wrong learning signal |
| `kernel/split.ts` | split proposal validation by dependence and repository boundary |

## Run it

Install and verify the kernel:

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

Start the static Web UI and its local deterministic API adapter:

```bash
npm run ui
```

Then open `http://127.0.0.1:3000`. Set `SPEC_UI_PORT` to choose another local
port. The browser layer is plain HTML, CSS, and JavaScript under `ui/public/`;
the Node adapter exists so it can invoke the TypeScript kernel without adding a
bundler or build step.

## Status

The v0.1 kernel MVP is complete, and S9 adds its static Web UI: slices S0–S9 are
implemented and recorded in `docs/BUILD-PLAN.md`. Profile and Shape still
deliberately ship with no mechanism; they wait for a real cross-project
conflict.
