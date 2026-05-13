"use client";

import { useMemo, useState } from "react";

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
};

type Props = {
  items?: Item[];
};

export default function InventoryTable({
  items,
}: Props) {

  const [search, setSearch] =
    useState("");

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
                  colSpan={8}
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