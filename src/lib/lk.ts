// ─────────────────────────────────────────────
//  Sri Lankan formats
// ─────────────────────────────────────────────
//
// Customers are looked up by phone at the counter and by NIC on warranty
// claims, and both get typed differently every time — 077 123 4567, 0771234567,
// +94 77 123 4567 are one number, and 861234567v is the same card as
// 861234567V. Stored as typed, a substring search misses the record and the
// unique constraint on NIC lets the same person in twice.
//
// So both are canonicalised on the way in, and search terms are put through
// the same function so they match what was stored.

/**
 * Canonical local form: 0XXXXXXXXX.
 *
 * Sri Lankan mobiles and landlines are nine digits after the leading zero.
 * +94 and 0094 are the same number written for dialling from abroad, so they
 * collapse to the local form rather than being kept as separate records.
 *
 * Anything that does not look like a Sri Lankan number is returned trimmed but
 * otherwise untouched — a shop that keeps a foreign supplier's number should
 * not have it mangled.
 */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Keep only digits; a leading + is implied by the 94 country code.
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return trimmed;

  // 0094771234567 → 94771234567
  const withoutIddPrefix = digits.startsWith("00")
    ? digits.slice(2)
    : digits;

  // 94771234567 → 0771234567
  if (withoutIddPrefix.startsWith("94") && withoutIddPrefix.length === 11) {
    return `0${withoutIddPrefix.slice(2)}`;
  }

  // 771234567 → 0771234567 (typed without the leading zero)
  if (withoutIddPrefix.length === 9 && !withoutIddPrefix.startsWith("0")) {
    return `0${withoutIddPrefix}`;
  }

  if (withoutIddPrefix.length === 10 && withoutIddPrefix.startsWith("0")) {
    return withoutIddPrefix;
  }

  // Not a shape we recognise — leave it as the user typed it.
  return trimmed;
}

/**
 * Canonical NIC: uppercase, no spaces.
 *
 * Two formats are in circulation — the old nine digits plus V or X, and the
 * twelve digit number issued since 2016. They are not converted into one
 * another here: deriving the new number from the old one requires the birth
 * century, which the card alone does not give, and a wrong guess would attach
 * a warranty to the wrong person.
 */
export function normaliseNic(input: string | null | undefined): string | null {
  if (!input) return null;

  const cleaned = input.replace(/\s/g, "").toUpperCase();

  return cleaned || null;
}

/** Old format: 9 digits then V or X. New format: 12 digits. */
export function isValidNic(input: string | null | undefined): boolean {
  const nic = normaliseNic(input);
  if (!nic) return false;

  return /^\d{9}[VX]$/.test(nic) || /^\d{12}$/.test(nic);
}

/** Local mobile or landline, in the canonical 0XXXXXXXXX form. */
export function isValidPhone(input: string | null | undefined): boolean {
  const phone = normalisePhone(input);
  if (!phone) return false;

  return /^0\d{9}$/.test(phone);
}
