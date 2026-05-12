"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddItemForm() {

  const router = useRouter();

  const [isOpen, setIsOpen] =
    useState(false);

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
      finalCategory = "General";
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
        formData.get(
          "buyingPrice"
        )
      ),

      sellingPrice: Number(
        formData.get(
          "sellingPrice"
        )
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
        throw new Error(
          result.error ||
            "Failed to add item"
        );
      }

      alert(
        "✅ Item successfully registered!"
      );

      setIsOpen(false);

      router.refresh();

    } catch (error: any) {

      alert(
        `❌ Error: ${error.message}`
      );

    } finally {

      setLoading(false);
    }
  };

  // CLOSED BUTTON

  if (!isOpen) {
    return (
      <button
        onClick={() =>
          setIsOpen(true)
        }
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
      >
        + Register New Item
      </button>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">

      <div className="flex justify-between items-center mb-4">

        <h2 className="text-xl font-bold text-gray-800">
          Register New Product
        </h2>

        <button
          onClick={() =>
            setIsOpen(false)
          }
          className="text-gray-500 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >

        {/* ITEM NAME */}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Item Name *
          </label>

          <input
            name="name"
            required
            className="w-full border p-2 rounded-md mt-1"
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
            className="w-full border p-2 rounded-md mt-1"
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
            className="w-full border p-2 rounded-md mt-1"
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
              className="w-full border p-2 rounded-md mt-1"
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
            className="w-full border p-2 rounded-md mt-1"
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

        {/* BUYING PRICE */}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Buying Price (Rs.) *
          </label>

          <input
            name="buyingPrice"
            type="number"
            step="0.01"
            required
            className="w-full border p-2 rounded-md mt-1"
          />
        </div>

        {/* SELLING PRICE */}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Selling Price (Rs.) *
          </label>

          <input
            name="sellingPrice"
            type="number"
            step="0.01"
            required
            className="w-full border p-2 rounded-md mt-1"
          />
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
            className="w-full border p-2 rounded-md mt-1"
          />
        </div>

        {/* DESCRIPTION */}

        <div className="md:col-span-2">

          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>

          <input
            name="description"
            className="w-full border p-2 rounded-md mt-1"
          />
        </div>

        {/* SUBMIT */}

        <div className="md:col-span-2 mt-2">

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 transition disabled:opacity-50"
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