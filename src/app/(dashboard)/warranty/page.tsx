import WarrantyClient from "./WarrantyClient";

export const dynamic = "force-dynamic";

export default function WarrantyPage() {

  return (
    <div className="p-6 max-w-6xl mx-auto">

      <div className="mb-8">

        <h1 className="text-3xl font-bold text-gray-900">
          Warranty & Claims
        </h1>

        <p className="text-gray-500 mt-2">
          Check whether an item is still under warranty, and track claims from the
          customer through to the supplier.
        </p>

      </div>

      <WarrantyClient />

    </div>
  );
}
