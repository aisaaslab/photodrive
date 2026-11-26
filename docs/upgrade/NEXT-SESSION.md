# Starting or resuming work in a new session

This repository is in the middle of a planned upgrade. Everything a fresh session needs is in
`docs/upgrade/`. Do not rely on chat history: it is not available.

## 1 · Open the right branch

The plan was published on branch **`docs/upgrade-plan`** (not yet merged to `main`).
Start the session from that branch, or merge it first:

```bash
git fetch origin docs/upgrade-plan
git checkout docs/upgrade-plan
```

Work branches then follow `sprint-N/<short-task-name>` (e.g. `sprint-1/fulfil-checkout-session`).

## 2 · What the session needs access to

| Need | Why | Needed from |
|---|---|---|
| GitHub (read/write on this repo) | branches, PRs | S0 |
| Staging Firebase project, Stripe **test** keys, Sentry project | prove payment changes | S0 (decision **D12**) |
| Figma connector (file `Aq966rDz8wrtnqVsk5esPB`) | landing build, mobile and admin design | S6, S7 |
| Vercel project access | env vars, cron, preview deployments | S2 onward |

Never put live Stripe keys into a session, a log, or a commit.

## 3 · Kickoff prompt (copy into the new session)

```text
We are continuing the PhotoDrive upgrade. The full plan is in docs/upgrade/ in this repo
(branch docs/upgrade-plan). Do this first:

1. Read docs/upgrade/README.md, docs/upgrade/00-proposal-traceability-and-decisions.md and
   docs/upgrade/04-environments-testing-release.md.
2. Run: node docs/upgrade/tools/status.mjs next
   and read the sprint file for the first open task, plus the sections of
   01-audit-findings.md and 03-target-architecture.md it references.
3. Check the decision log: tell me which open decisions block the next tasks and what you
   recommend. Do not start a task that depends on an unanswered blocking decision.
4. Before using any Next.js API, read the relevant guide in node_modules/next/dist/docs/
   (AGENTS.md: this is Next 16 with breaking changes).
5. Work one task at a time on a branch named sprint-N/<task-name>. For payment changes write
   the failing test first, prove it in Stripe test mode, then fix.
6. In the same change as the code, update the task checkbox with
   node docs/upgrade/tools/status.mjs start|done <TASK-ID>.
7. At the end of the session summarise: tasks completed, tasks in progress, decisions needed,
   and what the next session should pick up.

Start with task: <TASK-ID or "the next open task">.
```

## 4 · Rules for the session

1. **Plan is the source of truth.** If you find the plan is wrong, fix the plan (and say so) in the same PR as the change that revealed it.
2. **Test first for payments**; staging before production; live keys only in production.
3. **Dry-run first** for any script that writes user data. Show the owner the output; apply only what they approve.
4. **Keep the checkbox honest.** `done` means the task's "Done when" line is true and evidence exists where the task asks for it.
5. **Record decisions** in the decision log with the id, and reference them in the PR.
6. **Do not widen scope.** New ideas go into a "Parking lot" section at the bottom of the relevant sprint file, not into the current task.
7. **No behaviour changes in refactoring tasks** (S5-07 … S5-10): add characterisation tests first.
8. **Ask before** anything outward-facing or hard to reverse: production deploys, Stripe dashboard changes, data migrations, sending emails to real users.

## 5 · If the session is resuming mid-sprint

```bash
node docs/upgrade/tools/status.mjs next 10   # in-progress tasks come first
git log --oneline -20                        # what actually landed
```

Reconcile any task whose checkbox disagrees with the code before continuing.

## 6 · Fast orientation: what is already known

- Stack: Next.js 16.2.1, React 19, Tailwind v4, Firebase Auth + Firestore (Admin SDK on the server), Stripe SDK 20, `jose`, `bcryptjs`, `nodemailer`/Resend, SWR.
- The most important defects: **PAY-1** (returning customers locked out by the "already paid" guard in `app/api/stripe/checkout/route.ts`) and **PAY-2** (no extra time when paying while active, `lib/stripe/activate.ts`). Start with S0 → S1.
- Photos load from Google's CDN and the Drive folder is public by design; the PDF's "protected photos" promise needs decision **D15**.
- The dark landing mock-up (Concept B) omits the demo form, tutorial video and trust section: see `02-landing-design-brief.md`.
- The language is now chosen on the server (cookie, then `Accept-Language`, then English; S5-06 done). Every page is dynamic because of it (D16).
- Owner decisions of 2026-11-26: the main market is **English / United States** (D19); the user area gets a **full redesign designed in code**, no Figma frames (D9); the landing page follows the approved Figma file (`02-landing-design-brief.md`).
- **Figma from the cloud sandbox:** the Figma MCP tools work (metadata, variables, design context, inline screenshots), but the sandbox network blocks `www.figma.com` downloads, so the hero and gallery photos and other exported assets cannot be fetched. Before S6 implementation, either the owner adds the exported images to the repo or allows that host for the environment (their decision).
