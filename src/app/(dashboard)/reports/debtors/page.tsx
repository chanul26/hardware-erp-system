"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type ReportData = {
  topDebtors: {
    name: string;

    amount: number;
  }[];
};

export default function DebtorsPage() {
  const [report, setReport] =
    useState<ReportData | null>(null);

  const [search, setSearch] =
    useState("");

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

  // FILTERED DEBTORS

  const filteredDebtors =
    useMemo(() => {
      return (
        report?.topDebtors.filter(
          (debtor) =>
            debtor.name
              .toLowerCase()
              .includes(
                search.toLowerCase()
              )
        ) || []
      );
    }, [report, search]);

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div>
        <h1 className="text-3xl font-bold">
          Top Debtors Report
        </h1>

        <p className="text-gray-500 mt-2">
          View customers with
          outstanding balances.
        </p>
      </div>

      {/* SEARCH */}

      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        <input
          type="text"
          placeholder="Search customer..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
          className="border rounded-lg px-4 py-2 w-full md:w-96"
        />
      </div>

      {/* TABLE */}

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-4">
                Customer Name
              </th>

              <th className="text-left p-4">
                Outstanding Amount
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredDebtors.length ===
            0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="text-center p-6 text-gray-500"
                >
                  No debtors found
                </td>
              </tr>
            ) : (
              filteredDebtors.map(
                (debtor, index) => (
                  <tr
                    key={index}
                    className="border-t"
                  >
                    <td className="p-4">
                      {debtor.name}
                    </td>

                    <td className="p-4 font-semibold text-red-600">
                      Rs.{" "}
                      {debtor.amount}
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