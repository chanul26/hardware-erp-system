"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, DollarSign, TrendingDown, Users } from "lucide-react";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);

    fetch("/api/reports")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            res.status === 401
              ? "Your session has expired. Please sign in again."
              : json.error || "Could not load analytics."
          );
        }
        return json;
      })
      .then((json) => setData(json.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return <div className="p-6 flex justify-center text-gray-500">Loading Business Analytics...</div>;
  }

  // Previously the render fell through to `data.todayRevenue` with data === null
  // whenever the fetch failed, throwing and leaving a blank page.
  if (error || !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h2 className="font-bold text-lg text-foreground">Could not load the dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {error ?? "No data was returned."}
          </p>
          <button
            onClick={load}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Business Overview</h1>
        <p className="text-gray-500 mt-1">Live analytics and financial health.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm border-l-4 border-l-green-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Today&apos;s Cash In</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">Rs. {data.todayRevenue.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-lg"><DollarSign className="w-5 h-5" /></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm border-l-4 border-l-red-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Outstanding Debt</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">Rs. {data.outstandingDebt.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-lg"><TrendingDown className="w-5 h-5" /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="text-orange-500" />
            <h3 className="font-bold text-lg">Critical Low Stock Alerts</h3>
          </div>
          <div className="space-y-4">
            {data.lowStockItems.length === 0 ? (
              <p className="text-gray-500 text-sm">All inventory levels are healthy.</p>
            ) : (
              data.lowStockItems.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center border-b pb-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.barcode}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600">{item.stockQty} {item.unit}</p>
                    <p className="text-[10px] text-gray-400">Reorder at: {item.reorderLevel}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Debtors */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="text-blue-500" />
            <h3 className="font-bold text-lg">Largest Debtors (Credit Given)</h3>
          </div>
          <div className="space-y-4">
            {data.topDebtors.length === 0 ? (
              <p className="text-gray-500 text-sm">No customers currently owe money. Great job!</p>
            ) : (
              data.topDebtors.map((debtor: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center border-b pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                      {debtor.name.charAt(0)}
                    </div>
                    <p className="font-medium">{debtor.name}</p>
                  </div>
                  <p className="font-bold text-red-600">Rs. {debtor.amount.toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}