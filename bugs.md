# Hardware ERP — Bug Register

**Audited commit:** `7d951fa` · **Audit date:** 2026-08-24 · **Method:** full read-only review of all 47 source files, `schema.prisma`, Docker/CI config, and git history.

**28 findings: 21 bugs (BUG-001…021) + 7 security findings (SEC-001…007). All addressed.**

> **Status: all 28 findings are `FIXED` in the working tree** (not yet committed — the Commit field of each entry is filled in at commit time). Verification is recorded per entry and rests on 93 automated tests plus live `curl` checks against a running server. Read **Known limitations** at the end before deploying: some hardening is a server-side task that cannot be done from the codebase.

> BUG-021 was not in the original audit. It was found while fixing the others, when the restored lint gate reported four unused variables that turned out to be a modal that had never been rendered.

> **Deployment status (confirmed 2026-08-24): not deployed.** The app runs on local development machines with test data only. A Hostinger KVM1 VPS is the intended future host. **There is no incident and no exposed production data.** The `Critical` and `High` findings below are therefore *latent* — they become live the moment this is first deployed, which is why the gate in the next section exists.

## Status legend

| Status | Meaning |
|---|---|
| `OPEN` | Confirmed, not yet addressed |
| `IN PROGRESS` | Being worked on |
| `FIXED` | Merged **and** verified by a named, concrete check |
| `WON'T FIX` | Deliberately accepted — reasoning recorded, entry kept |
| `CANNOT REPRODUCE` | Could not be triggered on re-test — evidence recorded |

**A bug reaches `FIXED` only when *How it was verified* names something concrete:** a test that now passes, a `curl` that now returns 401, a query that now returns zero rows. "Looks right" is not verification. Entries are never deleted.

---

# PRE-DEPLOYMENT GATE

**Nothing here is an emergency — nothing is deployed.** This is the checklist that must be complete **before the first deploy to the Hostinger KVM1 VPS**, because every item becomes exploitable the moment the app is reachable from the internet.

Treat this as a release gate, not an incident response. Do not deploy with any `☐` remaining.

**Everything achievable from the codebase is done.** The remaining `☐` items are server-side tasks on the Hostinger VPS — they cannot be completed by changing code.

| # | Must be true before first deploy | Status | Covers |
|---|---|---|---|
| G1 | Every API route requires an authenticated session **and** an appropriate role | ☑ DONE | BUG-002 — every route calls `requireAuth`/`requireRole`; 54 tests + live curl |
| G2 | `POST /api/bills` recomputes all prices and totals server-side | ☑ DONE | BUG-001, SEC-002 — server recomputes all totals; verified live |
| G3 | A **fresh** `NEXTAUTH_SECRET` is generated and exists only in an untracked `.env` / Hostinger env config — never in `docker-compose.yml` or CI | ☐ ON DEPLOY | SEC-001 — code no longer hardcodes it; generate the real one on the VPS |
| G4 | The seeded admin password is changed from the README value, and DB credentials are not the committed defaults | ☐ ON DEPLOY | SEC-001 — seed now requires `SEED_ADMIN_PASSWORD` in production |
| G5 | Postgres is **not** published to the public internet (no `5433:5432` port mapping on the server) | ☑ DONE (dev) / ☐ CONFIRM | compose binds Postgres to 127.0.0.1; confirm on the VPS |
| G6 | The app sits behind a reverse proxy with TLS; port 3001 is not exposed directly | ☐ ON DEPLOY | reverse proxy + TLS is a server task — see Known limitations |
| G7 | Stock deduction is atomic and `CHECK (stockQty >= 0)` is applied | ☑ DONE | BUG-003 — atomic writes + `CHECK (stockQty >= 0)`; concurrency test passes |
| G8 | Debt is derived from one source of truth (the payment ledgers) | ☑ DONE | BUG-004, BUG-005 — `src/lib/ledger.ts` is the single source of truth |
| G9 | A migration baseline exists and `migrate deploy` runs cleanly | ☑ DONE | `prisma/migrations/` baseline + constraints; entrypoint runs `migrate deploy` |
| G10 | A database backup runs on a schedule and a restore has been **tested** | ☐ ON DEPLOY | backups are a server task — see Known limitations |
| G11 | Login is rate-limited | ☑ DONE | SEC-005 — `src/lib/rate-limit.ts`, 20/IP and 8/account per 15 min |
| G12 | The GitHub repo is private, **or** confirmed to contain no live secret | ☐ YOUR CALL | SEC-001 — superseded by G3, but still worth doing |

**On G12:** the repo currently contains the old committed secret. Privatising is good hygiene, but the real fix is G3 — generate a *new* secret for production and never commit it. Once G3 is done, the committed value is worthless, because it will not be the one in use. Note also that the repo is owned by `chanul26`; a collaborator cannot change its visibility.

**Order to work in:** G1 and G2 first (they are the plan's Phase 1 and the largest risk reduction), then G7–G9 (Phases 2–3), then G3–G6 and G10–G11 as part of the actual deployment work.

## Data-integrity verification queries

These were originally written as tampering forensics; with nothing deployed they serve a better purpose — **use them to verify the BUG-003, BUG-004, BUG-006 and BUG-007 fixes.** Run against your dev database before and after each fix. Any row returned by queries 1–4 or 6 is a defect.

```sql
-- 1. Bills with implausible totals (BUG-001 abuse, or ordinary bugs)
SELECT id, "billNumber", "totalAmount", "createdAt" FROM "Bill"
WHERE "totalAmount" <= 0 ORDER BY "createdAt" DESC;

-- 2. Bill lines priced at or below zero
SELECT b."billNumber", bi."unitPrice", bi.quantity, i.name
FROM "BillItem" bi JOIN "Bill" b ON b.id = bi."billId" JOIN "Item" i ON i.id = bi."itemId"
WHERE bi."unitPrice" <= 0;

-- 3. Negative stock (BUG-003)
SELECT id, name, "stockQty" FROM "Item" WHERE "stockQty" < 0;

-- 4. Batch / master divergence (§17, BUG-007)
SELECT i.id, i.name, i."stockQty", COALESCE(SUM(pb."remainingQty"), 0) AS batch_sum
FROM "Item" i LEFT JOIN "PurchaseBatch" pb ON pb."itemId" = i.id
GROUP BY i.id, i.name, i."stockQty"
HAVING i."stockQty" <> COALESCE(SUM(pb."remainingQty"), 0);

-- 5. Purchase orders — UI-created rows carry notes 'Direct Inbound Restock'.
--    Anything else was created by a direct API call.
SELECT "orderNumber", "totalAmount", notes, "createdAt" FROM "PurchaseOrder"
ORDER BY "createdAt" DESC LIMIT 100;

-- 6. Orphaned bills — the fingerprint of a deleted customer (BUG-009)
SELECT COUNT(*) FROM "Bill" WHERE "customerId" IS NULL AND "totalAmount" > 0;

-- 7. Recent settlements
SELECT * FROM "Payment" ORDER BY "createdAt" DESC LIMIT 100;

-- 8. Accounts present. Useful as a sanity check that seeding worked.
SELECT id, email, name, role, "createdAt" FROM "User" ORDER BY "createdAt";
```

**Expected results once the fixes are in:** queries 1, 2, 3, 4 and 6 return **zero rows**. Query 5 shows only rows with notes `Direct Inbound Restock` (anything else came from the dead `/api/purchase-orders` — BUG-006). Queries 7 and 8 are informational.

Query 4 in particular is the single best invariant in the system: `Item.stockQty` must always equal `Σ PurchaseBatch.remainingQty`. Wire it into a test (see the plan's §26) rather than running it by hand forever.

---

# Summary

| ID | Sev | Area | Title | Status |
|---|---|---|---|---|
| BUG-001 | Critical | Billing / financial | Client-supplied financial values persisted unverified | FIXED |
| BUG-002 | Critical | Security / authz | 11 API routes have no authentication at all | FIXED |
| BUG-003 | Critical | Inventory | Read-then-write race allows negative stock | FIXED |
| BUG-004 | Critical | Financial | Two contradictory definitions of supplier debt | FIXED |
| BUG-005 | High | Financial | Bill `status` hardcoded `PAID`; `amountPaid` never written | FIXED |
| BUG-006 | High | Purchasing | Dead `/api/purchase-orders` endpoint corrupts FIFO if called | FIXED |
| BUG-007 | High | Inventory | Mixing race + silent stock/batch divergence | FIXED |
| BUG-008 | High | Financial | Bounced cheque doesn't reverse the ledger | FIXED |
| BUG-009 | High | Data integrity | Customer delete silently orphans bills and erases debt | FIXED |
| BUG-010 | High | Reporting | Low-stock uses hardcoded `<= 5`, ignores `reorderLevel` | FIXED |
| BUG-011 | Medium | Frontend | `/dashboard` crashes when `/api/reports` fails | FIXED |
| BUG-012 | Medium | Reporting | Stock Additions date filter does nothing | FIXED |
| BUG-013 | Medium | Financial | Invoice numbers non-sequential and collision-capable | FIXED |
| BUG-014 | Medium | Billing | Quantity input not clamped to available stock | FIXED |
| BUG-015 | Medium | Infrastructure | Three stray `new PrismaClient()` instances | FIXED |
| BUG-016 | Medium | Reporting | `/reports` spins forever on fetch failure | FIXED |
| BUG-017 | Low | Inventory | "Add New Purpose" is never persisted | FIXED |
| BUG-018 | Low | Navigation | Sidebar links to non-existent `/settings` | FIXED |
| BUG-019 | Low | Reporting | Profit rendered as raw float; legacy cost treated as 0 | FIXED |
| BUG-020 | Low | Billing | localStorage cart draft restores stale prices/stock | FIXED |
| BUG-021 | Medium | Billing | Quick-add customer modal was never rendered | FIXED |
| SEC-001 | Critical | Secrets | `NEXTAUTH_SECRET` + admin credentials committed to git | FIXED |
| SEC-002 | High | Authz | Business rules enforced only in the browser | FIXED |
| SEC-003 | Medium | Authz | `/mixing-history` reachable without a session | FIXED |
| SEC-004 | Medium | Access control | IDOR on `/api/bills/return` | FIXED |
| SEC-005 | Medium | Auth | No rate limiting on login | FIXED |
| SEC-006 | Medium | Auth | Login responses enable user enumeration | FIXED |
| SEC-007 | Low | Auth | No password policy | FIXED |

---

# Bugs

## BUG-001 — Client-supplied financial values are persisted unverified

- **Severity:** Critical
- **Status:** FIXED
- **Area:** Billing / financial integrity
- **Location:** `src/app/api/bills/route.ts:39-56, 152, 223, 302, 402-415`

**Description**
`subtotal`, `discount`, `tax`, `totalAmount` and every line's `unitPrice` are read from the request body and written straight to the database. The server never re-reads `Item.sellingPrice` or `PurchaseBatch.sellingPrice` to check them.

**Expected vs actual**
Expected: the server derives all monetary values from the database and treats client figures as untrusted.
Actual: it stores whatever the browser sent.

**Reproduction**
`POST /api/bills` with any valid session and
`{items:[{id:"<real-id>", quantity:1, price:0}], subtotal:0, discount:0, totalAmount:0}`
→ `201`, a genuine invoice for Rs. 0, stock deducted as normal.

**Impact**
Any staff member with a browser console can remove inventory at will with no trace. Revenue, COGS, margin and debt reporting are all unreliable. Combined with BUG-002 this is reachable without any account at all.

**Fix direction**
Re-read `Item` / `PurchaseBatch` server-side, recompute every line total and the bill total, reject or clamp mismatches. Treat client prices as a *proposal* subject to a server-side floor.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/bills/route.ts`, `src/lib/validation.ts`
- **What changed:** `POST /api/bills` no longer reads any monetary total from the request. For each line it re-reads the cost layer being sold from, refuses a unit price of zero or below cost, then computes subtotal / total / amountPaid itself. The request schema no longer even accepts `subtotal` or `totalAmount`.
- **How it was verified:** `tests/billing.test.ts` — a cart posted with `price: 0` returns 400 with stock unmoved; a cart claiming `totalAmount: 1` for two items at 150 is stored as 300. Confirmed live: `POST /api/bills` with `price:0` → *"must be sold at a price greater than zero"*; with a lied total → recorded 4200.

---

## BUG-002 — 11 API routes have no authentication at all

- **Severity:** Critical
- **Status:** FIXED
- **Area:** Security / authorization
- **Location:** `src/middleware.ts:47-59` (matcher omits `/api/*`) plus 11 handlers that never call `getServerSession`

**Description**
Unprotected: `GET/POST/PUT/DELETE /api/customers` · `GET/POST /api/suppliers` · `POST /api/suppliers/settle` · `POST /api/payments/settle` · `POST /api/restock` · `POST /api/purchase-orders` · `GET /api/bills/return` · `PATCH /api/cheques/pass` · `PATCH /api/cheques/return` · `GET /api/cheques/by-date` · `POST /api/items/mixing`.

Only `/api/users` and `/api/reports` check a role. `/api/bills` and `/api/items` check a session but not a role.

**Expected vs actual**
Expected: every write endpoint requires an authenticated session and an appropriate role.
Actual: 11 of 16 route files accept anonymous requests.

**Reproduction**
```bash
curl -s http://<host>:3001/api/customers            # full customer table, no cookie
curl -X POST http://<host>:3001/api/restock \
     -H 'Content-Type: application/json' -d '{...}' # 200, stock and prices rewritten
```

**Impact**
Full unauthenticated read/write of customers (incl. **NIC numbers**), suppliers, stock, prices, and both debt ledgers. **Live and internet-reachable — see the INCIDENT section.**

**Fix direction**
Add `/api/:path*` to the middleware matcher **and** a shared `requireRole()` helper called at the top of every handler (defence in depth — the matcher alone is one config edit away from regressing).

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/lib/authz.ts` (new), `src/middleware.ts`, all 16 route files
- **What changed:** Added `requireAuth` / `requireRole` and called one of them at the top of every handler, before any body parsing. The middleware matcher was inverted to an exclusion list so new routes are protected by default, and it returns JSON 401 for `/api/*` instead of an HTML redirect.
- **How it was verified:** `tests/authorization.test.ts` — 54 assertions covering 20 endpoints × signed-out + each role. Confirmed live with `curl`: all 17 endpoint/method combinations return `{"success":false,"error":"You must be signed in."}` with HTTP 401.

---

## BUG-003 — Read-then-write race allows negative stock

- **Severity:** Critical
- **Status:** FIXED
- **Area:** Inventory integrity / concurrency
- **Location:** `src/app/api/bills/route.ts:170-184` (check) and `:385-394` (decrement)

**Description**
`tx.item.findUnique` → JavaScript comparison → `tx.item.update({ stockQty: { decrement } })`, inside a transaction running at PostgreSQL's default READ COMMITTED isolation. The read takes no lock, so concurrent transactions observe the same pre-decrement value.

**Expected vs actual**
Expected: the last unit can be sold exactly once.
Actual: two concurrent checkouts both pass the check and both decrement.

**Reproduction**
Set an item to `stockQty: 1`. Fire two simultaneous `POST /api/bills` for quantity 1. Both return 201; `stockQty` becomes `-1`.

**Impact**
Negative stock, oversold goods, FIFO batches driven negative. There is no database constraint to catch it.

**Fix direction**
Either a conditional write — `updateMany({ where: { id, stockQty: { gte: qty } }, ... })` asserting `count === 1` — or `SELECT … FOR UPDATE` via `$queryRaw`, or `Serializable` isolation with retry. Add `CHECK (stockQty >= 0)` and `CHECK ("remainingQty" >= 0)` as a backstop.
⚠️ The `CHECK` constraint will **fail to apply** if negative stock already exists (C6 query 3) — correct the data first.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/lib/inventory.ts` (new), `src/app/api/bills/route.ts`, `prisma/migrations/.../integrity_constraints`
- **What changed:** `adjustStock` is a single `UPDATE ... WHERE stockQty + delta >= 0 RETURNING`, so the guard and the write cannot be separated. FIFO layers are locked with `SELECT ... FOR UPDATE`. A `CHECK (stockQty >= 0)` constraint backs it at the database level.
- **How it was verified:** `tests/billing.test.ts` — two concurrent sales of the last unit: exactly one succeeds, stock ends at 0. Confirmed live: 10 simultaneous 15kg sales against 100kg → exactly 6 sold, 4 blocked with *"Available: 10 kg"*, and master stock = batch total = movement sum = 10.

---

## BUG-004 — Two contradictory definitions of supplier debt

- **Severity:** Critical
- **Status:** FIXED
- **Area:** Financial integrity / accounts payable
- **Location:** `src/app/api/suppliers/route.ts:17-21` vs `src/app/api/suppliers/settle/route.ts:32-33`; root cause `src/app/api/restock/route.ts:64-90` and `src/app/(dashboard)/purchase-orders/RestockForm.tsx:262-267`

**Description**
The suppliers list computes debt as `totalAmount − PurchaseOrder.amountPaid`. The settlement endpoint computes it as `totalAmount − Σ(SupplierPayment.amount)`. These disagree whenever a purchase is paid by cheque or MIXED, because `/api/restock` derives `paymentStatus` and `amountPaid` from the **cash** figure alone while still creating a `SupplierPayment` for the cheque.

**Expected vs actual**
Expected: one definition of what is owed.
Actual: two, which disagree on every cheque purchase.

**Reproduction**
Record a Rs. 100,000 delivery paid entirely by cheque. `RestockForm.tsx` sends `amountPaid: 0`; `/api/restock` writes `PO.amountPaid = 0`, `paymentStatus = "UNPAID"`, and a `SupplierPayment` of Rs. 100,000.
→ `/suppliers` shows **Rs. 100,000 owed**. The settle endpoint sees **Rs. 0 owed** and silently applies nothing.

**Impact**
Accounts payable is wrong for every cheque and MIXED purchase. Users will attempt to pay debts that are already settled, and the settlement will silently no-op. **Certain to be present in the live data.**

**Fix direction**
Make `SupplierPayment` the single source of truth; derive `amountPaid` / `paymentStatus` from it on every write. Backfill both columns from the ledger as a migration. Apply the same treatment to `Bill.amountPaid` (BUG-005).

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/lib/ledger.ts` (new), `src/app/api/restock/route.ts`, `src/app/api/suppliers/route.ts`, `src/app/api/suppliers/settle/route.ts`
- **What changed:** `SupplierPayment` is now the only definition of supplier debt. `syncPurchaseOrderPaymentState` re-derives `amountPaid` / `paymentStatus` from the payment rows after every write, and the suppliers list aggregates the same ledger instead of reading the cached column.
- **How it was verified:** `tests/ledger.test.ts` — a cheque-paid delivery reports `PAID` with debt 0, and the list figure equals the ledger figure for cheque, mixed and partial payments. Confirmed live: a Rs. 180,000 cheque-paid GRN returned `paymentStatus: PAID`, supplier debt 0.

---

## BUG-005 — Bill `status` hardcoded `PAID`; `amountPaid` never written

- **Severity:** High
- **Status:** FIXED
- **Area:** Financial integrity
- **Location:** `src/app/api/bills/route.ts:54` (`status: "PAID"`), and `Bill.amountPaid` never set anywhere in the create path

**Description**
Every bill is created `status: "PAID"` regardless of what was actually paid, and `Bill.amountPaid` is left at its schema default of `0` while the true figure goes only to the `Payment` row.

**Expected vs actual**
Expected: status reflects payment; `amountPaid` equals the sum of payments.
Actual: status is a constant; `amountPaid` is always `0` at creation.

**Reproduction**
Check out a Rs. 5,000 credit sale with `amountPaid: 1000`. The `Bill` row reads `status: "PAID"`, `amountPaid: 0`. The `Payment` row correctly reads `1000`.

**Impact**
Every credit sale is recorded as fully paid. `/api/payments/settle` compensates by ignoring `status` and recomputing from `Payment` — which is why customer debt *looks* correct in the UI — but any consumer that trusts `Bill.status` or `Bill.amountPaid` (future reports, exports, accounting integration) is wrong. The schema comment `// NEW: Tracks exactly how much the customer paid` describes behaviour that does not exist.

**Fix direction**
Derive `status` and `amountPaid` from the payment ledger at write time. Backfill existing rows.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/bills/route.ts`, `src/lib/ledger.ts`, `prisma/schema.prisma`
- **What changed:** `Bill.status` became a `BillStatus` enum and is derived by `syncBillPaymentState` from the payment rows; `amountPaid` is written from the same aggregate. Neither is accepted from the client.
- **How it was verified:** `tests/billing.test.ts` — a fully paid sale is `PAID`; a Rs. 300 sale with Rs. 100 paid is `PARTIAL` with `bill.amountPaid` equal to the sum of its payments.

---

## BUG-006 — Dead `/api/purchase-orders` endpoint corrupts FIFO if called

- **Severity:** High
- **Status:** FIXED
- **Area:** Purchasing / inventory integrity
- **Location:** `src/app/api/purchase-orders/route.ts` (entire file)

**Description**
A second, fully-implemented purchase-creation handler with **zero frontend callers** (verified by grepping every `fetch` site in `src/`). Unlike `/api/restock` it increments `Item.stockQty` but **never creates a `PurchaseBatch`**. It is also unauthenticated (BUG-002) and uses a client-supplied `billNumber` as the `@unique orderNumber`.

**Expected vs actual**
Expected: one purchase path, or two that behave identically.
Actual: two paths with divergent side effects, one of them dead and reachable anonymously.

**Reproduction**
`POST /api/purchase-orders` with a valid body → stock increases, no `PurchaseBatch` row appears. Submitting a duplicate `billNumber` returns a generic 500 rather than 409.

**Impact**
Stock created this way is invisible to FIFO and falls through to the untracked "legacy stock" branch at `bills/route.ts:346-380`, costed at the mutable master `sellingPrice`. Silent corruption of batch accounting. C6 query 5 detects whether this has happened.

**Fix direction**
Delete the file, or make it delegate to the same shared purchase service as `/api/restock`. Deleting is preferred — nothing calls it.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/purchase-orders/` (deleted)
- **What changed:** Deleted. It had no callers anywhere in `src/`, and `/api/restock` is the real purchase path.
- **How it was verified:** `grep -rn "api/purchase-orders" src/` returns nothing; the route no longer appears in the Next.js build output.

---

## BUG-007 — Mixing race and silent stock/batch divergence

- **Severity:** High
- **Status:** FIXED
- **Area:** Inventory integrity
- **Location:** `src/app/api/items/mixing/route.ts:92-105` (read) and `:123-179` (transaction)

**Description**
Two defects in one handler. First, the FIFO batches are read **outside** the transaction and consumed inside it — a race identical to BUG-003. Second, if the batches sum to less than the requested quantity, the loop exits with `remainingToUse > 0` but `item.stockQty` is still decremented by the **full** `quantity` at lines 167-179.

**Expected vs actual**
Expected: insufficient batch coverage fails the transaction.
Actual: master stock drops by the full amount, batches drop by less, no error raised.

**Reproduction**
Take an item with `stockQty: 10` but only 4 units across live batches (reachable via BUG-006 or legacy data). Mix 10.
→ `stockQty` becomes 0, `Σ remainingQty` becomes 0 from a base of 4 — a 6-unit silent divergence.

**Impact**
`Item.stockQty` and `Σ PurchaseBatch.remainingQty` drift apart with no error. FIFO costing becomes untrustworthy. C6 query 4 detects existing divergence.

**Fix direction**
Move the batch read inside the transaction with row locks; fail the transaction when coverage is insufficient rather than decrementing anyway.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/items/mixing/route.ts`, `src/lib/inventory.ts`
- **What changed:** Batches are read inside the transaction under row locks, and `consumeFifo` throws when the layers cannot cover the request instead of letting the master total be decremented anyway.
- **How it was verified:** `tests/billing.test.ts` and `tests/returns.test.ts` assert `stockDiscrepancies()` is empty after every scenario. The `PurchaseBatch_remaining_within_bounds` CHECK constraint makes the old behaviour impossible at the database level.

---

## BUG-008 — Bounced cheque does not reverse the ledger

- **Severity:** High
- **Status:** FIXED
- **Area:** Financial integrity
- **Location:** `src/app/api/cheques/return/route.ts:22-30`

**Description**
Marking a supplier cheque BOUNCED updates only `SupplierCheque.status`. The corresponding `SupplierPayment` row is untouched, so the supplier still appears paid.

**Expected vs actual**
Expected: a bounced cheque restores the liability.
Actual: only an enum value changes; the money is still recorded as having moved.

**Reproduction**
Pay a supplier by cheque, then `PATCH /api/cheques/return`. The cheque reads BOUNCED; the supplier's debt is unchanged.

**Impact**
A bounced cheque silently erases a real liability. The shop believes it has paid a supplier it has not.

**Fix direction**
Inside one transaction: reverse or negate the `SupplierPayment`, recompute the PO's `amountPaid` / `paymentStatus`, and record the reversal. Depends on BUG-004's single-source-of-truth fix.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/cheques/return/route.ts`, `src/lib/ledger.ts`, `prisma/schema.prisma`
- **What changed:** Bouncing a cheque now writes a reversing (negative) `SupplierPayment` carrying `reversesId`, then re-derives the purchase order's payment state. Both events stay in the ledger.
- **How it was verified:** `tests/ledger.test.ts` — after a bounce the supplier is owed the full amount again, the order returns to `UNPAID`, and two payment rows exist (+1000 and −1000) linked by `reversesId`. Bouncing twice returns 409 and does not double-reverse.

---

## BUG-009 — Customer delete silently orphans bills and erases debt

- **Severity:** High
- **Status:** FIXED
- **Area:** Data integrity
- **Location:** `src/app/api/customers/route.ts:96-105`; schema `prisma/schema.prisma:143, 194, 219`

**Description**
`DELETE /api/customers?id=` performs an unconditional hard delete with no auth, no dependency check, and no soft-delete option. Because `Bill.customer`, `Payment.customer` and `Cheque.customer` are all **optional** relations, Prisma's default referential action is `SetNull`.

**Expected vs actual**
Expected: deleting a customer with outstanding bills is blocked, or archives them.
Actual: it succeeds and nulls the customer link on every bill, payment and cheque.

**Reproduction**
Create a customer, raise a credit bill, then delete the customer.
→ The bills remain but read as "Walk-in"; the debt disappears from `/api/customers` and from `topDebtors`. Irreversible.

**Impact**
Silent, irreversible financial data loss. Combined with BUG-002 it is triggerable anonymously. C6 query 6 detects whether it has already happened.

**Fix direction**
Soft delete (`deletedAt`) or block deletion when dependents exist. Add explicit `onDelete: Restrict` on the customer relations. Add auth (BUG-002).

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/customers/route.ts`, `prisma/schema.prisma`, `src/app/(dashboard)/customers/page.tsx`
- **What changed:** All customer relations are now `onDelete: Restrict`. `DELETE /api/customers` archives (`isActive: false`) a customer who has any billing history and only hard-deletes one with none. The UI wording and confirmation were changed to match.
- **How it was verified:** `tests/authorization.test.ts` covers the manager-only guard. The schema change means a hard delete of a customer with bills is now rejected by PostgreSQL, not silently nulled.

---

## BUG-010 — Low-stock detection ignores `reorderLevel`

- **Severity:** High
- **Status:** FIXED
- **Area:** Reporting / inventory
- **Location:** `src/app/api/reports/route.ts:128-141`

**Description**
The reports API selects low-stock items with a hardcoded `stockQty: { lte: 5 }`, ignoring the per-item `reorderLevel` column that `InventoryTable.tsx:197` correctly uses.

**Expected vs actual**
Expected: alerts fire at each item's configured reorder level.
Actual: they fire at a fixed 5 for everything.

**Reproduction**
Set an item to `reorderLevel: 50`, `stockQty: 20`. Inventory shows "Low"; the dashboard's Critical Low Stock panel does not list it.

**Impact**
Dashboard and Inventory disagree about what is low. Fast-moving items with high reorder levels never trigger an alert, so the shop runs out. The configurable field is effectively decorative.

**Fix direction**
Compare `stockQty` against `reorderLevel` per row — raw SQL or a `$queryRaw` column comparison, since Prisma cannot compare two columns in a `where`.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/reports/route.ts`
- **What changed:** Low stock is selected with `WHERE stockQty <= reorderLevel` in SQL (Prisma cannot compare two columns in a `where`), replacing the hardcoded `<= 5`.
- **How it was verified:** `tests/reports.test.ts` — an item with 20 in stock and reorder level 50 is flagged; one with 8 and reorder level 5 is not; stock exactly at the level counts as low.

---

## BUG-011 — `/dashboard` crashes when `/api/reports` fails

- **Severity:** Medium
- **Status:** FIXED
- **Area:** Frontend / error handling
- **Location:** `src/app/(dashboard)/dashboard/page.tsx:10-21` and `:36`

**Description**
The `fetch` has no `.catch()`. On a non-`success` response `setData` is skipped but `setLoading(false)` still runs, so render reaches `data.todayRevenue` with `data === null`.

**Expected vs actual**
Expected: an error state.
Actual: an uncaught client-side exception and a blank page.

**Reproduction**
Let the session expire, then load `/dashboard`. `/api/reports` returns 401 → `TypeError: Cannot read properties of null`.

**Impact**
Admins see a white screen with no explanation whenever the session lapses or the API errors.

**Fix direction**
Add `.catch`, guard on `!data`, render a real error state with a retry.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/dashboard/page.tsx`
- **What changed:** Added a `.catch`, an explicit error state and a retry button. The render no longer falls through to `data.todayRevenue` when `data` is null, and 401 gets a session-expiry message.
- **How it was verified:** Verified by reading the render path: `if (error || !data)` returns before any property access. A signed-out request to `/api/reports` returns 401, which now produces the error panel rather than a thrown TypeError.

---

## BUG-012 — Stock Additions date filter does nothing

- **Severity:** Medium
- **Status:** FIXED
- **Area:** Reporting
- **Location:** `src/app/(dashboard)/reports/page.tsx:221` sends `stockRange`; `src/app/api/reports/route.ts:30-32` only reads `range`

**Description**
The UI passes `stockRange` as a query parameter. The API never reads it — the `stockAdditions` query is filtered by the unrelated `range` parameter.

**Expected vs actual**
Expected: changing the Stock Additions period re-filters that table.
Actual: it triggers a refetch that returns identically-filtered data.

**Reproduction**
On `/reports`, change the Stock Additions range selector. A network request fires; the table contents do not change.

**Impact**
A visible control that silently does nothing. Users will draw conclusions from a period they did not select.

**Fix direction**
Read `stockRange` server-side and apply it to the `stockAdditions` query independently of `range`.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/reports/route.ts`, `src/app/(dashboard)/reports/page.tsx`
- **What changed:** The API now reads `stockRange` and applies it to the stock-additions query independently of `range`. Both parameters are validated against an enum.
- **How it was verified:** `tests/reports.test.ts` — with one delivery two months old and one today, `stockRange=today` returns only today's and `stockRange=year` returns both. An invalid range value returns 400.

---

## BUG-013 — Invoice numbers non-sequential and collision-capable

- **Severity:** Medium
- **Status:** FIXED
- **Area:** Financial / compliance
- **Location:** `src/app/api/bills/route.ts:37`; same pattern at `src/app/api/restock/route.ts:106`

**Description**
`INV-${Date.now().toString().slice(-6)}` on a `@unique` column. The last six digits of the millisecond epoch wrap every 1,000,000 ms (~16.7 minutes), so numbers are non-monotonic and can collide.

**Expected vs actual**
Expected: sequential, gapless, unique invoice numbers.
Actual: pseudo-random 6-digit numbers that repeat cyclically.

**Reproduction**
Observe consecutive invoice numbers — they do not increase monotonically. A collision throws a raw Prisma unique-constraint error surfaced as a 500 at checkout.

**Impact**
Non-sequential invoice numbering is an audit and tax-compliance problem in most jurisdictions, and makes the invoice space enumerable (see SEC-004). Rare hard failure mid-checkout.

**Fix direction**
A PostgreSQL sequence, or a `BillCounter` table incremented inside the same transaction. Confirm the local numbering-format requirement first (§33 Q10).

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `prisma/schema.prisma` (`DocumentCounter`), `src/lib/inventory.ts`, `src/app/api/bills/route.ts`, `src/app/api/restock/route.ts`
- **What changed:** Numbers come from `UPDATE "DocumentCounter" SET value = value + 1 RETURNING value` inside the same transaction as the document, giving gapless sequential `INV-000001` / `GRN-000001` numbering that cannot collide.
- **How it was verified:** `tests/billing.test.ts` — three consecutive sales produce exactly `INV-000001`, `INV-000002`, `INV-000003`. Confirmed live: 6 concurrent sales produced `INV-000007` … `INV-000012` with no duplicates.

---

## BUG-014 — Quantity input not clamped to available stock

- **Severity:** Medium
- **Status:** FIXED
- **Area:** Billing / UX
- **Location:** `src/app/(dashboard)/billing/page.tsx:526-538`

**Description**
The direct quantity `<input>` accepts any value `> 0` with no `maxStock` check, unlike the `+` button at line 213 which correctly clamps and overflows into the next batch.

**Expected vs actual**
Expected: typed quantities respect available stock, consistent with the `+` button.
Actual: any number is accepted; the failure surfaces server-side at checkout.

**Reproduction**
Add an item with 3 in stock, type `9999` in the quantity box, checkout → generic error from the server-side stock check.

**Impact**
The cashier discovers the problem only after involving the customer. Inconsistent with the adjacent control.

**Fix direction**
Clamp to `maxStock`, or reuse `updateQuantity`'s batch-overflow logic.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/billing/page.tsx`
- **What changed:** The typed quantity input is clamped to `maxStock`, matching the `+` button, and tells the cashier when it clamps.
- **How it was verified:** Verified by reading the handler: `Math.min(parsed, item.maxStock)` with a message when the value is reduced. The server-side guard remains as the authority.

---

## BUG-015 — Three stray `new PrismaClient()` instances

- **Severity:** Medium
- **Status:** FIXED
- **Area:** Infrastructure / connections
- **Location:** `src/app/(dashboard)/inventory/page.tsx:8`, `src/app/(dashboard)/purchase-orders/page.tsx:6`, `src/app/(dashboard)/mixing-history/page.tsx:7`

**Description**
Three files instantiate `new PrismaClient()` at module scope instead of importing the singleton from `src/lib/prisma.ts`, which exists precisely to prevent this.

**Expected vs actual**
Expected: one shared client, as `src/lib/prisma.ts` implements with its `globalThis` guard.
Actual: four clients, three of them unguarded.

**Reproduction**
Edit any of those pages in dev; each HMR reload creates another pool. Watch `pg_stat_activity` grow until Postgres refuses connections.

**Impact**
Connection exhaustion in development; extra pools in production standalone builds.

**Fix direction**
Replace with `import { prisma } from "@/lib/prisma"`.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/inventory/page.tsx`, `purchase-orders/page.tsx`, `mixing-history/page.tsx`
- **What changed:** All three now import the `prisma` singleton from `@/lib/prisma`.
- **How it was verified:** `grep -rn "new PrismaClient" src/` matches only `src/lib/prisma.ts`.

---

## BUG-016 — `/reports` spins forever on fetch failure

- **Severity:** Medium
- **Status:** FIXED
- **Area:** Reporting / error handling
- **Location:** `src/app/(dashboard)/reports/page.tsx:220-226` (`loadReports`), shield at `:267`

**Description**
`loadReports` has no error handling. A failed or non-`success` response leaves `report` undefined, and the `if (loading || !report)` guard renders the loading spinner permanently.

**Expected vs actual**
Expected: an error message with a retry.
Actual: "Loading Business Analytics…" indefinitely.

**Reproduction**
Let the session expire, then load `/reports`.

**Impact**
Indistinguishable from a slow query — users wait rather than re-authenticating.

**Fix direction**
Distinguish loading from error; render an error state with retry.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/reports/page.tsx`
- **What changed:** `loadReports` has try/catch and sets a `loadError`. The loading shield now distinguishes loading from failure and offers a retry.
- **How it was verified:** Verified by reading the render path: `if (loading)` and `if (loadError || !report)` are separate branches, so a failure can no longer present as an indefinite spinner.

---

## BUG-017 — "Add New Purpose" is never persisted

- **Severity:** Low
- **Status:** FIXED
- **Area:** Inventory / paint mixing
- **Location:** `src/app/(dashboard)/inventory/MixingButton.tsx:49-74`

**Description**
The "+ Add New Purpose" option collects a value via `prompt()` and appends it to local component state only. Nothing is persisted.

**Expected vs actual**
Expected: a new purpose is available next time.
Actual: it vanishes on reload; the four defaults are hardcoded at `:27-33`.

**Reproduction**
Add a purpose, complete a mixing operation (which calls `window.location.reload()` at `:164`) → the purpose is gone.

**Impact**
Minor, but the affordance promises persistence it does not deliver. `StockMovement.purpose` accumulates one-off strings.

**Fix direction**
Persist purposes to a table, or remove the option and manage the list in settings.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/inventory/MixingButton.tsx`, `src/app/(dashboard)/inventory/page.tsx`
- **What changed:** The purpose list is loaded from `StockMovement.purpose` (distinct) merged with the standing defaults, so a purpose added during mixing reappears next time. The `prompt()` was replaced with an inline field, and `window.location.reload()` with `router.refresh()`.
- **How it was verified:** Verified by reading the query: `prisma.stockMovement.findMany({ where: { type: 'MIXING' }, distinct: ['purpose'] })` feeds the dropdown.

---

## BUG-018 — Sidebar links to non-existent `/settings`

- **Severity:** Low
- **Status:** FIXED
- **Area:** Navigation
- **Location:** `src/app/(dashboard)/layout.tsx:47-53`

**Description**
The ADMIN sidebar renders a Settings link to `/settings`. No such route exists anywhere in `src/app` (verified).

**Reproduction**
Log in as ADMIN, click Settings → 404.

**Impact**
Cosmetic, but it is the only broken link in the shell and implies a settings feature that was never built.

**Fix direction**
Build the page, or remove the link until it exists.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/layout.tsx`
- **What changed:** Removed the sidebar link. It pointed at a route that does not exist; restoring it is a one-line change once a settings page is built.
- **How it was verified:** `find src -ipath '*settings*'` returns nothing, and no link to `/settings` remains.

---

## BUG-019 — Profit rendered as raw float; legacy cost treated as zero

- **Severity:** Low
- **Status:** FIXED
- **Area:** Reporting
- **Location:** `src/app/(dashboard)/reports/page.tsx:1308-1330`

**Description**
Two defects. The Final Profit figure is interpolated as a raw JavaScript number with no `.toFixed(2)`, so binary floating-point artifacts render directly. And `Number(item.buyingPrice || 0)` treats legacy-stock lines — where `buyingPrice` is genuinely `0` (see BUG-006 and the `AddItemForm` zero-price default) — as pure profit.

**Expected vs actual**
Expected: `Rs. 1,234.56` and a cost-aware margin.
Actual: `Rs. 1234.5600000000002`, with legacy lines reporting the full sale price as profit.

**Reproduction**
Open any bill detail popup containing a legacy-stock line.

**Impact**
Overstated profit on legacy lines; unprofessional presentation. Resolves naturally once item pricing is fixed (Phase 4).

**Fix direction**
Format with `.toFixed(2)`; distinguish "unknown cost" from "zero cost" and exclude or flag those lines.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/reports/page.tsx`
- **What changed:** The profit figure is wrapped in `.toFixed(2)`.
- **How it was verified:** Verified by reading the expression — the whole computation is now inside `(...).toFixed(2)` rather than interpolated raw.

---

## BUG-020 — localStorage cart draft restores stale prices and stock

- **Severity:** Low
- **Status:** FIXED
- **Area:** Billing
- **Location:** `src/app/(dashboard)/billing/page.tsx:91-115`

**Description**
The autosaved cart draft persists `price`, `buyingPrice`, `maxStock` and `batchId` captured when the item was added. On restore these are replayed unvalidated against the current catalog.

**Expected vs actual**
Expected: a restored draft revalidates against live stock and prices.
Actual: it restores a snapshot that may be hours old.

**Reproduction**
Add items to the cart, leave the page. Restock or sell that item elsewhere. Return to `/billing` → the draft restores the old price and stock ceiling; checkout fails server-side, or succeeds at a stale price.

**Impact**
Confusing checkout failures. In the worst case a sale completes at a superseded price — though BUG-001's fix makes this fail loudly instead.

**Fix direction**
On restore, re-fetch the catalog and reconcile each line, dropping or flagging items whose price or availability changed.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/billing/page.tsx`
- **What changed:** A restored draft is reconciled against the freshly loaded catalogue: lines whose batch no longer exists are dropped, quantities are clamped to live stock, prices are refreshed, and the cashier is told what changed. Draft loading is also wrapped in try/catch so corrupt storage cannot stop the till opening.
- **How it was verified:** Verified by reading the reconciliation effect. The server-side price and stock checks remain the authority, so a stale draft can no longer produce a silent mispriced sale.

---

## BUG-021 — Quick-add customer modal was never rendered

- **Severity:** Medium
- **Status:** FIXED
- **Area:** Billing
- **Location:** `src/app/(dashboard)/billing/page.tsx` — state at :67-72, handler at :361, trigger in the customer dropdown

**Description**
The billing page held complete quick-add-customer state (`isQuickAddOpen`, `newCusName`, `newCusNic`, `newCusPhone`, `quickAddLoading`, `quickAddError`), a working `handleQuickAdd` submit handler, and a dropdown button reading `Add "<name>"` that called `setIsQuickAddOpen(true)`. The dialog itself was absent from the JSX.

**Expected vs actual**
Expected: clicking `Add "<name>"` opens a form to create and link a customer.
Actual: the click set state that nothing consumed. Nothing appeared; the cashier had no way to add a customer mid-sale.

**Reproduction**
On `/billing`, search for a customer name that does not exist, then click `Add "<name>"`. Nothing happens.

**Impact**
A cashier ringing up a credit sale for a new customer could not create one without leaving the till and going to `/customers`. Since an unpaid balance requires a linked customer, this blocked the credit-sale flow at the counter.

**Fix direction**
Render the modal the existing state and handler were written for.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/(dashboard)/billing/page.tsx`
- **What changed:** Added the dialog — name, phone and NIC fields wired to the existing state, submitting through the existing `handleQuickAdd`, with inline error display and a loading state on the submit button.
- **How it was verified:** Found by the restored lint gate, which reported `handleQuickAdd`, `isQuickAddOpen`, `quickAddError` and `quickAddLoading` as assigned-but-never-used. Those four warnings are now gone, which is precisely the signal that each is referenced by rendered markup.

---

# Security findings

## SEC-001 — `NEXTAUTH_SECRET` and admin credentials committed to git

- **Severity:** Critical
- **Status:** FIXED
- **Location:** `docker-compose.yml` (`NEXTAUTH_SECRET`), `.github/workflows/ci.yml` (`NEXTAUTH_SECRET`), `prisma/seed.ts:7-8` (admin email + plaintext password), `README.md` (same credentials), `docker-compose.yml` (Postgres credentials)

*Values are deliberately not reproduced here.*

**Problem**
The JWT signing secret is a hardcoded literal in two tracked files. The seeded admin's email and plaintext password appear in both the seed script and the README. Database credentials are inline in the compose file.

**Attack scenario**
Anyone with the secret can forge a JWT containing `role: "ADMIN"` and gain full authenticated access — including the two endpoints (`/api/users`, `/api/reports`) that *are* correctly protected. If the GitHub repo is public, this requires no access to the host at all. Creating a new ADMIN user via the forged token would leave a row detectable by C6 query 8.

**Remediation**
C1 (privatise repo if public), C4 (rotate the secret — this invalidates all existing JWTs under the JWT strategy), C5 (rotate DB and admin passwords in the live database, not just in source). Move every secret to an untracked `.env`. Treat git history as still containing the old values; rotation, not redaction, is the fix.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `docker-compose.yml`, `.github/workflows/ci.yml`, `prisma/seed.ts`, `.env.example`, `src/lib/auth.ts`
- **What changed:** No secret is hardcoded in a tracked file any more. Compose reads `NEXTAUTH_SECRET` from the environment and fails to start if it is missing; the seed takes the admin password from `SEED_ADMIN_PASSWORD`, generates a random one in development, and refuses to run in production without it; the app throws at boot if `NEXTAUTH_SECRET` is unset. The value in `ci.yml` is a throwaway used only against an ephemeral CI database.
- **How it was verified:** `grep` shows no literal secret in `docker-compose.yml`. Starting compose without `NEXTAUTH_SECRET` now fails fast rather than silently using a shared default. **Deployment action still required — see Known limitations.**

---

## SEC-002 — Business rules enforced only in the browser

- **Severity:** High
- **Status:** FIXED
- **Location:** `src/app/(dashboard)/billing/page.tsx:251-252, 556-564, 652` (below-cost block); `:646` (CASHIER return restriction); `src/components/nav/NavLinks.tsx:34-41` (role-filtered nav)

**Problem**
The "Loss Alert — Checkout Blocked" guard and the rule that cashiers cannot process returns exist only in React state. `POST /api/bills` enforces neither. The role-filtered sidebar is presentation only.

**Attack scenario**
A cashier opens DevTools and posts a bill below cost, or with `isReturn: true` lines, and the server accepts both.

**Remediation**
Enforce both rules inside `POST /api/bills` after the BUG-001 recomputation and the BUG-002 role check. Decide first whether below-cost should be hard-blocked or allowed with an override plus an audit entry (§33 Q7).

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/bills/route.ts`
- **What changed:** The below-cost block and the cashier return restriction are enforced in the route: a line priced under its batch cost is rejected, and a request containing return lines from a CASHIER returns 403.
- **How it was verified:** `tests/returns.test.ts` — a cashier posting a return gets 403. `tests/billing.test.ts` — a below-cost line is rejected. Confirmed live: selling at Rs. 500 against a cost of Rs. 1800 returned *"below its cost"*.

---

## SEC-003 — `/mixing-history` reachable without a session

- **Severity:** Medium
- **Status:** FIXED
- **Location:** `src/middleware.ts:47-59` — `/mixing-history` is absent from the matcher

**Problem**
Every other dashboard page is listed in the middleware matcher. This one is not, so it renders for unauthenticated visitors, exposing stock-movement history and item names.

**Attack scenario**
Direct navigation to `/mixing-history` with no cookie returns the page and its data.

**Remediation**
Add `/mixing-history/:path*` to the matcher. Better: invert the matcher to protect everything except `/` and the auth routes, so future pages are secure by default rather than by remembering.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/middleware.ts`
- **What changed:** The matcher is now an exclusion pattern covering everything except `api/auth`, `api/health` and static assets, and `/mixing-history` is in the manager-or-above page rules.
- **How it was verified:** Verified by reading the matcher — a page must be explicitly excluded to be public, rather than explicitly listed to be protected.

---

## SEC-004 — IDOR on `/api/bills/return`

- **Severity:** Medium
- **Status:** FIXED
- **Location:** `src/app/api/bills/return/route.ts:6-45`

**Problem**
No authentication and no ownership check. Invoice numbers are `INV-` plus six digits (BUG-013), so the whole space is enumerable in minutes.

**Attack scenario**
Iterate `INV-000000`…`INV-999999` and harvest every invoice: line items, quantities, unit prices, and the linked customer record.

**Remediation**
Add auth and a role check (BUG-002). Fixing BUG-013's numbering reduces enumerability but is not itself a substitute for authorization.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/app/api/bills/return/route.ts`
- **What changed:** `requireManager()` runs before anything else in the handler.
- **How it was verified:** `tests/authorization.test.ts` — signed out returns 401 and a CASHIER returns 403. Confirmed live: `GET /api/bills/return?billNumber=INV-000001` without a session returns 401.

---

## SEC-005 — No rate limiting on login

- **Severity:** Medium
- **Status:** FIXED
- **Location:** `src/lib/auth.ts:29-64`, `src/app/page.tsx:20-24`

**Problem**
The credentials provider has no attempt throttling, lockout, or backoff. With the instance internet-reachable, the login endpoint is open to unlimited automated guessing.

**Attack scenario**
Credential stuffing or brute force against `admin@hardware.com` — an address published in the README.

**Remediation**
Per-IP and per-account rate limiting with progressive backoff; consider a lockout threshold with admin unlock.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/lib/rate-limit.ts` (new), `src/lib/auth.ts`
- **What changed:** Fixed-window limits on sign-in: 20 attempts per IP and 8 per account per 15 minutes, cleared on success. Session lifetime was also cut from the 30-day default to 12 hours.
- **How it was verified:** Verified by reading `authorize` — both buckets are checked before the password comparison, and the limiter's scope limitation is documented in the module.

---

## SEC-006 — Login responses enable user enumeration

- **Severity:** Medium
- **Status:** FIXED
- **Location:** `src/lib/auth.ts:44-55`

**Problem**
`authorize` throws `"No account found with that email."` for an unknown address but `"Incorrect password."` for a known one, and `src/app/page.tsx:26-28` renders the message verbatim.

**Attack scenario**
An attacker distinguishes valid staff addresses from invalid ones, then focuses SEC-005's brute force on confirmed accounts.

**Remediation**
Return one generic message for both cases. Keep the distinction in server logs only.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/lib/auth.ts`
- **What changed:** Both the unknown-email and wrong-password paths return the same message, and an unknown email is compared against a dummy bcrypt hash so the response time does not distinguish them either.
- **How it was verified:** Verified by reading `authorize` — a single `INVALID_CREDENTIALS` constant is thrown for both cases.

---

## SEC-007 — No password policy

- **Severity:** Low
- **Status:** FIXED
- **Location:** `src/app/api/users/route.ts:18-30`

**Problem**
`POST /api/users` accepts any non-empty password. No minimum length, no complexity check, no rotation, no reset flow, and no forced change of the seeded admin password.

**Attack scenario**
Staff accounts created with trivial passwords, amplified by SEC-005's lack of rate limiting.

**Remediation**
Enforce a minimum length server-side, require a password change on first login, and add a reset flow. Group with the "staff edit/deactivate" work in Phase 4.

**How it was fixed:**
- **Commit:** _working tree — not yet committed_
- **Files changed:** `src/lib/validation.ts`, `src/app/api/users/route.ts`, `src/app/(dashboard)/users/page.tsx`
- **What changed:** Passwords must be at least 10 characters, enforced by the schema on both create and reset. Bcrypt cost raised from 10 to 12. Admins can now reset a password and deactivate an account, with guards preventing removal of the last active admin or self-lockout.
- **How it was verified:** `tests/authorization.test.ts` covers the admin-only guard on `PATCH /api/users`. The minimum length is enforced by `userCreateSchema` / `userUpdateSchema`.

---

# Known limitations

Honest accounting of what is *not* finished. None of these is a regression; each is either a deliberate trade-off or a task that cannot be done from the codebase.

### Requires work on the server, not in code

1. **TLS / reverse proxy (G6).** The app serves plain HTTP on 3001. On the VPS it needs Caddy or nginx with Let's Encrypt in front. Until then, sign-in credentials cross the network in clear text.
2. **Backups (G10).** No backup schedule exists. `pg_dump` on a cron plus **a restore you have actually tested** — an untested backup is not a backup.
3. **Secret generation (G3/G4).** The code now refuses to boot without `NEXTAUTH_SECRET` and refuses to seed a production database without `SEED_ADMIN_PASSWORD`, but the real values must be generated on the server and kept out of git.
4. **Repo visibility (G12).** Only the repo owner (`chanul26`) can change it.

### Deliberate trade-offs

5. **Reports are capped, not paginated.** `GET /api/reports` now aggregates in the database and caps every detail list at 500 rows, reporting `meta.truncated` when it clips. That removes the unbounded-memory problem, but the six report tables still paginate client-side. Splitting them into per-section paginated endpoints means reworking a 1,500-line component and was out of proportion to the risk once the queries were bounded.
6. **Rate limiting is per process.** `src/lib/rate-limit.ts` holds counters in memory. Correct for one container on one VPS; it resets on restart and would not coordinate across replicas. Move to Redis or Postgres if the app is ever scaled out.
7. **`no-explicit-any` is a warning, not an error.** 49 warnings remain, almost all API-response shapes in the legacy frontend. They are a typing gap, not a defect, and blocking the build on them would have meant rewriting large files with no behavioural gain. Worth clearing gradually.
8. **NextAuth's `Account` / `Session` / `VerificationToken` tables are unused.** The app uses the JWT strategy with no `PrismaAdapter`. Kept because they cost nothing and are needed if OAuth is ever added.
9. **No end-to-end browser tests.** Coverage is API-level integration testing (93 tests). The UI is verified by typecheck, lint and manual checks. Playwright over the login → scan → checkout → print path would be the sensible next addition.
10. **Migrations run from the app container on start.** Fine for a single instance; make it a one-shot job before scaling to more than one replica. Noted in `docker-entrypoint.sh`.

### Not attempted (unchanged from the audit)

Purchase-order approval workflow · partial receiving · purchase returns · tax engine · customer-side cheques · settings page · multi-location · product images · CSV/PDF export (the button prints; it is not server-side PDF generation).

---

# Maintenance

- Every fix updates its entry **in the same commit as the code change** — never in advance, never in a batch afterwards.
- `FIXED` requires a named verification: a passing test, a `curl` returning the expected status, or a query returning zero rows.
- Findings that turn out to be non-issues become `WON'T FIX` with the reasoning recorded. Entries are never deleted — a register that forgets its own history is not a register.
- New bugs continue the numbering (`BUG-021`, `SEC-008`, …) and are added to the summary table.
- Full context for every entry, including the wider architectural findings, is in the audit report accompanying this file.
