# Decisions

Each entry: the gap or conflict, the decision, and why. Numbered for reference from code comments and the build report.

## Repository and tooling

- **D1. Single package, three source roots.** `src/shared` (pure domain: status machine, permissions, constants, Zod schemas), `src/server` (Express API, jobs, PDF, email), `src/client` (React). One `package.json` keeps `npm run verify` simple. The repo's pre-existing Python files are unrelated and left untouched.
- **D2. Prisma 6.x**, not 7/8: Prisma 7 removed the schema `url` and requires driver adapters; 6.x is the stable API with the same migration model. Partial unique indexes, CHECK constraints, sequences and the custody-event immutability trigger are written as raw SQL in committed migrations.
- **D3. Local Postgres for development and tests.** `docker-compose.yml` ships Postgres 16 and Mailpit, but the build environment had no Docker daemon, so the gates were run against a locally installed Postgres 16. Nothing in the app depends on Docker.
- **D4. React 18.3** for library compatibility; Tailwind 3.4 with tokens as CSS variables; Inter self-hosted via `@fontsource/inter` (bundled by Vite, no external requests).
- **D5. "Mono" token = Inter 600 with tabular figures and slight tracking.** The design's tag chips are visibly Inter, not a monospace face; using a real monospace font would break visual fidelity.
- **D6. Radius scale 6 / 12 / 16 / pill**, from `components.png` (the brief said 8).

## Terminology and copy

- **D7.** "In Stock" → "In Store" in every label, filter, KPI, modal, email, export and identifier.
- **D8.** "Pending Resolution" never appears. Intake subtitle becomes "passes create assets In Store, failures are flagged Damaged". The mismatch toast becomes "Quantity mismatch - recorded on IN-xxx for follow-up". Add line item note: "Failed items are created as Damaged with a Failed intake flag and stay in Needs Attention until sent for repair or retired."
- **D9.** Form numbers follow the New form chooser: Issuance & indemnity = Form 2, Movement = Form 3, Return = Form 4. Subtitles on the Return and Movement screens are corrected.
- **D10.** Return form button "Add from In Store" → "Add issued items" (vendor mode: "Add items in repair"); Movement form → "Add items"; Issuance keeps "Add from In Store".
- **D11.** Intake checks bar: "X of Y checks passed" where Y = questions not answered N/A (unanswered questions count, so the denominator starts at 7) and X = questions answered Yes. All 7 questions must be answered before validation.

## Domain

- **D12. Drafts do not lock assets.** The one-active-form lock is taken when a form is sent (status PENDING_APPROVAL / AWAITING / PARTIAL / EXPIRED). A stale draft must never block an asset; the lock is re-checked on send, and the draft shows a clear error if an asset was taken meanwhile.
- **D13. Lock implementation:** `FormAsset.active` boolean maintained in the same transaction as the form status, with a partial unique index `UNIQUE (asset_id) WHERE active`. Asset rows are also locked `FOR UPDATE` while a form is being sent. Concurrent attempts produce exactly one success (tested).
- **D14. Repair tracking:** `Asset.repairFormId` points at the open repair movement. It is set when the vendor movement is fully approved (status stays Damaged, Under Repair badge), and cleared by the vendor return (or Retire). `inRepair` is derived as `repairFormId IS NOT NULL`.
- **D15. People directory.** Recipients, returners, receivers and vendors are stored in `Person` (type STAFF or VENDOR), upserted by email when a form is sent. This powers typeahead autofill and the "current holder". While at a vendor for repair, the vendor contact is the holder and the location is the vendor.
- **D16. Movement signers.** FROM: if the assets have a staff holder, that person signs a handover confirmation. TO: staff → a child Indemnity form (`IND-xxxx`) is generated for the receiver; location → the responsible person at the destination confirms; vendor → the vendor contact confirms receipt. All assets on one movement must share the same current holder and location. Vendor destination is allowed only for Damaged assets and requires an expected return date. A Damaged asset can only go to a vendor.
- **D17. Movement status** is aggregate: PENDING_APPROVAL until CTO and Admin Officer both approve, then AWAITING → PARTIAL → SIGNED across the movement's own signers *and* its child indemnity. The indemnity form has its own status shown in Sign-offs as type "Indemnity".
- **D18. Form statuses** add PENDING_APPROVAL and REJECTED to the brief's list (the brief requires movements to "end as Rejected"). In Sign-offs, the Awaiting tab includes Pending approval and Partial. Badge copy: "Awaiting approval" (amber), "Rejected" (red).
- **D19. Cancel.** The brief lists a Cancelled status. IT can cancel an unsigned, non-draft form from the sign-off drawer (secondary button, confirm modal). This releases the asset locks and revokes all links. Drafts are discarded (deleted) instead.
- **D20. Expired forms keep their lock** so the asset is not issued twice by accident; IT either re-sends (fresh 7-day window) or cancels.
- **D21. Issuance completion:** when the recipient signs, IT is counter-signed automatically as issuer (the user who sent it), the form becomes SIGNED, assets become ISSUED with the recipient as holder, custody events are written, and the PDF is generated after commit (regenerated on demand if missing).
- **D22. Return statuses** update only when the returner signs. Staff return: Good/Fair → In Store; Poor/Damaged → Damaged (RETURNED). Vendor return of an in-repair item: Good/Fair → In Store and repair closed; Poor/Damaged → stays Damaged, repair closed (may be sent again or retired). The holder is cleared on completion.
- **D23. Re-issued** custody event is used when the asset has a prior RETURNED event; it records the new indemnity reference.
- **D24. Report damage** keeps the holder. Condition options Fair/Poor/Damaged; notes required ≥ 10 characters; "Resulting status: Damaged".
- **D25. Repair (reinstatement)** is not a standalone mutation. "Repair" opens a confirm modal, then the Movement form in vendor mode with `reinstate=true`. The server reinstates (Retired → Damaged, custody event "Reinstated for repair") and creates the movement in one transaction when the movement is submitted. Cancelling the form before submission leaves the asset Retired.
- **D26. Soft delete only.** `deletedAt/deletedBy/deleteReason`; excluded from registry, counts, pickers and standard exports; visible to IT_ADMIN via the Status filter option "Deleted (admin)". Tags are never reused (sequence). Hard delete is not implemented.
- **D27. Temporary issuance / overdue.** Issuance and movement forms carry an optional "Temporary" flag and expected return date. Overdue = asset currently Issued under a temporary issuance signed ≥ 90 days ago. Vendor movements are overdue when the expected return date has passed and the repair is still open. The "Overdue returns" KPI counts the former; Needs Attention lists both.
- **D28. Unit cost** is an optional field on intake line items copied to the asset (NGN). Missing values count as zero in "Assets by project" with a visible footnote.
- **D29. Signature reminders** (auto after 48 h, once per link issue) apply to every form, as the modals state. Due-date reminders apply only to movements.
- **D30. Signed timestamps** are stored UTC and shown in WAT (Africa/Lagos) as "14 Aug 2026 · 10:32 WAT".

## Roles

- **D31.** No roles document exists in the repo or design package, so the defaults from the brief are seeded in `src/shared/permissions.ts`. IT_SUPPORT may view all sign-offs and resend/remind (the brief's "cannot" list does not exclude these). Resend, cancel and remind are open to IT_ADMIN and IT_SUPPORT.
- **D32. VIEWER** sees Dashboard, Asset Registry, Asset Detail and the Reports page KPIs. Viewers cannot download any export or single-asset report, and cannot open Sign-offs, Issuance & Returns or Intake (they contain personal data such as emails and phones). Hidden in the sidebar; the server returns 403.
- **D33. User management** has no design. It is implemented as IT_ADMIN-only API endpoints (`/api/users`) plus a CLI (`npm run user:create`). No UI page was added, to avoid inventing a screen.

## UX

- **D34.** Registry "View" on the Issuance / Return / Movement tabs opens the sign-off drawer for that form. The tag chip links to the asset.
- **D35.** The sign-off drawer is the full-height variant (`Background+VerticalBorder+Shadow.png`). Buttons change by status: Awaiting/Expired → View PDF (preview of the unsigned document) + Resend reminder; Partial → Remind; Signed → View document + Download PDF; Draft → Resume + Discard draft.
- **D36.** Damaged badge in tables uses the alert-triangle icon (AB-05-1). Header badges use the dot (AB-06-1).
- **D37.** The send-for-signature modal uses the full variant (with deadline and signing method), since it carries information the brief requires.
- **D38. Session**: 8 h idle timeout. The client warns 2 minutes before expiry and offers "Stay signed in"; drafts are server-side so nothing is lost.
- **D39. Email domain warning:** non-`@ecews.org` addresses show an amber inline note but are allowed.
