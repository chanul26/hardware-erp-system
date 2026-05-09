"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type ProfitGraph = {
  label: string;
  profit: number;
};

type ReportData = {
  todayRevenue: number;

  outstandingDebt: number;

  totalProfit: number;

  profitGraph: ProfitGraph[];
};

export default function ReportsPage() {
  const [report, setReport] =
    useState<ReportData | null>(null);

  const [range, setRange] =
    useState("today");

  const [graphRange, setGraphRange] =
    useState("daily");

  const [selectedDate, setSelectedDate] =
    useState("");

  // LOAD REPORTS

  const loadReports = async () => {
    const query = new URLSearchParams({
      range,
      graphRange,
      selectedDate,
    });

    const res = await fetch(
      `/api/reports?${query.toString()}`
    );

    const data = await res.json();

    setReport(data.data);
  };

  useEffect(() => {
    loadReports();
  }, [
    range,
    graphRange,
    selectedDate,
  ]);

  // FINANCIAL GRAPH

  const chartData = [
    {
      name: "Revenue",

      amount:
        report?.todayRevenue || 0,
    },

    {
      name: "Debt",

      amount:
        report?.outstandingDebt ||
        0,
    },

    {
      name: "Profit",

      amount:
        report?.totalProfit || 0,
    },
  ];

  // EXPORT PDF

  const exportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-3xl font-bold">
          Reports Dashboard
        </h1>

        <button
          onClick={exportPDF}
          className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800"
        >
          Export PDF
        </button>
      </div>

      {/* FILTERS */}

      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap gap-4">
          {/* MAIN FILTER */}

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

          {/* DATE FILTER */}

          <input
            type="date"
            value={selectedDate}
            onChange={(e) =>
              setSelectedDate(
                e.target.value
              )
            }
            className="border rounded-lg px-4 py-2"
          />
        </div>
      </div>

      {/* STATS */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* REVENUE */}

        <div className="bg-green-500 text-white rounded-2xl p-6 shadow">
          <p className="text-sm">
            Revenue
          </p>

          <h2 className="text-3xl font-bold mt-2">
            Rs.{" "}
            {report?.todayRevenue || 0}
          </h2>
        </div>

        {/* DEBT */}

        <div className="bg-red-500 text-white rounded-2xl p-6 shadow">
          <p className="text-sm">
            Outstanding Debt
          </p>

          <h2 className="text-3xl font-bold mt-2">
            Rs.{" "}
            {report?.outstandingDebt ||
              0}
          </h2>
        </div>

        {/* PROFIT */}

        <div className="bg-blue-500 text-white rounded-2xl p-6 shadow">
          <p className="text-sm">
            Total Profit
          </p>

          <h2 className="text-3xl font-bold mt-2">
            Rs.{" "}
            {report?.totalProfit || 0}
          </h2>
        </div>
      </div>

      {/* FINANCIAL GRAPH */}

      <div className="bg-white border rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold mb-6">
          Financial Overview
        </h2>

        <div className="h-80">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart data={chartData}>
              <XAxis dataKey="name" />

              <YAxis />

              <Tooltip />

              <Bar dataKey="amount" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PROFIT GRAPH */}

      <div className="bg-white border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold">
              Profit Analysis
            </h2>

            <p className="text-gray-500 mt-1">
              Profit tracking by selected
              period
            </p>
          </div>

          {/* PROFIT GRAPH FILTER */}

          <select
            value={graphRange}
            onChange={(e) =>
              setGraphRange(
                e.target.value
              )
            }
            className="border rounded-lg px-4 py-2"
          >
            <option value="daily">
              Daily
            </option>

            <option value="weekly">
              Weekly
            </option>

            <option value="monthly">
              Monthly
            </option>

            <option value="yearly">
              Yearly
            </option>
          </select>
        </div>

        <div className="h-96">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={
                report?.profitGraph ||
                []
              }
            >
              <XAxis dataKey="label" />

              <YAxis />

              <Tooltip />

              <Bar dataKey="profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}