"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type ReportData = {
  todayRevenue: number;
  outstandingDebt: number;
  lowStockItems: {
    id: string;
    name: string;
    stockQty: number;
    reorderLevel: number;
  }[];
  topDebtors: {
    name: string;
    amount: number;
  }[];
  stockAdditions: {
    id: string;
    quantity: number;
    item: {
      name: string;
    };
    purchaseOrder: {
      createdAt: string;
      supplier: {
        id: string;
        name: string;
      };
    };
  }[];
  chequeReports: {
    id: string;
    chequeNumber: string;
    bank: string;
    amount: number;
    chequeDate: string;
    passedDate: string | null;
    status: string;
    supplierPayment: {
      supplier: {
        name: string;
      };
    };
  }[];
  dailyBills: {
    id: string;
    billNumber: string;
    totalAmount: number;
    createdAt: string;
    customer: {
      name: string;
    } | null;
  }[];
};

type Supplier = {
  id: string;
  name: string;
};

export default function ReportsPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true); // <-- FIX: Added loading state

  // GLOBAL FILTER
  const [range, setRange] = useState("today");

  // STOCK REPORT FILTERS
  const [stockRange, setStockRange] = useState("today");
  const [stockSupplier, setStockSupplier] = useState("");

  // SEARCHES
  const [debtorSearch, setDebtorSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  // CHEQUE FILTERS
  const [chequeSearch, setChequeSearch] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [passedDate, setPassedDate] = useState("");
  const [selectedChequeId, setSelectedChequeId] = useState("");
  const [showPassModal, setShowPassModal] = useState(false);

  // LOAD REPORTS
  const loadReports = async () => {
    setLoading(true); // <-- FIX: Start loading
    const res = await fetch(
      `/api/reports?range=${range}&stockRange=${stockRange}&supplierId=${stockSupplier}&chequeSearch=${chequeSearch}&chequeDate=${chequeDate}`
    );
    const data = await res.json();
    setReport(data.data);
    setLoading(false); // <-- FIX: Stop loading
  };

  // LOAD SUPPLIERS
  const loadSuppliers = async () => {
    const res = await fetch("/api/suppliers");
    const data = await res.json();
    setSuppliers(data.data || []);
  };

  useEffect(() => {
    loadReports();
  }, [range, stockRange, stockSupplier, chequeSearch, chequeDate]);

  useEffect(() => {
    loadSuppliers();
  }, []);

// CHART DATA
const chartData = [
  {
    name: "Revenue",
    amount: report?.todayRevenue || 0,
  },
  {
    name: "Debt",
    amount: report?.outstandingDebt || 0,
  },
];

// FILTERED DEBTORS
const filteredDebtors = useMemo(() => {
  return (
    report?.topDebtors?.filter((debtor) =>
      debtor.name
        .toLowerCase()
        .includes(debtorSearch.toLowerCase())
    ) || []
  );
}, [report, debtorSearch]);

// --- FIX: The Loading Shield ---
if (loading || !report) {
  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>

        <p className="font-medium">
          Loading Business Analytics...
        </p>
      </div>
    </div>
  );
}

  // FILTERED SUPPLIERS
  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  // MARK CHEQUE PASSED
  const markChequePassed = async () => {
    if (!passedDate) {
      alert("Please select passed date");
      return;
    }
    const res = await fetch("/api/cheques/pass", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chequeId: selectedChequeId,
        passedDate,
      }),
    });
    if (res.ok) {
      alert("Cheque marked as cleared");
      setShowPassModal(false);
      setPassedDate("");
      loadReports();
    }
  };

  // MARK CHEQUE RETURNED
  const markChequeReturned = async (chequeId: string) => {
    const confirmed = confirm("Are you sure this cheque was returned?");
    if (!confirmed) return;
    const res = await fetch("/api/cheques/return", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chequeId,
      }),
    });
    if (res.ok) {
      alert("Cheque marked as returned");
      loadReports();
    }
  };

  // EXPORT PDF
  const exportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-3xl font-bold">Reports Dashboard</h1>
        <button
          onClick={exportPDF}
          className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800"
        >
          Export PDF
        </button>
      </div>

      {/* GLOBAL FILTER */}
      <div className="flex flex-wrap gap-4">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="border rounded-lg px-4 py-2"
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-green-500 text-white rounded-2xl p-6 shadow">
          <p className="text-sm">Revenue</p>
          <h2 className="text-3xl font-bold mt-2">Rs. {report.todayRevenue}</h2>
        </div>
        <div className="bg-red-500 text-white rounded-2xl p-6 shadow">
          <p className="text-sm">Outstanding Debt</p>
          <h2 className="text-3xl font-bold mt-2">Rs. {report.outstandingDebt}</h2>
        </div>
        <div className="bg-yellow-400 rounded-2xl p-6 shadow">
          <p className="text-sm">Low Stock Items</p>
          <h2 className="text-3xl font-bold mt-2">{report.lowStockItems.length}</h2>
        </div>
        <div className="bg-blue-500 text-white rounded-2xl p-6 shadow">
          <p className="text-sm">Debtors</p>
          <h2 className="text-3xl font-bold mt-2">{report.topDebtors.length}</h2>
        </div>
      </div>

      {/* FINANCIAL OVERVIEW */}
      <div className="bg-white border rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold mb-6">Financial Overview</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* STOCK REPORT */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="text-2xl font-bold">Supplier Stock Report</h2>
          <p className="text-gray-500 text-sm mt-1">Items added to inventory</p>
        </div>

        <div className="flex flex-wrap gap-4 p-5 border-b bg-gray-50">
          <select
            value={stockRange}
            onChange={(e) => setStockRange(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>

          <input
            type="text"
            placeholder="Search supplier..."
            value={supplierSearch}
            onChange={(e) => setSupplierSearch(e.target.value)}
            className="border rounded-lg px-4 py-2"
          />

          <select
            value={stockSupplier}
            onChange={(e) => setStockSupplier(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="">All Suppliers</option>
            {filteredSuppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">Item</th>
              <th className="text-left p-4">Supplier</th>
              <th className="text-left p-4">Quantity</th>
              <th className="text-left p-4">Date</th>
            </tr>
          </thead>
          <tbody>
            {report.stockAdditions.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center p-6 text-gray-500">
                  No stock additions found
                </td>
              </tr>
            ) : (
              report.stockAdditions.map((stock) => (
                <tr key={stock.id} className="border-t">
                  <td className="p-4">{stock.item.name}</td>
                  <td className="p-4">{stock.purchaseOrder.supplier.name}</td>
                  <td className="p-4">{stock.quantity}</td>
                  <td className="p-4">{new Date(stock.purchaseOrder.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* LOW STOCK */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="text-2xl font-bold">Low Stock Items</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">Item</th>
              <th className="text-left p-4">Current Stock</th>
              <th className="text-left p-4">Reorder Level</th>
              <th className="text-left p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.lowStockItems.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-4">{item.name}</td>
                <td className="p-4">{item.stockQty}</td>
                <td className="p-4">{item.reorderLevel}</td>
                <td className="p-4">
                  <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm">
                    Low Stock
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TOP DEBTORS */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-2xl font-bold">Top Debtors</h2>
          <input
            type="text"
            placeholder="Search customer..."
            value={debtorSearch}
            onChange={(e) => setDebtorSearch(e.target.value)}
            className="border rounded-lg px-4 py-2 w-full md:w-72"
          />
        </div>
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">Customer</th>
              <th className="text-left p-4">Amount Due</th>
            </tr>
          </thead>
          <tbody>
            {filteredDebtors.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center p-6 text-gray-500">
                  No debtors found
                </td>
              </tr>
            ) : (
              filteredDebtors.map((debtor, index) => (
                <tr key={index} className="border-t">
                  <td className="p-4">{debtor.name}</td>
                  <td className="p-4">Rs. {debtor.amount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CHEQUE REPORT */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="text-2xl font-bold">Supplier Cheques</h2>
        </div>

        <div className="flex flex-wrap gap-4 p-5 border-b bg-gray-50">
          <input
            type="text"
            placeholder="Search cheque number or supplier..."
            value={chequeSearch}
            onChange={(e) => setChequeSearch(e.target.value)}
            className="border rounded-lg px-4 py-2 w-full md:w-96"
          />
          <input
            type="date"
            value={chequeDate}
            onChange={(e) => setChequeDate(e.target.value)}
            className="border rounded-lg px-4 py-2"
          />
        </div>

        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">Cheque No</th>
              <th className="text-left p-4">Supplier</th>
              <th className="text-left p-4">Amount</th>
              <th className="text-left p-4">Cheque Date</th>
              <th className="text-left p-4">Passed Date</th>
              <th className="text-left p-4">Status</th>
              <th className="text-left p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {report.chequeReports.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-6 text-gray-500">
                  No cheques found
                </td>
              </tr>
            ) : (
              report.chequeReports.map((cheque) => (
                <tr key={cheque.id} className="border-t">
                  <td className="p-4">{cheque.chequeNumber}</td>
                  <td className="p-4">{cheque.supplierPayment.supplier.name}</td>
                  <td className="p-4">Rs. {cheque.amount}</td>
                  <td className="p-4">{new Date(cheque.chequeDate).toLocaleDateString()}</td>
                  <td className="p-4">
                    {cheque.passedDate ? new Date(cheque.passedDate).toLocaleDateString() : "-"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        cheque.status === "PENDING"
                          ? "bg-yellow-100 text-yellow-700"
                          : cheque.status === "CLEARED"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {cheque.status}
                    </span>
                  </td>
                  <td className="p-4 flex gap-2">
                    {cheque.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedChequeId(cheque.id);
                            setShowPassModal(true);
                          }}
                          className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-700"
                        >
                          Check Settled
                        </button>
                        <button
                          onClick={() => markChequeReturned(cheque.id)}
                          className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-700"
                        >
                          Returned
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* DAILY BILLS REPORT */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b">
          <h2 className="text-2xl font-bold">Daily Bills Report</h2>
          <p className="text-gray-500 text-sm mt-1">Bills generated during selected period</p>
        </div>
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">Bill ID</th>
              <th className="text-left p-4">Customer</th>
              <th className="text-left p-4">Amount</th>
              <th className="text-left p-4">Date</th>
              <th className="text-left p-4">Time</th>
            </tr>
          </thead>
          <tbody>
            {report.dailyBills.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center p-6 text-gray-500">
                  No bills found
                </td>
              </tr>
            ) : (
              report.dailyBills.map((bill) => (
                <tr key={bill.id} className="border-t">
                  <td className="p-4">{bill.billNumber}</td>
                  <td className="p-4">{bill.customer?.name || "Walk-in Customer"}</td>
                  <td className="p-4">Rs. {bill.totalAmount}</td>
                  <td className="p-4">{new Date(bill.createdAt).toLocaleDateString()}</td>
                  <td className="p-4">{new Date(bill.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PASS MODAL */}
      {showPassModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Select Passed Date</h2>
            <input
              type="date"
              value={passedDate}
              onChange={(e) => setPassedDate(e.target.value)}
              className="w-full border rounded-lg px-4 py-3"
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPassModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={markChequePassed}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}