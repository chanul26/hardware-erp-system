"use client";

import {
  useEffect,
  useState,
} from "react";

type ReportData = {
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
};

export default function ChequesPage() {
  const [report, setReport] =
    useState<ReportData | null>(null);

  const [search, setSearch] =
    useState("");

  const [chequeDate, setChequeDate] =
    useState("");

  const [passedDate, setPassedDate] =
    useState("");

  const [selectedChequeId, setSelectedChequeId] =
    useState("");

  const [showPassModal, setShowPassModal] =
    useState(false);

  // LOAD REPORTS

  const loadReports = async () => {
    const res = await fetch(
      `/api/reports?chequeSearch=${search}&chequeDate=${chequeDate}`
    );

    const data = await res.json();

    setReport(data.data);
  };

  useEffect(() => {
    loadReports();
  }, [search, chequeDate]);

  // MARK PASSED

  const markChequePassed =
    async () => {
      if (!passedDate) {
        alert(
          "Please select passed date"
        );

        return;
      }

      const res = await fetch(
        "/api/cheques/pass",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            chequeId:
              selectedChequeId,

            passedDate,
          }),
        }
      );

      if (res.ok) {
        alert(
          "Cheque marked as cleared"
        );

        setShowPassModal(false);

        setPassedDate("");

        loadReports();
      }
    };

  // MARK RETURNED

  const markChequeReturned =
    async (chequeId: string) => {
      const confirmed = confirm(
        "Are you sure this cheque was returned?"
      );

      if (!confirmed) return;

      const res = await fetch(
        "/api/cheques/return",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            chequeId,
          }),
        }
      );

      if (res.ok) {
        alert(
          "Cheque marked as returned"
        );

        loadReports();
      }
    };

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div>
        <h1 className="text-3xl font-bold">
          Supplier Cheque Report
        </h1>

        <p className="text-gray-500 mt-2">
          Monitor supplier cheque
          payments and status.
        </p>
      </div>

      {/* FILTERS */}

      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap gap-4">
          {/* SEARCH */}

          <input
            type="text"
            placeholder="Search cheque number or supplier..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            className="border rounded-lg px-4 py-2 w-full md:w-96"
          />

          {/* DATE */}

          <input
            type="date"
            value={chequeDate}
            onChange={(e) =>
              setChequeDate(
                e.target.value
              )
            }
            className="border rounded-lg px-4 py-2"
          />
        </div>
      </div>

      {/* TABLE */}

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">
                Cheque No
              </th>

              <th className="text-left p-4">
                Supplier
              </th>

              <th className="text-left p-4">
                Bank
              </th>

              <th className="text-left p-4">
                Amount
              </th>

              <th className="text-left p-4">
                Cheque Date
              </th>

              <th className="text-left p-4">
                Passed Date
              </th>

              <th className="text-left p-4">
                Status
              </th>

              <th className="text-left p-4">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {report?.chequeReports
              ?.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center p-6 text-gray-500"
                >
                  No cheques found
                </td>
              </tr>
            ) : (
              report?.chequeReports.map(
                (cheque) => (
                  <tr
                    key={cheque.id}
                    className="border-t"
                  >
                    <td className="p-4">
                      {
                        cheque.chequeNumber
                      }
                    </td>

                    <td className="p-4">
                      {
                        cheque
                          .supplierPayment
                          .supplier.name
                      }
                    </td>

                    <td className="p-4">
                      {cheque.bank}
                    </td>

                    <td className="p-4">
                      Rs. {cheque.amount}
                    </td>

                    <td className="p-4">
                      {new Date(
                        cheque.chequeDate
                      ).toLocaleDateString()}
                    </td>

                    <td className="p-4">
                      {cheque.passedDate
                        ? new Date(
                            cheque.passedDate
                          ).toLocaleDateString()
                        : "-"}
                    </td>

                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          cheque.status ===
                          "PENDING"
                            ? "bg-yellow-100 text-yellow-700"
                            : cheque.status ===
                              "CLEARED"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {cheque.status}
                      </span>
                    </td>

                    <td className="p-4 flex gap-2">
                      {cheque.status ===
                        "PENDING" && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedChequeId(
                                cheque.id
                              );

                              setShowPassModal(
                                true
                              );
                            }}
                            className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm"
                          >
                            Check Settled
                          </button>

                          <button
                            onClick={() =>
                              markChequeReturned(
                                cheque.id
                              )
                            }
                            className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm"
                          >
                            Returned
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {/* PASS MODAL */}

      {showPassModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">
              Select Passed Date
            </h2>

            <input
              type="date"
              value={passedDate}
              onChange={(e) =>
                setPassedDate(
                  e.target.value
                )
              }
              className="w-full border rounded-lg px-4 py-3"
            />

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() =>
                  setShowPassModal(
                    false
                  )
                }
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>

              <button
                onClick={
                  markChequePassed
                }
                className="bg-green-600 text-white px-4 py-2 rounded-lg"
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