import { prisma } from "@/lib/prisma";
import { cashEffect, startOfDay } from "@/lib/money";

// Server-only money helpers. Kept out of lib/money.ts because that module is
// imported by client components, and pulling Prisma in there would drag the
// database client into the browser bundle.

export const MONEY_SETTINGS_ID = "default";

// Marks the ledger entry that carries a count's variance, so a re-count can
// find and replace its own correction rather than stacking a second one.
export const CASH_VARIANCE_CATEGORY = "Cash over/short";

export type CashPosition = {
  // null until the drawer has been counted once — there is no honest running
  // total before a real starting figure exists.
  cashInHand: number | null;
  cashStart: Date | null;
  openingFloat: number;
};

/**
 * What the drawer *should* hold at the end of the given day.
 *
 * The counted opening float, plus every cash sale since, less the supplier
 * payments the owner marked as taken from the till, less whatever the ledger
 * says was banked, spent or given away. Sales before the tracking start date
 * are excluded: that money was spent or banked outside this system and is no
 * longer in the drawer.
 *
 * Both the dashboard and the day-end count read this, so the figure the owner
 * is checking against is always the figure the system believes.
 */
export async function computeCashInHand(
  dayEnd: Date
): Promise<CashPosition> {

  const settings = await prisma.moneySettings.findUnique({
    where: { id: MONEY_SETTINGS_ID },
  });

  const cashStart = settings?.cashTrackingStartDate
    ? startOfDay(settings.cashTrackingStartDate)
    : null;

  const openingFloat = Number(settings?.openingCashFloat ?? 0);

  if (!cashStart) {
    return { cashInHand: null, cashStart: null, openingFloat };
  }

  // Looking at a day before the drawer was ever counted. The float belongs to
  // the start day, not to the past, so reporting it here would put a figure
  // against a day on which it was never true.
  if (dayEnd < cashStart) {
    return { cashInHand: null, cashStart, openingFloat };
  }

  const window = { gte: cashStart, lte: dayEnd };

  const [cashIn, cashToSuppliers, ledger] = await Promise.all([
    prisma.payment.aggregate({
      where: { method: "CASH", paidAt: window },
      _sum: { amount: true },
    }),

    // Only the share of each supplier payment that actually came out of the
    // till. The rest was funded from a wallet or a bank transfer and never
    // passed through the drawer, so deducting the full amount would drive the
    // figure far below zero.
    prisma.supplierPayment.aggregate({
      where: { paidAt: window },
      _sum: { drawerAmount: true },
    }),

    prisma.moneyTransaction.findMany({
      where: { occurredAt: window },
      select: { type: true, amount: true, bankAccountId: true },
    }),
  ]);

  const cashInHand =
    openingFloat +
    (Number(cashIn._sum.amount) || 0) -
    (Number(cashToSuppliers._sum.drawerAmount) || 0) +
    ledger.reduce((sum, entry) => sum + cashEffect(entry), 0);

  return { cashInHand, cashStart, openingFloat };
}
