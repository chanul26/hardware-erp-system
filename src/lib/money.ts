// ─────────────────────────────────────────────
//  Money management helpers
// ─────────────────────────────────────────────
//
// The shop takes money in through billing and pays suppliers through purchase
// orders — both already recorded. This module never re-enters those amounts.
// It answers a different question: of what came in today, how much went to the
// bank, how much was spent, and how much should still be in the drawer.
//
// Nothing here stores a balance. Every figure is summed from the ledger on
// read, so deleting a mis-keyed entry is enough to put the books right.

export type MoneyTxType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "EXPENSE"
  | "DONATION"
  | "OTHER_INCOME"
  | "ADJUSTMENT";

export const MONEY_TX_TYPES: MoneyTxType[] = [
  "DEPOSIT",
  "WITHDRAWAL",
  "EXPENSE",
  "DONATION",
  "OTHER_INCOME",
  "ADJUSTMENT",
];

export const MONEY_TX_LABELS: Record<MoneyTxType, string> = {
  DEPOSIT: "Deposit to bank",
  WITHDRAWAL: "Withdraw from bank",
  EXPENSE: "Expense",
  DONATION: "Donation",
  OTHER_INCOME: "Other income",
  ADJUSTMENT: "Adjustment",
};

/**
 * DEPOSIT and WITHDRAWAL are moves between the drawer and a named bank, so
 * they are meaningless without one. The rest may sit on either side: a null
 * bank means the cash drawer.
 */
export function requiresBankAccount(type: MoneyTxType): boolean {
  return type === "DEPOSIT" || type === "WITHDRAWAL";
}

/**
 * Only ADJUSTMENT may be negative — it is the entry used to correct an
 * overstated balance or set an opening float. Everything else carries its
 * direction in the type, so a negative amount there is a data-entry slip.
 */
export function allowsNegativeAmount(type: MoneyTxType): boolean {
  return type === "ADJUSTMENT";
}

export type LedgerEntry = {
  type: MoneyTxType;
  amount: unknown;
  bankAccountId: string | null;
};

/**
 * Effect of one entry on the cash drawer.
 *
 * A deposit leaves the drawer; a withdrawal returns to it. Money spent or
 * given away only touches the drawer when it was not paid from a bank.
 */
export function cashEffect(entry: LedgerEntry): number {
  const amount = Number(entry.amount) || 0;

  const fromDrawer = entry.bankAccountId === null;

  switch (entry.type) {
    case "DEPOSIT":
      return -amount;

    case "WITHDRAWAL":
      return amount;

    case "EXPENSE":
    case "DONATION":
      return fromDrawer ? -amount : 0;

    case "OTHER_INCOME":
      return fromDrawer ? amount : 0;

    case "ADJUSTMENT":
      return fromDrawer ? amount : 0;

    default:
      return 0;
  }
}

/**
 * Effect of one entry on a given bank account. Entries belonging to another
 * account — or to the drawer — leave this balance alone.
 */
export function bankEffect(
  entry: LedgerEntry,
  bankAccountId: string
): number {
  if (entry.bankAccountId !== bankAccountId) {
    return 0;
  }

  const amount = Number(entry.amount) || 0;

  switch (entry.type) {
    case "DEPOSIT":
    case "OTHER_INCOME":
    case "ADJUSTMENT":
      return amount;

    case "WITHDRAWAL":
    case "EXPENSE":
    case "DONATION":
      return -amount;

    default:
      return 0;
  }
}

// ─────────────────────────────────────────────
//  Dates
// ─────────────────────────────────────────────
//
// The owner thinks in shop days, not UTC instants, so every window is built
// from the server's local midnight.

export function startOfDay(date: Date = new Date()): Date {
  const result = new Date(date.getTime());
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date = new Date()): Date {
  const result = new Date(date.getTime());
  result.setHours(23, 59, 59, 999);
  return result;
}

export function startOfMonth(date: Date = new Date()): Date {
  const result = new Date(date.getTime());
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Reads a `YYYY-MM-DD` query param as a local shop day, falling back to today
 * when absent or unparseable.
 */
export function parseDayParam(value: string | null): Date {
  if (!value) return startOfDay();

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return startOfDay();

  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  if (Number.isNaN(parsed.getTime())) return startOfDay();

  return startOfDay(parsed);
}

export function toDayString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validates and rounds a money figure to cents. Returns null when the input is
 * not a usable amount, which callers turn into a 400 rather than a silent 0.
 */
export function normaliseAmount(
  value: unknown,
  { allowNegative = false }: { allowNegative?: boolean } = {}
): number | null {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return null;
  if (amount === 0) return null;
  if (!allowNegative && amount < 0) return null;

  // Decimal(14,2) tops out below this; reject rather than let Postgres throw.
  if (Math.abs(amount) >= 1_000_000_000_000) return null;

  return Math.round(amount * 100) / 100;
}
