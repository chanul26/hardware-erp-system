-- Database-level guarantees that no application bug can bypass.
-- These are the last line of defence behind the atomic writes in the API layer.

-- Stock can never go negative. This is what makes the concurrent-sale race
-- (two cashiers selling the last unit) fail loudly instead of silently
-- corrupting inventory.
ALTER TABLE "Item"
  ADD CONSTRAINT "Item_stockQty_non_negative" CHECK ("stockQty" >= 0);

ALTER TABLE "Item"
  ADD CONSTRAINT "Item_prices_non_negative"
  CHECK ("buyingPrice" >= 0 AND "sellingPrice" >= 0);

ALTER TABLE "Item"
  ADD CONSTRAINT "Item_reorderLevel_non_negative" CHECK ("reorderLevel" >= 0);

-- A FIFO cost layer can never hold less than nothing, nor more than it started
-- with.
ALTER TABLE "PurchaseBatch"
  ADD CONSTRAINT "PurchaseBatch_remaining_within_bounds"
  CHECK ("remainingQty" >= 0 AND "remainingQty" <= "quantity");

ALTER TABLE "PurchaseBatch"
  ADD CONSTRAINT "PurchaseBatch_quantity_positive" CHECK ("quantity" > 0);

-- Returned quantity cannot exceed what was sold, and cannot be negative.
ALTER TABLE "BillItem"
  ADD CONSTRAINT "BillItem_returnedQty_within_bounds"
  CHECK ("returnedQty" >= 0 AND "returnedQty" <= ABS("quantity"));

-- A sale line must move a non-zero quantity in one direction or the other.
ALTER TABLE "BillItem"
  ADD CONSTRAINT "BillItem_quantity_non_zero" CHECK ("quantity" <> 0);

-- Purchases are always inbound.
ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_receivedQty_within_bounds"
  CHECK ("receivedQty" >= 0 AND "receivedQty" <= "quantity");

-- Amounts paid are never negative; overpayment is caught in application logic
-- because a legitimate credit note can push a single order's ledger around.
ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_amountPaid_non_negative" CHECK ("amountPaid" >= 0);

-- A stock movement that moves nothing is a bug, not a record.
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_quantity_non_zero" CHECK ("quantity" <> 0);

-- Seed the document number counters used for gapless invoice / order numbering.
INSERT INTO "DocumentCounter" ("id", "value") VALUES ('BILL', 0), ('PURCHASE', 0)
  ON CONFLICT ("id") DO NOTHING;
