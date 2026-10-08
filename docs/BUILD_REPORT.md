# ECEWS-ITAMS — Build Report

Status: **all phases complete; `npm run verify` passes from a clean clone.**
Branch: `claude/new-session-ohq5vr` · Phases committed separately (0 → 5).

## 1. Verification results (real runs)

`npm run verify` = typecheck → lint → unit → integration → production build → end-to-end.
Run on the working copy and again on a **fresh `git clone` + `npm ci` with no `.env`**, both exit 0:

| Gate | Result |
|---|---|
| TypeScript (strict, `noUncheckedIndexedAccess`) | 0 errors |
| ESLint (`--max-warnings=0`) | 0 problems |
| Unit tests (Vitest) | **151 passed** (5 files) |
| Integration tests (Vitest + Supertest, real PostgreSQL `itams_test`) | **51 passed** (6 files) |
| Production build (Vite client + esbuild server) | OK |
| End-to-end (Playwright on the production build, seeded `itams_e2e`) | **25 passed** |

What the suites cover:

- **Status machine** — table-driven test of every state (In Store, Issued, Damaged, Damaged-in-repair, Retired, Retired-deleted) × every event (incl. each return condition), header actions per state, and which forms accept which assets (147 cases).
- **Permissions** — the full role × permission matrix; API 403s for IT Support (retire/repair/delete/bulk export/users) and Viewers.
- **Tokens** — 256-bit, hash-only storage, constant-time compare, tamper rejection, never logged (URL redaction).
- **Intake** — draft/autosave, incomplete validation (400 + field errors), pass/fail split with sequential tags, atomic rollback on duplicate serial, idempotent re-validation, 409 on edits after validation.
- **Assets** — filters, search, sorting, pagination, picker availability, report damage, retire, soft delete, deleted-asset visibility, DB CHECK constraints, append-only custody trigger.
- **Forms** — issuance sent → locked → signed → Issued + PDF + receipt; tampered/malformed/used/expired links reveal nothing (410 with state only); one-active-form rule; **concurrency test (two simultaneous forms for one asset → exactly one 201, one 409)**; idempotency key; drafts; expiry job; resend revokes old link and extends 7 days; cancel; 48 h auto-reminder; bulk reminders (no duplicate emails); returns Good/Fair → In Store, Poor/Damaged → Damaged (RETURNED); re-issue recorded as Re-issued; movement CTO → Admin approval, rejection, staff→staff with generated indemnity, vendor repair (Under Repair on approval, Good back → In Store, Poor back → stays Damaged), reinstate-for-repair committed only with the movement.
- **Reports** — CSV parsed and compared row-for-row with the database (incl. each filter), Excel read back (typed cells, styled frozen header, history sheet), PDFs render, overdue rule, project values vs. database sums, missing-cost footnote, single-asset report contents, permissions.
- **E2E** — login/logout/forgot-password; intake pass+fail → registry → retire; registry URL state + report damage; issuance → public signing → signed document → PDF download; return with damage; movement with CTO + Admin approval pages then handover + indemnity signatures; re-send of an expired link; invalid link page; every export format downloads with the dated file name; single-asset report; IT Support restrictions; dashboard; **axe-core WCAG 2.1 A/AA scan of every main screen** (0 violations, colour-contrast reported separately, §6); modal focus trap + Escape.

## 2. How to run

See [README.md](../README.md). Short version:

```bash
npm install && docker compose up -d && cp .env.example .env
npm run db:migrate && npm run seed && npm run dev   # http://localhost:5173
```

Demo users (password `Itams-Demo-2026`): `edidiong.okon@ecews.org` (IT Admin), `uwem.ekanem@ecews.org` (IT Support), `aniekan.udo@ecews.org` (Viewer).

## 3. What was built, per screen

Every number on every screen is computed from the database. Screens were compared against their design images with Playwright screenshots at 1440 px (and 820 px / 390 px for responsiveness); visible differences in layout, spacing, colour, copy and states were fixed.

| Design | Built | Notes |
|---|---|---|
| `components.png` | Token CSS + Tailwind theme; component library in `src/client/components/ui`; `/dev/components` gallery (dev only) | Colours read from labels and confirmed by pixel sampling. |
| `Dashboard.png` | `/` | KPIs (In Store + added this month, Issued, Under Repair + awaiting parts, Awaiting signature + overdue today), Recent Actions, Needs Attention (damaged not in repair, failed intake, overdue vendor returns), Quick actions, Assets by project, bell + notifications panel. |
| `Background+Border+Shadow.png` | Notifications panel | Overdue returns, links expiring in 24 h, signed documents, approvals/rejections; relative times; Mark all read. |
| `AB-05`, `AB-05-1` | `/assets` | Search, Category/Status/Project/Added filters, removable chips, Clear filters, live result count, server pagination + sortable headers, URL state, "In repair" quick filter, Failed-intake chip, admin-only "Deleted" filter. |
| `AB-06`, `AB-06-1` | `/assets/:tag` | Header (icon, name, tag, status, current indemnity chip, serial, project, added, holder), state actions exactly per the brief's table with role hiding and lock explanations, chain-of-custody timeline, intake snapshot, lifecycle totals, Code 128 tag. **ECEWS-IT-0001 reproduces the AB-06 timeline** (12 Jun → 28 Jun → 14 Jul → 02 Aug → 06 Aug 2026). |
| `Background+Shadow.png` | Generate report (single asset) | PDF/Excel/CSV; timeline and intake snapshot toggles; `ECEWS-ITAMS-ECEWS-IT-0001_full-history_YYYY-MM-DD.ext`. |
| `Background+Shadow-5.png` | Report damage | Fair/Poor/Damaged, required notes (≥ 10), read-only "Resulting status: Damaged". |
| (composed) | Retire, Reinstate for repair, Delete (type the tag) | Built from the modal pattern; destructive copy says what is kept. |
| `AB-07`, `Background.png` | `/intake`, `/intake/:id` | Form 1 with debounced autosave, live "X of Y checks passed" bar, Save draft, Discard draft, Validate & create assets; quantity > 1 expands to per-unit serials; tag preview. |
| `Background+Shadow-6/-8/-1` | Add line item, Validate & create assets, Discard draft | Line item adds Result (Passed/Failed) and Unit cost. Success, failed and quantity-mismatch toasts. |
| `AB-08a` registries ×3 | `/forms?tab=issuance|return|movement` | Columns per design, search/category/project filters, computed counts, View opens the sign-off drawer. |
| `AB-08a` Issuance Form ×2 | `/forms/new/issuance` | Staff typeahead autofill, picker for In Store assets, optional temporary issuance, fixed terms. |
| `Issuance confirmational modal.png`, `-9` | Send for signature | Recipient + IT chips, email preview, deadline (+7 days), typed e-signature note. |
| `AB-08c` Return Form ×2 | `/forms/new/return` | Staff or Vendor returner, suggested chips for other assets in the person's custody, "Add issued items", per-item condition. |
| `Background+Shadow-11.png` | Confirm return | Signers, per-item resulting status, email preview, return date, received by. |
| `AB-08d` Movement Form (newer) | `/forms/new/movement` | Destination Staff / Location / Vendor; from-holder and location derived from the assets; CTO and Admin Officer emails; signer chips; reinstate mode for Repair. |
| `Background+Shadow-12.png` | Validate & send for signature (movement) | Signers, asset card, email preview, approval-chain note. |
| `Background+Shadow-14.png` | Add assets from registry | Search, category chips, multi-select that survives pagination, scan/paste tag + Enter, disabled rows with reasons. |
| `AB-09` | `/signoffs` | KPIs, tabs with counts (intake drafts appear under Draft), search, row actions by status, `?ref=` deep links. |
| `Sign-off detail drawer.png`, `Background+VerticalBorder+Shadow.png` | Drawer | Recipient/sent/link validity/status, approvals, signer cards, linked indemnity, document assets, View PDF, Resend/Remind, Cancel, Resume/Discard for drafts. |
| `Background+Shadow-4/-7/-10` | Re-send, Email reminders (bulk), New form chooser | |
| `AB-11` | `/sign/:token` (public) | No login, noindex, rate-limited, mobile-first; terms checkboxes, typed signature, confirmation; Sign & submit disabled until complete; thank-you state; calm expired/used/invalid pages with the IT contact. |
| (composed) | `/approve/:token` (public) | CTO / Admin Officer approve or reject (reason required). |
| `AB-12` | `/documents/:ref` | The same HTML that produces the PDF, previewed in a sandboxed iframe; "Signature verified · date · WAT · IP"; Download PDF; Email copy. |
| `Background+Shadow-13.png` | Email copy | Regenerates the PDF; optional copy to the signer. |
| `AB-10` | `/reports` | KPIs, searchable report list, PDF/Excel/CSV per report. |
| `Reports Download Modal.png`, `-2` | Export report | Format cards, lifecycle-history scope, custom filters (asset register), live count, file-name preview. |
| `Background+Shadow-3.png` | Sign out | |
| `Forget Password.png` | Forgot password (on `/login`) + `/reset-password/:token` | 24 h single-use link; never reveals whether an email exists; all sessions ended on reset. |
| (composed) | `/login`, 404, no-access page, session-timeout warning | |

Back end highlights: Zod on every body/query/param; one transaction per mutation with row locks; the partial unique index enforces one active form per asset; CHECK constraints make impossible states unrepresentable; custody events are append-only by trigger; emails are sent only after commit (a failed send is reported to the user and logged, never silent); jobs for expiry, 48 h reminders, 24 h expiry warnings, overdue issuances and overdue vendor repairs.

## 4. Decisions

All decisions are recorded in [DECISIONS.md](DECISIONS.md) (D1–D51). The most consequential:

- **D2** Prisma 6 with raw-SQL integrity migrations · **D12/D13** drafts don't lock assets; the lock is a partial unique index plus row locks · **D14** `inRepair` is `repairFormId` (set on approval, cleared by the vendor return or retire) · **D16/D17** movement signers and generated indemnity (`IND-xxxx`) · **D18** extra statuses Pending approval and Rejected · **D25** reinstatement commits with the movement · **D26** soft delete only · **D27** overdue rules · **D31–D33** roles (IT Support may resend; viewers download nothing; user management by API/CLI only) · **D43** the typed signature must match the name on the form · **D44** injectable clock so the seed replays history through real services · **D48** "awaiting parts" definition · **D49** export filters default to All.

## 5. Inconsistencies in the designs and how they were resolved

Listed in [SPEC.md §9](SPEC.md): form numbering (Issuance 2 / Movement 3 / Return 4), "of 6 checks" with 7 questions, "Add from In Store" on returns, "In Stock" → "In Store", "Pending Resolution" removed, "Under Repair" as a display variant, header indemnity chip shows the current indemnity, placeholder counts, radius 6 vs 8, two movement-form variants (newer wins), report-damage notes now required.

## 6. What is not complete or deviates, and why

1. **`docker compose` was not executed.** The build environment had no Docker daemon. `docker-compose.yml` (Postgres 16 + Mailpit, with `itams_test`/`itams_e2e` created by `scripts/docker-init.sql`) is provided but untested here; all gates ran against a local PostgreSQL 16 instead.
2. **SMTP delivery to a real server and Neon were not exercised.** Emails were verified through the in-memory transport (tests) and the file transport (development and e2e, where links are read from the `.eml` files). SMTP uses standard Nodemailer settings. Neon pooled/direct URLs are documented, and job locks were made transaction-scoped so they work behind pgbouncer, but no Neon database was available.
3. **Colour contrast.** axe-core reports contrast below 4.5:1 only for colours taken directly from the design: `--gray-400` secondary text on white (2.5:1, about 55 nodes across 7 pages), amber text on `--amber-light` badges (3.1:1), and `--gray-500` on `--gray-100` chips (4.4:1). They were kept for fidelity, as the brief requires. Darkening `--gray-400` to `--gray-500` for text would fix most of them if the design owner agrees.
4. **Exact-copy deviations driven by real data.** ECEWS-IT-0001's move reads "Uyo HQ Store → Ikot Ekpene office" (the seeded location names) where AB-06 shows "Uyo HQ → Ikot Ekpene" (D46). The header indemnity chip shows ISS-0161, the current indemnity, rather than ISS-0142. Counts differ from the mockups because they are computed.
5. **PDF exports are rendered in one pass** (D50). CSV and Excel stream in 500-row batches.
6. **No user-management screen** (D33). The design has none; there is an API plus `npm run user:create`.
7. **Registry page size is 10** (D40), where the mockups illustrate 5.
8. **`prisma migrate reset` is refused when run by an AI agent** without explicit user consent. The test harness therefore uses `prisma migrate deploy` plus a table-clearing helper that only runs on databases whose name ends in `_test` or `_e2e`. `npm run db:reset` is still provided for humans.
9. **The supplied logo is 205 × 59 px.** It is used as supplied, so it is slightly soft on high-DPI screens.

## 7. Seed data

`npm run seed` replays real workflows through the services at historic times, so all records are internally consistent. On an empty database it creates:

- 3 users, 5 projects, 6 locations, 9 categories
- 47 assets: 25 In Store, 16 Issued, 4 Damaged (one per origin: reported, returned and failed intake, plus 2 in repair, 1 of them overdue at the vendor), 2 Retired (one eligible for Repair or Delete, one rejected at intake)
- About 34 forms across every status: Signed, Awaiting, Partial (movement plus indemnity), Expired, Draft, Awaiting approval and Rejected, plus an intake draft
- One temporary issuance more than 90 days old, which drives the overdue-return alert
- The exact ECEWS-IT-0001 history from AB-06
