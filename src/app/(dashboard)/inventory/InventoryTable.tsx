"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";

import MixingButton from "./MixingButton";

type Item = {
  id: string;
  barcode: string;
  name: string;
  category: string | null;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  buyingPrice: any;
  sellingPrice: any;
  warrantyEligible?: boolean;
  defaultWarrantyMonths?: number | null;
  requiresSerial?: boolean;
};

type Props = {
  items?: Item[];
};

export default function InventoryTable({
  items,
}: Props) {

  const router = useRouter();

  const [search, setSearch] =
    useState("");

  const [savingId, setSavingId] =
    useState<string | null>(null);

  // TOGGLE WARRANTY ELIGIBILITY
  //
  // Turning this off only stops NEW warranties being issued. Warranties
  // already given to customers are untouched.

  const toggleWarranty = async (
    item: Item
  ) => {

    const enabling =
      !item.warrantyEligible;

    if (
      !enabling &&
      !confirm(
        `Stop offering warranty on "${item.name}"?\n\nWarranties already issued to customers stay valid.`
      )
    ) {
      return;
    }

    setSavingId(item.id);

    try {

      const res = await fetch(
        `/api/items/${item.id}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            warrantyEligible:
              enabling,

            defaultWarrantyMonths:
              enabling
                ? item.defaultWarrantyMonths ??
                  12
                : null,
          }),
        }
      );

      const json =
        await res.json();

      if (!res.ok) {
        throw new Error(
          json.error
        );
      }

      router.refresh();

    } catch (error: any) {

      alert(
        `Failed to update warranty setting: ${error.message}`
      );

    } finally {

      setSavingId(null);
    }
  };

  const filteredItems =
    useMemo(() => {

      return (items || []).filter((item) => {

        const searchText =
          search.toLowerCase();

        return (

          item.name
            .toLowerCase()
            .includes(searchText) ||

          item.barcode
            .toLowerCase()
            .includes(searchText) ||

          item.category
            ?.toLowerCase()
            .includes(searchText)

        );
      });

    }, [items, search]);

  return (
    <div>

      {/* SEARCH BAR */}

      <div className="bg-white border shadow-sm rounded-lg p-4 mb-5">

        <div className="flex flex-col md:flex-row gap-4">

          <div className="flex-1">

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Product / Barcode
            </label>

            <input
              type="text"
              value={search}
              autoFocus
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Type product name or scan barcode..."
              className="w-full border rounded-md p-3 text-sm"
            />

            <p className="text-xs text-gray-500 mt-1">
              Barcode scanners and phone scanners work automatically here.
            </p>

          </div>

        </div>
      </div>

      {/* TABLE */}

      <div className="bg-white shadow-sm border rounded-lg overflow-x-auto">

        <table className="min-w-full text-sm text-left border-collapse">

          <thead>

            <tr className="bg-gray-50 border-b">

              <th className="p-3 font-semibold text-gray-600">
                Product
              </th>

              <th className="p-3 font-semibold text-gray-600">
                Barcode
              </th>

              <th className="p-3 font-semibold text-gray-600">
                Category
              </th>

              <th className="p-3 font-semibold text-gray-600 text-right">
                Buy
              </th>

              <th className="p-3 font-semibold text-gray-600 text-right">
                Sell
              </th>

              <th className="p-3 font-semibold text-gray-600 text-right">
                Stock
              </th>

              <th className="p-3 font-semibold text-gray-600 text-center">
                Status
              </th>

              <th className="p-3 font-semibold text-gray-600 text-center">
                Warranty
              </th>

              <th className="p-3 font-semibold text-gray-600 text-center">
                Action
              </th>

            </tr>

          </thead>

          <tbody className="divide-y">

            {filteredItems.map((item) => (

              <tr
                key={item.id}
                className="hover:bg-gray-50 transition"
              >

                {/* PRODUCT */}

                <td className="p-3 font-medium text-gray-900 max-w-[220px]">
                  {item.name}
                </td>

                {/* BARCODE */}

                <td className="p-3 text-gray-500 text-xs whitespace-nowrap">
                  {item.barcode}
                </td>

                {/* CATEGORY */}

                <td className="p-3 text-gray-500">

                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                    {item.category || "General"}
                  </span>

                </td>

                {/* BUY PRICE */}

                <td className="p-3 text-right text-gray-700 whitespace-nowrap">
                  Rs. {Number(
                    item.buyingPrice
                  ).toFixed(2)}
                </td>

                {/* SELL PRICE */}

                <td className="p-3 text-right font-medium whitespace-nowrap">
                  Rs. {Number(
                    item.sellingPrice
                  ).toFixed(2)}
                </td>

                {/* STOCK */}

                <td className="p-3 text-right font-bold text-gray-800 whitespace-nowrap">
                  {item.stockQty} {item.unit}
                </td>

                {/* STATUS */}

                <td className="p-3 text-center">

                  {item.stockQty <=
                  item.reorderLevel ? (

                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">
                      Low
                    </span>

                  ) : (

                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">
                      In
                    </span>

                  )}

                </td>

                {/* WARRANTY */}

                <td className="p-3 text-center">

                  <button
                    type="button"
                    onClick={() =>
                      toggleWarranty(
                        item
                      )
                    }
                    disabled={
                      savingId ===
                      item.id
                    }
                    title={
                      item.warrantyEligible
                        ? "Warranty offered on this product — click to stop"
                        : "No warranty on this product — click to enable"
                    }
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition disabled:opacity-50 ${
                      item.warrantyEligible
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >

                    {item.warrantyEligible ? (

                      <>
                        <ShieldCheck className="h-3 w-3" />
                        {item.defaultWarrantyMonths
                          ? `${item.defaultWarrantyMonths} mo`
                          : "Yes"}
                      </>

                    ) : (

                      <>
                        <ShieldOff className="h-3 w-3" />
                        None
                      </>

                    )}

                  </button>

                </td>

                {/* ACTION */}

                <td className="p-3 text-center">

                  {item.category
                    ?.toLowerCase()
                    .includes("paint") && (

                    <MixingButton
                      item={item}
                    />

                  )}

                </td>

              </tr>
            ))}

            {filteredItems.length === 0 && (

              <tr>

                <td
                  colSpan={9}
                  className="p-8 text-center text-gray-500"
                >
                  No matching items found.
                </td>

              </tr>
            )}

          </tbody>

        </table>
      </div>
    </div>
  );
}