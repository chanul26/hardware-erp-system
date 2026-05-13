import { PrismaClient } from "@prisma/client";
import Link from "next/link";

export const dynamic =
  "force-dynamic";

const prisma =
  new PrismaClient();

type Props = {
  searchParams: Promise<{
    search?: string;
    date?: string;
    page?: string;
  }>;
};

export default async function MixingHistoryPage({
  searchParams,
}: Props) {

  const params =
    await searchParams;

  const search =
    params.search || "";

  const date =
    params.date || "";

  const currentPage =
    Number(params.page || "1");

  const ITEMS_PER_PAGE = 10;

  const whereCondition: any = {
    type: "MIXING",
  };

  // PRODUCT SEARCH

  if (search) {
    whereCondition.item = {
      name: {
        contains: search,
        mode: "insensitive",
      },
    };
  }

  // DATE FILTER

  if (date) {

    const startDate =
      new Date(date);

    startDate.setHours(
      0,
      0,
      0,
      0
    );

    const endDate =
      new Date(date);

    endDate.setHours(
      23,
      59,
      59,
      999
    );

    whereCondition.createdAt = {
      gte: startDate,
      lte: endDate,
    };
  }

  // TOTAL COUNT

  const totalItems =
    await prisma.stockMovement.count({
      where: whereCondition,
    });

  const totalPages =
    Math.ceil(
      totalItems /
      ITEMS_PER_PAGE
    );

  // FETCH DATA

  const mixingHistory =
    await prisma.stockMovement.findMany({
      where: whereCondition,

      include: {
        item: true,
      },

      orderBy: {
        createdAt: "desc",
      },

      skip:
        (currentPage - 1) *
        ITEMS_PER_PAGE,

      take:
        ITEMS_PER_PAGE,
    });

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* HEADER */}

      <div className="mb-8">

        <h1 className="text-3xl font-bold text-gray-900">
          Paint Mixing History
        </h1>

        <p className="text-gray-500 mt-1">
          Track all inventory items used for paint mixing.
        </p>

      </div>

      {/* FILTERS */}

      <div className="bg-white border rounded-lg shadow-sm p-4 mb-6">

        <form className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* SEARCH */}

          <div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Product
            </label>

            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by product name..."
              className="w-full border rounded-md p-2"
            />

          </div>

          {/* DATE */}

          <div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Date
            </label>

            <input
              type="date"
              name="date"
              defaultValue={date}
              className="w-full border rounded-md p-2"
            />

          </div>

          {/* BUTTON */}

          <div className="flex items-end gap-2">

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition"
            >
              Apply Filters
            </button>

            <Link
              href="/mixing-history"
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md transition"
            >
              Reset
            </Link>

          </div>

        </form>
      </div>

      {/* TABLE */}

      <div className="bg-white border shadow-sm rounded-lg overflow-hidden">

        <table className="w-full border-collapse text-left">

          <thead>

            <tr className="bg-gray-50 border-b">

              <th className="p-4 font-medium text-gray-600">
                Product
              </th>

              <th className="p-4 font-medium text-gray-600">
                Barcode
              </th>

              <th className="p-4 font-medium text-gray-600 text-center">
                Qty Used
              </th>

              <th className="p-4 font-medium text-gray-600 text-right">
                Selling Price
              </th>

              <th className="p-4 font-medium text-gray-600 text-right">
                Cost Price
              </th>

              <th className="p-4 font-medium text-gray-600">
                Note
              </th>

              <th className="p-4 font-medium text-gray-600">
                Date & Time
              </th>

            </tr>
          </thead>

          <tbody className="divide-y">

            {mixingHistory.map(
              (movement) => (

              <tr
                key={movement.id}
                className="hover:bg-gray-50 transition"
              >

                <td className="p-4 font-medium text-gray-900">
                  {movement.item.name}
                </td>

                <td className="p-4 text-gray-500 text-sm">
                  {movement.item.barcode}
                </td>

                <td className="p-4 text-center font-bold text-orange-600">
                  {Math.abs(
                    movement.quantity
                  )} {movement.item.unit}
                </td>

                <td className="p-4 text-right">
                  Rs. {Number(
                    movement.item.sellingPrice
                  ).toFixed(2)}
                </td>

                <td className="p-4 text-right">
                  Rs. {Number(
                    movement.item.buyingPrice
                  ).toFixed(2)}
                </td>

                <td className="p-4 text-gray-600">
                  {movement.note || "-"}
                </td>

                <td className="p-4 text-gray-500 text-sm">
                  {new Date(
                    movement.createdAt
                  ).toLocaleString()}
                </td>

              </tr>
            ))}

            {mixingHistory.length === 0 && (

              <tr>

                <td
                  colSpan={7}
                  className="p-8 text-center text-gray-500"
                >
                  No mixing history found.
                </td>

              </tr>
            )}

          </tbody>
        </table>
      </div>

      {/* PAGINATION */}

      <div className="flex justify-between items-center mt-6">

        <p className="text-sm text-gray-500">
          Page {currentPage} of {totalPages || 1}
        </p>

        <div className="flex gap-2">

          {/* PREVIOUS */}

          {currentPage > 1 && (

            <Link
              href={`/mixing-history?page=${
                currentPage - 1
              }&search=${search}&date=${date}`}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md transition"
            >
              ← Previous
            </Link>

          )}

          {/* NEXT */}

          {currentPage < totalPages && (

            <Link
              href={`/mixing-history?page=${
                currentPage + 1
              }&search=${search}&date=${date}`}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"
            >
              Next →
            </Link>

          )}

        </div>

      </div>
    </div>
  );
}