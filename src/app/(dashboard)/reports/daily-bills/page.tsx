"use client";

import {
  useEffect,
  useState,
} from "react";

type ReportData = {
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

export default function DailyBillsPage() {
  const [report, setReport] =
    useState<ReportData | null>(null);

  const [range, setRange] =
    useState("today");

  const [search, setSearch] =
    useState("");

  const [
    selectedBill,
    setSelectedBill,
  ] = useState<any>(null);

  const [
    showModal,
    setShowModal,
  ] = useState(false);

  // LOAD REPORTS

  const loadReports = async () => {
    const res = await fetch(
      `/api/reports?range=${range}`
    );

    const data = await res.json();

    setReport(data.data);
  };

  // OPEN BILL DETAILS

  const openBillDetails =
    async (billId: string) => {
      const res = await fetch(
        `/api/reports/bill-details?id=${billId}`
      );

      const data = await res.json();

      setSelectedBill(data.data);

      setShowModal(true);
    };

  useEffect(() => {
    loadReports();
  }, [range]);

  // FILTERED BILLS

  const filteredBills =
    report?.dailyBills?.filter(
      (bill) =>
        bill.billNumber
          .toLowerCase()
          .includes(
            search.toLowerCase()
          )
    ) || [];

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div>
        <h1 className="text-3xl font-bold">
          Daily Bills Report
        </h1>

        <p className="text-gray-500 mt-2">
          Monitor billing activity
          and sales transactions.
        </p>
      </div>

      {/* FILTER */}

      <div className="bg-white border rounded-2xl p-5 shadow-sm flex gap-4">
        <select
          value={range}
          onChange={(e) =>
            setRange(e.target.value)
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

        <input
          type="text"
          placeholder="Search bill number..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          className="border rounded-lg px-4 py-2 w-72"
        />
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
                Customer
              </th>

              <th className="text-left p-4">
                Amount
              </th>

              <th className="text-left p-4">
                Date
              </th>

              <th className="text-left p-4">
                Time
              </th>

              <th className="text-left p-4">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredBills.length ===
            0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-center p-6 text-gray-500"
                >
                  No bills found
                </td>
              </tr>
            ) : (
              filteredBills.map(
                (bill) => (
                  <tr
                    key={bill.id}
                    className="border-t"
                  >
                    <td className="p-4">
                      {
                        bill.billNumber
                      }
                    </td>

                    <td className="p-4">
                      {bill.customer
                        ?.name ||
                        "Walk-in Customer"}
                    </td>

                    <td className="p-4 font-semibold text-green-600">
                      Rs.{" "}
                      {bill.totalAmount}
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
                        onClick={() =>
                          openBillDetails(
                            bill.id
                          )
                        }
                        className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-700"
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

      {showModal &&
        selectedBill && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-full max-w-5xl p-6 max-h-[90vh] overflow-auto">
              {/* HEADER */}

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">
                    Bill Details
                  </h2>

                  <p className="text-gray-500">
                    Bill Number:
                    {" "}
                    {
                      selectedBill.billNumber
                    }
                  </p>
                </div>

                <button
                  onClick={() =>
                    setShowModal(
                      false
                    )
                  }
                  className="border px-4 py-2 rounded-lg"
                >
                  Close
                </button>
              </div>

              {/* ITEMS TABLE */}

              <div className="border rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left p-4">
                        Item Code
                      </th>

                      <th className="text-left p-4">
                        Item Name
                      </th>

                      <th className="text-left p-4">
                        Qty
                      </th>

                      <th className="text-left p-4">
                        Buying Price
                      </th>

                      <th className="text-left p-4">
                        Selling Price
                      </th>

                      <th className="text-left p-4">
                        Profit
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedBill.items.map(
                      (
                        item: any,
                        index: number
                      ) => {
                        const profit =
                          (Number(
                            item.unitPrice
                          ) -
                            Number(
                              item.buyingPrice
                            )) *
                          Number(
                            item.quantity
                          );

                        return (
                          <tr
                            key={
                              index
                            }
                            className="border-t"
                          >
                            <td className="p-4">
                              {
                                item
                                  .item
                                  .code
                              }
                            </td>

                            <td className="p-4">
                              {
                                item
                                  .item
                                  .name
                              }
                            </td>

                            <td className="p-4">
                              {
                                item.quantity
                              }
                            </td>

                            <td className="p-4">
                              Rs.{" "}
                              {
                                item.buyingPrice
                              }
                            </td>

                            <td className="p-4">
                              Rs.{" "}
                              {
                                item.unitPrice
                              }
                            </td>

                            <td className="p-4 font-semibold text-green-600">
                              Rs.{" "}
                              {profit}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>

              {/* TOTAL PROFIT */}

              <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-6">
                <h3 className="text-xl font-bold">
                  Total Bill Profit
                </h3>

                <p className="text-3xl font-bold text-green-700 mt-2">
                  Rs.{" "}
                  {selectedBill.items.reduce(
                    (
                      total: number,
                      item: any
                    ) =>
                      total +
                      (Number(
                        item.unitPrice
                      ) -
                        Number(
                          item.buyingPrice
                        )) *
                        Number(
                          item.quantity
                        ),
                    0
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}