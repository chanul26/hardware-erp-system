"use client";

import { useState } from "react";

type Props = {
  item: any;
};

export default function MixingButton({
  item,
}: Props) {

  const [isOpen, setIsOpen] =
    useState(false);

  const [quantity, setQuantity] =
    useState(1);

  const [note, setNote] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  // PURPOSES LIST

  const [purposes, setPurposes] =
    useState([
      "Machine 1",
      "Machine 2",
      "Machine 3",
      "Manual Mixing",
    ]);

  const [purpose, setPurpose] =
    useState("");

  const handlePurposeChange =
    (
      value: string
    ) => {

      // ADD NEW PURPOSE

      if (
        value === "__add_new__"
      ) {

        const newPurpose =
          prompt(
            "Enter new purpose"
          );

        if (
          newPurpose &&
          newPurpose.trim() !== ""
        ) {

          const cleanPurpose =
            newPurpose.trim();

          // ADD TO LIST

          setPurposes((prev) => [
            ...prev,
            cleanPurpose,
          ]);

          // AUTO SELECT

          setPurpose(
            cleanPurpose
          );
        }

        return;
      }

      setPurpose(value);
    };

  const handleMixing =
    async () => {

      try {

        if (
          quantity <= 0
        ) {

          alert(
            "Quantity must be greater than 0"
          );

          return;
        }

        if (
          quantity >
          item.stockQty
        ) {

          alert(
            `Only ${item.stockQty} ${item.unit} available in stock`
          );

          return;
        }

        if (!purpose) {

          alert(
            "Please select a purpose"
          );

          return;
        }

        setLoading(true);

        const response =
          await fetch(
            "/api/items/mixing",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({

                itemId: item.id,

                quantity,

                note,

                purpose,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {

          alert(
            data.error ||
              "Failed to process mixing"
          );

          return;
        }

        alert(
          "✅ Stock reduced for mixing"
        );

        setIsOpen(false);

        window.location.reload();

      } catch (error) {

        console.error(error);

        alert(
          "❌ Something went wrong"
        );

      } finally {

        setLoading(false);
      }
    };

  return (
    <>
      {/* BUTTON */}

      <button
        onClick={() =>
          setIsOpen(true)
        }
        className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded text-xs"
      >
        Use for Mixing
      </button>

      {/* MODAL */}

      {isOpen && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">

            <h2 className="text-xl font-bold mb-4">
              Use Item for Mixing
            </h2>

            <div className="space-y-4">

              {/* ITEM */}

              <div>

                <p className="text-sm text-gray-500">
                  Item
                </p>

                <p className="font-semibold">
                  {item.name}
                </p>

                <p className="text-sm text-gray-500 mt-1">
                  Available Stock: {item.stockQty} {item.unit}
                </p>

              </div>

              {/* QUANTITY */}

              <div>

                <label className="block text-sm font-medium mb-1">
                  Quantity
                </label>

                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className="w-full border rounded-lg p-2"
                />

              </div>

              {/* PURPOSE */}

              <div>

                <label className="block text-sm font-medium mb-1">
                  Purpose
                </label>

                <select
                  value={purpose}
                  onChange={(e) =>
                    handlePurposeChange(
                      e.target.value
                    )
                  }
                  className="w-full border rounded-lg p-2"
                >

                  <option value="">
                    Select purpose
                  </option>

                  {purposes.map(
                    (p) => (

                    <option
                      key={p}
                      value={p}
                    >
                      {p}
                    </option>
                  ))}

                  <option value="__add_new__">
                    + Add New Purpose
                  </option>

                </select>

              </div>

              {/* NOTE */}

              <div>

                <label className="block text-sm font-medium mb-1">
                  Note
                </label>

                <textarea
                  value={note}
                  onChange={(e) =>
                    setNote(
                      e.target.value
                    )
                  }
                  placeholder="Optional note..."
                  className="w-full border rounded-lg p-2"
                />

              </div>

              {/* ACTIONS */}

              <div className="flex justify-end gap-2 pt-2">

                <button
                  onClick={() =>
                    setIsOpen(false)
                  }
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>

                <button
                  onClick={
                    handleMixing
                  }
                  disabled={loading}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50"
                >

                  {loading
                    ? "Processing..."
                    : "Confirm Mixing"}

                </button>

              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}