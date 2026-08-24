"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Props = {
  item: {
    id: string;
    name: string;
    unit: string;
    stockQty: number;
  };
  /**
   * Purposes already used in the movement history, plus the standing defaults.
   * Sourced from the database so a purpose added here reappears next time —
   * previously "+ Add New Purpose" only touched local state and was lost on
   * reload.
   */
  knownPurposes: string[];
};

export default function MixingButton({ item, knownPurposes }: Props) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [customPurpose, setCustomPurpose] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usingCustom = purpose === "__custom__";
  const effectivePurpose = usingCustom ? customPurpose.trim() : purpose;
  const parsedQty = parseFloat(quantity);

  const reset = () => {
    setQuantity("1");
    setPurpose("");
    setCustomPurpose("");
    setNote("");
    setError(null);
  };

  const handleMixing = async () => {
    setError(null);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }

    if (parsedQty > item.stockQty) {
      setError(`Only ${item.stockQty} ${item.unit} available in stock.`);
      return;
    }

    if (!effectivePurpose) {
      setError("Select or enter a purpose.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/items/mixing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          quantity: parsedQty,
          purpose: effectivePurpose,
          note,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Could not record the mixing.");
      }

      setIsOpen(false);
      reset();
      // Re-render the server component instead of a full page reload.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded text-xs"
      >
        Use for Mixing
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Use item for mixing"
        >
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">Use Item for Mixing</h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Item</p>
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Available: {item.stockQty} {item.unit}
                </p>
              </div>

              <div>
                <label
                  htmlFor="mixing-qty"
                  className="block text-sm font-medium mb-1"
                >
                  Quantity ({item.unit})
                </label>
                <input
                  id="mixing-qty"
                  type="number"
                  step="any"
                  min="0"
                  max={item.stockQty}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full border rounded-lg p-2"
                />
              </div>

              <div>
                <label
                  htmlFor="mixing-purpose"
                  className="block text-sm font-medium mb-1"
                >
                  Purpose
                </label>
                <select
                  id="mixing-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="">Select purpose</option>
                  {knownPurposes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="__custom__">+ Add new purpose</option>
                </select>

                {usingCustom && (
                  <input
                    type="text"
                    autoFocus
                    value={customPurpose}
                    onChange={(e) => setCustomPurpose(e.target.value)}
                    placeholder="Name the new purpose"
                    className="w-full border rounded-lg p-2 mt-2"
                  />
                )}
              </div>

              <div>
                <label
                  htmlFor="mixing-note"
                  className="block text-sm font-medium mb-1"
                >
                  Note
                </label>
                <textarea
                  id="mixing-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note..."
                  className="w-full border rounded-lg p-2"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 font-medium">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    reset();
                  }}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>

                <button
                  onClick={handleMixing}
                  disabled={loading}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? "Processing..." : "Confirm Mixing"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
