# Working on spec-kernel itself

This file governs work **on** this repository. It is not loaded into the
interviews this kernel conducts — those get the kernel's own rules, which are
budgeted and tested.

**The playbook in a parent directory does not apply here.** A `CLAUDE.md` above
this one describes a different harness: a pipeline of phases, an agent roster,
and `/harness:*` skills, none of which exist in this repository. Where the two
disagree, this file wins.

## What this is

The specification layer. A human intent goes in; a contract an agent team can
claim comes out. **A library and a CLI** — it executes nothing, holds no
credentials, calls no service, and reaches no model runtime from anywhere in the
tree, not only from `kernel/`.

**This is layer 1b. Layer 1a is an agent in a session.** 1a runs the interview
and writes both documents; 1b defines what may be asked, what shape each document
takes, who may fill which slot, and every verdict. **1a authors, 1b adjudicates —
nothing here writes a specification** (`docs/BUILD-PLAN.md` § D36).

What it adjudicates is **two documents** (§ D37): a *human spec* — intent,
outcome, and acceptance claims a person can read — and a *technical spec* —
target, scope, context, and the executable criteria that prove them. The human
spec is verified by sign-off, the technical spec by not having drifted from what
was signed. Both, or neither (§ D38). `risk`, `irreversibility`, and `authority`
are human-spec slots without exception: 1a writes the technical half, so putting
them there would let it grant itself its own blast radius (§ D27).

**It is a kernel.** It contains the universal minimum and nothing else. A
domain's vocabulary belongs in a profile, a task type's falsifiability
requirements belong in a shape, and a codebase's own facts belong in that
codebase's `.spec/project.yaml`. `tests/anti-entropy/kernel-purity.test.ts` is
what keeps that from being merely an intention.

The finish line is not defined here. It is defined by the execution layer: a
document its contract-shape check admits, with every blocking decision answered
or explicitly deferred, and no `proposed` provenance left in it. See
`docs/BUILD-PLAN.md` § D3.

## Where to look

| File | For |
|---|---|
| `docs/BUILD-PLAN.md` | the decision ledger, the slice history, and the planned slices — read this before changing anything |
| `docs/L1-REARCHITECTURE-TRIAGE.md` | why the layer was retargeted; superseded in part by § D36, kept for the reasoning |
| `README.md` | someone adopting the kernel |
| `CLAUDE.md` | an agent working on **this** repo |

## Commands

```bash
npm run check      # typecheck + tests
```

`.ts` runs directly under Node's type stripping — there is no build step, and
adding one would be a regression.

## Rules that are not visible in the code

- **When an anti-entropy test fails, fix the code — never the threshold.** Each
  exists because the pressure it resists is invisible in the moment and
  irreversible in aggregate.
- **A rule and the question that fills it are one object.** Two lists that must
  agree will stop agreeing. See `docs/BUILD-PLAN.md` § D6.
- **Anything checkable by a program is not checked by a model.** The model
  elicits; it does not adjudicate.
- **Every gate ships two tests**: one that goes red when its fail-closed line is
  reverted, and one that feeds it unevaluable input and asserts it refuses.
- **No new runtime dependency without asking.** It is a supply-chain decision.
- **Never `git add -A`.** Stage named paths.

## Working style here

Small commits on a branch off `main`, merged locally. **No pull request** — this
repository is the tool, not work the tool produces.

That is not a contradiction of the seal mechanism. A *specification* is sealed by
a merged pull request in the repository that owns it, because the approver's
identity and the merge commit are the signature (§ D20). This repository is not a
specification.

Commit rhythm inside a slice:

```
test: <what it asserts>      the failing test and its minimal implementation
feat: <the behaviour>
refactor: <what came out>
```

Every commit is green.

**Suspended for S19–S22, from 2026-08-17.** The layer is being retargeted and the
shape of the two documents is being found by building them, so green-per-commit
and per-slice branches are relaxed until S22 lands. Two things do not relax: a
gate still ships its two tests, and an anti-entropy failure is still fixed in the
code, never in the threshold. See `docs/BUILD-PLAN.md` § Part 2.
