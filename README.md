# ECEWS-ITAMS — IT Asset Management System

Internal web app for the ECEWS IT unit. It replaces the paper forms with four digital workflows —
**Intake (Form 1)**, **Issuance & indemnity (Form 2)**, **Movement (Form 3)** and **Return (Form 4)** — and
keeps an append-only chain of custody for every asset. Signers and approvers never need an account:
they act through single-use emailed links.

- Design package: `design/` (extracted from `ECEWS_ITAMS.zip`)
- Specification: [`docs/SPEC.md`](docs/SPEC.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Build report: [`docs/BUILD_REPORT.md`](docs/BUILD_REPORT.md)

## Stack

TypeScript (strict) · React 18 + Vite + React Router + TanStack Query + React Hook Form + Zod · Tailwind (design tokens from `components.png`) + Radix UI + lucide-react · Inter (self-hosted) · Node + Express · PostgreSQL + Prisma 6 · argon2 sessions with CSRF · Nodemailer · Chromium (Playwright) for PDFs · exceljs / csv-stringify · bwip-js (Code 128) · node-cron · Vitest + Supertest + Playwright.

## Requirements

- Node.js 20 or newer (tested on 22)
- PostgreSQL 14+ (local, Docker, or Neon)
- A Chromium build for PDF rendering — `npx playwright install chromium` once, or set `CHROMIUM_PATH`
- Optional: Docker, for Postgres + Mailpit via `docker compose`

## Setup (development)

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres and Mailpit (or use your own Postgres; see "Without Docker" below)
docker compose up -d
#    Mailpit inbox: http://localhost:8025 (SMTP on localhost:1025)

# 3. Configure the environment
cp .env.example .env
#    For Mailpit set: MAIL_TRANSPORT=smtp, SMTP_HOST=localhost, SMTP_PORT=1025
#    Otherwise MAIL_TRANSPORT=file writes every email to var/mail/*.eml

# 4. Create the schema and the demo data
npm run db:migrate
npm run seed            # only on an empty database

# 5. Run API (port 4000) and web app (port 5173) together
npm run dev
```

Open <http://localhost:5173> and sign in:

| Role | Email | Password |
|---|---|---|
| IT Admin | `edidiong.okon@ecews.org` | `Itams-Demo-2026` |
| IT Support | `uwem.ekanem@ecews.org` | `Itams-Demo-2026` |
| Viewer | `aniekan.udo@ecews.org` | `Itams-Demo-2026` |

(Change the seed password with `SEED_PASSWORD` before seeding.)

Signature and approval links are emailed. In development, open them from Mailpit or from `var/mail/*.eml`.
`/dev/components` shows the component gallery (development only).

### Without Docker

Create three databases in your own PostgreSQL and point `.env` at the first one:

```sql
CREATE DATABASE itams;       -- application
CREATE DATABASE itams_test;  -- integration tests (cleared by the tests)
CREATE DATABASE itams_e2e;   -- end-to-end tests (cleared and re-seeded by the tests)
```

`docker compose` creates `itams_test` and `itams_e2e` automatically (`scripts/docker-init.sql`).

### Using the app from other machines on the LAN

The server binds to `HOST=0.0.0.0` and the browser always calls the relative `/api`, so nothing is tied
to `localhost`. Set `APP_BASE_URL` to the address other machines use (for example
`http://192.168.1.20:4000` in production, or `http://192.168.1.20:5173` with `npm run dev`); every link in
emails is built from it.

## Production

```bash
npm ci
npm run build                 # client → dist/client, server → dist/server
npm run db:migrate            # uses DIRECT_URL on Neon
npm start                     # node dist/server/index.js --production (serves API + built app on PORT)
```

- **Neon:** `DATABASE_URL` = the *pooled* connection string (host contains `-pooler`, add `pgbouncer=true`),
  `DIRECT_URL` = the *direct* string. Migrations use `DIRECT_URL`; the app uses `DATABASE_URL`.
- Serve over HTTPS behind a reverse proxy and set `TRUST_PROXY=true`. Cookies are `Secure` in production
  (set `COOKIE_SECURE=false` only for plain-HTTP LAN deployments).
- Background jobs (expiry, 48 h reminders, overdue alerts) run in-process with a Postgres advisory lock,
  so several instances never double-run a job. Disable with `JOBS_ENABLED=false`.
- `.env` files saved on Windows work: carriage returns are stripped and every variable is validated at
  startup with a clear message.

### Users

There is no user-management screen in the design. IT Admins manage users through the API
(`GET/POST /api/users`, `PATCH /api/users/:id`) or the CLI:

```bash
ITAMS_NEW_PASSWORD='a-strong-password-1' npm run user:create -- --email jane@ecews.org --name "Jane Doe" --role IT_SUPPORT --title "IT Support" --office Uyo
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm run build` | Production build of client and server |
| `npm start` | Start the production server |
| `npm run db:migrate` | Apply committed migrations |
| `npm run seed` | Load the demo dataset (empty database only) |
| `npm run typecheck` / `lint` / `format` | Static checks |
| `npm run test:unit` | Vitest unit tests (status machine, permissions, tokens, formatting…) |
| `npm run test:integration` | API tests against `itams_test` (override with `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright against the production build on `itams_e2e` (override with `E2E_DATABASE_URL`) |
| `npm run verify` | typecheck → lint → unit → integration → build → e2e |

`npm run verify` needs PostgreSQL running with `itams_test` and `itams_e2e`, and a Chromium for
Playwright (set `PLAYWRIGHT_CHROMIUM_PATH` if your Chromium is not where Playwright expects it).

## Project layout

```
src/shared/     status machine, permissions, constants, Zod form schemas, formatting
src/server/     Express API, services (forms engine, assets, intake, reports), jobs, email, PDF
src/client/     React app: pages, components (ui/ is the design-system library), lib/
prisma/         schema, migrations (incl. raw-SQL integrity rules), seed
tests/          unit + integration (Vitest)
e2e/            Playwright end-to-end, accessibility and export tests
docs/           SPEC, DECISIONS, BUILD_REPORT
design/         the original design package
```
