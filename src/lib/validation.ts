import { z } from "zod";

/**
 * Input schemas for every API route.
 *
 * Two rules drive these:
 *  1. Anything a browser sends is untrusted, including prices and totals. The
 *     schemas accept a *proposal*; the route re-derives money from the database.
 *  2. Quantities may be fractional (the shop sells paint, cement and wire by
 *     weight and length), so quantity is a positive number, not an integer.
 */

const money = z
  .number()
  .finite("Must be a valid amount.")
  .nonnegative("Cannot be negative.")
  .max(99_999_999.99, "Amount is too large.");

const quantity = z
  .number()
  .finite("Must be a valid quantity.")
  .positive("Must be greater than zero.")
  .max(1_000_000, "Quantity is too large.");

const id = z.string().uuid("Invalid identifier.");

/**
 * Optional free text. Forms send `""` for an untouched input and `null` for a
 * field that does not apply to the chosen mode (for example cheque details on a
 * cash purchase), so all three of undefined/null/"" mean "not supplied".
 */
const optionalText = (max = 500) =>
  z
    .union([
      z.string().trim().max(max, `Must be ${max} characters or fewer.`),
      z.null(),
    ])
    .optional()
    .transform((v) => (v ? v : undefined));

/** Accepts "" / undefined / null as "not supplied". */
const optionalId = z
  .union([id, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : undefined));

/** A date string that may be absent, for the same reason as optionalText. */
const optionalDate = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v ? v : undefined));

// ─────────────────────────────────────────────
//  Items
// ─────────────────────────────────────────────

export const itemCreateSchema = z.object({
  barcode: z.string().trim().min(1, "Barcode is required.").max(64),
  name: z.string().trim().min(1, "Item name is required.").max(200),
  description: optionalText(1000),
  category: optionalText(100),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  reorderLevel: z.number().int().nonnegative().max(1_000_000).default(5),
  buyingPrice: money.default(0),
  sellingPrice: money.default(0),
});

export const itemUpdateSchema = z.object({
  id,
  name: z.string().trim().min(1, "Item name is required.").max(200),
  description: optionalText(1000),
  category: optionalText(100),
  unit: z.string().trim().min(1).max(20),
  reorderLevel: z.number().int().nonnegative().max(1_000_000),
  sellingPrice: money,
});

export const mixingSchema = z.object({
  itemId: id,
  quantity,
  purpose: z.string().trim().min(1, "Please select a purpose.").max(100),
  note: optionalText(500),
});

// ─────────────────────────────────────────────
//  Billing
// ─────────────────────────────────────────────

/**
 * A cart line. `price` is what the cashier saw; the server re-reads the real
 * price and rejects the sale if the two disagree beyond the allowed override.
 */
const saleLineSchema = z.object({
  isReturn: z.literal(false).optional(),
  id,
  batchId: optionalId,
  quantity,
  price: money,
});

const returnLineSchema = z.object({
  isReturn: z.literal(true),
  id,
  originalBillItemId: id,
  // Return lines carry a negative quantity by convention.
  quantity: z
    .number()
    .finite("Must be a valid quantity.")
    .negative("A return line must have a negative quantity.")
    .min(-1_000_000, "Quantity is too large."),
  price: money,
});

export const billCreateSchema = z.object({
  customerId: optionalId,
  items: z
    .array(z.union([returnLineSchema, saleLineSchema]))
    .min(1, "Cannot process an empty cart."),
  discount: money.default(0),
  tax: money.default(0),
  /** Blank means "customer paid the full total". */
  amountPaid: z.number().finite().optional(),
  paymentMethod: z
    .enum(["CASH", "CARD", "CHEQUE", "BANK_TRANSFER"])
    .default("CASH"),
});

export const billNumberQuerySchema = z.object({
  billNumber: z.string().trim().min(1, "Invoice number is required.").max(64),
});

// ─────────────────────────────────────────────
//  Customers
// ─────────────────────────────────────────────

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  phone: z.string().trim().min(1, "Phone is required.").max(30),
  nic: optionalText(30),
  email: z
    .union([z.string().trim().email("Enter a valid email address."), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  address: optionalText(500),
});

export const customerUpdateSchema = customerCreateSchema.extend({ id });

export const customerListQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().positive().max(100_000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(5),
});

export const idQuerySchema = z.object({ id });

// ─────────────────────────────────────────────
//  Suppliers, purchasing, payments
// ─────────────────────────────────────────────

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required.").max(200),
  phone: optionalText(30),
  email: z
    .union([z.string().trim().email("Enter a valid email address."), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  address: optionalText(500),
});

const restockLineSchema = z.object({
  itemId: id,
  quantity,
  unitCost: money,
  sellingPrice: money,
});

export const restockSchema = z
  .object({
    supplierId: id,
    items: z.array(restockLineSchema).min(1, "Add at least one item."),
    notes: optionalText(1000),
    paymentMethod: z.enum(["CASH", "CHEQUE", "MIXED"]).default("CASH"),
    /** Cash portion. For CHEQUE this must be 0. */
    amountPaid: money.default(0),
    chequeAmount: money.default(0),
    chequeNumber: optionalText(64),
    bankName: optionalText(100),
    chequeDate: optionalDate,
  })
  .superRefine((val, ctx) => {
    const needsCheque =
      val.paymentMethod === "CHEQUE" || val.paymentMethod === "MIXED";

    if (needsCheque) {
      if (!val.chequeNumber)
        ctx.addIssue({
          code: "custom",
          path: ["chequeNumber"],
          message: "Cheque number is required.",
        });
      if (!val.bankName)
        ctx.addIssue({
          code: "custom",
          path: ["bankName"],
          message: "Bank name is required.",
        });
      if (!val.chequeDate || Number.isNaN(Date.parse(val.chequeDate)))
        ctx.addIssue({
          code: "custom",
          path: ["chequeDate"],
          message: "A valid cheque date is required.",
        });
      if (val.chequeAmount <= 0)
        ctx.addIssue({
          code: "custom",
          path: ["chequeAmount"],
          message: "Cheque amount must be greater than zero.",
        });
    }

    if (val.paymentMethod === "CHEQUE" && val.amountPaid > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amountPaid"],
        message: "A cheque-only payment cannot include cash.",
      });
    }
  });

export const settleCustomerSchema = z.object({
  customerId: id,
  amount: money.refine((v) => v > 0, "Amount must be greater than zero."),
});

export const settleSupplierSchema = z.object({
  supplierId: id,
  amount: money.refine((v) => v > 0, "Amount must be greater than zero."),
});

export const chequePassSchema = z.object({
  chequeId: id,
  passedDate: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "A valid date is required."),
});

export const chequeReturnSchema = z.object({ chequeId: id });

export const chequeByDateQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "A valid date is required."),
});

// ─────────────────────────────────────────────
//  Users
// ─────────────────────────────────────────────

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters.")
    .max(200, "Password is too long."),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
});

export const userUpdateSchema = z.object({
  id,
  name: z.string().trim().min(1, "Name is required.").max(200).optional(),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
  isActive: z.boolean().optional(),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters.")
    .max(200)
    .optional(),
});

// ─────────────────────────────────────────────
//  Reports
// ─────────────────────────────────────────────

export const reportsQuerySchema = z.object({
  range: z.enum(["today", "week", "month", "year"]).default("today"),
  stockRange: z.enum(["today", "week", "month", "year"]).default("today"),
  supplierId: optionalId,
  chequeSearch: z.string().trim().max(100).optional().default(""),
  chequeDate: z.string().trim().optional().default(""),
  page: z.coerce.number().int().positive().max(100_000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
