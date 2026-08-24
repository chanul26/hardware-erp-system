"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  name: string;
  nic?: string;
  email?: string;
  phone: string;
  totalDebt: number;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 5;

  const [loading, setLoading] = useState(false);

  // modal state
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // settlement modal
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [selectedDebtor, setSelectedDebtor] = useState<Customer | null>(null);
  const [isSettling, setIsSettling] = useState(false);

  // form
  const [name, setName] = useState("");
  const [nic, setNic] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCustomers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/customers?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load customers.");
      setCustomers(json.data.customers);
      setTotal(json.data.total);
    } catch (err) {
      setCustomers([]);
      setTotal(0);
      setLoadError(err instanceof Error ? err.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delay = setTimeout(() => {
      loadCustomers();
    }, 400);
    return () => clearTimeout(delay);
  }, [search, page]);

  const totalPages = Math.ceil(total / limit);

  const resetForm = () => {
    setName("");
    setNic("");
    setEmail("");
    setPhone("");
    setEditId(null);
  };

  const handleSettleDebt = async () => {
    if (!selectedDebtor || !settleAmount || Number(settleAmount) <= 0) return;
    setIsSettling(true);

    const res = await fetch("/api/payments/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: selectedDebtor.id,
        amount: Number(settleAmount)
      })
    });

    const json = await res.json();

    if (res.ok) {
      // The server reports what it actually applied — it will not record more
      // than is owed, so this can differ from what was typed.
      showToast(json.data.message);
      setSettleOpen(false);
      setSettleAmount("");
      loadCustomers();
    } else {
      showToast(json.error || "Failed to process payment");
    }
    setIsSettling(false);
  };

  const handleSubmit = async () => {
    if (!name || !phone) {
      showToast("Name and phone required");
      return;
    }

    const method = editId ? "PUT" : "POST";

    const res = await fetch("/api/customers", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editId ? { id: editId } : {}),
        name,
        nic,
        email,
        phone,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      showToast(editId ? "Updated successfully" : "Added successfully");
      setOpen(false);
      resetForm();
      loadCustomers();
    } else {
      // Surface per-field validation messages rather than a bare "Error".
      const detail = data.details
        ? Object.values(data.details as Record<string, string[]>)
            .flat()
            .join(" ")
        : "";
      showToast(detail || data.error || "Could not save the customer.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    // Customers with billing history are archived, not deleted — removing them
    // outright would orphan their bills and erase the debt trail.
    if (
      !confirm(
        `Remove ${name}?\n\nIf they have any billing history the record is archived instead of deleted, so invoices and payments stay intact.`
      )
    )
      return;

    const res = await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
    const json = await res.json();

    if (!res.ok) {
      showToast(json.error || "Could not remove the customer.");
      return;
    }

    showToast(json.data.archived ? `${json.data.name} archived` : "Deleted successfully");
    loadCustomers();
  };

  const handleEdit = (c: Customer) => {
    setName(c.name);
    setNic(c.nic || "");
    setEmail(c.email || "");
    setPhone(c.phone);
    setEditId(c.id);
    setOpen(true);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Customers</h1>

      {/* search + add */}
      <div className="flex justify-between mb-4">
        <input
          className="border px-3 py-2 rounded w-64"
          placeholder="Search name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          + Add Customer
        </button>
      </div>

      {/* table */}
      <table className="w-full border rounded">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">ID</th>
            <th>Name</th>
            <th>NIC</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Debt</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="text-center p-4 text-gray-500">
                Loading customers…
              </td>
            </tr>
          ) : loadError ? (
            <tr>
              <td colSpan={7} className="text-center p-4">
                <p className="text-red-600 font-medium">{loadError}</p>
                <button
                  onClick={loadCustomers}
                  className="mt-2 border px-3 py-1 rounded text-sm hover:bg-gray-50"
                >
                  Try again
                </button>
              </td>
            </tr>
          ) : customers.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center p-4">
                No customers found
              </td>
            </tr>
          ) : (
            customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.id.slice(0, 6)}</td>
                <td>{c.name}</td>
                <td>{c.nic || "-"}</td>
                <td>{c.email || "-"}</td>
                <td>{c.phone}</td>
                <td className="p-2 font-bold">
                  {c.totalDebt > 0 ? (
                    <span className="text-red-600">Rs. {c.totalDebt.toFixed(2)}</span>
                  ) : (
                    <span className="text-green-600">Settled</span>
                  )}
                </td>
                <td className="flex gap-2 p-2">
                  <button
                    onClick={() => handleEdit(c)}
                    className="bg-yellow-400 px-2 py-1 rounded"
                  >
                    ✏️ Edit
                  </button>

                  {c.totalDebt > 0 && (
                    <button
                      onClick={() => { setSelectedDebtor(c); setSettleAmount(""); setSettleOpen(true); }}
                      className="bg-green-600 text-white px-2 py-1 rounded text-sm font-bold"
                    >
                      💵 Receive Cash
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    className="bg-red-500 text-white px-2 py-1 rounded"
                  >
                    🗑 Remove
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* pagination */}
      <div className="flex justify-center mt-4 gap-2">
        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          className="border px-3 py-1 rounded disabled:opacity-40"
        >
          Prev
        </button>

        <span>
          {page} / {totalPages || 1}
        </span>

        <button
          disabled={page === totalPages}
          onClick={() => setPage(page + 1)}
          className="border px-3 py-1 rounded disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {/* modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded w-96">
            <h2 className="text-lg font-bold mb-3">
              {editId ? "Edit Customer" : "Add Customer"}
            </h2>

            <input
              placeholder="Name"
              className="border p-2 w-full mb-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              placeholder="NIC Number (Recommended for Credit)"
              className="border p-2 w-full mb-2"
              value={nic}
              onChange={(e) => setNic(e.target.value)}
            />

            <input
              placeholder="Email (optional)"
              className="border p-2 w-full mb-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              placeholder="Phone"
              className="border p-2 w-full mb-4"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="border px-3 py-1 rounded"
              >
                Cancel
              </button>

              <button
                onClick={handleSubmit}
                className="bg-blue-600 text-white px-3 py-1 rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* settlement modal */}
      {settleOpen && selectedDebtor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-96 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Receive Payment</h2>
            <p className="text-sm text-gray-500 mb-4">Clearing debt for {selectedDebtor.name}</p>

            <div className="bg-red-50 p-3 rounded-md border border-red-100 mb-4 flex justify-between items-center">
              <span className="text-sm font-medium text-red-800">Total Outstanding:</span>
              <span className="font-bold text-red-600">Rs. {selectedDebtor.totalDebt.toFixed(2)}</span>
            </div>

            <input
              type="number"
              placeholder="Enter Cash Amount Received"
              className="border p-3 w-full mb-4 rounded-md focus:ring-2 focus:ring-green-500 font-bold"
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setSettleOpen(false)} 
                className="px-4 py-2 text-gray-600 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleSettleDebt} 
                disabled={isSettling}
                className="bg-green-600 text-white px-4 py-2 rounded-md font-bold disabled:opacity-50"
              >
                {isSettling ? "Processing..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-black text-white px-4 py-2 rounded">
          {toast}
        </div>
      )}
    </div>
  );
}