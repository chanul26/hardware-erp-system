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
    amountPaid: any;
    discount: any;
    status: any;
    createdAt: string;

    customer: {
      name: string;
    } | null;

    billItems: {
      quantity: number;
      unitPrice: any;
      totalPrice: any;

      item: {
        name: string;
        buyingPrice: any;
      };
    }[];

    payments: {
      method: string;
      amount: number;
    }[];

    cheques: {
      chequeNumber: string;
    }[];
  }[];

  returnedBills: {
    id: string;

    billNumber: string;

    originalInvoice?: string;

    createdAt: string;

    totalAmount: number;

    customer: {
      name: string;
    } | null;

    billItems: {
      quantity: number;
      unitPrice: any;
      buyingPrice: any;
      totalPrice: any;

      item: {
        name: string;
      };
    }[];
 
  }[];
      upcomingCheques: {
      id: string;

      chequeNumber: string;

      amount: number;

      chequeDate: string;

      supplierPayment: {
        supplier: {
          name: string;
        };
      };
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
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [showBillPopup, setShowBillPopup] = useState(false);
  const [returnPage, setReturnPage] = useState(1);

  const RETURNS_PER_PAGE = 10

  const [billPage, setBillPage] = useState(1);

  const BILLS_PER_PAGE = 10;

  const [chequePage, setChequePage] = useState(1);

  const CHEQUES_PER_PAGE = 10;

  const [stockPage, setStockPage] = useState(1);

  const STOCKS_PER_PAGE = 10;

  const [lowStockPage, setLowStockPage] = useState(1);

  const LOW_STOCKS_PER_PAGE = 10;

  const [debtorPage, setDebtorPage] = useState(1);

  const DEBTORS_PER_PAGE = 10;

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
{report.upcomingCheques?.length > 0 && (

  <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-xl p-5">

    <h2 className="text-xl font-bold text-yellow-800 mb-3">
      ⚠ Upcoming Cheques
    </h2>

    <div className="space-y-3">

      {report.upcomingCheques.map(
        (cheque) => {

          const daysLeft =
            Math.ceil(
              (
                new Date(
                  cheque.chequeDate
                ).getTime() -
                Date.now()
              ) /
              (1000 * 60 * 60 * 24)
            );

          return (

            <div
              key={cheque.id}
              className="bg-white border rounded-lg p-3"
            >

              <div className="font-semibold">
                {cheque.chequeNumber}
              </div>

              <div>
                Supplier:
                {" "}
                {
                  cheque
                    .supplierPayment
                    .supplier
                    .name
                }
              </div>

              <div>
                Amount:
                Rs. {cheque.amount}
              </div>

              <div className="font-bold text-red-600">

                {daysLeft === 0
                  ? "Due Today"
                  : `Due in ${daysLeft} day(s)`}

              </div>

            </div>
          );
        }
      )}

    </div>

  </div>

)}      

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
            <th className="text-left p-4">PO Number</th>
            <th className="text-left p-4">Supplier</th>
            <th className="text-left p-4">Items</th>
            <th className="text-left p-4">Total Value</th>
            <th className="text-left p-4">Date</th>
            <th className="text-left p-4">Payment</th>
            <th className="text-left p-4">Actions</th>
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
              report.stockAdditions
                .slice(
                  (stockPage - 1) * STOCKS_PER_PAGE,
                  stockPage * STOCKS_PER_PAGE
                )
                .map((stock) => (
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
        <div className="flex justify-center items-center gap-4 py-5">

          <button
            disabled={stockPage === 1}
            onClick={() =>
              setStockPage((p) => p - 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Previous
          </button>

          <span>
            Page {stockPage}
          </span>

          <button
            disabled={
              stockPage >=
              Math.ceil(
                report.stockAdditions.length /
                STOCKS_PER_PAGE
              )
            }
            onClick={() =>
              setStockPage((p) => p + 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Next
          </button>

        </div>        
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
              {report.lowStockItems
                .slice(
                  (lowStockPage - 1) * LOW_STOCKS_PER_PAGE,
                  lowStockPage * LOW_STOCKS_PER_PAGE
                )
                .map((item) => (
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
        <div className="flex justify-center items-center gap-4 py-5">

          <button
            disabled={lowStockPage === 1}
            onClick={() =>
              setLowStockPage((p) => p - 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Previous
          </button>

          <span>
            Page {lowStockPage}
          </span>

          <button
            disabled={
              lowStockPage >=
              Math.ceil(
                report.lowStockItems.length /
                LOW_STOCKS_PER_PAGE
              )
            }
            onClick={() =>
              setLowStockPage((p) => p + 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Next
          </button>

        </div>
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
              filteredDebtors
                .slice(
                  (debtorPage - 1) * DEBTORS_PER_PAGE,
                  debtorPage * DEBTORS_PER_PAGE
                )
                .map((debtor, index) => (
                <tr key={index} className="border-t">
                  <td className="p-4">{debtor.name}</td>
                  <td className="p-4">Rs. {debtor.amount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex justify-center items-center gap-4 py-5">

          <button
            disabled={debtorPage === 1}
            onClick={() =>
              setDebtorPage((p) => p - 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Previous
          </button>

          <span>
            Page {debtorPage}
          </span>

          <button
            disabled={
              debtorPage >=
              Math.ceil(
                filteredDebtors.length /
                DEBTORS_PER_PAGE
              )
            }
            onClick={() =>
              setDebtorPage((p) => p + 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Next
          </button>

        </div>        
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
              report.chequeReports
                .slice(
                  (chequePage - 1) * CHEQUES_PER_PAGE,
                  chequePage * CHEQUES_PER_PAGE
                )
                .map((cheque) => (
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
        <div className="flex justify-center items-center gap-4 py-5">

          <button
            disabled={chequePage === 1}
            onClick={() =>
              setChequePage((p) => p - 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Previous
          </button>

          <span>
            Page {chequePage}
          </span>

          <button
            disabled={
              chequePage >=
              Math.ceil(
                report.chequeReports.length /
                CHEQUES_PER_PAGE
              )
            }
            onClick={() =>
              setChequePage((p) => p + 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Next
          </button>

        </div>        
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
              <th className="text-left p-4">Actions</th>
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
              report.dailyBills
                .slice(
                  (billPage - 1) * BILLS_PER_PAGE,
                  billPage * BILLS_PER_PAGE
                )
                .map((bill) => (
                              <tr key={bill.id} className="border-t">

                  <td className="p-4">
                    {bill.billNumber}
                  </td>

                  <td className="p-4">
                    {bill.customer?.name ||
                      "Walk-in Customer"}
                  </td>

                  <td className="p-4">
                    Rs. {bill.totalAmount}
                  </td>

                  <td className="p-4">
                    {new Date(
                      bill.createdAt
                    ).toLocaleDateString()}
                  </td>

                  <td className="p-4">
                    {new Date(
                      bill.createdAt
                    ).toLocaleTimeString()}
                  </td>

                  <td className="p-4">

                    <button
                      onClick={() => {
                        setSelectedBill(bill);
                        setShowBillPopup(true);
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                      View Details
                    </button>

                  </td>

                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex justify-center items-center gap-4 py-5">

          <button
            disabled={billPage === 1}
            onClick={() => setBillPage((p) => p - 1)}
            className="border px-4 py-2 rounded-lg"
          >
            Previous
          </button>

          <span>
            Page {billPage}
          </span>

          <button
            disabled={
              billPage >=
              Math.ceil(
                report.dailyBills.length /
                BILLS_PER_PAGE
              )
            }
            onClick={() => setBillPage((p) => p + 1)}
            className="border px-4 py-2 rounded-lg"
          >
            Next
          </button>

        </div>        
      </div>
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">

        <div className="p-5 border-b">
          <h2 className="text-2xl font-bold">
            Returned Items Report
          </h2>

          <p className="text-gray-500 text-sm mt-1">
            All returned invoices
          </p>
        </div>

        <table className="w-full">

          <thead className="bg-gray-100">

            <tr>
              <th className="text-left p-4">Return Invoice</th>
              <th className="text-left p-4">Customer</th>
              <th className="text-left p-4">Returned Value</th>
              <th className="text-left p-4">Return Date</th>
              <th className="text-left p-4">Actions</th>
            </tr>

          </thead>

          <tbody>

            {report.returnedBills?.length === 0 ? (

              <tr>
                <td
                  colSpan={5}
                  className="text-center p-6 text-gray-500"
                >
                  No returned invoices found
                </td>
              </tr>

            ) : (

              report.returnedBills
                ?.slice(
                  (returnPage - 1) * RETURNS_PER_PAGE,
                  returnPage * RETURNS_PER_PAGE
                )
                .map((bill) => (

                  <tr
                    key={bill.id}
                    className="border-t"
                  >

                    <td className="p-4">
                      {bill.billNumber}
                    </td>

                    <td className="p-4">
                      {bill.customer?.name ||
                        "Walk-in Customer"}
                    </td>

                    <td className="p-4">
                      Rs. {bill.totalAmount}
                    </td>

                    <td className="p-4">
                      {new Date(
                        bill.createdAt
                      ).toLocaleDateString()}
                    </td>

                    <td className="p-4">

                      <button
                        onClick={() => {
                          setSelectedBill(bill);
                          setShowBillPopup(true);
                        }}
                        className="px-3 py-1 bg-red-600 text-white rounded-lg"
                      >
                        View Details
                      </button>

                    </td>

                  </tr>

                ))
            )}

          </tbody>

        </table>
        <div className="flex justify-center items-center gap-4 py-5">

          <button
            disabled={returnPage === 1}
            onClick={() =>
              setReturnPage((p) => p - 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Previous
          </button>

          <span>
            Page {returnPage}
          </span>

          <button
            disabled={
              returnPage >=
              Math.ceil(
                report.returnedBills.length /
                  RETURNS_PER_PAGE
              )
            }
            onClick={() =>
              setReturnPage((p) => p + 1)
            }
            className="border px-4 py-2 rounded-lg"
          >
            Next
          </button>

        </div>     


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
      {showBillPopup && selectedBill && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    
    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto">
      
      {/* HEADER */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Bill Details
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            {selectedBill.billNumber}
          </p>
        </div>

        <button
          onClick={() => setShowBillPopup(false)}
          className="text-gray-500 hover:text-red-500 text-xl font-bold"
        >
          ✕
        </button>
      </div>

      {/* BILL INFO */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">
            Customer
          </p>

          <p className="font-semibold text-gray-900">
            {selectedBill.customer?.name || "Walk-in Customer"}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">
            Payment Method
          </p>

          <p className="font-semibold text-gray-900">
            {selectedBill.payments?.[0]?.method || "Cash"}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">
            Total Amount
          </p>

          <p className="font-bold text-blue-600">
            Rs. {selectedBill.totalAmount}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">
            Discount
          </p>

          <p className="font-semibold text-red-500">
            Rs. {selectedBill.discount || 0}
          </p>
        </div>

      </div>

      {/* ITEMS TABLE */}
      <div className="border rounded-xl overflow-hidden mb-6">

        <table className="w-full text-sm">

          <thead className="bg-gray-100">

            <tr>

              <th className="text-left px-4 py-3">
                Item
              </th>

              <th className="text-center px-4 py-3">
                Qty
              </th>

              <th className="text-right px-4 py-3">
                Buying
              </th>

              <th className="text-right px-4 py-3">
                Selling
              </th>

            </tr>

          </thead>

          <tbody>

            {selectedBill.billItems?.map(
              (item: any, index: number) => (

                <tr
                  key={index}
                  className="border-t"
                >

                  <td className="px-4 py-3 font-medium">
                    {item.item?.name}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {item.quantity}
                  </td>

                  <td className="px-4 py-3 text-right">
                    Rs. {item.buyingPrice || 0}
                  </td>

                  <td className="px-4 py-3 text-right text-blue-600 font-semibold">
                    Rs. {item.unitPrice}
                  </td>

                </tr>
              )
            )}

          </tbody>

        </table>

      </div>

      {/* PROFIT */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5">

        <div className="flex items-center justify-between">

          <span className="text-gray-700 font-medium">
            Final Profit
          </span>

          <span className="text-2xl font-bold text-green-600">

            Rs. {

              selectedBill.billItems?.reduce(
                (total: number, item: any) => {

                  return (
                    total +
                    (
                      (
                        Number(item.unitPrice || 0) -
                        Number(item.buyingPrice || 0)
                      ) * Number(item.quantity || 0)
                    )
                  );

                },
                0
              ) - (selectedBill.discount || 0)

            }

          </span>

        </div>

      </div>

    </div>

  </div>
)}
    </div>
  );
}