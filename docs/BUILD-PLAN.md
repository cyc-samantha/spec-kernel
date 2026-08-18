# Build Plan

Written so that someone — or something — arriving with no prior conversation can
pick this up and continue. Read it before changing anything.

Part 1 is the decision ledger. It is the acceptance criteria for every slice; when
a question comes up mid-build, look it up here rather than re-deciding it. Part 2
is the engineering contract. Part 3 is the completed slice history. Part 4 is what
is planned and not yet built.

**Read § "Two documents, one specification" (D36–D41) first.** It was written
after S18 and it retargets the layer: where it disagrees with D1–D35, it wins.

---

## Where this sits

L1 is two halves. **1a is an agent in a session; 1b is this repository.**

```
L1a  an agent in a session   human intent     ->  human spec + technical spec
         │                                          elicits, drafts, authors
         │
L1b  spec-kernel             both documents   ->  sealed contract        <- this repo
         │                                          defines, verifies, seals
L2   agent-ticket-system     sealed contract  ->  contract, queue, ledger
         │
L3   lite-harness            contract         ->  branch + evidence per criterion
```

**1a authors. 1b adjudicates. Nothing in this repository writes a
specification.** It defines what may be asked, what shape each document takes,
who may fill which slot, and every verdict; the agent calls it through `bin/` to
learn what is still missing and whether it is finished. This is the dual of the
rule that already governs the other direction — anything a program can check is
not checked by a model — and it is why there is no model runtime anywhere in this
tree (D36).

`harness-factory-map` is **an instance, not a layer**: a real project that has
hand-written specifications in the shape L1 should be producing. It is a useful
example and a purity pressure test. It is never a source of content for the
kernel.

L2 and L3 exist and work. This repository is a library and a CLI.

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

## Two documents, one specification

Written 2026-08-17. D36–D41 retarget the layer. Where they disagree with D1–D35,
they win; where they are silent, D1–D35 still hold. `docs/L1-REARCHITECTURE-TRIAGE.md`
carries the reasoning that led here and the two-repository resolution D36 retires.

| # | Decision |
|---|---|
| **D36** | **1a is an agent; 1b is this repository. 1a authors, 1b adjudicates.** The interview and both documents it produces are an agent's work in a session: it elicits the human spec from a requester and writes the technical spec itself, because that is a task an agent does. This repository writes nothing. It defines the rule set, the shape of each document, who may fill which slot, and every verdict; the agent calls `bin/` to learn what is missing and whether it is done. There is therefore no `ports/model.ts` — the model is 1b's caller, not its dependency, and an adapter in this tree would be a second, weaker interviewer competing with the one that already has the context. Retires the two-repository resolution in `docs/L1-REARCHITECTURE-TRIAGE.md`, and with it D24, D25, D30, D34, and D35: those bind whatever conducts the interview, which is not code here. *Amended by D42: 1a now has a repository of its own. The split is unchanged — 1a still authors and 1b still adjudicates — but "1a is not a repository" was never what made the split work, and saying so left this ledger stating something false about a repository that exists.* |
| **D37** | **A specification is two documents, not one, and 1a writes both.** The **human spec** is what the requester wants, why, and how they will know it worked: intent, outcome, metric, and acceptance claims a person can read. The **technical spec** is how it gets built and how a machine proves it: target, scope, context, constraints, and executable criteria. A requester is never asked to author the second. **`risk`, `irreversibility`, and `authority` are human-spec slots**, without exception: they decide how much damage an agent may do unsupervised (D27), and the agent writes the technical half — put them there and it grants itself its own blast radius, with D27 left as a rule with nothing behind it. `awaiting_technical_completion` (D16) stops being an interview state and becomes the boundary between the two documents. |
| **D38** | **Each half is verified by a different question, and both are required.** The human spec is verified by **sign-off**: a named, entitled human says this is what they want. The technical spec is verified by **no drift**: every human claim still has technical criteria tracing to the exact text that was signed. A signed human spec beside a drifted technical spec is not partially ready — it is refused. Two verdicts, one gate. |
| **D39** | **`derivedFrom` carries the parent's content hash, not only its id.** An id survives an edit to the thing it names, so revising a human criterion leaves its derived tests pointing at it and silently stale: all green, proving something nobody is asking for any more. The hash turns drift into a fact a program checks instead of a thing a reviewer must notice. This is `context[].contentSha` — already in the schema — applied to the one link that carries authorship. Extends D18; it is the mechanism D38's second verdict runs on. |
| **D40** | **An outcome and a metric are not acceptance criteria. The metric gates its own presence, never its achievement.** "Churn drops five percent" cannot produce evidence inside a branch, so D19 refuses it as a criterion and `evidence-producible` is right to. But the metric is the evidence that the work was worth doing at all, and **it only means that if it was named before the work started** — a metric chosen afterwards is chosen to flatter the result, and reads as evidence while being its opposite. So: `outcome` says what the work is for; `metric` is the predefined data that would settle whether it happened. Neither carries a verification mechanism and no rule asks either to name a test. But a seal without a metric is refused, exactly as an absent `blockingDecisions` key is refused — "we said in advance what would make this worth doing" and "nobody said" are different documents, and only one of them can be judged later. They are the ruler S7's outcome record is read against, which is what turns "all criteria green, still wrong" from an anecdote into an answerable question. Because both are human-spec slots covered by the sign-off, D39 already makes editing one after the fact a drift that must be re-signed. |
| **D41** | **A wrong outcome versions the human spec, not the technical one.** The loop back from S7 is: the requester says the shipped change did not do what it was for, and the human spec gains a version. Every derived criterion whose parent hash no longer matches is drifted by D39 and must be re-derived before the next seal. Version n+1 is the next commit (D20) — no new mechanism is needed to express it. The technical spec never versions alone: a technical change with no human change is a different task, not a new version of this one. |

## The layer below, and the layer above

Written 2026-08-18. D42–D46 answer two things nobody had checked: what 1a needs
from here, and whether what leaves here is admitted by what consumes it.

The measurement that prompted them. `examples/engineer-draft.output.json` — the
document this repository reports as `"status": "sealed"` — was put through both
downstream gates for the first time:

| Gate | Verdict |
|---|---|
| `lite-harness/engine/contract-shape.ts` (L3) | **accepted** — D3's claim holds |
| `agent-ticket-system` `src/contract/work-contract.ts` (L2) | **refused**, ten issues |

L2 is `.strict()` and snake_case; L3 is `.passthrough()` and camelCase. So a
document can satisfy L3 and still be unqueueable, which is what the golden
example is. D3 named L3 as the finish line and skipped the hop in between. **The
contract named in D1 does not exist in this repository**, and the document
standing in for it is refused by the layer that consumes it.

| # | Decision |
|---|---|
| **D42** | **A `spec-intake` repository exists, and what it owes this one is a published shape.** 1a's own ledger records the dependency: it may not invent a competing document shape and reconcile later, because reconciling later is the failure the split was built to prevent. So `bin/schema.ts` prints the document shape and every question that fills it, **derived from `rules` rather than written beside them** — a hand-maintained schema is a second list that must agree with the first, and two lists that must agree stop agreeing (D6). Adding a rule publishes its slot; nobody has to remember. An *optional* slot is deliberately unpublished: `signature` is tolerated by the type and read by no rule, and telling 1a to write a field nothing adjudicates is how a value comes to look authoritative without being checked. Amends D36. |
| **D43** | **`human_review` is not a verification mechanism. A rubric is.** 1a refuses to emit a criterion whose verification is that somebody looks at it: nobody downstream is assigned to look, so it is a stall dressed as a check, and it passes every gate by having a value (D14 again, one layer down). Removed for `change` and `spike` alike. **A rubric survives**, because a written standard is something a person can apply and a requester can disagree with, so S6's spike outlet is unaffected in substance — a spike now produces knowledge reviewable *against a stated rubric*. That is only true while the rubric is argued: **a rubric criterion must state why deterministic verification was unavailable**, which is what L2 already requires of one. Without that, `human_review` returns within a week under a new name. |
| **D44** | **The sealed document is the audit record; the contract carries pointers to it.** 1a drops its intake box on completion and keeps nothing, so the question "who authorised this slot, and on what grounds" has exactly one place left to be answerable. It is answerable *here*: the human spec and the authorship trace live in what 1b seals. They do **not** travel into the contract — the projection carries `source` and a per-criterion `source_ref` that resolve back, and L2's `.strict()` schema is not extended. Two reasons that is the right side of the line: a contract is what an execution layer needs to do the work, not the record of how the work was agreed; and widening a downstream `.strict()` schema to carry provenance makes every future provenance change a two-repository change. |
| **D45** | **The projection to a contract is a port, not kernel.** It lives in `ports/contract.ts`, beside `ports/project.ts`, because "the shape the next layer admits" is a fact about the next layer and the kernel holds the universal minimum only — `tests/anti-entropy/kernel-purity.test.ts` already refuses to let a downstream project be named in `kernel/`. Its conformance test asserts **by value against a checked-in fixture**, never by importing the downstream schema: the three layers are on three zod majors (4.4.3, 3.23.8, ^3.24.1), so an import would couple the kernel's dependency graph to a downstream upgrade schedule and fail for reasons that have nothing to do with the contract being wrong. |
| **D46** | **The seal is currently a synonym for "every rule passed", and that is a defect, not a design.** `signature` is optional and no rule reads it; `ports/project.ts` declares `signing_identity` and no kernel code reads it; there is no `content_sha`, so a signature binds to no content (D20 specifies one). Meanwhile L3 exports `needsSignature` — true when `irreversibility` is `rewrite` or `risk` is `critical` — and 1b has no counterpart, so the documents most worth refusing are precisely the ones it seals and lets L3 refuse afterwards. 1b refuses first. The content hash is L2's canonicalisation rule (keys sorted, array order preserved — the asymmetry is deliberate: key order is a serialisation accident, array order is content) **re-derived here rather than imported**, for D45's reason. |

### Open, and deliberately not decided yet

- **Whether achieving a metric ever gates anything.** D40 says no here: D19
  refuses a criterion whose evidence cannot be produced inside the execution
  layer's boundary, and no branch can show churn moved. The pressure to relax
  that arrives the first time a change is green and wrong. The honest answer is
  probably that achievement gates a *later* verdict in L2 or L3, never this one
  — but that verdict does not exist yet, so the metric currently has a reader
  only in S7.
- **What a metric may be made of.** A number and a window ("under 5 per week")
  is checkable for presence and shape. Prose ("clearly faster") is not, and
  admitting it makes the slot filled without making it predefined in any useful
  sense. Decide the shape in S20, when the slot is written.
- **Whether a blast radius is asked per specification or per project.** 1a elicits
  the ceiling once per project on the grounds that re-asking guarantees
  rubber-stamping: the fourth time someone is asked what an agent may do
  unsupervised, they stop reading. This repository asks `authority` on every
  specification, and `ports/project.ts` has no ceiling to check an answer
  against. S3's own discipline says the fix is to extend the declaration rather
  than special-case a project — but a per-project ceiling and a per-spec grant
  are different objects and the relationship between them (does the spec narrow
  the ceiling, or claim against it?) is the part not yet decided. Take it in S20.
- **Where "is half of this useful?" lands.** 1a asks two questions this document
  has no slot for: whether a partial delivery is worth having (which is
  stop-the-line behaviour when ticket 3 of 8 fails) and what order the tickets
  must go in. `dependsOn` is specification-level, and the `after` ordering a
  split proposes is validated by a CLI and then discarded. Both are answers a
  requester gives once and an execution layer needs; neither has anywhere to be
  written. Take it in S20.

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

> **Suspended for S19–S22, from 2026-08-17.** The layer is being retargeted
> (D36–D41) and the shape of the two documents is still being found by building
> them, so "every commit is green" and per-slice branch discipline are relaxed
> while that is true. This is a dated exception with a named end: it lifts when
> S22 lands. Two things do **not** relax — a gate still ships its two tests, and
> an anti-entropy test failure is still fixed in the code and never in the
> threshold. Those exist to resist pressure that is invisible in the moment,
> which is exactly the condition a prototype is in.

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

# Part 4 — Planned slices

S0–S18 above are done. These four are not. They carry out D36–D41 and are
ordered by what each one unblocks, not by size: S19 shrinks the surface the rest
have to stay consistent with, S20 defines the document S21 checks, and S22 needs
S21's hash to have something to invalidate.

---

### S19 · The repository sheds its model runtime — **DONE**

`branch: s19-shed-the-model`

Carries out D36. `kernel/` imports nothing from `ports/model.ts`, `adapters/`,
or `ui/` — the import graph runs one way only — so this is a leaf deletion, not
surgery on the trunk. What survives is the whole deterministic core and its four
CLIs: `bin/seal-check.ts`, `bin/interview.ts`, `bin/split.ts`,
`bin/record-outcome.ts`.

- Delete `ui/`, `adapters/`, `ports/model.ts`, `bin/ui.ts`, the `ui` script in
  `package.json`, and the six test files that exist only to cover them.
- `skills/` stays. It is not code this repository runs; it is what 1a reads
  before calling `bin/` — the instructions shipped alongside the rules they
  derive from. Nothing exports it anywhere.
- `skills/elicit-specification/SKILL.md` still instructs the agent to say *"That
  did not answer the question I asked."* S18 removed that string from
  `kernel/interview.ts` because the claim is false exactly when the translation
  failed, not the requester. Untested prose drifted from the kernel inside one
  slice; correct it here and record that `skills/` has nothing testing it.
- `README.md` and `CLAUDE.md` drop the model-runtime, adapter, and browser
  sections. `CLAUDE.md`'s "the optional application shell may call a configured
  model runtime through `ports/model.ts`" is the line D36 contradicts.

**Done when**: the deterministic core is intact, `examples/engineer-draft.output.json`
still reaches sealed through `bin/seal-check.ts`, and no file outside `docs/`
names a model provider, adapter, or runtime endpoint.

**What landed.** 1893 lines of test and 2024 of source removed; 102 of the 196
tests survived, and they are the whole deterministic core. The import graph had
always run one way, so nothing needed rewriting to make the deletion safe.

`tests/anti-entropy/no-model-runtime.test.ts` was not in the plan and is the part
worth keeping. D36 was a statement in a document, and the pressure it resists —
"just a fallback for when something is missing" — arrives precisely when nobody
is reading the document. The test scans every tracked file rather than only
`kernel/`, because the shell that used to be allowed to hold a port no longer
exists. `docs/` and `tests/anti-entropy/` are exempt for one reason: a rule has
to be able to say what it forbids.

Two false positives were fixed in the test rather than in its lists. `CLAUDE.md`
is a reserved filename, not a provider, so the literal filename is stripped
before scanning and "call the Claude API" still fails. Dropping the vendor from
the list to make the filename pass would have been fixing the threshold.

The skill drift was real and is the open flank D36 leaves. `skills/elicit-specification/SKILL.md`
still told the agent to say *"That did not answer the question I asked"* one
slice after S18 removed it from the kernel for being false in exactly the case
it fires. Nothing tests `skills/`, and D36 moves a dozen hard-won decisions
(D8, D10, D12, D26–D29, D32) out of typed, tested code and into that untested
prose. Naming the cost here so the next slice can decide whether to pay it.

---

### S19a · The shape 1a builds against — **DONE**

`branch: s19a-publish-the-shape`

Carries out D42. 1a is blocked today: it has no published shape, and its own
ledger forbids it to invent one and reconcile later.

- `bin/schema.ts` prints the document shape and every question that fills it,
  composed in `kernel/published-schema.ts` from `rules` — which already carry
  `valueSchema` — rather than from a second, hand-written schema.
- `SPEC_SCHEMA_VERSION` travels inside the artifact, so 1a pins a version rather
  than a snapshot of a Tuesday.
- Retriage D36 and record D42–D46.

**Done when**: 1a can generate against a published artifact, and the ledger
answers its only external dependency.

**What landed.** The emitter, its four behaviour tests, and one anti-entropy test
that is the part worth keeping: `tests/anti-entropy/published-shape.test.ts`
asserts the published slots are exactly the slots `specificationSchema` requires.
Those two have described the same object since S1 and nothing had ever made them
prove it. Publishing changes what a divergence costs — it stops being an internal
inconsistency and becomes 1a generating documents this layer refuses — and it
would have arrived one slot at a time, silently.

Two smaller findings. Relational rules are published as rules but not as document
properties: `acceptance.*.verification` is a path across criteria, and publishing
it as a key would tell 1a to write a slot no rule reads. And the JSON Schema
dialect is hoisted from what zod emitted rather than written in the source —
`no-model-runtime` forbids a URL literal in any tracked file, correctly, and the
emitted value is the same string without putting one in the tree.

---

### S19b · Only machine-adjudicable criteria — **DONE**

`branch: s19b-no-human-review`

Carries out D43. 1a and 1b currently disagree about what counts as a check, and
the golden example is on the wrong side of it: `AC-01` is `human_review`.

- Drop `human_review` from `producibleMechanisms` and from `evidence-producible`'s
  published values in `kernel/rules.ts`.
- Narrow `spike-knowledge-output` to `rubric` alone. Its question changes from
  *how will a person review it* to *against what stated rubric*, which is the
  same slot asking for something a person can actually be held to.
- A rubric criterion must carry the argument that deterministic verification was
  unavailable — mirroring what L2 requires. Without it the removal is cosmetic:
  the mechanism returns as an unargued rubric.
- Re-cut `examples/engineer-draft.output.json`. It is the first thing the removal
  catches, which is the point.

**Done when**: a document carrying `human_review` is refused with a reason a
requester can act on, and an unargued rubric is refused too.

**What landed.** The removal is three lines; the rest of the slice is what stops
it being cosmetic. `rubric-argued` is a new relational rule with its own slot and
its own question, because a rule and the question that fills it are one object
(D6) — bolting the requirement onto `evidence-producible` would have made one
rule ask two things and left the interview unable to say which.

The refusal message is the part worth arguing about. "human_review cannot produce
evidence" is true and useless: the author chose it because a person genuinely is
the judge, so being told a person cannot judge reads as a broken tool rather than
a request. `retiredMechanisms` maps the mechanism to what to write instead. That
map is the only place a removed mechanism keeps a name, which is the point — the
kernel must be able to say what it no longer admits.

`deterministic_assertion` was left alone and is now the odd one out: the document
type admits it and `evidence-producible` refuses it, because it was the thing the
question-derivation fixture used to trigger that rule. L2 admits it and ranks it
*above* a rubric. Being stricter than the layer below is safe, so this is not
urgent — but it is a disagreement nobody decided, and it should be decided rather
than inherited.

The example needed a better criterion, not a renamed mechanism. `AC-01` was "a
requester can observe that unsupported fields are rejected" verified by someone
looking; it is now "the rejection names the unsupported field and what to send
instead", argued as a rubric because a test can assert the field name appears and
cannot assert the instruction is followable. That is what a rubric is for, and
the old text was a claim the derived test already covered.

---

### S19c · The output is admitted by the layer that consumes it — **DONE**

`branch: s19c-contract-projection`

Carries out D44 and D45, and closes the finding above: the contract named in D1
does not exist here.

- `ports/contract.ts` projects a sealed document into the contract L2 queues.
  Not `kernel/` — `kernel-purity` forbids naming a downstream project there, and
  rightly.
- Carry the four things L2 requires and this layer does not produce: `source`
  (`adapter`, `spec_id`, `spec_path`, `spec_sha`), a per-criterion `source_ref`,
  slug-shaped ids, and snake_case throughout.
- A conformance test in `tests/` asserting the projection satisfies a
  **checked-in fixture** of L2's shape, by value. Never by import (D45).

**Done when**: the golden example projects to a contract L2's `workContractSchema`
accepts, and reverting any one projection line goes red.

**What landed.** It does: the projected golden example was parsed by
`agent-ticket-system`'s own schema and accepted. Four things came out of building
it that were not visible from reading.

**D3's claim was true by accident.** L3 does not consume this repository. It
consumes `WorkContract` through `ports/work-source.ts`, and a source adapter maps
whatever the source holds into it. The sealed document passed L3's shape check
because both happened to be camelCase and L3's schema is `.passthrough()` — not
because anything was built to hand it over. The next hop was always L2.

**A pinned pointer needed a time.** L2 requires `retrieved_at` on every context
reference and this layer had nowhere to put one, so `context[]` gained
`retrievedAt`. That is not a downstream detail leaking upward: a hash with no
time it was taken cannot be aged, and "this is what the file said" and "this is
what the file said in March" are different claims. Only the second can be
doubted.

**A decision the document answers is not blocking.** `blocking_decisions` carries
only the deferred ones. The kernel's schema already makes `deferred: false` imply
an answer, and handing a settled question downstream stalls the work on it —
L2 learns answers out of band, from its environment, so a resolved decision in the
contract is unanswerable from the contract.

**The refusals are the design.** The projection will not rename a criterion to fit
`AC-\d{2,}`, will not invent a git object name, and will not project a document
`sealCheck` has not admitted. Renaming would satisfy the schema and break the
reference the trace is for; the other two are the fail-open this boundary exists
to prevent.

The one cost taken knowingly: `tests/fixtures/consuming-contract-shape.ts` is a
hand-copied mirror of L2's schema, which is the second list D6 warns about.
Re-verify against the real one by parsing a projected contract with
`agent-ticket-system`'s `workContractSchema` — deliberately not automated, since
automating it is the coupling D45 refuses.

---

### S19d · The seal is a fact, not a verdict — **DONE**

`branch: s19d-the-seal`

Carries out D46 and D20's unbuilt half.

- A rule refusing a seal when a signature is required and absent, on L3's
  conditions: `irreversibility: rewrite` or `risk: critical`. 1b refuses before
  L3 does rather than after.
- `signature` gains the hash of what was signed, over a canonical form with keys
  sorted and array order preserved.
- This is a gate, so it ships the two tests: one red when the fail-closed line is
  reverted, one feeding an unevaluable document and asserting refusal.

**Done when**: a `risk: critical` document cannot reach `sealed` unsigned, and
editing one byte after signing invalidates the signature.

**What landed.** Two rules, not one, and the reason is the interesting part. A
missing signature and a stale one need different answers — *get it signed* versus
*it changed, sign again* — so they are different questions and therefore
different rules (D6). `signature-required` owns the whole slot including a
malformed value; `signature-binds-content` runs only on a signature it can parse.
Without that split one unreadable value produced two questions, which is the
failure `structuralCriterionSchema` was already written to avoid.

The pairing is a seam, so it has its own test: a malformed signature on a
low-risk document — one that needed no signature at all — is still refused. Drop
that and the drift rule's skip becomes a fail-open, silently.

`signableContentSha` hashes the document with the signature removed. A signature
cannot cover its own bytes, and the useful consequence is that signing is not an
edit: two people can sign the same text and neither invalidates the other. That
is asserted, because it is the kind of property that is true by accident until
somebody refactors.

`signature.contentSha` is strict lowercase sha256 where `context[].contentSha` is
not, and the asymmetry is deliberate: a context hash is somebody else's hash of
somebody else's file, and this one is produced here. A layer may be lenient about
what it is handed and must not be lenient about what it emits.

Two things this slice did **not** close. `ports/project.ts` still declares
`signing_identity` and no rule reads it — checking the signer against the
declaration needs the project declaration inside `sealCheck`, which today takes
only a document. And the contract carries no signature at all: the layer below
learns which contracts are signed from its own environment, not from the
contract, so a sign-off recorded here still has no channel into it. Both are real
and neither is a one-line fix; they belong to whoever takes the seal further.

The published shape moved with it. `signature` is a root-level slot owned by a
relational rule, so `documentOf` now publishes a property for every root slot and
requires only the structural ones. Publishing only structural slots would have
hidden a slot a rule reads, and 1a would have discovered it from a refusal.

---

### S20 · The human half is its own document — **PLANNED**

`branch: s20-human-spec`

Carries out D37 and D40. Today one schema interleaves both halves, so "the
requester has finished" is a state the interview computes rather than a document
anyone can hold, sign, or hand over.

- Split `kernel/specification.ts` along the entitlement line that already
  exists: requester-owned slots become the human spec, `technical_author`-owned
  slots become the technical spec.
- Add `outcome` and `metric` as human-spec slots (D40). Neither carries a
  verification mechanism and no rule demands evidence for either —
  `evidence-producible` must not see them at all, rather than seeing them and
  being taught an exception. A rule refuses a seal when `metric` is absent; no
  rule ever asks whether it was met. Settle the metric's shape here, per § Open.
- `risk`, `irreversibility`, and `authority` land on the human side (D37). This
  is the constraint the split exists to hold; put them anywhere else and D27
  stops meaning anything.
- `awaiting_technical_completion` becomes the boundary between the two documents
  instead of a terminal state of one (D37).
- Sign-off is recorded against the human spec alone, with the signer named and
  the signed content hashed — S21 needs that hash to exist.
- The authorship trace lands inside the sealed document (D44). `kernel/answers.ts`
  already builds a `SlotAnswer[]` carrying `answeredBy` and hands it back to a
  caller that no longer exists; since S19 removed the shell, nothing writes it
  anywhere. Give it a writer, or delete it and stop implying the record is kept.
- Settle the two questions in § Open that have no slot: the per-project blast
  radius ceiling, and whether a partial delivery is worth having. Both are being
  asked by 1a today and dropped on the floor here.

**Done when**: a human spec whose technical slots are all empty is a complete,
signable document rather than an incomplete one; a metric can be recorded and no
rule asks it to name a test; and the two halves round-trip through the CLI
separately.

---

### S21 · The technical half is derived and cannot drift — **PLANNED**

`branch: s21-no-drift`

Carries out D38 and D39, and closes a hole that is live today: `derivedFrom` is
a bare id (`kernel/specification.ts`), so editing a human criterion's text
leaves every derived test pointing at it, passing, and proving something nobody
is asking for. The idiom for the fix is already in the same file —
`context[].contentSha`.

- `derivedFrom` carries the parent criterion's content hash alongside its id.
- A new rule reports every derived criterion whose recorded parent hash does not
  match the parent's current text, naming both sides. It is relational tier: it
  cannot run until the structural rules admit both documents.
- This is a gate, so it ships the two tests the contract requires: one that goes
  red when its fail-closed line is reverted, and one that feeds it a document
  whose parent criterion is missing entirely and asserts it refuses rather than
  reporting no drift.
- A seal needs both verdicts (D38). Signed-but-drifted is refused, not reported
  as partial progress.
- Close the second direction while the file is open. `human-criteria-covered`
  checks human → derived; **nothing checks that a derived criterion's
  `derivedFrom` resolves to a criterion that exists**, so one pointing at `AC-99`
  seals today. That is the *agent inventing scope* half of the same invariant,
  and it is the cheaper of the two to write.

**Done when**: changing one word of a signed human criterion refuses the seal
and names which derived criterion drifted from which parent, and a technical
spec that covers every signed claim with matching hashes seals.

---

### S22 · A wrong outcome versions the human spec — **PLANNED**

`branch: s22-outcome-versions`

Carries out D41, and is the first slice that makes S7 do work. The outcome
record already stores the specification version, the requester's verdict, and
which rule was missing; nothing reads it.

- A "green but wrong" outcome opens version n+1 of the human spec. Version n+1
  is the next commit (D20) — this slice adds the transition, not a version
  store.
- Every derived criterion whose parent hash no longer matches is drifted by S21
  already. This slice adds nothing to detect it; it only makes the re-seal
  refuse until each drifted criterion is re-derived or explicitly re-affirmed by
  a named author.
- The technical spec does not version on its own (D41). A technical-only change
  is a different specification.

**Done when**: recording "all criteria green and the requester says no" against
a sealed specification produces a human spec at version n+1 that cannot re-seal
while any criterion derived from the old text is still standing.

---

## Deliberately not built

Written down so nobody rediscovers them mid-build.

- **Profile and Shape mechanisms.** Not even the mechanism. Wait for the first
  real conflict: a rule that is clearly necessary for one domain and makes no
  sense in another.
- **A signature service.** A merged pull request is the seal (D20).
- **In-flight overlap detection.** Wait for ten contracts a day.
- **Pricing vagueness back to the requester.** Wait for abuse data.
- **Any change to L2.** Still the decision, but not for the reason first written.
  "Output feeds the existing adapter" was an assumption and it was false: the only
  adapter in L2 is `harness-factory-map`, which projects from a build brief, and
  nothing there has ever read a document from here. What holds the line now is
  D44 — the contract carries pointers to the sealed document rather than the
  document — and D45 puts the projection in `ports/contract.ts` on this side of
  the boundary, so L2's `.strict()` schema stays untouched by design rather than
  by neglect.
- **A model port, an adapter, or any browser surface.** Retired by D36, not
  deferred by it. The interview is conducted by the agent that already has the
  context; a `ModelPort` in this tree is a second, weaker interviewer competing
  with it. If a deployment ever needs to run the interview without an agent, that
  is a new decision, not this one resumed.
- **A source-recognition mechanism for imported specifications.** D23's
  spec-kernel-side twin existed only because a second repository was going to
  hand documents across a boundary. D36 removes the boundary. If one returns,
  note that D20 forbids a signature service, so the mechanism is undesigned —
  not merely unbuilt.
- **Execution basis / envelope.** Already done in `lite-harness/engine/envelope.ts`
  — this is not a gap.
