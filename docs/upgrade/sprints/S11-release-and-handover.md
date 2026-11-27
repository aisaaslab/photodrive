# S11 — Release, rollout and handover

**Phase:** Release
**Goal:** Everything is live, monitored and documented; the owner can run the platform without the developer.
**Entry:** S10 done (R4 gate).
**Exit (done when):** Full regression passed in six languages; a live-mode payment rehearsal succeeded and was refunded; alerts and uptime monitoring are active; 72 hours of production monitoring are clean; runbook and README are current; a release tag exists.
**Decisions needed:** owner approval for the live-mode rehearsal.

## Tasks

- [ ] **S11-01** · M · Full regression across dashboard, gallery, admin and landing in EL/EN/NL/DE/ES/IT; payments **live-mode rehearsal** (a small real charge or 100 %-off code, then refund) with owner approval; evidence recorded.
  - Files: `docs/upgrade/evidence/S11.md`
  - Done when: checklist complete; refund removes access as designed.
- [ ] **S11-02** · M · Production cutover check: all environment variables set, webhook event list correct, Vercel Cron jobs active (`reconcile`, `cleanup`, `reminders`, `stats-recompute`), Upstash and Sentry live, Firestore indexes deployed, TTL policy enabled.
  - Done when: a cutover checklist is ticked line by line.
- [ ] **S11-03** · S · Monitoring: Sentry alert rules (webhook 5xx, `UnmatchedPayment`, reconcile > 0, fulfil failure, cron failure), uptime monitor on `/` and the webhook health route, 72-hour watch, rollback drill performed once.
  - Done when: alerts proven with a test event; watch log completed.
- [ ] **S11-04** · S · Documentation: `docs/runbook.md` (refund, re-sync, back-fill, add/remove admin, rotate secrets, alerts), update the install `README.md` (new env vars, cron, Sentry, Upstash) and `.env.example`.
  - Done when: a fresh reader can perform each runbook task.
- [ ] **S11-05** · S · Handover: close the plan (all boxes ticked or consciously deferred with reasons), final status table, retrospective notes, tag `v2.0.0`.
  - Done when: `docs/upgrade/README.md` shows 100 % or lists deferred items with owners.

## Risks and notes

- Do not run the live rehearsal without a refund plan and the owner present.
- Keep the old payment path removed (S2-12) before tagging.
