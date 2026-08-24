"use client";

import { useState } from "react";
import {
  Search,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Loader2,
  X,
  Truck,
  Clock,
} from "lucide-react";

type Claim = {
  id: string;
  claimNumber: string;
  issue: string;
  status: string;
  resolution: string | null;
  supplierClaimRef: string | null;
  supplierNotes: string | null;
  sentToSupplierAt: string | null;
  supplierRespondedAt: string | null;
  resolvedAt: string | null;
  reportedAt: string;
  handledByUser?: { id: string; name: string | null } | null;
};

type Warranty = {
  id: string;
  warrantyNumber: string;
  serialNumber: string | null;
  months: number;
  startDate: string;
  endDate: string;
  status: string;
  effectiveStatus: string;
  daysRemaining: number;
  item: { id: string; name: string; barcode: string };
  bill: { id: string; billNumber: string; createdAt: string };
  customer: { id: string; name: string; phone: string | null } | null;
  supplier: { id: string; name: string; phone: string | null } | null;
  batch: { warrantyMonths: number | null; supplierWarrantyRef: string | null } | null;
  claims: Claim[];
};

const CLAIM_STEPS = [
  { value: "RECEIVED", label: "Received from customer" },
  { value: "SENT_TO_SUPPLIER", label: "Sent to supplier" },
  { value: "SUPPLIER_APPROVED", label: "Supplier approved" },
  { value: "SUPPLIER_REJECTED", label: "Supplier rejected" },
  { value: "RESOLVED", label: "Resolved with customer" },
  { value: "REJECTED", label: "Rejected" },
];

export default function WarrantyClient() {

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Claim modal
  const [claimTarget, setClaimTarget] = useState<Warranty | null>(null);
  const [claimIssue, setClaimIssue] = useState("");
  const [claimSaving, setClaimSaving] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [expiredConfirm, setExpiredConfirm] = useState(false);

  // Inline serial editing
  const [serialEditId, setSerialEditId] = useState<string | null>(null);
  const [serialValue, setSerialValue] = useState("");

  const runSearch = async (
    term: string,
    statusFilter?: string
  ) => {

    setLoading(true);
    setError(null);
    setSearched(true);

    try {

      const params = new URLSearchParams();
      if (term) params.set("search", term);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/warranties?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      setResults(json.data || []);

    } catch (err: any) {
      setError(err.message || "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const submitClaim = async (force = false) => {

    if (!claimTarget || !claimIssue.trim()) {
      setClaimError("Describe the fault before raising a claim.");
      return;
    }

    setClaimSaving(true);
    setClaimError(null);

    try {

      const res = await fetch("/api/warranties/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warrantyId: claimTarget.id,
          issue: claimIssue,
          force,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        // An expired warranty needs an explicit goodwill confirmation.
        if (json.expired) {
          setExpiredConfirm(true);
          setClaimError(json.error);
          return;
        }
        throw new Error(json.error);
      }

      setClaimTarget(null);
      setClaimIssue("");
      setExpiredConfirm(false);
      await runSearch(search);

    } catch (err: any) {
      setClaimError(err.message || "Failed to raise claim");
    } finally {
      setClaimSaving(false);
    }
  };

  const updateClaim = async (
    claimId: string,
    patch: Record<string, unknown>
  ) => {

    try {

      const res = await fetch(`/api/warranties/claims/${claimId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      await runSearch(search);

    } catch (err: any) {
      alert(`Failed to update claim: ${err.message}`);
    }
  };

  const saveSerial = async (warrantyId: string) => {

    try {

      const res = await fetch(`/api/warranties/${warrantyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: serialValue }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setSerialEditId(null);
      setSerialValue("");
      await runSearch(search);

    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>

      {/* ── SEARCH ── */}

      <div className="bg-white border shadow-sm rounded-xl p-5 mb-6">

        <label className="block text-sm font-medium text-gray-700 mb-2">
          Find a warranty
        </label>

        <div className="flex gap-2">

          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch(search);
              }}
              placeholder="Warranty no, serial no, invoice no, customer phone or name..."
              className="w-full border rounded-md pl-10 p-3 text-sm"
            />
          </div>

          <button
            onClick={() => runSearch(search)}
            disabled={loading}
            className="px-6 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>

        </div>

        <button
          onClick={() => {
            setSearch("");
            runSearch("", "OPEN_CLAIMS");
          }}
          className="text-sm text-blue-600 hover:underline mt-3 inline-flex items-center gap-1"
        >
          <Clock className="h-3.5 w-3.5" />
          Show all open claims
        </button>

      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* ── RESULTS ── */}

      {searched && !loading && results.length === 0 && !error && (
        <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
          <ShieldOff className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No warranty found</p>
          <p className="text-sm mt-1">
            Check the invoice number, or search by the customer&apos;s phone number.
          </p>
        </div>
      )}

      <div className="space-y-4">

        {results.map((warranty) => {

          const status = warranty.effectiveStatus;

          const openClaim = warranty.claims.find(
            (claim) => !["RESOLVED", "REJECTED"].includes(claim.status)
          );

          return (
            <div
              key={warranty.id}
              className="bg-white border shadow-sm rounded-xl overflow-hidden"
            >

              {/* STATUS BANNER */}

              <div
                className={`px-5 py-3 flex items-center justify-between ${
                  status === "ACTIVE"
                    ? "bg-emerald-50 border-b border-emerald-200"
                    : status === "CLAIMED"
                    ? "bg-blue-50 border-b border-blue-200"
                    : status === "VOID"
                    ? "bg-gray-100 border-b border-gray-200"
                    : "bg-red-50 border-b border-red-200"
                }`}
              >

                <div className="flex items-center gap-2">

                  {status === "ACTIVE" ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  ) : status === "CLAIMED" ? (
                    <ShieldAlert className="h-5 w-5 text-blue-600" />
                  ) : (
                    <ShieldOff className="h-5 w-5 text-gray-500" />
                  )}

                  <span
                    className={`font-bold text-sm ${
                      status === "ACTIVE"
                        ? "text-emerald-800"
                        : status === "CLAIMED"
                        ? "text-blue-800"
                        : status === "VOID"
                        ? "text-gray-600"
                        : "text-red-800"
                    }`}
                  >
                    {status === "ACTIVE"
                      ? `UNDER WARRANTY — ${warranty.daysRemaining} days left`
                      : status === "CLAIMED"
                      ? "CLAIM IN PROGRESS"
                      : status === "VOID"
                      ? "VOID — ITEM WAS RETURNED"
                      : `EXPIRED on ${new Date(warranty.endDate).toLocaleDateString()}`}
                  </span>

                </div>

                <span className="font-mono text-xs text-gray-600">
                  {warranty.warrantyNumber}
                </span>

              </div>

              {/* BODY */}

              <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">

                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Item</p>
                  <p className="font-bold text-gray-900">{warranty.item.name}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {warranty.item.barcode}
                  </p>

                  <div className="mt-2">
                    <p className="text-xs text-gray-500">Serial</p>
                    {serialEditId === warranty.id ? (
                      <div className="flex gap-1 mt-1">
                        <input
                          value={serialValue}
                          onChange={(e) => setSerialValue(e.target.value)}
                          autoFocus
                          className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                          placeholder="Scan or type serial"
                        />
                        <button
                          onClick={() => saveSerial(warranty.id)}
                          className="text-xs bg-blue-600 text-white px-2 rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setSerialEditId(null)}
                          className="text-xs border px-2 rounded"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSerialEditId(warranty.id);
                          setSerialValue(warranty.serialNumber || "");
                        }}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {warranty.serialNumber || "— add serial —"}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Sold to</p>
                  <p className="font-medium text-gray-900">
                    {warranty.customer?.name || "Walk-in customer"}
                  </p>
                  {warranty.customer?.phone && (
                    <p className="text-xs text-gray-500">{warranty.customer.phone}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Invoice{" "}
                    <span className="font-mono text-gray-700">
                      {warranty.bill.billNumber}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(warranty.startDate).toLocaleDateString()} →{" "}
                    {new Date(warranty.endDate).toLocaleDateString()} ({warranty.months} mo)
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                    Backed by supplier
                  </p>
                  <p className="font-medium text-gray-900">
                    {warranty.supplier?.name || "Not recorded"}
                  </p>
                  {warranty.supplier?.phone && (
                    <p className="text-xs text-gray-500">{warranty.supplier.phone}</p>
                  )}
                  {warranty.batch?.warrantyMonths && (
                    <p className="text-xs text-gray-500 mt-2">
                      Supplier gave {warranty.batch.warrantyMonths} months on this shipment
                    </p>
                  )}
                  {warranty.batch?.supplierWarrantyRef && (
                    <p className="text-xs text-gray-500 font-mono">
                      Ref: {warranty.batch.supplierWarrantyRef}
                    </p>
                  )}
                </div>

              </div>

              {/* CLAIMS */}

              {warranty.claims.length > 0 && (
                <div className="border-t bg-gray-50 p-5 space-y-4">

                  <h4 className="text-xs font-bold text-gray-700 uppercase">
                    Claim history
                  </h4>

                  {warranty.claims.map((claim) => (
                    <div
                      key={claim.id}
                      className="bg-white border rounded-lg p-4 text-sm"
                    >

                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-mono text-xs text-gray-500">
                            {claim.claimNumber}
                          </p>
                          <p className="font-medium text-gray-900 mt-0.5">{claim.issue}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Reported {new Date(claim.reportedAt).toLocaleDateString()}
                            {claim.handledByUser?.name &&
                              ` by ${claim.handledByUser.name}`}
                          </p>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                          {claim.status.replace(/_/g, " ")}
                        </span>
                      </div>

                      {/* SUPPLIER TRAIL */}

                      {(claim.sentToSupplierAt || claim.supplierRespondedAt) && (
                        <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mb-3 space-y-0.5">
                          {claim.sentToSupplierAt && (
                            <p className="flex items-center gap-1">
                              <Truck className="h-3 w-3" />
                              Sent to supplier{" "}
                              {new Date(claim.sentToSupplierAt).toLocaleDateString()}
                              {claim.supplierClaimRef && ` (ref ${claim.supplierClaimRef})`}
                            </p>
                          )}
                          {claim.supplierRespondedAt && (
                            <p>
                              Supplier responded{" "}
                              {new Date(claim.supplierRespondedAt).toLocaleDateString()}
                              {claim.supplierNotes && ` — ${claim.supplierNotes}`}
                            </p>
                          )}
                        </div>
                      )}

                      {/* ADVANCE THE CLAIM */}

                      {!["RESOLVED", "REJECTED"].includes(claim.status) && (
                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">

                          <select
                            value={claim.status}
                            onChange={(e) =>
                              updateClaim(claim.id, { status: e.target.value })
                            }
                            className="text-xs border rounded px-2 py-1.5"
                          >
                            {CLAIM_STEPS.map((step) => (
                              <option key={step.value} value={step.value}>
                                {step.label}
                              </option>
                            ))}
                          </select>

                          <input
                            defaultValue={claim.supplierClaimRef || ""}
                            onBlur={(e) => {
                              if (e.target.value !== (claim.supplierClaimRef || "")) {
                                updateClaim(claim.id, {
                                  supplierClaimRef: e.target.value,
                                });
                              }
                            }}
                            placeholder="Supplier claim ref"
                            className="text-xs border rounded px-2 py-1.5 w-40"
                          />

                          <select
                            value={claim.resolution || ""}
                            onChange={(e) =>
                              updateClaim(claim.id, {
                                resolution: e.target.value || null,
                                status: e.target.value ? "RESOLVED" : claim.status,
                              })
                            }
                            className="text-xs border rounded px-2 py-1.5"
                          >
                            <option value="">Close as…</option>
                            <option value="REPAIR">Repaired</option>
                            <option value="REPLACE">Replaced</option>
                            <option value="REFUND">Refunded</option>
                            <option value="REJECTED">Rejected</option>
                          </select>

                        </div>
                      )}

                      {claim.resolution && (
                        <p className="text-xs font-bold text-emerald-700 mt-2">
                          Closed as {claim.resolution.toLowerCase()}
                          {claim.resolvedAt &&
                            ` on ${new Date(claim.resolvedAt).toLocaleDateString()}`}
                        </p>
                      )}

                    </div>
                  ))}

                </div>
              )}

              {/* RAISE CLAIM */}

              {status !== "VOID" && !openClaim && (
                <div className="border-t p-4 bg-gray-50">
                  <button
                    onClick={() => {
                      setClaimTarget(warranty);
                      setClaimIssue("");
                      setClaimError(null);
                      setExpiredConfirm(false);
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-bold hover:bg-amber-700"
                  >
                    Raise a claim
                  </button>
                </div>
              )}

            </div>
          );
        })}

      </div>

      {/* ── CLAIM MODAL ── */}

      {claimTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border overflow-hidden">

            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <h2 className="text-lg font-bold text-gray-800">Raise Warranty Claim</h2>
              <button
                onClick={() => setClaimTarget(null)}
                className="text-gray-400 hover:text-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">

              <div className="bg-gray-50 border rounded-md p-3 text-sm">
                <p className="font-bold">{claimTarget.item.name}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  {claimTarget.warrantyNumber}
                  {claimTarget.serialNumber && ` · SN ${claimTarget.serialNumber}`}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Claim goes to {claimTarget.supplier?.name || "the supplier"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What is wrong with it?
                </label>
                <textarea
                  value={claimIssue}
                  onChange={(e) => setClaimIssue(e.target.value)}
                  rows={4}
                  autoFocus
                  className="w-full border rounded-md p-3 text-sm"
                  placeholder="e.g. Motor stopped working after 3 months, does not power on"
                />
              </div>

              {claimError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
                  {claimError}
                </div>
              )}

            </div>

            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
              <button
                onClick={() => setClaimTarget(null)}
                className="px-4 py-2 border rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => submitClaim(expiredConfirm)}
                disabled={claimSaving}
                className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-bold disabled:opacity-50"
              >
                {claimSaving
                  ? "Saving..."
                  : expiredConfirm
                  ? "Log as goodwill claim"
                  : "Raise claim"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
