# HYROX Bookings

Weekly Saturday class booking app for Coach J — replaces a Google Form + Sheet
workflow. One coach manages slots, ~30 members book per week, and a waitlist
auto-promotes when someone cancels.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript (strict) ·
Tailwind CSS v4 (`@theme`) · Prisma 5 + Postgres · Zod · bcrypt cookie auth ·
Gmail SMTP via Nodemailer (pluggable `EmailProvider`) · Vitest · Docker.

---

## Features

- **Public booking page** (`/`) — slot cards with progress bars, mobile-first form,
  works without JS (progressive enhancement via Server Actions).
- **Cancellation page** (`/cancel`) — match on case-insensitive name + digits-only
  WhatsApp; auto-promotes the oldest waitlist entry in the same slot if the
  cancelled booking was Confirmed.
- **Admin dashboard** (`/admin`) — cookie-protected. Tabs for:
  - **Roster** — generates the WhatsApp-ready text exactly per spec, with
    "Copy to clipboard" and "Share to WhatsApp" buttons.
  - **Bookings** — sortable, filterable table; mark paid, cancel.
  - **Walk-in** — admin-only quick-add form.
  - **Slots** — CRUD slots for the current training date.
  - **Settings** — gym location, training date, fees, change admin password.
  - **Reset week** — archives all bookings to `AuditLog` and advances `trainingDate`
    to the next Saturday in a single transaction.
- **Audit log** — every mutation (book, cancel, promote, markPaid, adminLogin,
  resetWeek) writes a row.
- **Email** — `EmailProvider` interface with a Gmail SMTP implementation
  (Nodemailer). Falls back to a console logger when the `gmail` /
  `apppassword` env vars are unset (useful in dev).
- **Health endpoint** — `GET /api/health` pings the DB; used by Docker
  healthchecks and Cloudflare/Nginx upstream checks.

---

## Local development

Requirements: **Node 20+**, **pnpm 9+**, a **Postgres** database (local or
hosted — Neon / Supabase / Vercel Postgres all work).

```bash
pnpm install
cp .env.example .env
# Edit .env — set DATABASE_URL to your Postgres connection string and
# SESSION_SECRET to a long random value (e.g. `openssl rand -hex 32`).

# Apply migrations to your database:
pnpm db:migrate

# Seed default settings + 3 Saturday slots:
pnpm db:seed

# Run the dev server:
pnpm dev
```

Open `http://localhost:3000` for the booking page and
`http://localhost:3000/admin/login` for the admin.

### Useful scripts

| Command            | What it does                                    |
| ------------------ | ----------------------------------------------- |
| `pnpm dev`         | Start Next.js in dev mode                       |
| `pnpm build`       | `prisma generate` + `next build`                |
| `pnpm start`       | Run the production build                        |
| `pnpm lint`        | ESLint (flat config, zero warnings expected)    |
| `pnpm test`        | Vitest — roster + booking/waitlist suite        |
| `pnpm db:migrate`  | Apply / create Prisma migrations (development)  |
| `pnpm db:deploy`   | Apply migrations (production / CI)              |
| `pnpm db:seed`     | Run the seed script                             |
| `pnpm format`      | Prettier write                                  |

---

## Environment variables

See `.env.example`. Highlights:

| Variable                  | Required | Notes                                                                                  |
| ------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | yes      | Postgres connection string. Example: `postgresql://user:pass@host:5432/db?sslmode=require`. |
| `SESSION_SECRET`          | yes      | ≥ 16 chars. Used to HMAC-sign session cookies. Rotate to log everyone out.             |
| `ADMIN_PASSWORD_INITIAL`  | first run only | Used **only** if no admin password hash exists. Set once, then change in admin. |
| `gmail`                   | optional | Gmail address to send from. If unset, emails are logged to stdout instead of sent.    |
| `apppassword`             | optional | Google [App Password](https://myaccount.google.com/apppasswords) for the above account. |
| `EMAIL_FROM`              | optional | e.g. `HYROX <bookings@chillwithhans.com>`                                              |
| `OWNER_EMAIL`             | optional | Reserved for future notifications.                                                     |
| `PUBLIC_BASE_URL`         | optional | Used in shared URLs.                                                                   |

### First-run admin password

1. Set `ADMIN_PASSWORD_INITIAL` to something memorable in `.env` before the first
   boot.
2. The first time the admin login is attempted, the value is hashed with bcrypt
   and stored in the `Setting` table under `adminPasswordHash`.
3. Sign in to `/admin/login`, open **Settings**, and change the password.
4. After that, `ADMIN_PASSWORD_INITIAL` is ignored — you can remove it from your
   environment.

To **reset** the admin password if you've lost it, delete the
`adminPasswordHash` row from your Postgres database and restart the app with
`ADMIN_PASSWORD_INITIAL` set:

```sql
DELETE FROM "Setting" WHERE key = 'adminPasswordHash';
```

---

## Deploy to Vercel

This project is configured to run on Vercel. The app needs a hosted Postgres
database — **Neon** (free tier) and **Vercel Postgres** are both good fits.

1. **Create a Postgres database** (Neon, Vercel Postgres, Supabase, etc.) and
   copy its connection string. Make sure it includes `sslmode=require`.
2. **Import the repo into Vercel** (Add New → Project → import from GitHub).
   The framework preset auto-detects Next.js.
3. **Set Environment Variables** in Vercel → Project Settings → Environment
   Variables (apply to Production + Preview + Development as needed):

   | Name                     | Value                                               |
   | ------------------------ | --------------------------------------------------- |
   | `DATABASE_URL`           | Your Postgres connection string                     |
   | `SESSION_SECRET`         | `openssl rand -hex 32`                              |
   | `ADMIN_PASSWORD_INITIAL` | A password you choose for the first admin login    |
   | `gmail`                  | (optional) Gmail address to send from, blank to log instead |
   | `apppassword`            | (optional) Google App Password for that Gmail account |
   | `EMAIL_FROM`             | (optional) e.g. `HYROX <bookings@chillwithhans.com>` |
   | `OWNER_EMAIL`            | (optional) Your email                              |
   | `PUBLIC_BASE_URL`        | (optional) Your final URL                          |

4. **Deploy.** The build command in `vercel.json` runs
   `prisma generate && prisma migrate deploy && next build`, so migrations are
   applied to your Postgres database on every deploy.
5. **Seed the database once** (after the first successful deploy), from your
   local machine, against the production DB:

   ```bash
   DATABASE_URL="<your-prod-postgres-url>" pnpm db:seed
   ```

   This inserts default settings and the three Saturday slots. You only need
   to do this on the first deploy.
6. Visit `/admin/login`, sign in with `ADMIN_PASSWORD_INITIAL`, then change
   the password under **Settings**.

> **Note:** SQLite (`file:./dev.db`) does **not** work on Vercel — the
> serverless filesystem is read-only/ephemeral. You must use Postgres (or
> another network-reachable database) when deploying to Vercel.

---

## Docker deployment (self-hosted, behind Nginx/Cloudflare)

```bash
# 1. Provide secrets
cat > .env <<'EOF'
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD_INITIAL=change-me-on-first-login
gmail=
apppassword=
EMAIL_FROM=HYROX <bookings@chillwithhans.com>
PUBLIC_BASE_URL=https://hyrox.chillwithhans.com
EOF

# 2. Build & launch
docker compose up -d --build

# 3. Sanity check
curl -fsS http://localhost:3000/api/health
```

The container runs as a non-root user (`nextjs:1001`) and applies pending Prisma
migrations against `DATABASE_URL` on every start (`prisma migrate deploy`). The
healthcheck probes `/api/health` every 30s.

Front it with Nginx / Cloudflare; only `:3000` needs to be reachable from your
reverse proxy.

### Backups

Use your Postgres provider's backup tooling (e.g. `pg_dump`, Neon point-in-time
restore, managed snapshots). The application stores no state outside the
database.

### Updating

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on container start.

---

## Project structure

```
app/
  (public)/          public booking + cancel + success
  admin/             login, dashboard, server actions
  api/health/        readiness probe
  globals.css        Tailwind v4 @theme + base layer
components/          UI (booking-form, slot-card, roster-view, etc.)
  ui/                shadcn-style primitives (Button, Card, Input, …)
lib/
  db.ts              Prisma singleton
  auth.ts            cookie session + bcrypt
  booking.ts         createBooking / cancelBooking / promoteWaitlist / resetWeek
  roster.ts          formatRoster (pure, tested)
  email.ts           EmailProvider + Gmail SMTP impl
  settings.ts        get/set typed settings
  validators.ts      Zod schemas
  phone.ts           normalizePhone
  utils.ts           cn, date helpers
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  roster.test.ts     formatRoster fixtures + snapshot
  booking.test.ts    capacity / waitlist / promotion / audit log (real SQLite)
docker/entrypoint.sh runs prisma migrate deploy on container start
Dockerfile           multi-stage, non-root, /api/health healthcheck
docker-compose.yml   ./data volume mount, env wiring
```

---

## Testing

```bash
pnpm test
```

The pure unit suite (`formatRoster`) always runs.

The booking integration suite (capacity math, waitlist promotion, duplicate
detection, audit log) requires a real Postgres database. Provide one via
`TEST_DATABASE_URL` and the tests will push the schema to it before each run:

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/hyrox_test" pnpm test
```

When `TEST_DATABASE_URL` is unset the integration tests are skipped (not failed)
so `pnpm test` still works on a fresh clone.

---

## License

Private — Coach J / chillwithhans.
