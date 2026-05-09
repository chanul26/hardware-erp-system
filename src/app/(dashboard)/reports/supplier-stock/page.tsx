"use client";

import {
  useEffect,
  useState,
} from "react";

type StockItem = {
  id: string;

  quantity: number;

  buyingPrice: number;

  item: {
    name: string;
  };
};

type StockAddition = {
  id: string;

  supplier: {
    name: string;
  };

  purchaseOrder: {
    billNumber: string;

    createdAt: string;

    totalAmount: number;

    paymentStatus: string;

    paymentMethod: string;

    items: StockItem[];
  };
};

type ReportData = {
  stockAdditions: StockAddition[];
};

type Supplier = {
  id: string;
  name: string;
};

export default function SupplierStockPage() {
  const [report, setReport] =
    useState<ReportData | null>(null);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [stockRange, setStockRange] =
    useState("today");

  const [stockSupplier, setStockSupplier] =
    useState("");

  // SEARCH BY BILL NUMBER
  const [billSearch, setBillSearch] =
    useState("");

  const [
    selectedOrder,
    setSelectedOrder,
  ] = useState<any>(null);

  // LOAD REPORTS

  const loadReports = async () => {
    const res = await fetch(
      `/api/reports?stockRange=${stockRange}&supplierId=${stockSupplier}`
    );

    const data = await res.json();

    setReport(data.data);
  };

  // LOAD SUPPLIERS

  const loadSuppliers = async () => {
    const res = await fetch(
      "/api/suppliers"
    );

    const data = await res.json();

    setSuppliers(data.data || []);
  };

  useEffect(() => {
    loadReports();
  }, [stockRange, stockSupplier]);

  useEffect(() => {
    loadSuppliers();
  }, []);

  // FILTER BILL NUMBER

  const filteredStocks =
    report?.stockAdditions.filter(
      (stock) =>
        stock.purchaseOrder.billNumber
          ?.toString()
          .toLowerCase()
          .includes(
            billSearch.toLowerCase()
          )
    ) || [];

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div>
        <h1 className="text-3xl font-bold">
          Supplier Stock Report
        </h1>

        <p className="text-gray-500 mt-2">
          Monitor supplier stock
          additions and inventory
          updates.
        </p>
      </div>

      {/* FILTERS */}

      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap gap-4">
          {/* RANGE */}

          <select
            value={stockRange}
            onChange={(e) =>
              setStockRange(
                e.target.value
              )
            }
            className="border rounded-lg px-4 py-2"
          >
            <option value="today">
              Today
            </option>

            <option value="week">
              This Week
            </option>

            <option value="month">
              This Month
            </option>

            <option value="year">
              This Year
            </option>
          </select>

          {/* SEARCH BILL NUMBER */}

          <input
            type="text"
            placeholder="Search bill number..."
            value={billSearch}
            onChange={(e) =>
              setBillSearch(
                e.target.value
              )
            }
            className="border rounded-lg px-4 py-2"
          />

          {/* SUPPLIER FILTER */}

          <select
            value={stockSupplier}
            onChange={(e) =>
              setStockSupplier(
                e.target.value
              )
            }
            className="border rounded-lg px-4 py-2"
          >
            <option value="">
              All Suppliers
            </option>

            {suppliers.map(
              (supplier) => (
                <option
                  key={supplier.id}
                  value={supplier.id}
                >
                  {supplier.name}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      {/* TABLE */}

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">
                Bill Number
              </th>

              <th className="text-left p-4">
                Supplier
              </th>

              <th className="text-left p-4">
                Date
              </th>

              <th className="text-left p-4">
                Total Amount
              </th>

              <th className="text-left p-4">
                Payment Method
              </th>

              <th className="text-left p-4">
                Payment Status
              </th>

              <th className="text-left p-4">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredStocks.length ===
            0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center p-6 text-gray-500"
                >
                  No supplier stock
                  records found
                </td>
              </tr>
            ) : (
              filteredStocks.map(
                (stock) => (
                  <tr
                    key={stock.id}
                    className="border-t"
                  >
                    {/* BILL NUMBER */}

                    <td className="p-4 font-medium">
                      {
                        stock
                          .purchaseOrder
                          .billNumber
                      }
                    </td>

                    {/* SUPPLIER */}

                    <td className="p-4">
                      {
                        stock.supplier
                          .name
                      }
                    </td>

                    {/* DATE */}

                    <td className="p-4">
                      {new Date(
                        stock
                          .purchaseOrder
                          .createdAt
                      ).toLocaleDateString()}
                    </td>

                    {/* AMOUNT */}

                    <td className="p-4 font-semibold text-green-600">
                      Rs.{" "}
                      {
                        stock
                          .purchaseOrder
                          .totalAmount
                      }
                    </td>

                    {/* PAYMENT METHOD */}

                    <td className="p-4">
                      {
                        stock
                          .purchaseOrder
                          .paymentMethod
                      }
                    </td>

                    {/* PAYMENT STATUS */}

                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          stock
                            .purchaseOrder
                            .paymentStatus ===
                          "PAID"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {
                          stock
                            .purchaseOrder
                            .paymentStatus
                        }
                      </span>
                    </td>

                    {/* DETAILS BUTTON */}

                    <td className="p-4">
                      <button
                        onClick={() =>
                          setSelectedOrder(
                            stock.purchaseOrder
                          )
                        }
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {/* DETAILS MODAL */}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl p-6">
            {/* HEADER */}

            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold">
                  Purchase Bill Details
                </h2>

                <p className="text-gray-500 mt-1">
                  Bill Number:{" "}
                  {
                    selectedOrder.billNumber
                  }
                </p>
              </div>

              <button
                onClick={() =>
                  setSelectedOrder(
                    null
                  )
                }
                className="text-gray-500 hover:text-red-500 text-2xl"
              >
                ×
              </button>
            </div>

            {/* ITEMS TABLE */}

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-4">
                      Item Name
                    </th>

                    <th className="text-left p-4">
                      Quantity
                    </th>

                    <th className="text-left p-4">
                      Buying Price
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {selectedOrder.items.map(
                    (
                      item: StockItem
                    ) => (
                      <tr
                        key={item.id}
                        className="border-t"
                      >
                        <td className="p-4">
                          {
                            item.item
                              .name
                          }
                        </td>

                        <td className="p-4">
                          {
                            item.quantity
                          }
                        </td>

                        <td className="p-4 font-medium text-blue-600">
                          Rs.{" "}
                          {
                            item.buyingPrice
                          }
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}