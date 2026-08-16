# Build Plan

Written so that someone — or something — arriving with no prior conversation can
pick this up and continue. Read it before changing anything.

Part 1 is the decision ledger. It is the acceptance criteria for every slice; when
a question comes up mid-build, look it up here rather than re-deciding it. Part 2
is the engineering contract. Part 3 is the completed slice history.

---

## Where this sits

Three layers, three repositories, already partly built.

```
L1  spec-kernel          human intent  ->  sealed specification        <- this repo
        │
L2  agent-ticket-system  sealed spec   ->  contract, queue, ledger
        │
L3  lite-harness         contract      ->  branch + evidence per criterion
```

`harness-factory-map` is **an instance, not a layer**: a real project that has
hand-written specifications in the shape L1 should be producing. It is a useful
example and a purity pressure test. It is never a source of content for the
kernel.

L2 and L3 exist and work. This repository is the missing front half.

---

# Part 1 — Decision ledger

## Positioning

| # | Decision |
|---|---|
| **D1** | spec-kernel is L1. Input is a human intent; output is a contract an agent team can claim. |
| **D2** | It is a **kernel**: it contains no domain, project, or repository name. `harness-factory-map` is an instance, not a content source. |
| **D3** | **The finish line already exists in code.** A document that `lite-harness/engine/contract-shape.ts` admits, with every `blockingDecisions` entry answered or explicitly deferred, and no `provenance: proposed` remaining. There is no second standard. |
| **D4** | Four layers: **Kernel** (universal) / **Profile** (domain vocabulary) / **Shape** (task-type falsifiability requirements) / **Project** (`.spec/project.yaml`). **Profile and Shape ship empty in v1** — not even the mechanism. Wait for a real conflict. |

## Purity

| # | Decision |
|---|---|
| **D5** | Purity is enforced by tests, not by rules. `kernel-purity`: no project name, no domain vocabulary, no host inside `kernel/`. `examples/` is not scanned. |
| **D6** | **The question set is derived from the seal-check rules, never authored.** One extra question means somebody put a personal best practice in the kernel; one missing question means a gate will refuse downstream something a human was never asked about. The wording is part of the derivation: one rule owns exactly one slot and one question, because a wording shared by many slots cannot tell a person which gap it means (S11). |
| **D7** | 1→N acceptance: **two unrelated projects onboard with zero edits to `kernel/`.** |

## The interview

| # | Decision |
|---|---|
| **D8** | The interviewer **may not answer its own question.** It may propose; a proposal is held beside the draft, never inside it, and becomes an answer only when an entitled person names the slot they accept (see D26). A draft that arrives with `provenance: proposed` is refused by the same rule. |
| **D9** | Stop condition is **seal-check reaching zero**, not a question count and not a turn count. |
| **D10** | The same question asked twice in different words, yielding nothing new, is not a question — it is a `blocking_decision`. (The interview can fixate too.) |
| **D11** | Two doors. **Engineer door = assert-first** (you write, the kernel finds the holes). **Non-technical door = elicit-first** (the kernel asks, you answer). Same slots, same seal-check; only the direction of information flow differs. |
| **D12** | A door is a **default, not a permission.** The interview must be able to disconfirm it: an engineer who cannot name `scope.exclude` gets the same handoff as anyone else, and a non-technical requester who can name it is allowed to. |
| **D13** | Doors must be **erasable**: reading a finished specification, you should not be able to tell which door it came through except by reading provenance. No seal-check rule may branch on entry point. |

## People and authority

| # | Decision |
|---|---|
| **D14** | Three gaps, three different responses, never conflated: **vocabulary** (translate) / **authority** (route) / **consequence** (go and look it up). Explaining harder to an authority gap produces a confident wrong answer — and seal-check passes it, because the field has a value. |
| **D15** | **Slot entitlement.** Every slot declares who may fill it; entitlement comes from `.spec/project.yaml`; every answer records `answered_by`. Filling a slot you are not entitled to is a **handoff, not an answer**. |
| **D16** | `awaiting_technical_completion` is a **successful** terminal state, not a failure. A non-technical interview ends normally with an incomplete specification. |
| **D17** | Requester answers are append-only. The technical author may not rewrite them — only the requester may re-answer. Otherwise scope moves invisibly. |
| **D18** | Acceptance criteria have two forms and must stay linked: the requester's observable claim (`human_authored`) and the executable test (`derived`, carrying **`derivedFrom`** pointing at its parent). `lite-harness/ports/work-source.ts` has `derived` but **no parent pointer today** — this field has to be added, and with it the coverage check that every `human_authored` criterion has at least one `derived` child. Without it you get all-green evidence and an unhappy requester, with no way to find where it was lost. |

## Boundary and provenance

| # | Decision |
|---|---|
| **D19** | **DONE = verified change candidate** (a branch with evidence). This is a kernel constant, not a project option: a criterion whose evidence cannot be produced inside the execution layer's boundary is refused. Making it configurable would let a project declare criteria the harness cannot prove, which turns evidence into decoration. |
| **D20** | Seal = a **merged pull request in the repository that owns the specification.** `content_sha` is the blob sha, `signed_by` is the approver, `signed_at` is the merge time, and version n+1 is the next commit. **v1 needs no signature service.** |
| **D21** | One contract targets exactly **one repository**. Cross-repository work is split into a parent intent and one contract per repository, each sealed separately. |
| **D22** | The source rule is about provenance, not traffic: **every contract traces, by an unbroken chain of named authorship, to a human intent that came through a door.** Not "every contract walks a door" — a split (1 intent → N contracts), a mechanical sweep (one door-walk defines a policy, many instances follow), and a learning-loop proposal (a human carries it through the door) all satisfy it. |
| **D23** | The real risk to D22 is not agents originating work — it is somebody adding a convenience endpoint to L2. **The ledger must accept contracts from exactly one source, and an anti-entropy test in `agent-ticket-system` must say so.** Not this repository's slice, but do not lose it. |
| **D24** | Model use is an **optional application concern behind `ModelPort`**. The kernel never knows a provider, model name, protocol, or availability state. A hobby deployment may use a local runtime; an enterprise deployment replaces only the adapter. |
| **D25** | A model returns candidate values for Rule-owned gaps, never a seal verdict. The application matches each candidate to an offered gap, checks entitlement and named authorship, applies it in isolation, then reruns deterministic seal-check. Malformed, unavailable, or out-of-scope model output is refused. |
| **D26** | **A requester is never asked to produce a value from nothing.** Every open slot is either *derived* — one correct value follows from what is already declared, so nobody is asked — or *drafted* by the model with the reason it rests on, for a person to confirm or correct. A draft is held beside the document until confirmed; confirmation is deterministic and must name each slot it accepts. Machine-authored is not machine-approved. |
| **D27** | **`risk`, `irreversibility`, and `authority` are marked `consequence: authority` and can never be `machine_derives`.** They decide how much damage an agent may do unsupervised. A machine that fills them silently has granted itself the permission, and seal-check passes it because the field has a value (D14). The UI renders them apart and unticked; the kernel refuses a blanket confirmation. |
| **D28** | **A gap with a draft on offer is asked as a confirmation, and a draft the requester has not seen counts as progress under D10.** Otherwise the interview argues with its own suggestion: it shows a drafted value and in the same breath complains the question went unanswered, then declares a blocking decision over a slot it has already filled. The same draft a second time is *not* progress — an ignored suggestion must not keep an interview alive forever. |
| **D29** | **The interviewer's prose is carried only when the ledger backs it.** A model summary is dropped unless the turn recorded an answer or kept a draft, and a confirmation names the slots it wrote. A requester cannot distinguish a fluent summary from a result, so an unbacked summary is a claim of progress the document does not support (D22). |
| **D30** | **A model adapter declares its context window and refuses a reply that overran it.** A local runtime whose window cannot hold the prompt does not fail — it discards the oldest tokens, which are the instructions, and answers HTTP 200 anyway. The reply is fluent and grounded in nothing. Inheriting the runtime's default window is therefore a fail-open on the one input the kernel cannot re-derive: what the requester actually said. |
| **D31** | **The parent intent a split traces to is derived from the sealed document, never re-elicited, and splitting is a capability a deployment may not have.** Re-asking for the parent would restart the authorship chain at whoever happens to be dividing the work (D22). `SplitPort` is separate from `ModelPort` so a deployment that only elicits one bounded change need not implement it — and one that cannot split refuses the route rather than sourcing a division from somewhere else. |
| **D32** | **A pending model draft survives turns and can be approved only through the named human confirmation route.** The next model turn receives pending drafts but cannot copy one into `answers`; explicit corrections focus only their named pending gap. Model prose never narrates progress; the answer ledger does. *Amended by D33: the route is a spoken one, and a differing value is a human answer rather than a redirected proposal.* |
| **D33** | **A specification has one entrance: what a person says in the interview.** Accepting a draft is read out of the message, deterministically, before the model is consulted — a translator that could recognise its own approval would be approving its own work (D8), so agreement never reaches it. Recognition stays narrow: a message carrying content falls through to an ordinary turn, where a value the human stated outranks any draft standing in that slot, because discarding it leaves the machine's guess in its place. A draft whose consequence is `authority` is unreachable by a general agreement and must be named (D14). No second route writes to the document — a tick box beside a conversation that keeps asking the same question teaches a requester that answering does nothing. |
| **D34** | **The translator is told which slots hold a draft, never what the draft says.** Measured on `qwen3.5:2b`: the turn enumerating four column mappings returned one — the mapping the standing draft held — and returned all four with that draft withheld. A drafted value in view is something to copy, and copying is cheaper than reading, so carrying it forward buys nothing and costs the message. The slot name is the whole requirement: enough not to spend a bounded budget redrafting, with nothing to reproduce in place of what the requester said. |
| **D35** | **A value's shape is enforced where it is generated, not refused after it arrives.** The translator was handed a description of the shape and an unconstrained slot to put it in; both local models filled the slot with a self-describing envelope built out of the description. A gap already carries its schema, so the provider format names one variant per offered gap with that schema in place. What a gap does *not* hand the translator matters as much: entitlement, authorship, and the human-facing refusal message were adjacent fields to copy into the value, and both models copied them. |
## Known gaps, and what happens to each

| Gap | Decision |
|---|---|
| Exploratory work has no route | **Build it** (S6). Without a spike outlet the interview grinds people who are still exploring, and they route around the system entirely — leaving only the requests that were already clear, which are the least valuable half. |
| No artifact for "all criteria green, still wrong" | **Build it** (S7). It is the only input that makes the kernel improve, and the signal is unrecoverable if not captured from the first run. |
| In-flight overlap is invisible to the interview | **Wait for a signal.** Only appears on success — ten contracts a day against one repository, each sealed against a different base. |
| Vagueness is free to the requester | **Wait for a signal.** Every escape hatch costs the platform, not the person; pricing that needs real abuse data to design. |

---

# Part 2 — Engineering contract

- **Stack**: TypeScript + vitest (+ zod from S1). `.ts` runs directly under Node's
  type stripping. **No build step** — adding one is a regression. Mirrors
  `lite-harness` deliberately: two repositories that hand documents to each other
  stay honest more cheaply when neither needs a mapping layer to read the other.
- **TDD.** The failing test and its minimal implementation land in one commit.
- **Anti-entropy tests: fix the code, never the threshold.**
- **Every gate ships two tests**: one that goes red when the fail-closed line is
  reverted, and one that feeds unevaluable input and asserts refusal.
- **Anything a program can check is not checked by a model.** The model elicits;
  it does not adjudicate.
- **No new runtime dependency without asking.**
- **Never `git add -A`.**
- **Branch per slice off `main`, merged locally, branch deleted. No pull
  request** — this repository is the tool, not work the tool produces. (Not a
  contradiction of D20: a *specification* is sealed by a merged PR in the
  repository that owns it. This repository is not a specification.)

Commit rhythm inside a slice:

```
test: <what it asserts>     the red test and its minimal implementation
feat: <the behaviour>
refactor: <what came out>
```

Every commit is green.

---

# Part 3 — Slice history

Order matters. **S0 → S1 → S2 is a straight line with nothing inserted into it**:
until the rules exist and S2 has locked them down, no skill should exist, or the
question set will grow before the rules do and D6 is unrecoverable.

After S3, S4 and S5 can proceed in parallel — different doors over one
seal-check.

---

### S0 · Skeleton and the purity test — **DONE**

`branch: s0-skeleton`

Toolchain, `CLAUDE.md`, this document, `kernel/version.ts`, and
`tests/anti-entropy/kernel-purity.test.ts`.

The purity test landed with the first line of kernel code on purpose. `The rule
survives only if breaking it fails the build` — a day later is already too late.

---

### S1 · Slot model and seal-check (**deterministic, no model**) — **DONE**

`branch: s1-seal-check`

The heart. Every later slice hangs off it.

**The design decision that carries the slice** — a rule is *one object* carrying
its check, its question, and its entitlement together:

```
Rule {
  id
  slot
  check(spec) -> ok | missing
  question        // what to ask when this slot is empty
  entitlement     // which class of person may fill it
}
```

Rule and question in one definition means they cannot drift. Two lists that must
agree will stop agreeing; this removes the possibility rather than testing for it.

**v1 rules — these and no others:**

1. Required slots present and non-blank.
2. An `executable_test` criterion names a target test.
3. Criterion ids are unique.
4. The `blockingDecisions` key is present (`[]` and absent mean different things —
   "we looked and there are none" versus "nobody looked").
5. No `provenance: proposed` remains.
6. Every `human_authored` criterion has at least one `derived` criterion pointing
   at it via `derivedFrom` (D18).
7. Every criterion's verification mechanism is one the execution layer can
   actually produce evidence for (D19).

Output is a list of missing items, each carrying its rule id.

**Done when**: a complete hand-written specification yields zero missing items,
and removing any one slot makes exactly the corresponding rule report.

---

### S2 · The question-derivation test — **DONE**

`branch: s2-question-derivation`

For **every** rule, a fixture where removing that answer makes seal-check red.
Missing any one, the test fails.

The type already guarantees rule-to-question is one-to-one (S1's design), so this
test asserts the harder thing: **every question is load-bearing.** A question that
cannot name a downstream refusal is caught here.

**Done when**: `rules.length === fixtures.length`, and each fixture demonstrates
its rule biting.

---

### S3 · The project port, entitlement, and two real projects — **DONE**

`branch: s3-project-port`

Modelled on `lite-harness/ports/project-capabilities.ts`, including its
discipline:

> *If the engine ever needs to know something about a project that cannot be said
> here, that is the signal to extend this schema, not to special-case the
> project.*

- Port schema: target repository, boundary source (optional), the slot
  entitlement table, signing identity.
- `answered_by` validation: an answer from a party not entitled to that slot is a
  handoff, not an answer (D15).
- `awaiting_technical_completion` as a successful terminal state (D16).
- Requester slots are append-only (D17).
- `examples/` carries two real declarations, for two unrelated projects.

**Deliberately early.** This is purity's first real pressure test; done last, the
kernel would already be shaped by whichever project came first.

**Done when**: both example declarations parse and `kernel-purity` is still green
— the first demonstration of D7.

---

### S4 · The engineer door — assert-first — **DONE**

`branch: s4-draft`

Prose or a draft goes in, a specification comes out, seal-check runs, gaps are
reported. **No interview.** Most of the time an engineer gets three lines back
("this criterion names no test") and is finished.

Add the D13 assertion to `kernel-purity` here, once an entry point exists to
branch on: no kernel source may condition on which door was used.

**Done when**: a hand-written draft produces a document S1 admits, and
`examples/` carries a golden output to compare against. The golden output lives in
`examples/`, never in `kernel/` — it is an example, not an authority.

---

### S5 · The non-technical door — elicit-first — **DONE**

`branch: s5-grill`

The interview is driven entirely by seal-check's missing list. **There is no
question set inside the skill**; the questions come from S1's rules.

Must hold: D8 (never answers itself), D9 (stops at zero), D10 (repetition becomes
a blocking decision), D15 (unentitled slot becomes a handoff), and above all —

> **it says "that did not answer the question I asked."**

If it cannot do that, it should be replaced by a form and the model spend saved.

**Done when**: for one requirement, S4 and S5 produce documents of the *same
shape* — the practical test of D13.

---

### S6 · The spike outlet — **DONE**

`branch: s6-spike`

`intent.kind: change | spike`. A spike's criteria are of the form "we now know X";
its output is knowledge, not a change, and its admissible verification mechanisms
differ. A kernel constant, not a profile — "I do not know yet" is universal.

---

### S7 · The "green but wrong" record — **DONE**

`branch: s7-outcome`

Append-only: specification version, the requester's verdict, and **which rule was
missing**.

Its purpose is not reporting. It feeds S2: every "all criteria green and the
requester says no" means seal-check is short a rule or a slot went unasked. This
is the only mechanism by which the kernel grows a new question.

Keep it small — an append-only file is enough. **Its value is in existing, not in
being good.**

---

### S8 · Split, and one contract per repository — **DONE**

`branch: s8-split`

Criteria as in `lite-harness/roles/splitter.md` — **dependence, not count** — plus
D21.

Last on purpose: v1 may require a human to bring one bounded change.

---

### S9 · Static Web UI — **DONE**

`branch: s9-local-ui`

A thin static JavaScript browser surface over the existing deterministic entry
points, with a native Node adapter for local preview and API transport. It edits
a draft and project declaration, runs seal-check, and advances one interview
step. It owns no rule, question, entitlement, or verdict.

- Native Node HTTP and browser APIs only: no framework, bundler, or build step.
- Listens on loopback by default and calls no external service.
- Untrusted specification text is rendered as text, never markup.
- Malformed or oversized input is refused before it reaches a kernel function.

**Done when**: the golden example seals through the HTTP API, an incomplete
draft displays its Rule-derived missing item and next question, malformed input
is refused, and `npm run ui` serves the browser surface locally.

---

### S10 · Adaptable conversational runtime — **DONE**

`branch: s10-conversational-runtime`

The browser entry point is natural language rather than a JSON workbench. Its
server-side session holds the evolving draft, authorship, and attempt history;
the browser cannot submit a replacement history. Each human turn is translated
into candidate values for the currently offered Rule gaps, and one inference may
cover several gaps so local hardware does not pay one inference per slot.

- `ports/model.ts` is the provider-neutral boundary.
- `adapters/ollama.ts` is the first replaceable adapter and uses native `fetch`.
- No provider SDK or new runtime package is installed.
- The model cannot choose an unoffered slot and cannot return `sealed`.
- Offline, malformed, oversized, duplicate, or out-of-scope model output refuses
  without advancing the draft.
- Structured extraction disables unbounded thinking, caps output, keeps the
  model warm, and distinguishes a deadline from an unreachable runtime.
- The translator receives the specification's machine-readable schema. It may
  translate a human fact into that shape; it still may not invent a fact or a
  verdict.
- A locally entitled identity may fill both requester and technical-author gaps;
  otherwise the same workflow ends in the successful technical handoff from D16.

**Done when**: a browser user starts with prose, the conversation displays only
Rule-derived questions, an entitled answer reaches the deterministic sealed
state through the same kernel functions, and an unavailable model leaves the
draft unsealed with a clear error.

---

### S11 · Machine drafts, human confirms — **DONE**

`branch: s11-machine-drafts-human-confirms`

One rule covered twelve required slots behind one wording, so the interview
asked the same generic question repeatedly and a requester could not tell which
gap it meant. Worse, several of those slots held values no requester could ever
produce — an identifier, a content sha, a repository name — while the translator
was correctly forbidden from inventing them. The conversation could not end.

- Each required slot is its own rule: its own question, entitlement, value
  schema, and declaration of who may originate its value.
- Rules carry a tier. Relational rules do not run until every structural rule
  admits the document, so one missing slot cannot cascade into questions about
  relationships that do not exist yet.
- `kernel/derivations.ts` fills the slots with exactly one correct value. They
  are withheld from the translator: a guess can only be wrong.
- The model returns `answers` (facts the human stated) and `proposals` (its own
  drafts, each with a reason). Proposals are validated against the rule that
  reported the gap and held in conversation state, never in the draft.
- `confirmProposals` turns named drafts into answers deterministically. No model
  inference, no blanket accept.
- Each gap carries its own value schema, so the translator no longer receives a
  whole-document schema and has to locate the right fragment.

**Done when**: a requester describes intent in prose, sees what the machine
drafted and why, corrects what is wrong, confirms the rest, and reaches the
deterministic sealed state without ever being asked to invent a slot value.

---

### S12 · A drafted gap is confirmed, not re-asked — **DONE**

`branch: s12-confirm-drafted-gaps`

S11 taught the machine to draft, but the interview never learned that a draft
had arrived. Against a live 2b model the first turn produced a usable draft of
`intent` and answered in the same breath: *"That did not answer the question I
asked."* Two such turns and a slot the machine had already filled became a
blocking decision. The requester was refused by a document that was holding the
answer.

- A draft the requester has not seen is new information for its gap; the same
  draft again is not, so D10 still ends an interview going nowhere (D28).
- A gap with a draft on offer is asked as a confirmation, not re-asked bare.
- A model summary is carried only when the turn recorded an answer or kept a
  draft, and a confirmation names the slots it wrote (D29).

**Done when**: a requester who describes work in prose is shown what the machine
drafted and asked to confirm it, and no slot the machine has drafted is ever
escalated to a blocking decision on the turn it was drafted.

---

### S13 · The context window is declared, not inherited — **DONE**

`branch: s13-context-truncation-guard`

The interview reached `the configured model returned an invalid response` and
the runtime looked healthy, because it was. Ollama inherits a 4096-token window
and silently drops whatever does not fit. Measured against qwen3.5:2b: a 33 KB
conversation came back as `prompt_eval_count=25`, HTTP 200, with a confident
answer to a conversation it had already discarded. What gets dropped first is
the system prompt — so the reply is fluent, unformatted, and grounded in
nothing.

- `OllamaAdapter` declares `num_ctx` and refuses a window that does not exceed
  its own output budget. Asking for 4096 output tokens inside a 4096-token
  window guarantees the overrun.
- A reply is refused when `prompt_eval_count + maxOutputTokens > num_ctx`, and
  when the runtime will not report how much it read (D30).
- `context_exceeded` is its own failure: "unavailable" sends the requester to
  check a runtime that is running fine.
- `SPEC_MODEL_CONTEXT_TOKENS` sizes the window per deployment.

**Done when**: a conversation that outgrows the window stops the interview with
a message naming the window, and never with a translation of a prompt the
runtime discarded.

---

### S14 · A sealed intent becomes claimable tickets — **DONE**

`branch: s14-sealed-intent-splits`

S8 built the split validator and connected it to nothing but a CLI. A sealed
specification was the end of the road: correct, and still one undivided lump for
the execution layer to receive.

- `parentIntentFrom` derives the parent from the sealed document — its id,
  title, and every criterion, each inheriting the document's one target (D21).
  The author is named by the caller, so the chain continues rather than
  restarting at whoever is dividing the work (D31).
- `SplitPort` is separate from `ModelPort`. Both capabilities share one request
  path in the adapter, so the S13 window gate cannot be true of one and not the
  other.
- `proposeSplit` asks for a division and lets `validateSplitProposal` admit it.
  A division that drops a criterion, assigns one twice, or names a contract that
  does not trace to the parent is refused, never repaired.
- `POST /api/conversation/split` refuses outright when the configured adapter
  has no split capability.

**Done when**: a sealed session returns either contracts that carry every
criterion of the document, each tracing to it, or a reasoned verdict that the
work is already one contract.

---

### S15 · A small-model interview keeps one coherent draft — **DONE**

`branch: s15-coherent-interview-workflow`

A live `qwen3.5:2b` data-mapping interview took more than 100 seconds for its
first turn, forgot standing proposals, repeated stale narration, treated an
inferred empty list as a human answer, and ignored a later four-item scope
correction. Each output was structurally plausible; together they made the
requester unable to finish one intake.

- Pending proposals are part of every model request and survive silence in a
  later response. The model cannot confirm them; only the named deterministic
  confirmation route can move them into the document (D32).
- Narration is derived from newly recorded answers, derivations, and changed
  proposals. Out-of-order facts count as progress without changing Rule order.
- Local extraction has a 1024-token output ceiling, an explicit focus gap, and
  at most two answers plus two proposals. A correction that names a pending
  slot receives only that slot's schema.
- Partial compound values stay proposals. A correction returned through the
  model's answer channel is downgraded to a proposal rather than trusted.
- Draft JSON is editable before confirmation. An invalid edit remains pending;
  a valid edit is rerun through its Rule and attributed to the confirming human.

**Done when**: the same two-turn data-mapping request completes each inference
inside the local budget, retains its scope draft across turns, never attributes
an inferred value to the requester, and gives the requester a deterministic
way to correct all four mappings when the configured 2b model cannot.

---

### S16 · Confirmation is something the requester says — **DONE**

`branch: s16-confirmation-is-spoken`

User testing stalled on a turn that named four column mappings. Replaying it
against `qwen3.5:2b` showed the model had translated it correctly and the
application had thrown the answer away, because `scope` already held a machine
draft; what survived was the model's own reconciliation of the two, which had
moved three of the four stated mappings into `exclude`. The requester was then
told to edit JSON in a side panel while the conversation went on asking an
unrelated question.

- A value the human stated outranks a draft standing in the same slot. The
  guard that dropped it was aimed at a model approving its own draft and caught
  a human overriding one as well; the distinction is now the value itself
  (D33).
- Agreement is read out of the typed message by `ui/confirmation.ts`, before
  any inference. Recognition is narrow and fail-closed: content falls through
  to an ordinary turn. An `authority` draft needs its own name (D14).
- The drafts card reports what was guessed and why. The tick box, the JSON
  editor, and `POST /api/conversation/confirm` are gone, leaving one entrance.
- The translator receives the names of drafted slots, not their values. Holding
  the draft in its view was what made it answer with the draft (D34).

**Done when**: the live four-mapping turn records all four in `scope` as the
requester's own answer, and a requester who only ever types can move every
routine draft into the document.

---

### S17 · The interview answers what the requester said — **DONE**

`branch: s17-answer-what-was-said`

A requester stated their scope as four column mappings and was answered
"Drafts awaiting your confirmation: scope." followed by a question about the
title. The turn had understood them; nothing they could see said so, and the
only visible thing was a question about something else.

- A drafted value appears in the conversation with the one thing that takes
  it, rather than as a slot name beside an unrelated question. A grant of
  authority names its own confirmation, because a general yes cannot reach it.
- The gap being asked leads the gaps list the translator receives. With a
  two-entry budget against eleven offered gaps, last is where a gap goes
  unanswered for four turns — which is what happened to every title.
- `title-stated` asks "In one line, what should this work be called?". The
  previous wording made "one line" the subject of "names"; every sibling
  question is ordinary word order, and this one read as a riddle.
- Agreement with nothing pending is read as itself. It had been sent to the
  translator, which cost an inference to learn nothing and recorded a stalled
  attempt against a question the requester never declined.

**Done when**: a turn that states a compound value shows what was understood
and how to accept it, and the title arrives as a draft rather than a question
asked four times.

---

### S18 · The translator is given a shape, not a description of one — **DONE**

`branch: s18-hand-the-translator-less`

A requester answered "In one line, what should this work be called?" with "data
mapping tool" and was told they had not answered. Probing both local models
showed each had answered: `qwen3.5:4b` returned
`{"kind":"string","value":"data mapping tool"}`, and `:2b` returned the gap's
own `valueSchema`, Zod refusal string included. Every rule refused the shape,
the turn dropped it in silence, and the stall counter charged the requester.

- The response format names one variant per offered gap, carrying that gap's
  own schema where an empty object had been. A shape the runtime enforces
  during generation cannot be lost and refused afterwards (D35).
- A gap handed to the translator is reduced to rule, slot, question, and
  shape. Its entitlement, authorship, and human-facing refusal message were
  fields to copy into the value, and both models copied them.
- A candidate its rule refuses is named, with what went wrong. The stall prefix
  no longer says "That did not answer the question I asked" — the kernel knows
  the gap is still open, not whose fault that is, and the claim was false
  exactly when the translation had failed.

**Done when**: the opening description records `intent` and `title` and derives
`id` in one turn, and no requester is told they failed to answer a question
they answered.

---

## Deliberately not built

Written down so nobody rediscovers them mid-build.

- **Profile and Shape mechanisms.** Not even the mechanism. Wait for the first
  real conflict: a rule that is clearly necessary for one domain and makes no
  sense in another.
- **A signature service.** A merged pull request is the seal (D20).
- **In-flight overlap detection.** Wait for ten contracts a day.
- **Pricing vagueness back to the requester.** Wait for abuse data.
- **Any change to L2.** Output feeds the existing adapter.
- **Enterprise model adapters.** `ModelPort` is stable; add the adapter when a
  deployment names its approved runtime rather than guessing one in the kernel.
- **Execution basis / envelope.** Already done in `lite-harness/engine/envelope.ts`
  — this is not a gap.
