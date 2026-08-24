# Hardware ERP System

Point-of-sale and inventory management for a hardware and paint shop. Handles
billing with barcode scanning, FIFO batch costing, customer and supplier
ledgers, cheque tracking, paint-mixing consumption, and reporting.

---

## 1. Technology

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript, strict mode |
| Styling | Tailwind CSS |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma 6 |
| Auth | NextAuth (credentials + bcrypt, JWT sessions) |
| Validation | Zod |
| Tests | Vitest (integration, against a real database) |

---

## 2. Local setup

### Prerequisites

Node.js 20+, Docker Desktop running, Git.

### Steps

**1. Clone and install**

```bash
git clone -b dev https://github.com/chanul26/hardware-erp-system.git
cd hardware-erp-system
npm install
```

**2. Create your `.env`**

```bash
cp .env.example .env
```

Then generate a signing secret and put it in `.env` as `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

> `.env` is gitignored. Never commit it.
>
> Note `DIRECT_URL` in `.env.example` — Prisma requires it and **every** Prisma
> command fails without it, including `generate`. For a plain PostgreSQL setup
> it is the same value as `DATABASE_URL`.

**3. Start the database**

```bash
docker compose up -d db
```

Postgres is published on **127.0.0.1:5433** — loopback only, so it is not
reachable from the network.

**4. Apply the schema and generate the client**

```bash
npx prisma migrate deploy
npx prisma generate
```

Use `npm run db:migrate` instead when you are *changing* the schema; it creates
a new migration file. Never use `prisma db push` — it leaves no migration
history, so the schema cannot be reproduced or deployed.

**5. Create the admin account**

```bash
SEED_ADMIN_PASSWORD='choose-a-strong-password' npm run db:seed
```

Omit `SEED_ADMIN_PASSWORD` in development and the seed generates a random
password and prints it once. In production it is required.

**6. Run**

```bash
npm run dev
```

Open <http://localhost:3001> and sign in with the email and password from step 5.

---

## 3. Everyday commands

```bash
npm run dev        # dev server on :3001
npm run build      # production build (typecheck + lint must pass)
npm test           # integration tests
npm run verify     # typecheck + lint + tests — run before pushing
npm run db:studio  # browse the database
```

### Tests

Tests run against a separate `hardware_erp_test` database, created once with:

```bash
docker exec hardware_erp_db psql -U erp_user -d postgres -c "CREATE DATABASE hardware_erp_test"
```

They truncate between cases, so they never touch development data.

---

## 4. Architecture notes

Things worth knowing before changing code.

### Money and quantities

Money is `Decimal(12,2)`, quantities are `Decimal(12,3)` — never `Float`.
Binary floats cannot represent currency exactly, and the shop sells paint,
cement and wire by weight and length, so fractional quantities are normal.

### The server owns the money

`POST /api/bills` does **not** accept `subtotal` or `totalAmount`. The client
proposes a unit price; the server re-reads the cost layer being sold from,
refuses anything at or below cost, and computes every total itself.

### One definition of debt

`src/lib/ledger.ts` is the single source of truth. `Bill.amountPaid` /
`Bill.status` and `PurchaseOrder.amountPaid` / `.paymentStatus` are caches of the
payment tables, re-derived on every write. Never set them directly.

### The inventory invariant

```
Item.stockQty === SUM(PurchaseBatch.remainingQty)
```

Always true. Enforced by `CHECK` constraints, by mutating both inside one
transaction, and asserted in the tests. `findStockDiscrepancies()` in
`src/lib/inventory.ts` returns violations — it should always return nothing.

### Authorization is two layers

`src/middleware.ts` is a coarse gate whose matcher is an *exclusion* list, so a
new route is protected by default. Every API handler independently calls
`requireAuth` / `requireRole` from `src/lib/authz.ts` **before parsing the body**,
so a mistake in the matcher cannot expose an endpoint on its own.

### Stock changes go through `src/lib/inventory.ts`

`adjustStock`, `consumeFifo`, `consumeBatch` and `restoreBatch` put their guard
in the SQL `WHERE` clause, so the check and the write cannot be separated by a
concurrent transaction. Do not write `Item.stockQty` directly.

---

## 5. Team workflow

1. Never push to `main` or `dev` directly.
2. Branch from `dev`: `git checkout -b feature/your-feature-name`
3. Run `npm run verify` before pushing.
4. Open a pull request against `dev`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, migrations, tests and a
production build against a throwaway PostgreSQL service. All of them must pass.

---

## 6. Before deploying

**Read `bugs.md` first.** Its pre-deployment gate lists what must be true before
this is exposed to a network, and its Known Limitations section records what is
deliberately unfinished.

The short version:

- Generate a fresh `NEXTAUTH_SECRET` on the server; never reuse a development value.
- Change the seeded admin password.
- Do not publish the Postgres port.
- Put the app behind a reverse proxy with TLS — sign-in posts credentials, and
  the app itself speaks plain HTTP.
- Set up backups, and test a restore.
