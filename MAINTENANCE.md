# Maintenance Phase — Process Notes

Working notes from an in-progress conversation (started 2026-08-18) about how we work together now that the site has reached base functionality. Not finalized — resume here.

## Where we landed

**Phase shift:** base functionality is done. Sessions are no longer "build a new section" — they're specific, detail-oriented reviews of existing pages and flows ("I want to change how we add an item," "can we restructure this menu"). Scope comes from the user each session, not a pre-built backlog list.

**Session flow (agreed):**
1. User brings a specific flow/page question.
2. Claude implements a candidate change directly — `npm run build` after every edit.
3. User reviews live on the dev server themselves (not Playwright by default).
4. Nothing is committed until approved — so "no, revert, leave it as it was" is a normal, expected outcome, not a failure. Since nothing's committed, reverting is just discarding uncommitted changes.
5. Once approved: one commit per batch/flow, then push.

**When a "simple" fix turns out to touch multiple pages:**
- If it's one shared component/action already reused by several pages, fixing it once naturally fixes all of them — still one batch.
- If it's the same UX idea independently duplicated across pages (no shared code) — pilot the fix on the one page originally asked about, get the user's call on whether the approach is right, THEN roll out to the rest as a separate follow-up batch. Don't build into multiple pages before the pattern itself is approved.
- Always let the user choose "build it everywhere now" vs. "just this one for now" — don't decide unilaterally.

**Priority order — this is the key open thread:** interaction-layer reliability (latency, duplicated button/form logic, consolidating repeated UI patterns into a shared module) comes BEFORE flow/navigation redesign work. User's framing: *"latency and button issues will kill the site long before what page am I supposed to be on at this moment."*

**Consolidation principle (agreed, VBA/Access analogy):** anywhere multiple pages do the same process, it should be built as a shared module, not independently duplicated per page — same idea as building a shared button-handler module in Access rather than copy-pasting per form.

**Scoped so far (investigation only, no fix started):**
- Data/logic layer is already reasonably modular — `app/actions/*.ts`, one file per domain, shared across pages. This part is fine.
- UI/interaction layer is NOT modular — ~77 independent page-level "Client" components, only ~22 narrow single-purpose shared components (no generic form/modal/action module). Confirmed by reading `UsersClient.tsx` and `StationsStep.tsx`: both independently hand-roll the same `loading`/`error`/`success` state + submit wrapper + manual `router.refresh()` pattern. This is a general "submit an action, update the screen" problem reimplemented per-page, not specific to "add item" forms — same shape likely applies to Edit/Delete/Approve actions across the site.
- This is the root cause behind the 8-form "missing refresh" bug found in the functional/UX audit (see `HISTORY.md`/CLAUDE.md session 7 notes) — each page had its own independent implementation, so fixing one didn't fix the others.
- Floated idea (not committed to): a shared hook (e.g. `useServerAction()`) wrapping loading/error/success + refresh-on-success once, instead of every page reimplementing it. Not started — still in process conversation, no pilot page chosen yet.

## Open questions — pick up here

- Is "fix the interaction/latency layer" a separate track from the flow/UX conversations, or interleaved — e.g. does every flow session start with "any consolidation debt on this page first?"
- How much of the existing duplication debt (the ~77 independent Client components) gets addressed proactively vs. only when a flow session happens to touch that page?
- Still no pilot page chosen for the "add item" consolidation idea — that was floated too early, before the process conversation was finished.
