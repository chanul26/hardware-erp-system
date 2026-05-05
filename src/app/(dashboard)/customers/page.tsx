"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  name: string;
  email?: string;
  phone: string;
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

  // form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const loadCustomers = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/customers?search=${search}&page=${page}&limit=${limit}`
    );
    const data = await res.json();
    setCustomers(data.customers);
    setTotal(data.total);
    setLoading(false);
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
    setEmail("");
    setPhone("");
    setEditId(null);
  };

  const handleSubmit = async () => {
    if (!name || !phone) {
      showToast("Name and phone required");
      return;
    }

    const method = editId ? "PUT" : "POST";

    const res = await fetch("/api/customers", {
      method,
      body: JSON.stringify({
        id: editId,
        name,
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
      showToast(data.error || "Error");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = confirm(
      "Are you sure? This will permanently delete the customer."
    );
    if (!confirmDelete) return;

    await fetch(`/api/customers?id=${id}`, {
      method: "DELETE",
    });

    showToast("Deleted successfully");
    loadCustomers();
  };

  const handleEdit = (c: Customer) => {
    setName(c.name);
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
            <th>Email</th>
            <th>Phone</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {customers.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center p-4">
                No customers found
              </td>
            </tr>
          ) : (
            customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.id.slice(0, 6)}</td>
                <td>{c.name}</td>
                <td>{c.email || "-"}</td>
                <td>{c.phone}</td>
                <td className="flex gap-2 p-2">
                  <button
                    onClick={() => handleEdit(c)}
                    className="bg-yellow-400 px-2 py-1 rounded"
                  >
                    ✏️ Edit
                  </button>

                  <button
                    onClick={() => handleDelete(c.id)}
                    className="bg-red-500 text-white px-2 py-1 rounded"
                  >
                    🗑 Delete
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

      {/* toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-black text-white px-4 py-2 rounded">
          {toast}
        </div>
      )}
    </div>
  );
}