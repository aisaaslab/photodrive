# S7 — Admin back office I: design, roles, audit, counters, users, galleries

**Phase:** 3 · Redesign and foundation
**Goal:** The data foundation of the new back office (roles, audit trail, stored counters) plus the Users and Galleries screens, server-paginated and fast at any size.
**Entry:** S5 done (server layer, repos, primitives). Can run in parallel with the end of S6.
**Exit (done when):** No admin endpoint reads a whole collection; Users and Galleries support search and paging; every admin mutation is audited; more than one admin can be added.
**Decisions needed:** none blocking; confirm the admin IA at S7-01.

## Tasks

- [x] **S7-01** · M · **SUPERSEDED (owner, 2026-11-26, D9): the admin area is designed in code on the Concept B tokens, no Figma frames; the information architecture below is the brief.** Was: Admin design (Figma): Overview, Users list + detail drawer, Galleries, Payments (+ Needs attention), Support, Plans/Promo codes, Settings, in the Concept B style (desktop). Owner reviews.
  - Files: Figma file `Aq966rDz8wrtnqVsk5esPB`, new page "Admin"
  - Done when: node ids recorded in this file and owner approves.
  - Refs: G3
- [x] **S7-02** · M · Roles: Firebase custom claim `admin`; `requireAdmin` accepts the claim or `ADMIN_UID` (bootstrap); script to grant/revoke an admin; tests for both paths.
  - Files: `lib/server/auth.ts`, `scripts/admin/set-admin-claim.ts`
  - Done when: a second admin can sign in and use the back office; revoking works.
- [x] **S7-03** · M · Audit log: `audit_log` collection, `writeAudit()`; wrap every admin mutation (assign plan, grant, revoke, delete user, plan and promo CRUD, settings, gallery disable).
  - Files: `lib/server/audit.ts`, all `app/api/admin/*`
  - Done when: each admin action creates an entry with actor, target, before/after (tests).
- [x] **S7-04** · L · Stored counters: `stats/overview` (users, active subscriptions, galleries, `revenueByCurrency{}`, payments) updated incrementally on user/gallery/payment events, nightly recompute cron as truth; use Firestore `count()` where cheap; replace the full-scan stats endpoint; revenue reported **per currency**.
  - Files: `lib/server/repos/stats.ts`, `app/api/admin/stats/route.ts`, `app/api/cron/stats-recompute/route.ts`
  - Done when: counters match a full recompute on staging data; the endpoint reads one document.
  - Refs: SEC-5, PAY-6
- [~] **S7-05** · L · Users: `GET /api/admin/users?q&cursor&limit` (indexed `emailLower` search, Auth lookups only for the visible page); list UI with search, filters (active, expiring, lapsed, comped), paging; **detail drawer** with plan, expiry, galleries, payments and actions (extend, assign plan, revoke, delete) writing audit entries.
  - Depends: S7-02, S7-03
  - Files: `app/api/admin/users/*`, `app/dashboard/admin/users/*`, `components/admin/*`
  - Done when: smooth with 10k seeded users; no 1,000-user cap; actions audited.
  - Refs: SEC-5
- [ ] **S7-06** · M · Galleries: server-paginated list with owner, status (password, downloads, disabled), last activity; open public link; **disable/enable** (`disabled` flag honoured by the public page and media route).
  - Depends: S7-03
  - Files: `app/api/admin/galleries/*`, `app/dashboard/admin/galleries/*`, `app/gallery/[slug]/page.tsx`
  - Done when: a disabled gallery shows a polite unavailable page everywhere; audit entry written.

## Risks and notes

- Seed realistic volumes in staging before judging performance.
- `emailLower` needs a backfill script and a composite index (see `03-target-architecture.md`).
- Keep the old admin pages working until S8-05 so operations are never blocked.
