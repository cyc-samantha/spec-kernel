# L1 re-architecture — decision triage & resolution (D6–D35)

> **Superseded in part, same day.** `docs/BUILD-PLAN.md` § D36 retires the
> central resolution below: **the 1a/1b split is right and stands — it is the
> second repository that does not exist.** 1a is an agent in a session, not a
> codebase; 1b is this repository, and it authors nothing. The
> elicitation agent is the model in the session, so the question set, the
> entitlement table, and every verdict stay here and the "exactly one document
> crosses the boundary" seam has no boundary to cross. What that removes:
>
> | Resolved below | Now |
> |---|---|
> | Two repositories, joined by the Standard Spec | One repository (1b) plus an agent (1a) reading `skills/*/SKILL.md` |
> | 1a produces a Standard Spec; 1b converts and seals it | 1a produces **two** documents — human and technical (D37); 1b verifies sign-off and no-drift, then seals |
> | Pre-flight oracle as a versioned cross-repo dependency | An ordinary in-process call; versioning is instead the D41 loop back from a wrong outcome |
> | Import-time entitlement re-verification | Dropped — nothing is imported, and the idea is not built out enough to design against |
> | D23's spec-kernel twin ("one recognized source") | Dropped with the boundary. Undesigned, not merely unbuilt — D20 forbids a signature service |
> | D8, D9, D10, D12, D25–D30, D32, D34, D35 "migrate to `spec-intake`" | They bind whatever conducts the interview. That is now an agent, not code in this tree — so they are constraints on `skills/`, which nothing tests |
>
> What survives unchanged: this repository sheds its model runtime, and the
> structural decisions (D7, D14, D16, D18–D21, D31) still bind. The per-decision
> triage below is kept because every entry was written against a real incident,
> and the incidents stay true whichever document currently governs the repo.
>
> The document is retained for that reasoning trail. It is no longer a statement
> of the architecture; `docs/BUILD-PLAN.md` § "Two documents, one specification"
> is.

**Status: resolved 2026-08-17.** Written for the conversation that decided:
Layer 1a (Claude API, GrillMe-style elicitation → Standard Spec) becomes its
**own repository, `spec-intake`**, upstream of this one. Layer 1b
(Standard Spec → sealed contract) **stays this repository, `spec-kernel`**.

This is not a replacement for `docs/BUILD-PLAN.md`. It is the punch-list that
let the rewrite start without amnesia: `docs/BUILD-PLAN.md` is no longer
treated as the SSOT for the new architecture, but every D-decision below D6
was written against a real incident (a slice number, a failure mode), and
that incident stays true regardless of which document currently governs the
repo. Discarding the document is fine. Discarding the incidents is not.

Two labels, as originally scoped:

- **eval fixture** — the decision (or the incident behind it) still binds
  `spec-kernel` as designed; carry it forward as a test.
- **重新討論 (needs discussion)** — the repo split changes who the decision
  binds, or introduces a seam the decision didn't anticipate.

The open items in the second bucket were resolved this session. Both the
resolutions and the original per-decision triage are kept below, so the
reasoning survives.

---

## Resolved architecture

- **Two repositories.** `spec-intake` (Layer 1a, new, not yet built) and this
  repository, `spec-kernel` (Layer 1b), joined by exactly one document: the
  Standard Spec. Nothing else crosses the boundary.
- **One door.** Every requester — technical or not — goes through the same
  guided-elicitation process in `spec-intake`. There is no separate
  assert-first shortcut; a requester who already knows the answers just
  finishes faster. This retires D11's two-door model and D13's
  door-erasability concern together — there is only one door left to be
  erasable *from*.
- **`spec-kernel` sheds its model entirely.** No `ports/model.ts`, no
  `adapters/ollama.ts`, no fallback LLM for "just in case something's
  missing." If `spec-intake` did its job, nothing is missing; if something
  is missing, that's `spec-intake`'s bug to fix, not `spec-kernel`'s gap to
  paper over. `spec-kernel` becomes close to pure `kernel/` plus a thin
  intake/compile/seal wrapper — no human, no model, anywhere in this repo's
  Layer-1 path.
- **"Convert" and "check" are one step, not two.** A Standard Spec that fails
  seal-check has failed to convert — full stop. This is not `spec-kernel`
  redoing work `spec-intake` already did; per the "downstream does not trust
  that upstream already checked, because upstream is replaceable" principle,
  `spec-kernel` re-derives its own missing list every time, regardless of
  what `spec-intake` claims. `spec-intake` is explicitly replaceable ("a
  virtual Claude env") — this is exactly the case that principle exists for.
- **Pre-flight oracle.** `spec-kernel` publishes its seal-check rule set as a
  versioned, callable dependency `spec-intake` queries before it ever
  finalizes a Standard Spec. Most incompleteness gets caught and resolved
  inside `spec-intake`'s own conversation loop. A real handoff failure should
  now be rare, and when it happens it means the two repos' rule-set versions
  have drifted — a hard stop / platform escalation, not a normal
  spec-quality failure sent back to the requester.
- **Authorship chain, no new signature service.** The Standard Spec *is* the
  same append-only, `answered_by`-tagged slot-answer ledger `kernel/answers.ts`
  already defines — not a prose document. `spec-kernel` runs its existing
  D15/D17 checks against the imported ledger exactly as it would against a
  live session, plus one new check: that the ledger's append order wasn't
  retroactively edited. No PKI, no signing service — consistent with D20's
  own restraint ("v1 needs no signature service").
- **Entitlement stays authoritative at `spec-kernel`.** `spec-intake` may read
  `.spec/project.yaml` for better UX (ask the right person the right
  question) but every answer it produces is provisional until `spec-kernel`
  re-verifies entitlement on import. `spec-intake`'s own entitlement checks,
  if it has any, are never final.
- **Build order: schema before either side gets built out further.** Harden
  `spec-kernel`'s Standard Spec schema first — mostly extraction from
  `kernel/specification.ts`, `kernel/rules.ts`, `kernel/answers.ts`, which
  already contain nearly all of it. Publish that schema and the seal-check
  oracle. Only then does `spec-intake` get built against a fixed target.
- **Repo name: `spec-intake`.**

## Where each D-decision landed

Given `spec-kernel` sheds its model, every decision that was really about
*translator/interviewer behaviour* no longer has a home in this repo — it
migrates wholesale to `spec-intake`'s own design constraints. Only decisions
about document *shape* and *deterministic mechanics* stay native here.

**Stays in `spec-kernel`** (structural / deterministic, unaffected by the
split): D7, D14 *(taxonomy — still used at import-time entitlement checks)*,
D16, D18, D19, D20, D21, D24 *(trivially satisfied now — there is no
provider left to name)*, D31.

**Migrates to `spec-intake`** (translator/interviewer behaviour —
`spec-kernel` has no translator left to bind): D8, D9 *(the stop condition is
still "seal-check reaches zero" — it now runs as a cross-repo oracle call,
not in-process)*, D10, D12, D25, D26, D27, D28, D29, D30, D32, D34, D35. D6
migrates with a rescoped invariant attached: `spec-intake` may author its own
question curriculum, but it does not get to decide when it's done — only the
oracle call does.

**Resolved by the architecture itself, no longer open questions:** D11, D13
(single door), D15, D17 (entitlement/append-only checks run at import, in
`spec-kernel`, not earlier), D22, D23 (authorship chain = the reused ledger
shape + the append-order check above), D33 (there is now only one entrance,
full stop — `spec-intake`'s own confirmation *is* the interview;
`spec-kernel` never runs a second confirmation route, because it never runs a
conversation at all).

## What's left

Nothing outstanding for this repo's Layer-1 scope. The remaining open
questions (turn budgets, which elicitation methodology to keep, exact
transport for the oracle call — a published package vs. an HTTP endpoint) are
`spec-intake`'s own build decisions. `spec-intake` is a separate repository
by design (see "Resolved architecture" above), so its build plan is
deliberately not part of this repo's docs.

---

## Original per-decision triage

Kept for the reasoning trail. Section headings match `docs/BUILD-PLAN.md`.

### Purity

| # | Decision (one line) | 判定 | 理由 / fixture 方向 |
|---|---|---|---|
| D6 | Question set is derived from seal-check rules, never authored. | 重新討論 → **resolved** | Rescoped to `spec-intake`'s stop condition, not its question style (see above). |
| D7 | 1→N acceptance: two unrelated projects onboard with zero edits to `kernel/`. | eval fixture | Structural, already enforced by `kernel-purity.test.ts` + `examples/`. Unaffected. |

### The interview

| # | Decision | 判定 | 理由 / fixture 方向 |
|---|---|---|---|
| D8 | The interviewer may not answer its own question. | eval fixture → **migrates to `spec-intake`** | `spec-kernel` has no interviewer left to bind. |
| D9 | Stop condition is seal-check reaching zero. | eval fixture → **migrates to `spec-intake`** | Runs as a cross-repo oracle call now. |
| D10 | Repetition with nothing new is a `blocking_decision`. | eval fixture → **migrates to `spec-intake`** | Same test, now `spec-intake`'s own conversation-loop concern. |
| D11 | Two doors: assert-first / elicit-first. | 重新討論 → **resolved** | Collapsed to one door. |
| D12 | A door is a default, not a permission. | eval fixture → **migrates to `spec-intake`** | The only door left. |
| D13 | Doors must be erasable. | 重新討論 → **resolved** | Trivial with one door. |

### People and authority

| # | Decision | 判定 | 理由 / fixture 方向 |
|---|---|---|---|
| D14 | Vocabulary / authority / consequence gaps, never conflated. | eval fixture | Still used at `spec-kernel`'s import-time entitlement check. |
| D15 | Slot entitlement from `.spec/project.yaml`, recorded `answered_by`. | 重新討論 → **resolved** | Authoritative check moved to `spec-kernel`, at import. |
| D16 | `awaiting_technical_completion` is a successful terminal state. | eval fixture | Pure `spec-kernel` state definition. Unaffected. |
| D17 | Requester answers are append-only. | 重新討論 → **resolved** | The ledger `spec-kernel` already owns is the single source; `spec-intake`'s copy is provisional until import. |
| D18 | `human_authored` + `derived` criteria, linked by `derivedFrom`. | eval fixture | Still owed regardless of architecture; unbuilt per BUILD-PLAN. |

### Boundary and provenance

| # | Decision | 判定 | 理由 / fixture 方向 |
|---|---|---|---|
| D19 | DONE = verified change candidate, a kernel constant. | eval fixture | Structural, unaffected. |
| D20 | Seal = a merged PR in the repo that owns the specification. | eval fixture | Structural, unaffected. Its "no signature service" restraint is the precedent for the D22/D23 resolution above. |
| D21 | One contract targets exactly one repository. | eval fixture | Structural (S8/S14), unaffected. |
| D22 | Unbroken chain of named authorship to a human intent through a door. | 重新討論 → **resolved** | Carried by the reused ledger shape (see above). |
| D23 | Ledger accepts contracts from exactly one source, anti-entropy test. | 重新討論 → **resolved** | `spec-kernel` gets its own version: accepts Standard Specs from exactly one recognized `spec-intake` source. |
| D24 | Model use is optional, behind `ModelPort`; kernel never knows provider. | eval fixture | Trivially satisfied — no provider left in `spec-kernel` at all. |
| D25 | Model returns candidates, never a seal verdict. | eval fixture → **migrates to `spec-intake`** | No model left in `spec-kernel` to bind. |
| D26 | Every open slot is derived or drafted-with-reason; confirmation is deterministic and named. | eval fixture → **migrates to `spec-intake`** | The mechanism that reconciles `spec-intake`'s suggestion-heavy UX with fabrication safety. |
| D27 | `risk`/`irreversibility`/`authority` can never be `machine_derives`. | eval fixture → **migrates to `spec-intake`** | Critical, keep verbatim wherever the interviewer lives. |
| D28 | A gap with a draft on offer is asked as confirmation, not re-asked bare. | eval fixture → **migrates to `spec-intake`** | Conversation-loop mechanic. |
| D29 | Model prose carried only when the ledger backs it. | eval fixture → **migrates to `spec-intake`** | Conversation-loop mechanic. |
| D30 | A model adapter declares its context window, refuses overrun. | eval fixture → **migrates to `spec-intake`** | Binds whichever adapter holds a model — now only `spec-intake`. |
| D31 | Parent intent derived from the sealed document; `SplitPort` separate from `ModelPort`. | eval fixture | Structural (D21/S8/S14), stays in `spec-kernel`. Also the reason split/decomposition logic must not be duplicated in `spec-intake`. |
| D32 | A pending draft survives turns; only named confirmation writes it. | eval fixture → **migrates to `spec-intake`** | Conversation-loop mechanic. |
| D33 | One entrance; no second route writes the document. | 重新討論 → **resolved** | Trivially true — `spec-kernel` runs no conversation, so there is only ever one entrance, full stop. |
| D34 | Translator told which slots hold a draft, never what the draft says. | eval fixture → **migrates to `spec-intake`** | No translator left in `spec-kernel`. |
| D35 | A value's shape enforced at generation, not refused after arrival. | eval fixture → **migrates to `spec-intake`** | Binds whichever adapter generates values — now only `spec-intake`. |
