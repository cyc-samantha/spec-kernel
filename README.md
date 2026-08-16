# spec-kernel

The specification layer. A human intent goes in; a contract an agent team can
claim comes out.

The kernel executes no target work, holds no credentials, and calls no service.
Its authoritative verdict is whether a description of work is complete enough
to hand to somebody who was not in the conversation. Local deterministic CLIs
expose that verdict and append learning records.

The optional browser application can use a configured model runtime to translate
natural-language answers into candidate slot values. That model sits behind a
provider-neutral port and never decides whether the specification is complete.

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
write a draft never has to invent one: slots with a single correct value are
derived and never asked, and the rest are drafted by the model — each with the
reason it rests on — for that person to accept or replace in conversation. Same slots, same
checks, and a finished specification does not reveal which door it came through.

The questions are not authored. They are derived from the checks: a question
exists exactly when there is a downstream refusal it prevents, and each rule
owns exactly one slot and one wording.

A machine draft is not an answer. It is held beside the document until a named
person accepts it, and the slots that decide what an Agent may do unsupervised
must be accepted one at a time.

The workflow packaging and verdict remain model- and vendor-neutral: each door
is a plain `SKILL.md`, `ports/model.ts` is the only application-facing model
contract, and every verdict remains TypeScript that can run without a model.

## What ships

| Surface | Purpose |
|---|---|
| `kernel/specification.ts` | the slot schema handed toward execution |
| `kernel/rules.ts` | each deterministic check, question, entitlement, and authorship in one object |
| `kernel/derivations.ts` | the slots nobody is asked about, because one value is already correct |
| `kernel/seal-check.ts` | the complete missing-item verdict |
| `ports/project.ts` | repository boundary, entitlement identities, and signer |
| `skills/draft-specification/` | assert-first intake |
| `skills/elicit-specification/` | elicit-first intake driven only by missing items |
| `kernel/outcomes.ts` | append-only green-but-wrong learning signal |
| `kernel/split.ts` | split proposal validation by dependence and repository boundary |
| `ports/model.ts` | provider-neutral structured conversation boundary |
| `adapters/ollama.ts` | optional local-runtime adapter using native HTTP |
| `ui/conversation.ts` | entitlement-aware translation and deterministic re-check loop |

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

### Conversational UI with a local model

The UI defaults to Ollama at `http://127.0.0.1:11434` with
`qwen3.5:4b`. Install Ollama separately, then pull the model once:

```bash
ollama pull qwen3.5:4b
```

Start the UI:

```bash
npm run ui
```

Open `http://127.0.0.1:3000`. If that port is already occupied, choose another:

```bash
SPEC_UI_PORT=3107 npm run ui
```

The page accepts ordinary prose, preserves the conversation on the local server,
shows the current Rule-owned gap, and exposes the evolving specification as a
read-only detail. It enables download only after deterministic seal-check reaches
zero. If the model runtime is absent or returns invalid output, the UI reports the
failure and leaves the draft unsealed.

Runtime selection is configuration, not kernel code:

| Setting | Default | Purpose |
|---|---|---|
| `SPEC_MODEL_ADAPTER` | `ollama` | application adapter selector |
| `SPEC_MODEL_NAME` | `qwen3.5:4b` | runtime model identifier |
| `SPEC_MODEL_URL` | `http://127.0.0.1:11434` | model HTTP endpoint |
| `SPEC_MODEL_TIMEOUT_MS` | `300000` | deadline including a cold model load |
| `SPEC_MODEL_MAX_OUTPUT_TOKENS` | `1024` | ceiling for one structured proposal |
| `SPEC_USER_ID` | `local-user` | named answer author for the local project |
| `SPEC_TARGET_REPOSITORY` | `local-project` | repository receiving the specification |
| `SPEC_UI_PORT` | `3000` | loopback UI port |

For an enterprise deployment, implement `ModelPort` for the approved runtime and
inject it into `createUiServer({ model })`. The conversation, entitlement,
provenance, Rule questions, and seal-check do not change. Provider credentials
belong in that deployment adapter or its secret manager, never in `kernel/`.

The Ollama adapter disables unbounded thinking for structured extraction, caps
generated tokens, and keeps the model warm for ten minutes. It receives the
machine-readable specification schema so a small local model does not have to
guess slot shapes. A deadline is reported as `model request timed out`;
`model unavailable` is reserved for a runtime that cannot be reached.

Each turn focuses a bounded set of Rule gaps. Drafted values remain visible
across turns and never become answers because the model repeated them. Progress
messages come from the answer ledger, not model narration.

Accepting a draft is something the requester types. Agreement is recognised
deterministically, before any inference, so the model never sees a confirmation
of its own work; a message that carries content is not agreement, and is
translated as an ordinary answer instead. A draft that decides what an Agent may
do unsupervised is unreachable by a general yes and must be named. The drafts
panel reports what was guessed and why — it is not a second way to answer.

The UI process does not hot-reload source or environment variables. After an
update or configuration change, stop it with `Ctrl+C` and run `npm run ui` again.

The browser remains plain HTML, CSS, and JavaScript under `ui/public/`; there is
no framework, bundler, or build step.

## Status

The deterministic v0.1 kernel MVP and conversational workflow are complete:
slices S0–S15 are implemented and recorded in
`docs/BUILD-PLAN.md`. Profile and Shape still deliberately ship with no
mechanism; they wait for a real cross-project conflict.
