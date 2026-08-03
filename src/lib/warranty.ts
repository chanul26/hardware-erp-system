// ─────────────────────────────────────────────
//  Warranty helpers
// ─────────────────────────────────────────────
//
// The shop resells goods it did not manufacture, so a warranty given to a
// customer is only ever a pass-through of cover the supplier granted on that
// specific shipment. The customer's clock starts on the day they buy —
// shelf time does not eat into it.

export const MAX_WARRANTY_MONTHS = 120;

/**
 * Adds whole months to a date, clamping the day so that adding one month to
 * 31 Jan lands on 28/29 Feb rather than rolling into March.
 */
export function addMonths(
  date: Date,
  months: number
): Date {

  const result = new Date(date.getTime());

  const targetDay = result.getDate();

  // Move to the 1st first, so the month arithmetic cannot overflow.
  result.setDate(1);
  result.setMonth(result.getMonth() + months);

  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0
  ).getDate();

  result.setDate(
    Math.min(targetDay, lastDayOfTargetMonth)
  );

  return result;
}

/**
 * Warranty numbers are minted in batches during checkout, so a timestamp
 * alone would collide. The sequence suffix keeps them unique within a bill.
 */
export function generateWarrantyNumber(
  sequence: number,
  now: number = Date.now()
): string {

  const stamp = now.toString().slice(-8);

  return `WR-${stamp}-${String(sequence).padStart(3, "0")}`;
}

export function generateClaimNumber(
  now: number = Date.now()
): string {

  return `WC-${now.toString().slice(-8)}`;
}

/**
 * Normalises a requested warranty term. Returns null when the term is
 * unusable, which callers treat as "issue no warranty".
 */
export function normaliseMonths(
  value: unknown
): number | null {

  const months = Number(value);

  if (!Number.isFinite(months) || months <= 0) {
    return null;
  }

  return Math.min(
    Math.round(months),
    MAX_WARRANTY_MONTHS
  );
}

export type StoredWarrantyStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "CLAIMED"
  | "VOID";

/**
 * ACTIVE is stored, not recalculated by a job — so expiry is derived on read
 * by comparing against the end date. VOID and CLAIMED are deliberate states
 * and always win over the calendar.
 */
export function effectiveStatus(warranty: {
  status: StoredWarrantyStatus;
  endDate: Date | string;
}): StoredWarrantyStatus {

  if (
    warranty.status === "VOID" ||
    warranty.status === "CLAIMED"
  ) {
    return warranty.status;
  }

  const end = new Date(warranty.endDate);

  return end.getTime() < Date.now()
    ? "EXPIRED"
    : "ACTIVE";
}

export function daysRemaining(
  endDate: Date | string
): number {

  const end = new Date(endDate).getTime();

  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.ceil(
    (end - Date.now()) / msPerDay
  );
}
