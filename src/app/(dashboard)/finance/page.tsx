// File: src/app/(dashboard)/finance/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Landmark, Users, Receipt, Wallet, Plus, Loader2 } from "lucide-react";

export default function AdvancedFinancePage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Transaction Ledger Form States
  const [type, setType] = useState("BANK_DEPOSIT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedBorrowerId, setSelectedBorrowerId] = useState("");
  const [txSubmitting, setTxSubmitting] = useState(false);

  // Quick Add Independent Panel States
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [newBankAcc, setNewBankAcc] = useState("");
  const [bankSubmitting, setBankSubmitting] = useState(false);

  const [showAddBorrower, setShowAddBorrower] = useState(false);
  const [newBName, setNewBName] = useState("");
  const [newBPhone, setNewBPhone] = useState("");
  const [newBDetails, setNewBDetails] = useState("");
  const [borrowerSubmitting, setBorrowerSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [txRes, bankRes, borrRes] = await Promise.all([
        fetch("/api/finance"),
        fetch("/api/finance/banks"),
        fetch("/api/finance/borrowers"),
      ]);
      const [txJson, bankJson, borrJson] = await Promise.all([
        txRes.json(),
        bankRes.json(),
        borrRes.json(),
      ]);

      if (txJson.success) setTransactions(txJson.data);
      if (bankJson.success) setBanks(bankJson.data);
      if (borrJson.success) setBorrowers(borrJson.data);
    } catch (err) {
      console.error("Error loading finance elements:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Submit Ledger Entries
  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return alert("Please fill in all required fields.");
    
    if (["BANK_DEPOSIT", "BANK_WITHDRAWAL"].includes(type) && !selectedBankId) {
      return alert("Please choose or register a target bank account.");
    }
    if (["LOAN_GIVEN", "LOAN_REPAYMENT"].includes(type) && !selectedBorrowerId) {
      return alert("Please select or register a person.");
    }

    setTxSubmitting(true);
    try {
      const res = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount,
          description,
          bankId: selectedBankId || null,
          borrowerId: selectedBorrowerId || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setAmount("");
        setDescription("");
        fetchData();
        alert("Transaction successfully recorded!");
      } else {
        alert(`Failed: ${json.error}`);
      }
    } catch (err: any) {
      alert(`System Error: ${err.message}`);
    } finally {
      setTxSubmitting(false);
    }
  };

  // Standalone Action: Save Bank Account Registry
  const handleSaveBankRegistry = async () => {
    if (!newBankName.trim()) return alert("Please type a valid Bank Name.");
    setBankSubmitting(true);
    try {
      const res = await fetch("/api/finance/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBankName, accountNumber: newBankAcc }),
      });
      const json = await res.json();
      if (json.success) {
        setBanks([...banks, json.data]);
        setSelectedBankId(json.data.id);
        setNewBankName("");
        setNewBankAcc("");
        setShowAddBank(false);
        alert("Bank registered successfully!");
      } else {
        alert(`Error: ${json.error}`);
      }
    } catch (err: any) {
      alert(`Request failed: ${err.message}`);
    } finally {
      setBankSubmitting(false);
    }
  };

  // Standalone Action: Save Person Profile
  const handleSavePersonProfile = async () => {
    if (!newBName.trim()) return alert("Please type a valid name.");
    setBorrowerSubmitting(true);
    try {
      const res = await fetch("/api/finance/borrowers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBName, phone: newBPhone, details: newBDetails }),
      });
      const json = await res.json();
      if (json.success) {
        setBorrowers([...borrowers, json.data]);
        setSelectedBorrowerId(json.data.id);
        setNewBName("");
        setNewBPhone("");
        setNewBDetails("");
        setShowAddBorrower(false);
        alert("Person registered successfully!");
      } else {
        alert(`Error: ${json.error}`);
      }
    } catch (err: any) {
      alert(`Request failed: ${err.message}`);
    } finally {
      setBorrowerSubmitting(false);
    }
  };

  // Financial Metrics Summaries
  const netBankBalance = transactions.reduce((acc, t) => {
    if (t.type === "BANK_DEPOSIT") return acc + t.amount;
    if (t.type === "BANK_WITHDRAWAL") return acc - t.amount;
    return acc;
  }, 0);

  const totalActiveLoansGivenOut = transactions.reduce((acc, t) => {
    if (t.type === "LOAN_GIVEN") return acc + t.amount;
    if (t.type === "LOAN_REPAYMENT") return acc - t.amount;
    return acc;
  }, 0);

  const totalBillsPaid = transactions.filter(t => t.type === "BILL_PAYMENT").reduce((s, t) => s + t.amount, 0);

  const getLabelAndColor = (type: string) => {
    switch (type) {
      case "BANK_DEPOSIT": return { txt: "Bank Deposit (+)", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "BANK_WITHDRAWAL": return { txt: "Bank Withdrawal (-)", cls: "bg-red-50 text-red-700 border-red-200" };
      case "LOAN_GIVEN": return { txt: "Loan Given Out (-)", cls: "bg-amber-50 text-amber-700 border-amber-200" };
      case "LOAN_REPAYMENT": return { txt: "Loan Repayment Received (+)", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" };
      case "BILL_PAYMENT": return { txt: "Bill Payment (-)", cls: "bg-slate-100 text-slate-700 border-slate-300" };
      default: return { txt: "Misc Expense (-)", cls: "bg-stone-50 text-stone-700 border-stone-200" };
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto bg-gray-50/50 min-h-screen">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Non-Shop Capital & Finance Flow</h1>
        <p className="text-sm text-gray-500 mt-1">Manage external assets, dynamic bank entries, utility processing, and personal advances.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Available Bank Assets</span>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">Rs. {netBankBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100"><Landmark className="w-6 h-6" /></div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Debt Owed to You</span>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">Rs. {totalActiveLoansGivenOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100"><Users className="w-6 h-6" /></div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Accumulated Utility Bills Paid</span>
            <h3 className="text-2xl font-bold text-red-600 mt-1">Rs. {totalBillsPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="p-3 bg-red-50 rounded-xl text-red-500 border border-red-100"><Receipt className="w-6 h-6" /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Hand: Management Action Column */}
        <div className="space-y-6">
          
          {/* Main Entry Ledger Form */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Wallet className="text-blue-600 w-5 h-5"/> Log New Capital Entry</h2>
            
            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase">Flow Category Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full border border-gray-300 p-2.5 rounded-lg mt-1 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                >
                  <option value="BANK_DEPOSIT">Bank Savings / Deposit (+)</option>
                  <option value="BANK_WITHDRAWAL">Bank Withdrawal / Capital Return (-)</option>
                  <option value="LOAN_GIVEN">Lend Money / Loan Out (-)</option>
                  <option value="LOAN_REPAYMENT">Receive Loan Payment Back (+)</option>
                  <option value="BILL_PAYMENT">External Bill Payment / Expense (-)</option>
                  <option value="MISC_EXPENSE">Miscellaneous External Expense (-)</option>
                </select>
              </div>

              {/* Bank Selection Mode Dropdown */}
              {["BANK_DEPOSIT", "BANK_WITHDRAWAL"].includes(type) && (
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-600 uppercase">Target Bank Account</label>
                    <button type="button" onClick={() => setShowAddBank(!showAddBank)} className="text-blue-600 font-semibold text-xs flex items-center gap-1 hover:underline">
                      <Plus className="w-3 h-3"/> {showAddBank ? "Show Selection" : "Quick Add Bank"}
                    </button>
                  </div>
                  
                  {!showAddBank && (
                    <select value={selectedBankId} onChange={(e)=>setSelectedBankId(e.target.value)} className="w-full border bg-white p-2 text-sm rounded-md outline-none">
                      <option value="">-- Choose registered bank --</option>
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name} {b.accountNumber ? `(${b.accountNumber})` : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Person Selection Mode Dropdown */}
              {["LOAN_GIVEN", "LOAN_REPAYMENT"].includes(type) && (
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-600 uppercase">Select Target Person</label>
                    <button type="button" onClick={() => setShowAddBorrower(!showAddBorrower)} className="text-blue-600 font-semibold text-xs flex items-center gap-1 hover:underline">
                      <Plus className="w-3 h-3"/> {showAddBorrower ? "Show Selection" : "Register New Person"}
                    </button>
                  </div>

                  {!showAddBorrower && (
                    <select value={selectedBorrowerId} onChange={(e)=>setSelectedBorrowerId(e.target.value)} className="w-full border bg-white p-2 text-sm rounded-md outline-none">
                      <option value="">-- Select Registered Profile --</option>
                      {borrowers.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase">Amount (Rs.)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-gray-300 p-2.5 rounded-lg mt-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase">Reference Context / Memo</label>
                <textarea
                  required
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-300 p-2.5 rounded-lg mt-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Describe details..."
                />
              </div>

              <button
                type="submit"
                disabled={txSubmitting}
                className="w-full bg-slate-900 text-white font-medium py-3 rounded-lg hover:bg-slate-800 transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {txSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Commit Ledger Entry"}
              </button>
            </form>
          </div>

          {/* Quick Add Bank Registry Panel (COMPLETELY SEPARATED FROM MAIN FORM ELEMENT) */}
          {showAddBank && (
            <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-200 shadow-sm space-y-3 animate-in fade-in duration-200">
              <h3 className="text-sm font-bold text-blue-900 flex items-center gap-1.5"><Landmark className="w-4 h-4"/> Register Bank Option</h3>
              <div className="space-y-2">
                <input type="text" placeholder="Bank Name (e.g., Commercial Bank)" value={newBankName} onChange={e=>setNewBankName(e.target.value)} className="w-full border bg-white border-gray-300 p-2 text-sm rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                <input type="text" placeholder="Account Number (Optional)" value={newBankAcc} onChange={e=>setNewBankAcc(e.target.value)} className="w-full border bg-white border-gray-300 p-2 text-sm rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                <div className="flex gap-2 justify-end pt-1">
                  <button type="button" onClick={()=>setShowAddBank(false)} className="px-3 py-1.5 text-xs font-semibold bg-gray-200 rounded-md hover:bg-gray-300 transition">Cancel</button>
                  <button type="button" disabled={bankSubmitting} onClick={handleSaveBankRegistry} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1">
                    {bankSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Bank Option"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Register Person Profile Panel (COMPLETELY SEPARATED FROM MAIN FORM ELEMENT) */}
          {showAddBorrower && (
            <div className="bg-amber-50/50 p-5 rounded-xl border border-amber-200 shadow-sm space-y-3 animate-in fade-in duration-200">
              <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5"><Users className="w-4 h-4"/> Register Person Profile</h3>
              <div className="space-y-2">
                <input type="text" placeholder="Person's Full Name" value={newBName} onChange={e=>setNewBName(e.target.value)} className="w-full border bg-white border-gray-300 p-2 text-sm rounded-md focus:ring-2 focus:ring-amber-500 outline-none font-medium" />
                <input type="text" placeholder="Phone Number" value={newBPhone} onChange={e=>setNewBPhone(e.target.value)} className="w-full border bg-white border-gray-300 p-2 text-sm rounded-md focus:ring-2 focus:ring-amber-500 outline-none" />
                <input type="text" placeholder="Extra Details / Notes" value={newBDetails} onChange={e=>setNewBDetails(e.target.value)} className="w-full border bg-white border-gray-300 p-2 text-sm rounded-md focus:ring-2 focus:ring-amber-500 outline-none" />
                <div className="flex gap-2 justify-end pt-1">
                  <button type="button" onClick={()=>setShowAddBorrower(false)} className="px-3 py-1.5 text-xs font-semibold bg-gray-200 rounded-md hover:bg-gray-300 transition">Cancel</button>
                  <button type="button" disabled={borrowerSubmitting} onClick={handleSavePersonProfile} className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:opacity-50 flex items-center gap-1">
                    {borrowerSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Person"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Hand: Log Output Audit Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/70 flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-700 uppercase tracking-wider">Audit Trail Log History</h3>
            </div>

            {loading ? (
              <div className="p-12 text-center flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100/70 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase">
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Class Target</th>
                      <th className="p-4">Memo Details / Profile context</th>
                      <th className="p-4 text-right">Magnitude</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {transactions.map((t) => {
                      const meta = getLabelAndColor(t.type);
                      return (
                        <tr key={t.id} className="hover:bg-gray-50/80 transition text-xs md:text-sm">
                          <td className="p-4 text-gray-500 whitespace-nowrap">
                            {new Date(t.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold border ${meta.cls} whitespace-nowrap`}>
                              {meta.txt}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-gray-900">{t.description}</div>
                            {t.bank && (
                              <div className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-0.5">
                                <Landmark className="w-3 h-3" /> Account: {t.bank.name} {t.bank.accountNumber ? `[${t.bank.accountNumber}]` : ""}
                              </div>
                            )}
                            {t.borrower && (
                              <div className="text-xs text-amber-600 font-medium flex items-center gap-1 mt-0.5">
                                <Users className="w-3 h-3" /> Person: {t.borrower.name} {t.borrower.phone ? `(${t.borrower.phone})` : ""}
                                {t.borrower.details && <span className="text-gray-400 font-normal ml-1">| {t.borrower.details}</span>}
                              </div>
                            )}
                          </td>
                          <td className={`p-4 text-right font-bold text-base whitespace-nowrap ${["BANK_DEPOSIT", "LOAN_REPAYMENT"].includes(t.type) ? "text-emerald-600" : "text-gray-900"}`}>
                            {["BANK_DEPOSIT", "LOAN_REPAYMENT"].includes(t.type) ? "+" : "-"} Rs. {t.amount.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-12 text-center text-gray-400 text-sm font-medium">
                          No transactions recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}