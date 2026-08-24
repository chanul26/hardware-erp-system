"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import MixingButton from "./MixingButton";

export type Item = {
  id: string;
  barcode: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  buyingPrice: number;
  sellingPrice: number;
  warrantyEligible: boolean;
  defaultWarrantyMonths: number | null;
  requiresSerial: boolean;
};

type Props = {
  items?: Item[];
  purposes: string[];
};

export default function InventoryTable({ items, purposes }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  /**
   * Quick on/off for warranty eligibility, without opening the editor.
   *
   * Turning it off only stops NEW warranties being issued — warranties already
   * given to customers are untouched, and their claims still work.
   */
  const toggleWarranty = async (item: Item) => {
    const enabling = !item.warrantyEligible;

    if (
      !enabling &&
      !confirm(
        `Stop offering warranty on "${item.name}"?\n\nWarranties already issued to customers stay valid — this only affects future sales.`
      )
    ) {
      return;
    }

    setTogglingId(item.id);
    setError(null);

    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          description: item.description ?? "",
          category: item.category ?? "",
          unit: item.unit,
          reorderLevel: item.reorderLevel,
          sellingPrice: item.sellingPrice,
          warrantyEligible: enabling,
          defaultWarrantyMonths: enabling
            ? (item.defaultWarrantyMonths ?? 12)
            : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update warranty.");

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update warranty setting."
      );
    } finally {
      setTogglingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items ?? [];

    return (items ?? []).filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.barcode.toLowerCase().includes(needle) ||
        item.category?.toLowerCase().includes(needle)
    );
  }, [items, search]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;

    setSaving(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          category: String(form.get("category") ?? ""),
          unit: String(form.get("unit") ?? ""),
          reorderLevel: Number(form.get("reorderLevel") ?? 0),
          sellingPrice: Number(form.get("sellingPrice") ?? 0),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const detail = json.details
          ? Object.values(json.details as Record<string, string[]>)
              .flat()
              .join(" ")
          : "";
        throw new Error(detail || json.error || "Could not save the item.");
      }

      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="bg-white border shadow-sm rounded-lg p-4 mb-5">
        <label
          htmlFor="inventory-search"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Search product / barcode
        </label>
        <input
          id="inventory-search"
          type="text"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type product name or scan barcode..."
          className="w-full border rounded-md p-3 text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          Barcode scanners and phone scanners work automatically here.
        </p>
      </div>

      <div className="bg-white shadow-sm border rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th scope="col" className="p-3 font-semibold text-gray-600">Product</th>
              <th scope="col" className="p-3 font-semibold text-gray-600">Barcode</th>
              <th scope="col" className="p-3 font-semibold text-gray-600">Category</th>
              <th scope="col" className="p-3 font-semibold text-gray-600 text-right">Buy</th>
              <th scope="col" className="p-3 font-semibold text-gray-600 text-right">Sell</th>
              <th scope="col" className="p-3 font-semibold text-gray-600 text-right">Stock</th>
              <th scope="col" className="p-3 font-semibold text-gray-600 text-center">Status</th>
              <th scope="col" className="p-3 font-semibold text-gray-600 text-center">Warranty</th>
              <th scope="col" className="p-3 font-semibold text-gray-600 text-center">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition">
                <td className="p-3 font-medium text-gray-900 max-w-[220px]">
                  {item.name}
                </td>
                <td className="p-3 text-gray-500 text-xs whitespace-nowrap">
                  {item.barcode}
                </td>
                <td className="p-3 text-gray-500">
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                    {item.category || "General"}
                  </span>
                </td>
                <td className="p-3 text-right text-gray-700 whitespace-nowrap">
                  Rs. {item.buyingPrice.toFixed(2)}
                </td>
                <td className="p-3 text-right font-medium whitespace-nowrap">
                  Rs. {item.sellingPrice.toFixed(2)}
                </td>
                <td className="p-3 text-right font-bold text-gray-800 whitespace-nowrap">
                  {item.stockQty} {item.unit}
                </td>
                <td className="p-3 text-center">
                  {item.stockQty <= item.reorderLevel ? (
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">
                      Low
                    </span>
                  ) : (
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">
                      In
                    </span>
                  )}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => toggleWarranty(item)}
                    disabled={togglingId === item.id}
                    title={
                      item.warrantyEligible
                        ? `Warranty offered${item.defaultWarrantyMonths ? ` — default ${item.defaultWarrantyMonths} months` : ""}`
                        : "No warranty offered on this product"
                    }
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                      item.warrantyEligible
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {togglingId === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : item.warrantyEligible ? (
                      <ShieldCheck className="h-3 w-3" />
                    ) : (
                      <ShieldOff className="h-3 w-3" />
                    )}
                    {item.warrantyEligible
                      ? `${item.defaultWarrantyMonths ?? 12} mo`
                      : "None"}
                  </button>
                </td>

                <td className="p-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setEditing(item);
                        setError(null);
                      }}
                      className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1 rounded text-xs font-medium"
                    >
                      Edit
                    </button>

                    {item.category?.toLowerCase().includes("paint") && (
                      <MixingButton item={item} knownPurposes={purposes} />
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-500">
                  {search
                    ? "No items match that search."
                    : "No items yet. Register your first product to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal. Barcode and buying price are intentionally not editable:
          the barcode identifies the physical label, and cost comes from the
          purchase batches rather than from typing. */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${editing.name}`}
        >
          <form
            onSubmit={handleSave}
            className="bg-white rounded-xl w-full max-w-lg shadow-xl"
          >
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold text-gray-900">Edit product</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {editing.barcode} · cost Rs. {editing.buyingPrice.toFixed(2)}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Item name
                </label>
                <input
                  id="edit-name"
                  name="name"
                  required
                  defaultValue={editing.name}
                  className="w-full border p-2.5 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-category" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <input
                    id="edit-category"
                    name="category"
                    defaultValue={editing.category ?? ""}
                    className="w-full border p-2.5 rounded-md"
                  />
                </div>

                <div>
                  <label htmlFor="edit-unit" className="block text-sm font-medium text-gray-700 mb-1">
                    Unit
                  </label>
                  <input
                    id="edit-unit"
                    name="unit"
                    required
                    defaultValue={editing.unit}
                    className="w-full border p-2.5 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-selling" className="block text-sm font-medium text-gray-700 mb-1">
                    Selling price (Rs.)
                  </label>
                  <input
                    id="edit-selling"
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    defaultValue={editing.sellingPrice}
                    className="w-full border p-2.5 rounded-md"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Must be at least the cost of Rs. {editing.buyingPrice.toFixed(2)}.
                  </p>
                </div>

                <div>
                  <label htmlFor="edit-reorder" className="block text-sm font-medium text-gray-700 mb-1">
                    Reorder level
                  </label>
                  <input
                    id="edit-reorder"
                    name="reorderLevel"
                    type="number"
                    min={0}
                    required
                    defaultValue={editing.reorderLevel}
                    className="w-full border p-2.5 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  name="description"
                  defaultValue={editing.description ?? ""}
                  className="w-full border p-2.5 rounded-md"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 font-medium">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-6 border-t">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded-md font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
