"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  onCancel: () => void;
};

export default function AddItemForm({
  onCancel,
}: Props) {

  const router = useRouter();

  const [loading, setLoading] =
    useState(false);

  const [selectedCategory, setSelectedCategory] =
    useState("General");

  const [customCategory, setCustomCategory] =
    useState("");

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {

    e.preventDefault();

    setLoading(true);

    const formData =
      new FormData(
        e.currentTarget
      );

    // CATEGORY LOGIC

    let finalCategory =
      selectedCategory;

    if (
      selectedCategory ===
      "CUSTOM"
    ) {

      finalCategory =
        customCategory.trim() ||
        "General";
    }

    // FALLBACK

    if (!finalCategory) {
      finalCategory =
        "General";
    }

    const data = {

      barcode:
        formData.get("barcode"),

      name:
        formData.get("name"),

      description:
        formData.get("description"),

      category:
        finalCategory,

      unit:
        formData.get("unit"),

      reorderLevel: Number(
        formData.get(
          "reorderLevel"
        )
      ),

      // TEMPORARY DEFAULTS
      // (Needed until full FIFO migration)

      buyingPrice: 0,

      sellingPrice: 0,
    };

    try {

      const response =
        await fetch(
          "/api/items",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                data
              ),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {

        throw new Error(
          result.error ||
          "Failed to add item"
        );
      }

      alert(
        "✅ Item successfully registered!"
      );

      router.refresh();

      onCancel();

    } catch (error: any) {

      alert(
        `❌ Error: ${error.message}`
      );

    } finally {

      setLoading(false);
    }
  };

  return (

    <div className="bg-white p-6 rounded-lg shadow-sm border">

      {/* HEADER */}

      <div className="flex justify-between items-center mb-6">

        <div>

          <h2 className="text-2xl font-bold text-gray-800">
            Register New Product
          </h2>

          <p className="text-gray-500 text-sm mt-1">
            Add new inventory items to the catalog.
          </p>

        </div>

        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-800 font-medium"
        >
          Cancel
        </button>

      </div>

      {/* FORM */}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 md:grid-cols-2 gap-5"
      >

        {/* ITEM NAME */}

        <div>

          <label className="block text-sm font-medium text-gray-700">
            Item Name *
          </label>

          <input
            name="name"
            required
            className="w-full border p-3 rounded-md mt-1"
            placeholder="e.g. Makita 18V Drill"
          />

        </div>

        {/* BARCODE */}

        <div>

          <label className="block text-sm font-medium text-gray-700">
            Barcode / SKU *
          </label>

          <input
            name="barcode"
            required
            className="w-full border p-3 rounded-md mt-1"
            placeholder="e.g. MAK-001"
          />

        </div>

        {/* CATEGORY */}

        <div>

          <label className="block text-sm font-medium text-gray-700">
            Category
          </label>

          <select
            value={selectedCategory}
            onChange={(e) =>
              setSelectedCategory(
                e.target.value
              )
            }
            className="w-full border p-3 rounded-md mt-1"
          >

            <option value="General">
              General
            </option>

            <option value="Paint">
              Paint
            </option>

            <option value="Tools">
              Tools
            </option>

            <option value="Electrical">
              Electrical
            </option>

            <option value="Plumbing">
              Plumbing
            </option>

            <option value="CUSTOM">
              + Add New Category
            </option>

          </select>

        </div>

        {/* CUSTOM CATEGORY */}

        {selectedCategory ===
          "CUSTOM" && (

          <div>

            <label className="block text-sm font-medium text-gray-700">
              New Category Name
            </label>

            <input
              value={customCategory}
              onChange={(e) =>
                setCustomCategory(
                  e.target.value
                )
              }
              className="w-full border p-3 rounded-md mt-1"
              placeholder="Enter new category"
            />

          </div>
        )}

        {/* UNIT */}

        <div>

          <label className="block text-sm font-medium text-gray-700">
            Unit of Measure
          </label>

          <select
            name="unit"
            className="w-full border p-3 rounded-md mt-1"
          >

            <option value="pcs">
              Pieces (pcs)
            </option>

            <option value="kg">
              Kilograms (kg)
            </option>

            <option value="meters">
              Meters (m)
            </option>

            <option value="liters">
              Liters (L)
            </option>

            <option value="bags">
              Bags
            </option>

          </select>

        </div>

        {/* REORDER LEVEL */}

        <div>

          <label className="block text-sm font-medium text-gray-700">
            Low Stock Alert Level
          </label>

          <input
            name="reorderLevel"
            type="number"
            defaultValue="5"
            className="w-full border p-3 rounded-md mt-1"
          />

        </div>

        {/* DESCRIPTION */}

        <div className="md:col-span-2">

          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>

          <input
            name="description"
            className="w-full border p-3 rounded-md mt-1"
          />

        </div>

        {/* SUBMIT */}

        <div className="md:col-span-2 mt-3">

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 transition disabled:opacity-50 font-medium"
          >

            {loading
              ? "Saving..."
              : "Save to Catalog"}

          </button>

        </div>

      </form>
    </div>
  );
}