# Invoice Dispatch

Accepts an invoice request for an existing client, renders it to a PDF, and emails it —
asynchronously, reliably, and idempotently.
This README is the practical "how do I run this" guide, plus a summary of the
design decisions.

## Contents

- [Quickstart](#quickstart)
- [What it does](#what-it-does)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Local development without Docker](#local-development-without-docker)
- [Frontend](#frontend)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Engineering principles](#engineering-principles)
- [Known limitations / explicitly out of scope](#known-limitations--explicitly-out-of-scope)

## Quickstart

Requires Docker and Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

That's it — `docker compose up` brings up Postgres, Redis, the API, and the worker; runs
migrations automatically; and (in dev, via `docker-compose.override.yml`, which is loaded
automatically) uses the `console` mail driver, so no Mailgun account is needed to see the
whole pipeline work.

Seed the demo clients (idempotent — safe to run more than once):

```bash
docker compose exec api pnpm db:seed
```

This creates 3 companies and 5 clients, one of them (`mia.wallace@example.com`) with no
company, to exercise that branch of the PDF/email templates. The others:
`john.doe@acme.example`, `jane.smith@acme.example` (Acme Inc.), `hank.scorpio@globex.example`
(Globex Corporation), `peter.gibbons@initech.example` (Initech LLC).

Register a user and create an invoice (the session cookie curl saves to `cookies.txt` on
register carries through the rest of the walkthrough):

```bash
curl -s -c cookies.txt -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{ "email": "operator@example.com", "password": "correct-horse-battery" }'

curl -s -b cookies.txt -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-1" \
  -d '{
    "email": "john.doe@acme.example",
    "items": [
      { "description": "Website redesign", "quantity": 1, "unitAmountMinor": 150000 },
      { "description": "Hosting (3 months)", "quantity": 3, "unitAmountMinor": 2000 }
    ],
    "notes": "Thanks for your business!"
  }'
```

You'll get back `202` with an `invoiceId`. Within a few seconds the worker renders the PDF and
"sends" the email — with `MAIL_DRIVER=console` (the dev default), nothing actually goes out
over the network; instead, look in `./tmp/outbox/` for the rendered email body (`.html`) and
the PDF attachment, or just tail the worker's logs.

Check on it:

```bash
curl -s -b cookies.txt http://localhost:3000/api/invoices/<invoiceId> | jq
curl -s -b cookies.txt http://localhost:3000/api/invoices/<invoiceId>/pdf -o invoice.pdf   # once status is PDF_READY or later
```

Or skip the `curl`/`cookies.txt` dance entirely and drive the same flow from a browser — see
[Frontend](#frontend).

Swagger UI is at `http://localhost:3000/docs` in dev (off by default in production —
see [Configuration](#configuration)).

## What it does

1. `POST /api/invoices` — you give it a client's email and line items; it looks the client up
   (this service never creates clients — that's a separate concern, seeded/managed
   elsewhere), computes totals itself, allocates a gapless per-year invoice number, and
   returns `202` immediately. The heavy lifting happens in the background.
2. A worker process renders the invoice to a PDF (headless Chromium via Puppeteer) and stores
   it in Postgres.
3. The same worker process emails the PDF to the client (Mailgun in production, or a
   `console` driver that just writes files locally for dev/test).
4. `GET /api/invoices/:id` reports where things stand at every step: `PENDING` →
   `PDF_RENDERING` → `PDF_READY` → `EMAIL_SENDING` → `SENT`, or `FAILED` with a reason.
5. Retries, a stuck-invoice sweeper, idempotent request handling, and structured logging round
   out the "actually reliable" part of the system.

## Architecture

```
                POST /api/invoices
                       │
                       ▼
              ┌─────────────────┐        writes an audit row first,
              │   api process   │        no matter what happens next
              │  (Express)      │
              └────────┬────────┘
                       │ enqueues "render" job
                       ▼
              ┌─────────────────┐   PENDING → PDF_RENDERING
              │  worker process │─────────────────────────┐
              │                 │                          ▼
              │  ┌───────────┐  │                  renders HTML (Handlebars)
              │  │ pdf worker│──┼─── Puppeteer ───▶ HTML → PDF bytes
              │  └───────────┘  │                          │
              │        │        │                  stores in Postgres (bytea)
              │        ▼        │                          │
              │  enqueues "send" job          PDF_RENDERING → PDF_READY
              │        │        │
              │  ┌───────────┐  │
              │  │email worker│─┼─── Mailgun / console ───▶ sends the email
              │  └───────────┘  │
              │                 │            PDF_READY → EMAIL_SENDING → SENT
              │  ┌───────────┐  │
              │  │  sweeper  │──┼─── re-enqueues anything stuck too long
              │  └───────────┘  │    in an in-flight status (lost enqueue,
              └─────────────────┘    crashed worker, etc.)
```

Both processes run from the same image (`Dockerfile`); only the command differs
(`node dist/index.js` vs `node dist/worker.js`). Everything both processes need to agree on —
job payload shapes, the status machine, the repository layer — is shared code, not duplicated.

**The status machine** (`invoices.status`): `PENDING → PDF_RENDERING → PDF_READY →
EMAIL_SENDING → SENT`, with `FAILED` reachable from any in-flight state and `POST
/:id/retry` resetting `FAILED → PENDING`. Every transition goes through one function
(`src/services/invoiceStatus.service.ts`) built around a single conditional SQL statement —
see [ADR-2](#design-decisions) below for why that matters more than it sounds like it should.

## API reference

Full OpenAPI document at `/docs/openapi.json` (or browse `/docs` in dev). Summary:

| Method | Path                      | Notes                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/invoices`           | `202` (or `200` on an idempotent replay). Body: `{ email, items: [{ description, quantity?, unitAmountMinor }], currency?, notes? }`. `.strict()` — sending `totalMinor` or an item's `amountMinor` is a `400`, not a silently ignored field, because those are server-computed. Optional `Idempotency-Key` header. |
| `GET`  | `/api/invoices/:id`       | Status, computed totals, line items, and the client/company data as it was billed (from the frozen snapshot — see ADR-8), not a live lookup.                                                                                                                                                                        |
| `GET`  | `/api/invoices/:id/pdf`   | `200` + the PDF once it exists; `409 PDF_NOT_READY` before that.                                                                                                                                                                                                                                                    |
| `POST` | `/api/invoices/:id/retry` | Only from `FAILED`; otherwise `409 INVOICE_NOT_RETRYABLE`. `role: admin` only — `403 ADMIN_REQUIRED` otherwise.                                                                                                                                                                                                     |
| `GET`  | `/health`                 | Liveness — always `200`, never touches a dependency.                                                                                                                                                                                                                                                                |
| `GET`  | `/health/ready`           | Readiness — Postgres `SELECT 1` + Redis `PING`; `503` with a per-component breakdown if either is down.                                                                                                                                                                                                             |
| `POST` | `/auth/register`          | Body: `{ email, password }`. Always creates `role: "user"` — no self-serve admin. Sets the session cookie.                                                                                                                                                                                                          |
| `POST` | `/auth/login`             | Body: `{ email, password }`. `401 INVALID_CREDENTIALS` on a mismatch either way (never reveals which).                                                                                                                                                                                                              |
| `POST` | `/auth/logout`            | Clears the session cookie. Stateless JWT — this doesn't revoke it server-side.                                                                                                                                                                                                                                      |
| `GET`  | `/auth/me`                | Current user, from the session cookie.                                                                                                                                                                                                                                                                              |

All `/api/invoices*` routes require a valid session cookie (`POST /auth/login` or
`/auth/register` — see [Frontend](#frontend)), and additionally an `X-API-Key` header **only
if** `API_KEY` is configured — that piece is still an explicit opt-in, layered on top of the
session rather than replacing it.

Error responses are always `{ "error": { "message": "...", "code": "..." } }`, e.g.
`CLIENT_NOT_FOUND` (404), `VALIDATION_ERROR` (400), `IDEMPOTENCY_KEY_CONFLICT` (409),
`INVOICE_STATUS_CONFLICT` (409), `RATE_LIMITED` (429).

## Configuration

Copy `.env.example` to `.env` and adjust. Every variable is validated at startup with zod
(`src/config/env.ts`) — the process refuses to start rather than run with a bad config.

| Variable                                                                                 | Required                      | Default                                      | Notes                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                               | no                            | `development`                                | `development` \| `test` \| `production`                                                                    |
| `PORT`                                                                                   | no                            | `3000`                                       |                                                                                                            |
| `DATABASE_URL`                                                                           | **yes**                       | —                                            |                                                                                                            |
| `DATABASE_POOL_MAX`                                                                      | no                            | `10`                                         |                                                                                                            |
| `REDIS_URL`                                                                              | **yes**                       | —                                            | Shared by BullMQ and the rate limiter                                                                      |
| `LOG_LEVEL`                                                                              | no                            | `info`                                       | pino level; independent of `NODE_ENV` on purpose                                                           |
| `LOG_PRETTY`                                                                             | no                            | `false`                                      | pino-pretty locally                                                                                        |
| `API_KEY`                                                                                | no                            | —                                            | Optional machine-to-machine secret, layered on top of the session cookie below (see [Frontend](#frontend)) |
| `JWT_SECRET`                                                                             | **yes**                       | —                                            | Signs the browser session cookie; >=32 chars, no default (unlike `API_KEY`, this guards real accounts)     |
| `JWT_COOKIE_NAME`                                                                        | no                            | `auth_token`                                 |                                                                                                            |
| `JWT_EXPIRES_IN_SECONDS`                                                                 | no                            | `604800`                                     | 7 days                                                                                                     |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`                                                         | no, but together-or-neither   | —                                            | One-time admin bootstrap, read by `pnpm db:seed`                                                           |
| `AUTH_RATE_LIMIT_MAX`                                                                    | no                            | `10`                                         | `POST /auth/register` and `/auth/login`, tighter than `RATE_LIMIT_MAX` on purpose                          |
| `DOCS_ENABLED`                                                                           | no                            | `true` outside production, `false` in it     | Swagger UI + `/docs/openapi.json`                                                                          |
| `REGISTRATION_ENABLED`                                                                   | no                            | `true` outside production, `false` in it     | Open self-service `POST /auth/register`. Closed in production: accounts are created by the operator        |
| `USER_INVOICE_RATE_LIMIT_MAX` / `USER_INVOICE_RATE_LIMIT_WINDOW_MS`                      | no                            | `60` / `3600000`                             | Per-**account** invoice-creation quota, on top of the per-IP `RATE_LIMIT_*`                                |
| `MAIL_DRIVER`                                                                            | **yes**                       | —                                            | `mailgun` \| `console` — no default, no silent fallback                                                    |
| `MAILGUN_API_KEY` / `MAILGUN_DOMAIN`                                                     | only if `MAIL_DRIVER=mailgun` | —                                            |                                                                                                            |
| `MAILGUN_BASE_URL`                                                                       | no                            | `https://api.mailgun.net`                    | EU accounts: `https://api.eu.mailgun.net`                                                                  |
| `MAIL_OUTBOX_DIR`                                                                        | only if `MAIL_DRIVER=console` | `./tmp/outbox`                               |                                                                                                            |
| `MAIL_FROM_NAME` / `MAIL_FROM_EMAIL`                                                     | **yes**                       | —                                            |                                                                                                            |
| `SENDER_BRAND` / `SENDER_NAME` / `SENDER_ADDRESS_LINE1` / `SENDER_CITY` / `SENDER_EMAIL` | **yes**                       | —                                            | Printed on every invoice                                                                                   |
| `SENDER_ADDRESS_LINE2` / `SENDER_POSTAL_CODE` / `SENDER_COUNTRY` / `SENDER_PHONE`        | no                            | —                                            |                                                                                                            |
| `INVOICE_CURRENCY_DEFAULT`                                                               | no                            | `USD`                                        | `USD` \| `EUR` \| `GBP`                                                                                    |
| `INVOICE_DUE_DAYS`                                                                       | no                            | `14`                                         |                                                                                                            |
| `PDF_TIMEOUT_MS` / `PDF_MAX_BYTES`                                                       | no                            | `20000` / `5242880`                          | Oversized PDF is a permanent failure, not retried                                                          |
| `PUPPETEER_EXECUTABLE_PATH`                                                              | no (yes outside Docker)       | —                                            | `/usr/bin/chromium` in the Docker image                                                                    |
| `QUEUE_PDF_CONCURRENCY` / `QUEUE_EMAIL_CONCURRENCY`                                      | no                            | `2` / `5`                                    |                                                                                                            |
| `QUEUE_JOB_ATTEMPTS` / `QUEUE_BACKOFF_DELAY_MS`                                          | no                            | `3` / `3000`                                 | Exponential backoff                                                                                        |
| `QUEUE_STUCK_SWEEP_INTERVAL_MS` / `QUEUE_STUCK_TIMEOUT_MS`                               | no                            | `60000` / `120000`                           | Sweeper cadence / staleness threshold                                                                      |
| `QUEUE_LEASE_MS`                                                                         | no                            | `120000`                                     | How long a worker's claim on an in-flight invoice is honoured for others; must exceed `PDF_TIMEOUT_MS`     |
| `REDIS_COMMAND_TIMEOUT_MS`                                                               | no                            | `1000`                                       | Max time of one Redis command on the fail-fast client (rate limiter, readiness, queue producers)           |
| `HEALTH_CHECK_TIMEOUT_MS`                                                                | no                            | `2000`                                       | Deadline for each `/health/ready` probe (database, Redis)                                                  |
| `QUEUE_ENQUEUE_TIMEOUT_MS`                                                               | no                            | `2000`                                       | Deadline for adding a job to a queue; on expiry the sweeper picks the invoice up                           |
| `EMAIL_RATE_LIMIT_MAX` / `EMAIL_RATE_LIMIT_DURATION_MS`                                  | no                            | `50` / `60000`                               | Throttles the email worker against the provider's quota                                                    |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`                                                | no                            | `60000` / `30`                               | `POST /api/invoices`, Redis-backed, fails open with a `warn` log if Redis is down                          |
| `SHUTDOWN_TIMEOUT_MS`                                                                    | no                            | `15000`                                      | Force-exit timeout for graceful shutdown                                                                   |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`                                    | no                            | `postgres` / `postgres` / `invoice_dispatch` | Used by `docker-compose.yml` to init the Postgres container                                                |

## Local development without Docker

Needs Node 22, pnpm (`corepack enable`), a local Postgres with the `citext` extension
available, a local Redis, and a Chrome/Chromium binary (set `PUPPETEER_EXECUTABLE_PATH`).

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev          # API, with reload
pnpm dev:worker   # worker, with reload — run in a second terminal
```

Useful scripts: `pnpm db:generate` (Drizzle migration from the schema), `pnpm db:export-sql`
(regenerates `db/schema.sql`), `pnpm docs:export` (regenerates `docs/openapi.json`),
`pnpm typecheck`, `pnpm lint`, `pnpm format`.

## Frontend

A small operator console lives in [`frontend/`](./frontend). It's an independent package
(own `package.json`, own lockfile), not a pnpm workspace member and not a `backend/` restructure of this repo: React
19 + Redux Toolkit/RTK Query + Tailwind v4, talking to this API over the same origin.

Log in or register (self-registration always creates `role: "user"`; the first `admin` account
comes from the `ADMIN_EMAIL`/`ADMIN_PASSWORD` bootstrap above), create an invoice, and it's
tracked in a per-browser `localStorage` journal — there's deliberately no `GET /api/invoices`
list endpoint, so the journal plus an "add by ID" lookup is how the console builds its own view
of "invoices I care about" instead. Each tracked row polls `GET /api/invoices/:id` every 2s
until it reaches `SENT`/`FAILED`, offers a PDF download once one exists, and shows a **Retry**
button only for `role: admin` (the backend's `requireAdmin` on `POST /:id/retry` is the actual
enforcement — hiding the button is just not offering an action that would 403).

```bash
cd frontend
cp .env.example .env        # only used by the dev proxy below, not the production build
npm install
npm run gen:api              # regenerates src/types/api.generated.ts from ../docs/openapi.json
npm run dev                  # http://localhost:5173, proxying /api,/auth,/health,/docs to :3000
```

`npm run build` produces `frontend/dist` — static files with no server of their own. There is
**no frontend Docker container**: production serves `dist/` from a host-level nginx (outside
`docker compose`) that also proxies `/api`, `/auth`, `/health`, `/docs` to the `api` container
on `127.0.0.1:3000`, using [`deploy/nginx.conf.example`](./deploy/nginx.conf.example) as a
starting point. Same-origin here isn't just tidy — the session cookie is `httpOnly` +
`sameSite: "lax"`, which doesn't reliably survive a cross-origin request, so there's no `cors`
package on the backend and no `VITE_BACKEND_URL` baked into the production build.

`npm run typecheck`, `npm run lint`, `npm test` — same expectations as the backend.

## Testing

```bash
pnpm test              # everything
pnpm test:unit         # no DB, no network — safe to run anywhere
pnpm test:integration  # needs a real Postgres + Redis (see tests/setupEnv.ts for defaults)
pnpm test:coverage
```

Unit tests mock or inject every external dependency (repositories are called through a narrow
`typeof`-derived interface per service, never imported directly by the service itself — see
[SOLID D](#engineering-principles)) and run with zero network access; this was
verified during development by stopping Postgres entirely and confirming the unit suite still
passes. Integration tests run against a real database and Redis and include the key scenario: the same email job executed twice
_concurrently_ must call the mail provider exactly once (`tests/integration/pipeline.duplicate.test.ts`).

## Design decisions

Summary of the key decisions:

- **ADR-1 — layered structure.** `routes → controllers → services → repositories`, each layer
  only aware of the one below it; services receive their dependencies as an explicit `deps`
  parameter rather than importing singletons, so they're unit-testable without a database.
- **ADR-2 — one status-transition function, one conditional SQL statement.** Every status
  change goes through `src/services/invoiceStatus.service.ts`, built on `UPDATE ... WHERE id =
:id AND status = ANY(:from) RETURNING *`. No read-then-write at the application level, so
  two workers racing to claim the same invoice can't both "win" — see the duplicate-job note
  below for why this took a second pass to get fully right.
- **ADR-3 — Drizzle schema is the source of truth; `db/schema.sql` is a generated artifact,**
  regenerated with `pnpm db:export-sql` and committed for anyone who'd rather read plain
  SQL.
- **ADR-4 — the PDF lives in Postgres (`bytea`), not on local disk.** Any worker replica can
  serve `GET /:id/pdf`; only `invoiceId` ever needs to move between processes.
- **ADR-5 — one Puppeteer/Chromium process per worker,** launched once from an explicit
  `bootstrap()` (never as a side effect of importing a module) and reused across every render.
- **ADR-6 — `MAIL_DRIVER` is a required, explicit choice, not a fallback.** `console` is a
  first-class dev/test driver behind the same `Mailer` interface as the real Mailgun one, not
  a degraded mode entered when credentials are missing.
- **ADR-7 — money is integer minor units, always,** computed server-side
  (`quantity * unitAmountMinor`) regardless of what a client sends; display formatting
  (`Intl.NumberFormat`) is a separate, pure concern from the arithmetic.
- **ADR-8 — the billing snapshot is frozen at intake time.** A PDF rendered on retry, possibly
  days later, shows the client/company/sender data as it was when the invoice was issued, not
  whatever the live records say now.
- **ADR-9 — idempotency and correctness live in Postgres; Redis only makes the happy path
  faster.** BullMQ's own jobId deduplication is real, but it's an optimization: if Redis
  evicts a completed job's record (or `removeOnComplete` frees the id, which this project uses
  deliberately — see below), a second pass at the same invoice must still be safe, because the
  database-level guard is what actually prevents a duplicate.

**A note on the duplicate-email test, because it's worth being honest about:** this took two
designs, and the first one was wrong in a way the tests could not see. The original rule let a
status be its own valid `from` state (so a BullMQ retry can re-enter `EMAIL_SENDING`) and
guarded it with the row's age (`updated_at < now - 120s`) to keep two _concurrent_ calls out.
That fixed the duplicate — and silently broke every retry: BullMQ backs off for 3–6 s, the
window was minutes, so each retry lost its claim, logged a warning, returned without throwing,
and BullMQ deleted the "successful" job. The invoice stayed in `EMAIL_SENDING` forever. The
tests were green because the unit tests mocked the claim and the integration test only ran the
concurrent scenario the fix was written for.

The claim now belongs to an _executor_, not to a row's age: `invoices.claim_token` (the BullMQ
job id) and `invoices.lease_until`. The same job's retry or crash-restart re-takes its own claim
at once; any other executor is refused until the lease expires. A transient failure hands the
claim back (`EMAIL_SENDING → PDF_READY`, `PDF_RENDERING → PENDING`); a worker that loses a claim
**throws** instead of returning (a returned job is a deleted job); and the lease monitor in the
sweeper fails in-flight invoices whose lease expired — for `EMAIL_SENDING` with a note that
delivery is unknown and where to check (Mailgun events for `v:invoice-id`). The regression
tests that matter: `pipeline.retry.test.ts` (real BullMQ + Postgres + Redis + the real
`mailgun.js` client against a local stub: 503, then OK → `SENT` after exactly 2 calls),
`invoices.lease.test.ts` and `invoices.leaseMonitor.test.ts`.

## When Redis is down

Redis only speeds up the happy path (ADR-9), so an outage must degrade, not hang. Two kinds of
connection, on purpose: everything on a request path (the rate limiter, `/health/ready`, the
queue **producers** that `add` jobs) shares a **fail-fast** client — `enableOfflineQueue: false`,
`commandTimeout`, one retry — so a dead Redis is a quick error instead of a command that waits
for the reconnect forever; only the BullMQ **workers** use `maxRetriesPerRequest: null`, which
is what their blocking commands need. Result: the limiter fails open with a `warn`, invoice
creation commits and answers 202 (the enqueue is best-effort, bounded by
`QUEUE_ENQUEUE_TIMEOUT_MS`, and the sweeper picks the invoice up), and readiness answers 503
within `HEALTH_CHECK_TIMEOUT_MS`. The limiter uses a small stateless store
(`src/lib/redisRateLimitStore.ts`) instead of `rate-limit-redis`: that library caches the
promise of its start-up script load, so a process that started during an outage would keep a
permanently dead limiter. Covered by `tests/integration/redisDown.test.ts`.

## Who can see and send what

An invoice belongs to the account that created it (`invoices.created_by`); only that account and
admins can read it or download its PDF — anyone else gets the same 404 as for a missing id, so ids
can't be probed. Every request is attributed: `invoice_requests.user_id`, `invoice_events.user_id`
(the creator at intake, the admin who pressed retry; empty for worker/monitor transitions).
Idempotency keys are private to the account that sent them. Creation is rate-limited per IP **and**
per account. In production `POST /auth/register` is closed (`REGISTRATION_ENABLED`), so the only
way to get a session is an account the operator created. `API_KEY` is deliberately not mandatory in
`docker-compose.prod.yml`: the browser frontend can't keep a shared secret, so it was never real
protection there.

## Engineering principles

**SOLID.** Single Responsibility: one file per concern (a repository per table, one service
per pipeline stage). Open/Closed: a new mail provider is a new file implementing `Mailer`, not
a change to the workers that call it. Liskov: `console` and `mailgun` drivers are fully
interchangeable behind that interface, and `claim()`/`transition()` are only ever called with
consistent status-machine invariants. Interface Segregation: each service declares its own
narrow `typeof`-derived slice of a repository's functions rather than depending on the whole
module. **Dependency Inversion: no service imports `env` or the database/Redis singletons
directly** — everything external arrives via a `deps` parameter; only controllers and
`src/worker.ts` (the composition roots) wire concrete implementations in.

**12-factor.** Config is entirely environment variables, validated once at startup
(`src/config/env.ts`) — no config files, no environment-name branching for anything except log
pretty-printing. Dev/prod parity: the same Docker image runs both, `docker-compose.prod.yml`
only changes environment values and published ports, not code paths. Logs are structured JSON
to stdout (pino) — the process never writes to a log file. Admin/one-off tasks
(`db:migrate`, `db:seed`, `db:export-sql`, `docs:export`) are scripts run against the same
codebase and config, not separate tooling.

**Scaling.** `api` and `worker` scale independently (stateless, horizontally). PDF rendering
is the current bottleneck (`QUEUE_PDF_CONCURRENCY`, one Chromium per worker process) — the
first thing to split out if load grew, as its own service with its own image (dropping the
~500 MB Chromium dependency from the API/email path entirely). The mail provider's quota is
already guarded by a BullMQ rate limiter on the email queue (`EMAIL_RATE_LIMIT_MAX`/
`_DURATION_MS`), which throttles job pickup without touching `QUEUE_JOB_ATTEMPTS`.

## Known limitations / explicitly out of scope

No client/company CRUD (seeded/managed directly in the database);
no multi-tenancy (the `admin`/`user` roles are global, not per-organization);
no webhook-based delivery-status updates from Mailgun
(delivery is considered done once the provider accepts the message). The Docker image is
heavier than ideal (~500 MB, `bookworm-slim` + Chromium) — a deliberate trade-off for
reliability over image size, and the first candidate for the scaling split described above.

Authentication and a small operator UI are covered above (see [Frontend](#frontend)). Still out of
scope: password reset, 2FA, OAuth (email and password only), and a CI/CD pipeline — the deploy is
manual, and automating it is a separate task.
