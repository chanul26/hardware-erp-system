"use client";

import { useState } from "react";

import AddItemForm from "./AddItemForm";
import InventoryTable, { type Item } from "./InventoryTable";

type Props = {
  items?: Item[];
  purposes: string[];
};

export default function InventoryClient({
  items = [],
  purposes,
}: Props) {

  const [showForm, setShowForm] =
    useState(false);

  // REGISTER ITEM PAGE

  if (showForm) {

    return (

      <div className="p-6 max-w-7xl mx-auto">

        {/* TOP BAR */}

        <div className="flex justify-between items-center mb-8">

          <div>

            <h1 className="text-3xl font-bold text-gray-900">
              Register New Product
            </h1>

            <p className="text-gray-500 mt-1">
              Add a new product to your inventory catalog.
            </p>

          </div>

          <button
            onClick={() =>
              setShowForm(false)
            }
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-5 py-3 rounded-md font-medium transition"
          >
            ← Back to Inventory
          </button>

        </div>

        {/* FORM ONLY */}

        <div className="max-w-3xl">
          <AddItemForm
            onCancel={() =>
              setShowForm(false)
            }
          />
        </div>

      </div>
    );
  }

  // NORMAL INVENTORY PAGE

  return (

    <div className="p-6 max-w-7xl mx-auto">

      {/* HEADER */}

      <div className="flex justify-between items-center mb-8">

        <div>

          <h1 className="text-3xl font-bold text-gray-900">
            Inventory Catalog
          </h1>

          <p className="text-gray-500 mt-1">
            Manage your product database and track stock levels.
          </p>

        </div>

        <div className="flex gap-3">

          <a
            href="/mixing-history"
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-md font-medium transition"
          >
            🎨 Mixing History
          </a>

          <button
            onClick={() =>
              setShowForm(true)
            }
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-md font-medium transition"
          >
            + Register New Item
          </button>

        </div>

      </div>

      {/* INVENTORY TABLE */}

      <InventoryTable items={items} purposes={purposes} />

    </div>
  );
}