# HYROX Bookings

Weekly Saturday class booking app for Coach J — replaces a Google Form + Sheet
workflow. One coach manages slots, ~30 members book per week, and a waitlist
auto-promotes when someone cancels.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript (strict) ·
Tailwind CSS v4 (`@theme`) · Prisma 5 + SQLite · Zod · bcrypt cookie auth ·
Resend (pluggable `EmailProvider`) · Vitest · Docker.

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
- **Email** — `EmailProvider` interface with Resend implementation. Falls back to
  a console logger when `RESEND_API_KEY` is unset (useful in dev).
- **Health endpoint** — `GET /api/health` pings the DB; used by Docker
  healthchecks and Cloudflare/Nginx upstream checks.

---

## Local development

Requirements: **Node 20+**, **pnpm 9+**.

```bash
pnpm install
cp .env.example .env
# Edit .env — at minimum set SESSION_SECRET to a long random string.

# Create the SQLite DB and apply migrations:
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
| `DATABASE_URL`            | yes      | SQLite path. In Docker, `file:/app/data/prod.db`.                                      |
| `SESSION_SECRET`          | yes      | ≥ 16 chars. Used to HMAC-sign session cookies. Rotate to log everyone out.             |
| `ADMIN_PASSWORD_INITIAL`  | first run only | Used **only** if no admin password hash exists. Set once, then change in admin. |
| `RESEND_API_KEY`          | optional | If unset, emails are logged to stdout instead of sent.                                 |
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
`adminPasswordHash` row from the SQLite DB and restart the app with
`ADMIN_PASSWORD_INITIAL` set:

```bash
sqlite3 ./data/prod.db "DELETE FROM Setting WHERE key='adminPasswordHash';"
```

---

## Docker deployment (self-hosted, behind Nginx/Cloudflare)

```bash
# 1. Provide secrets
cat > .env <<'EOF'
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD_INITIAL=change-me-on-first-login
RESEND_API_KEY=
EMAIL_FROM=HYROX <bookings@chillwithhans.com>
PUBLIC_BASE_URL=https://hyrox.chillwithhans.com
EOF

# 2. Build & launch
docker compose up -d --build

# 3. Sanity check
curl -fsS http://localhost:3000/api/health
```

The container runs as a non-root user (`nextjs:1001`), persists data to the
`./data` volume on the host, and applies pending Prisma migrations on every
start (`prisma migrate deploy`). The healthcheck probes `/api/health` every 30s.

Front it with Nginx / Cloudflare; only `:3000` needs to be reachable from your
reverse proxy.

### SQLite backup strategy

The entire database is a single file: `./data/prod.db`.

**Online snapshot (recommended)** — uses SQLite's `.backup` to produce a
consistent copy without stopping the app:

```bash
docker exec hyrox-bookings sh -c \
  'apt-get install -y sqlite3 >/dev/null 2>&1; \
   sqlite3 /app/data/prod.db ".backup /app/data/backup-$(date +%F).db"'
cp ./data/backup-*.db /your/offsite/location/
```

**Cold copy** — if the app is stopped, just copy the file:

```bash
docker compose stop app
cp ./data/prod.db /your/offsite/location/prod-$(date +%F).db
docker compose start app
```

A cron-driven daily snapshot + weekly off-site sync is plenty for this scale.

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
  email.ts           EmailProvider + Resend impl
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

The suite covers:

- `formatRoster` — exact WhatsApp output (snapshot), partial slots, FULL marker,
  multi-slot ordering, cancelled-row exclusion, createdAt ordering.
- Capacity math — Confirmed up to capacity, then Waitlist with correct positions.
- Duplicate detection — same `(name + whatsapp)` in same slot rejected.
- Waitlist promotion — oldest Waitlist promoted on Confirmed cancel; emails sent.
- Audit log — `book`, `cancel`, `promote`, `markPaid` rows are written.

The booking suite spins up a real on-disk SQLite DB via `prisma db push`, so it
exercises actual transactions.

---

## License

Private — Coach J / chillwithhans.
