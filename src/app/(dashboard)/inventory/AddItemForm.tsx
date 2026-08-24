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

  const [error, setError] =
    useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] =
    useState("General");

  const [customCategory, setCustomCategory] =
    useState("");

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {

    e.preventDefault();

    setLoading(true);

    setError(null);

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

      buyingPrice: Number(
        formData.get("buyingPrice") || 0
      ),

      sellingPrice: Number(
        formData.get("sellingPrice") || 0
      ),
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

        // Surface per-field validation messages, not just a generic failure.
        const detail = result.details
          ? Object.values(
              result.details as Record<string, string[]>
            )
              .flat()
              .join(" ")
          : "";

        throw new Error(
          detail ||
          result.error ||
          "Failed to add item"
        );
      }

      router.refresh();

      onCancel();

    } catch (error: any) {

      setError(
        error instanceof Error
          ? error.message
          : "Failed to add item"
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

      {error && (
        <div className="mb-5 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

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

        {/* PRICING
            These inputs replace hardcoded zeros. A product registered with no
            price could not be sold until it had been through a restock, and
            the below-cost guard had nothing to compare against. */}

        <div>

          <label
            htmlFor="buyingPrice"
            className="block text-sm font-medium text-gray-700"
          >
            Buying Price (Rs.)
          </label>

          <input
            id="buyingPrice"
            name="buyingPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className="w-full border p-3 rounded-md mt-1"
          />

          <p className="text-xs text-gray-500 mt-1">
            Updated automatically on each delivery.
          </p>

        </div>

        <div>

          <label
            htmlFor="sellingPrice"
            className="block text-sm font-medium text-gray-700"
          >
            Selling Price (Rs.)
          </label>

          <input
            id="sellingPrice"
            name="sellingPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className="w-full border p-3 rounded-md mt-1"
          />

          <p className="text-xs text-gray-500 mt-1">
            Must be at or above the buying price.
          </p>

        </div>

        {/* DESCRIPTION */}

        <div className="md:col-span-2">

          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700"
          >
            Description
          </label>

          <input
            id="description"
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