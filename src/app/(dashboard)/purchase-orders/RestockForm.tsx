"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

interface Supplier {
  id: string;
  name: string;
}

interface Item {
  id: string;
  name: string;
}

interface Props {
  suppliers: Supplier[];
  items: Item[];
}

interface BillItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
}

export default function RestockForm({
  suppliers,
  items,
}: Props) {
  // =========================================
  // BILL DETAILS
  // =========================================

  const [billNumber, setBillNumber] =
    useState("");

  const [supplierId, setSupplierId] =
    useState("");

  const [notes, setNotes] = useState("");

  // =========================================
  // ITEM FORM
  // =========================================

  const [selectedItemId, setSelectedItemId] =
    useState("");

  const [quantity, setQuantity] =
    useState("");

  const [unitCost, setUnitCost] =
    useState("");

  // =========================================
  // BILL ITEMS
  // =========================================

  const [billItems, setBillItems] = useState<
    BillItem[]
  >([]);

  // =========================================
  // PAYMENT
  // =========================================

  const [paymentMethod, setPaymentMethod] =
    useState("CASH");

  const [amountPaid, setAmountPaid] =
    useState("");

  const [chequeNumber, setChequeNumber] =
    useState("");

  const [bankName, setBankName] =
    useState("");

  const [chequeDate, setChequeDate] =
    useState("");

  // =========================================
  // CHEQUE POPUP
  // =========================================

  const [showChequePopup, setShowChequePopup] =
    useState(false);

  const [sameDayCheques, setSameDayCheques] =
    useState<any[]>([]);

  const [loadingCheques, setLoadingCheques] =
    useState(false);

  // =========================================
  // LOADING
  // =========================================

  const [loading, setLoading] =
    useState(false);

  // =========================================
  // TOTAL BILL AMOUNT
  // =========================================

  const totalAmount = useMemo(() => {
    return billItems.reduce(
      (sum, item) =>
        sum +
        item.quantity * item.unitCost,
      0
    );
  }, [billItems]);

  // =========================================
  // CHEQUE AMOUNT
  // =========================================

  const chequeAmount =
    paymentMethod === "CHEQUE"
      ? totalAmount -
        Number(amountPaid || 0)
      : 0;

  // =========================================
  // CHECK SAME DAY CHEQUES
  // =========================================

  const checkSameDayCheques =
    async () => {
      if (!chequeDate) return;

      try {
        setLoadingCheques(true);

        const res = await fetch(
          `/api/cheques/by-date?date=${chequeDate}`
        );

        const data = await res.json();

        if (data.success) {
          setSameDayCheques(data.data);
          setShowChequePopup(true);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingCheques(false);
      }
    };

  // =========================================
  // ADD ITEM
  // =========================================

  const handleAddItem = () => {
    if (
      !selectedItemId ||
      !quantity ||
      !unitCost
    ) {
      alert("Please fill all item fields");
      return;
    }

    const selectedItem = items.find(
      (item) => item.id === selectedItemId
    );

    if (!selectedItem) return;

    const newItem: BillItem = {
      itemId: selectedItemId,
      itemName: selectedItem.name,
      quantity: Number(quantity),
      unitCost: Number(unitCost),
    };

    setBillItems((prev) => [
      ...prev,
      newItem,
    ]);

    setSelectedItemId("");
    setQuantity("");
    setUnitCost("");
  };

  // =========================================
  // REMOVE ITEM
  // =========================================

  const handleRemoveItem = (
    index: number
  ) => {
    setBillItems((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  // =========================================
  // SAVE BILL
  // =========================================

  const handleSaveBill = async () => {
    try {
      if (!billNumber) {
        alert("Bill number required");
        return;
      }

      if (!supplierId) {
        alert("Supplier required");
        return;
      }

      if (billItems.length === 0) {
        alert(
          "Please add at least one item"
        );
        return;
      }

      if (
        paymentMethod === "CHEQUE"
      ) {
        if (
          !chequeNumber ||
          !bankName ||
          !chequeDate
        ) {
          alert(
            "Please fill cheque details"
          );
          return;
        }

        if (chequeAmount <= 0) {
          alert(
            "Cheque amount must be greater than 0"
          );
          return;
        }
      }

      setLoading(true);

      const response = await fetch(
        "/api/purchase-orders",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            billNumber,

            supplierId,

            items: billItems,

            paymentMethod,

            amountPaid,

            chequeNumber,

            bankName,

            chequeDate,

            notes,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed"
        );
      }

      alert(
        "Purchase bill saved successfully"
      );

      setBillNumber("");
      setSupplierId("");
      setNotes("");

      setSelectedItemId("");
      setQuantity("");
      setUnitCost("");

      setBillItems([]);

      setPaymentMethod("CASH");
      setAmountPaid("");

      setChequeNumber("");
      setBankName("");
      setChequeDate("");

      setSameDayCheques([]);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-2xl p-8 space-y-8">
      {/* BILL DETAILS */}

      <div>
        <h2 className="text-3xl font-bold mb-6">
          Purchase Bill Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="font-medium block mb-2">
              Supplier Bill Number
            </label>

            <input
              type="text"
              value={billNumber}
              onChange={(e) =>
                setBillNumber(e.target.value)
              }
              placeholder="e.g. INV-2026-001"
              className="w-full border rounded-xl px-4 py-3"
            />
          </div>

          <div>
            <label className="font-medium block mb-2">
              Select Supplier
            </label>

            <select
              value={supplierId}
              onChange={(e) =>
                setSupplierId(
                  e.target.value
                )
              }
              className="w-full border rounded-xl px-4 py-3"
            >
              <option value="">
                -- Choose a Supplier --
              </option>

              {suppliers.map((supplier) => (
                <option
                  key={supplier.id}
                  value={supplier.id}
                >
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ADD ITEMS */}

      <div className="border-t pt-8">
        <h2 className="text-3xl font-bold mb-6">
          Add Items to Bill
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="font-medium block mb-2">
              Select Item
            </label>

            <select
              value={selectedItemId}
              onChange={(e) =>
                setSelectedItemId(
                  e.target.value
                )
              }
              className="w-full border rounded-xl px-4 py-3"
            >
              <option value="">
                -- Choose an Item --
              </option>

              {items.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-medium block mb-2">
              Quantity
            </label>

            <input
              type="number"
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  e.target.value
                )
              }
              placeholder="e.g. 50"
              className="w-full border rounded-xl px-4 py-3"
            />
          </div>

          <div>
            <label className="font-medium block mb-2">
              Unit Cost (Rs.)
            </label>

            <input
              type="number"
              value={unitCost}
              onChange={(e) =>
                setUnitCost(
                  e.target.value
                )
              }
              placeholder="e.g. 1500"
              className="w-full border rounded-xl px-4 py-3"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddItem}
          className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center gap-2"
        >
          <Plus size={18} />
          Add Item
        </button>
      </div>

      {/* ITEM TABLE */}

      <div>
        <h2 className="text-3xl font-bold mb-6">
          Added Items
        </h2>

        <div className="border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-4">
                  Item
                </th>

                <th className="text-left p-4">
                  Qty
                </th>

                <th className="text-left p-4">
                  Unit Cost
                </th>

                <th className="text-left p-4">
                  Total
                </th>

                <th className="text-left p-4">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {billItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center p-8 text-gray-500"
                  >
                    No items added yet
                  </td>
                </tr>
              ) : (
                billItems.map(
                  (item, index) => (
                    <tr
                      key={index}
                      className="border-t"
                    >
                      <td className="p-4">
                        {item.itemName}
                      </td>

                      <td className="p-4">
                        {item.quantity}
                      </td>

                      <td className="p-4">
                        Rs.{" "}
                        {item.unitCost.toFixed(
                          2
                        )}
                      </td>

                      <td className="p-4">
                        Rs.{" "}
                        {(
                          item.quantity *
                          item.unitCost
                        ).toFixed(2)}
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() =>
                            handleRemoveItem(
                              index
                            )
                          }
                          className="text-red-500"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAYMENT */}

      <div className="border-t pt-8">
        <h2 className="text-3xl font-bold mb-6">
          Payment Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="font-medium block mb-2">
              Payment Method
            </label>

            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value
                )
              }
              className="w-full border rounded-xl px-4 py-3"
            >
              <option value="CASH">
                Cash
              </option>

              <option value="CHEQUE">
                Cheque
              </option>
            </select>
          </div>

          <div>
            <label className="font-medium block mb-2">
              Amount Paid By Cash
            </label>

            <input
              type="number"
              value={amountPaid}
              onChange={(e) =>
                setAmountPaid(
                  e.target.value
                )
              }
              placeholder="e.g. 5000"
              className="w-full border rounded-xl px-4 py-3"
            />
          </div>
        </div>

        {paymentMethod === "CHEQUE" && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="font-medium block mb-2">
                  Cheque Number
                </label>

                <input
                  type="text"
                  value={chequeNumber}
                  onChange={(e) =>
                    setChequeNumber(
                      e.target.value
                    )
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="font-medium block mb-2">
                  Bank Name
                </label>

                <input
                  type="text"
                  value={bankName}
                  onChange={(e) =>
                    setBankName(
                      e.target.value
                    )
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />
              </div>

              <div>
                <label className="font-medium block mb-2">
                  Cheque Date
                </label>

                <input
                  type="date"
                  value={chequeDate}
                  onChange={(e) =>
                    setChequeDate(
                      e.target.value
                    )
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />

                {chequeDate && (
                  <button
                    type="button"
                    onClick={
                      checkSameDayCheques
                    }
                    className="text-sm text-blue-600 mt-2 hover:underline"
                  >
                    {loadingCheques
                      ? "Checking..."
                      : "See other pending cheques on this day"}
                  </button>
                )}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-2">
                Cheque Amount
              </h2>

              <p className="text-4xl font-bold text-yellow-700">
                Rs.{" "}
                {chequeAmount.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* TOTAL */}

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-2">
          Total Bill Amount
        </h2>

        <p className="text-4xl font-bold text-blue-700">
          Rs. {totalAmount.toFixed(2)}
        </p>
      </div>

      {/* NOTES */}

      <div>
        <label className="font-medium block mb-2">
          Notes
        </label>

        <textarea
          value={notes}
          onChange={(e) =>
            setNotes(e.target.value)
          }
          rows={4}
          className="w-full border rounded-xl px-4 py-3"
        />
      </div>

      {/* SAVE */}

      <button
        onClick={handleSaveBill}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-lg font-semibold"
      >
        {loading
          ? "Saving..."
          : "Save Purchase Bill"}
      </button>

      {/* POPUP */}

      {showChequePopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                Pending Cheques
              </h2>

              <button
                onClick={() =>
                  setShowChequePopup(false)
                }
                className="text-gray-500"
              >
                ✕
              </button>
            </div>

            {sameDayCheques.length ===
            0 ? (
              <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg">
                There are no other cheques on this day.
                You are safe.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {sameDayCheques.map(
                  (cheque: any) => (
                    <div
                      key={cheque.id}
                      className="border rounded-lg p-3"
                    >
                      <p className="font-semibold">
                        {
                          cheque
                            .supplierPayment
                            ?.supplier?.name
                        }
                      </p>

                      <p className="text-sm text-gray-600">
                        Cheque Amount:
                        <span className="font-medium ml-2">
                          Rs.
                          {Number(
                            cheque.amount
                          ).toLocaleString()}
                        </span>
                      </p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}