"use client";

import {
  useEffect,
  useState,
} from "react";

type ReportData = {
  lowStockItems: {
    id: string;

    name: string;

    stockQty: number;

    reorderLevel: number;
  }[];
};

export default function LowStockPage() {
  const [report, setReport] =
    useState<ReportData | null>(null);

  // LOAD REPORTS

  const loadReports = async () => {
    const res = await fetch(
      "/api/reports"
    );

    const data = await res.json();

    setReport(data.data);
  };

  useEffect(() => {
    loadReports();
  }, []);

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div>
        <h1 className="text-3xl font-bold">
          Low Stock Report
        </h1>

        <p className="text-gray-500 mt-2">
          Monitor items that are
          below reorder level.
        </p>
      </div>

      {/* TABLE */}

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">
                Item Name
              </th>

              <th className="text-left p-4">
                Current Stock
              </th>

              <th className="text-left p-4">
                Reorder Level
              </th>

              <th className="text-left p-4">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {report?.lowStockItems
              ?.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="text-center p-6 text-gray-500"
                >
                  No low stock items
                  found
                </td>
              </tr>
            ) : (
              report?.lowStockItems.map(
                (item) => (
                  <tr
                    key={item.id}
                    className="border-t"
                  >
                    <td className="p-4">
                      {item.name}
                    </td>

                    <td className="p-4">
                      {item.stockQty}
                    </td>

                    <td className="p-4">
                      {
                        item.reorderLevel
                      }
                    </td>

                    <td className="p-4">
                      <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-medium">
                        Low Stock
                      </span>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}