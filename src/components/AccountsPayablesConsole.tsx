import React, { useState, useEffect } from "react";
import { Payable, PayablePayment } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { useToast } from "../context/ToastContext";
import { isPostgresTarget, selectQuery, executeQuery } from "../utils/dbHelper";

interface AccountsPayablesConsoleProps {
  db: Database | null;
}

export default function AccountsPayablesConsole({ db }: AccountsPayablesConsoleProps) {
  const toast = useToast();
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payments, setPayments] = useState<PayablePayment[]>([]);

  // Modals
  const [showPayableModal, setShowPayableModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Payable Form State
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Payable["category"]>("RENT & LEASE");
  const [vendorPayee, setVendorPayee] = useState("");
  const [totalAmountDue, setTotalAmountDue] = useState("");
  const [billingFrequency, setBillingFrequency] = useState<Payable["billingFrequency"]>("MONTHLY");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<PayablePayment["paymentMethod"]>("CHECK");
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const loadData = async () => {
    if (!db) {
      setPayables([]);
      setPayments([]);
      return;
    }

    try {
      const dbPath = String((db as any).path || (db as any).connection?.url || "");
      const isPg = isPostgresTarget(dbPath);

      const payableRows = await selectQuery<any>(db, isPg, "SELECT * FROM neugate.payables ORDER BY due_date ASC");
      const paymentRows = await selectQuery<any>(db, isPg, "SELECT * FROM neugate.payable_payments ORDER BY id DESC");

      if (payableRows && payableRows.length > 0) {
        setPayables(
          payableRows.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            vendorPayee: r.vendor_payee,
            totalAmountDue: r.total_amount_due,
            totalPaid: r.total_paid,
            remainingBalance: r.remaining_balance,
            billingFrequency: r.billing_frequency || "MONTHLY",
            dueDate: r.due_date,
            status: r.status,
            notes: r.notes,
            createdAt: r.created_at,
          }))
        );
      } else {
        setPayables([]);
      }

      if (paymentRows && paymentRows.length > 0) {
        setPayments(
          paymentRows.map((r) => ({
            id: r.id,
            payableId: r.payable_id,
            disbursementNo: r.disbursement_no,
            paymentDate: r.payment_date,
            amountPaid: r.amount_paid,
            paymentMethod: r.payment_method,
            referenceNo: r.reference_no,
            paidBy: r.paid_by,
            notes: r.notes,
            createdAt: r.created_at,
          }))
        );
      } else {
        setPayments([]);
      }
    } catch (err) {
      console.error("Failed to load payables data:", err);
      setPayables([]);
      setPayments([]);
    }
  };

  useEffect(() => {
    loadData();
  }, [db]);

  const resetPayableForm = () => {
    setEditingPayable(null);
    setTitle("");
    setVendorPayee("");
    setTotalAmountDue("");
    setBillingFrequency("MONTHLY");
    setDueDate(new Date().toISOString().split("T")[0]);
    setNotes("");
  };

  const handleOpenCreatePayable = () => {
    resetPayableForm();
    setShowPayableModal(true);
  };

  const handleOpenEditPayable = (payable: Payable) => {
    setEditingPayable(payable);
    setTitle(payable.title);
    setCategory(payable.category);
    setVendorPayee(payable.vendorPayee);
    setTotalAmountDue(String(payable.totalAmountDue));
    setBillingFrequency(payable.billingFrequency || "MONTHLY");
    setDueDate(payable.dueDate);
    setNotes(payable.notes || "");
    setShowPayableModal(true);
  };

  const handleDeletePayable = async (payable: Payable) => {
    if (!confirm(`Are you sure you want to delete payable "${payable.title}"?`)) return;

    if (db) {
      try {
        const dbPath = String((db as any).path || (db as any).connection?.url || "");
        const isPg = isPostgresTarget(dbPath);
        const numericId = typeof payable.id === "number" ? payable.id : parseInt(String(payable.id), 10);

        await executeQuery(db, isPg, "DELETE FROM neugate.payables WHERE id = $1", [isNaN(numericId) ? payable.id : numericId]);
        toast.success(`Payable "${payable.title}" deleted successfully.`, "Deleted");
        await loadData();
      } catch (err) {
        console.error("Failed to delete payable:", err);
        toast.error("Database error while deleting payable.", "Error");
      }
    } else {
      setPayables(payables.filter(p => p.id !== payable.id));
      toast.success(`Payable "${payable.title}" deleted (Demo Mode).`, "Deleted");
    }
  };

  // Create or Update Payable
  const handleSavePayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !vendorPayee || !totalAmountDue || parseFloat(totalAmountDue) <= 0) {
      toast.error("Please fill in title, vendor name, and valid amount due.", "Validation Error");
      return;
    }

    const amt = parseFloat(totalAmountDue);
    const dbPath = db ? String((db as any).path || (db as any).connection?.url || "") : "";
    const isPg = db ? isPostgresTarget(dbPath) : false;

    if (editingPayable) {
      const updatedBalance = Math.max(0, amt - editingPayable.totalPaid);
      const updatedStatus = updatedBalance === 0 ? "FULLY PAID" : "ACTIVE";
      const numericId = typeof editingPayable.id === "number" ? editingPayable.id : parseInt(String(editingPayable.id), 10);

      if (db) {
        try {
          await executeQuery(
            db,
            isPg,
            `UPDATE neugate.payables SET
              title = $1, category = $2, vendor_payee = $3, total_amount_due = $4,
              remaining_balance = $5, billing_frequency = $6, due_date = $7, status = $8, notes = $9
             WHERE id = $10`,
            [title, category, vendorPayee, amt, updatedBalance, billingFrequency, dueDate, updatedStatus, notes, isNaN(numericId) ? editingPayable.id : numericId]
          );
          toast.success(`Payable "${title}" updated successfully!`, "Updated");
          await loadData();
        } catch (err) {
          console.error("Failed to update payable:", err);
          toast.error("Database error while updating payable.", "Error");
        }
      } else {
        setPayables(payables.map(p => p.id === editingPayable.id ? {
          ...p,
          title,
          category,
          vendorPayee,
          totalAmountDue: amt,
          remainingBalance: updatedBalance,
          billingFrequency,
          dueDate,
          status: updatedStatus,
          notes
        } : p));
        toast.success(`Payable "${title}" updated (Demo Mode).`, "Updated");
      }
    } else {
      const newRecord: Payable = {
        title,
        category,
        vendorPayee,
        totalAmountDue: amt,
        totalPaid: 0,
        remainingBalance: amt,
        billingFrequency,
        dueDate,
        status: "ACTIVE",
        notes,
        createdAt: new Date().toISOString(),
      };

      if (db) {
        try {
          await executeQuery(
            db,
            isPg,
            `INSERT INTO neugate.payables (
              title, category, vendor_payee, total_amount_due, total_paid, remaining_balance, billing_frequency, due_date, status, notes, created_at
            ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, 'ACTIVE', $8, $9)`,
            [newRecord.title, newRecord.category, newRecord.vendorPayee, newRecord.totalAmountDue, newRecord.remainingBalance, newRecord.billingFrequency, newRecord.dueDate, newRecord.notes, newRecord.createdAt]
          );
          toast.success(`Payable "${title}" added successfully!`, "Success");
          await loadData();
        } catch (err) {
          console.error("Failed to insert payable:", err);
          toast.error("Database error while creating payable.", "Error");
        }
      } else {
        setPayables([{ ...newRecord, id: payables.length + 1 }, ...payables]);
        toast.success(`Payable "${title}" recorded (Demo Mode).`, "Success");
      }
    }

    setShowPayableModal(false);
    resetPayableForm();
  };

  // Calculate Next Due Date based on Billing Frequency
  const calculateNextDueDate = (currentDueDateStr: string, frequency: Payable["billingFrequency"]): string => {
    const current = new Date(currentDueDateStr);
    if (isNaN(current.getTime())) return currentDueDateStr;

    switch (frequency) {
      case "BI-WEEKLY":
        current.setDate(current.getDate() + 14);
        break;
      case "MONTHLY":
        current.setMonth(current.getMonth() + 1);
        break;
      case "QUARTERLY":
        current.setMonth(current.getMonth() + 3);
        break;
      case "SEMI-ANNUAL":
        current.setMonth(current.getMonth() + 6);
        break;
      case "ANNUAL":
        current.setFullYear(current.getFullYear() + 1);
        break;
      case "ONE-TIME":
      default:
        return currentDueDateStr;
    }
    return current.toISOString().split("T")[0];
  };

  // Record Payment for a Payable
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayable || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error("Please enter a valid payment amount.", "Validation Error");
      return;
    }

    const payAmt = parseFloat(paymentAmount);
    const newPaidTotal = selectedPayable.totalPaid + payAmt;
    let newBalance = Math.max(0, selectedPayable.totalAmountDue - newPaidTotal);
    let newStatus: Payable["status"] = newBalance === 0 ? "FULLY PAID" : "ACTIVE";
    let nextDueDate = selectedPayable.dueDate;

    // Automatic Due Date Rollover & Amount Reset for Recurring Obligations if fully paid current cycle
    if (newBalance === 0 && selectedPayable.billingFrequency !== "ONE-TIME") {
      nextDueDate = calculateNextDueDate(selectedPayable.dueDate, selectedPayable.billingFrequency);
      newStatus = "ACTIVE";
      newBalance = selectedPayable.totalAmountDue;
    }

    const paymentRecord: PayablePayment = {
      payableId: selectedPayable.id!,
      paymentDate,
      amountPaid: payAmt,
      paymentMethod,
      referenceNo,
      paidBy: "Finance Officer",
      notes: paymentNotes,
      createdAt: new Date().toISOString(),
    };

    if (db) {
      try {
        const dbPath = String((db as any).path || (db as any).connection?.url || "");
        const isPg = isPostgresTarget(dbPath);
        const numericId = typeof selectedPayable.id === "number" ? selectedPayable.id : parseInt(String(selectedPayable.id), 10);

        await executeQuery(
          db,
          isPg,
          `INSERT INTO neugate.payable_payments (
            payable_id, payment_date, amount_paid, payment_method, reference_no, paid_by, notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [paymentRecord.payableId, paymentRecord.paymentDate, paymentRecord.amountPaid, paymentRecord.paymentMethod, paymentRecord.referenceNo, paymentRecord.paidBy, paymentRecord.notes, paymentRecord.createdAt]
        );

        const updatedPaid = newStatus === "ACTIVE" && selectedPayable.billingFrequency !== "ONE-TIME" && selectedPayable.totalPaid + payAmt >= selectedPayable.totalAmountDue ? 0 : newPaidTotal;

        await executeQuery(
          db,
          isPg,
          `UPDATE neugate.payables SET total_paid = $1, remaining_balance = $2, status = $3, due_date = $4 WHERE id = $5`,
          [updatedPaid, newBalance, newStatus, nextDueDate, isNaN(numericId) ? selectedPayable.id : numericId]
        );

        toast.success(`Payment of ₱${payAmt.toLocaleString()} recorded for ${selectedPayable.title}. Next due date: ${nextDueDate}`, "Payment Success");
        await loadData();
      } catch (err) {
        console.error("Failed to record payment:", err);
        toast.error("Database error while logging payment.", "Error");
      }
    } else {
      setPayments([{ ...paymentRecord, id: payments.length + 1 }, ...payments]);
      setPayables((prev) =>
        prev.map((p) =>
          p.id === selectedPayable.id
            ? { ...p, totalPaid: newPaidTotal, remainingBalance: newBalance, status: newStatus, dueDate: nextDueDate }
            : p
        )
      );
      toast.success(`Payment recorded (Demo Mode). Next due date: ${nextDueDate}`, "Payment Success");
    }

    setShowPaymentModal(false);
    setPaymentAmount("");
    setReferenceNo("");
    setPaymentNotes("");
  };

  const filteredPayables = payables.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.vendorPayee.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === "ALL" || p.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalPayablesDue = filteredPayables.reduce((acc, p) => acc + p.totalAmountDue, 0);
  const totalPaidAmount = filteredPayables.reduce((acc, p) => acc + p.totalPaid, 0);
  const totalBalanceRemaining = filteredPayables.reduce((acc, p) => acc + p.remainingBalance, 0);

  const getPaymentHistoryForPayable = (payableId?: number) => {
    if (!payableId) return [];
    return payments.filter((pm) => pm.payableId === payableId);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text)" }}>
            🏢 Recurring Accounts Payables &amp; Loans Monitor
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.2rem 0 0 0" }}>
            Track recurring financial obligations (Rent, Loans, Credit Lines, Utilities) &amp; inspect payment logs.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }} className="no-print">
          <button className="btn btn-primary" onClick={handleOpenCreatePayable}>
            ➕ Add Payable / Loan
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="stats-grid no-print">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--primary-dim)", color: "var(--primary)" }}>
            📊
          </div>
          <div className="stat-info">
            <div className="stat-title">TOTAL AMOUNT DUE</div>
            <div className="stat-number" style={{ color: "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>
              ₱{totalPayablesDue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{filteredPayables.length} Accounts Listed</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--success-dim)", color: "var(--success)" }}>
            ✅
          </div>
          <div className="stat-info">
            <div className="stat-title">PAID AMOUNT</div>
            <div className="stat-number" style={{ color: "var(--success)", fontFamily: "JetBrains Mono, monospace" }}>
              ₱{totalPaidAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Settled Payments</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--danger-dim)", color: "var(--danger)" }}>
            ⏳
          </div>
          <div className="stat-info">
            <div className="stat-title">REMAINING BALANCE</div>
            <div className="stat-number" style={{ color: "var(--danger)", fontFamily: "JetBrains Mono, monospace" }}>
              ₱{totalBalanceRemaining.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Outstanding Balance</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--purple-dim)", color: "var(--purple)" }}>
            📜
          </div>
          <div className="stat-info">
            <div className="stat-title">PAYMENT LOGS</div>
            <div className="stat-number" style={{ color: "var(--purple)", fontFamily: "JetBrains Mono, monospace" }}>
              {payments.length} Logs
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Total Payment Entries</span>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="directory-actions no-print" style={{ background: "var(--bg-card)", padding: "0.85rem 1.1rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", gap: "0.75rem", flexWrap: "wrap" }}>
        <div className="search-wrapper" style={{ minWidth: "220px" }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search Particulars, Vendor, Ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="form-select"
          style={{ width: "auto" }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="ALL">All Categories</option>
          <option value="RENT & LEASE">Rent &amp; Lease</option>
          <option value="LOAN & AMORTIZATION">Loan &amp; Amortization</option>
          <option value="UTILITIES">Utilities</option>
          <option value="SUPPLIER CREDIT">Supplier Credit</option>
          <option value="EQUIPMENT LEASE">Equipment Lease</option>
          <option value="GOVERNMENT TAX & DUES">Government Tax &amp; Dues</option>
          <option value="OTHER RECURRING">Other Recurring</option>
        </select>

        <select
          className="form-select"
          style={{ width: "auto" }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active / Outstanding</option>
          <option value="FULLY PAID">Fully Paid</option>
        </select>

        <button
          className="btn btn-outline"
          style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "0.4rem 0.75rem" }}
          onClick={() => {
            setSearchQuery("");
            setCategoryFilter("ALL");
            setStatusFilter("ALL");
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Main Table */}
      <div id="printable-report" className="table-card">
        <table>
          <thead>
            <tr>
              <th>Due Date</th>
              <th>Particulars &amp; Vendor</th>
              <th>Category</th>
              <th>Reference / Remarks</th>
              <th style={{ textAlign: "right" }}>Total Amount</th>
              <th style={{ textAlign: "right" }}>Paid Amount</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th style={{ textAlign: "center" }}>Status</th>
              <th style={{ textAlign: "right" }} className="no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayables.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🏢</div>
                  No accounts payables or loans found matching your filter.
                </td>
              </tr>
            ) : (
              filteredPayables.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem", fontWeight: 700, color: item.status === "FULLY PAID" ? "var(--text-muted)" : "var(--primary)" }}>
                    {item.dueDate}
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{item.title}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{item.vendorPayee}</div>
                  </td>
                  <td>
                    <span style={{
                      display: "inline-block",
                      fontSize: "0.65rem",
                      padding: "0.15rem 0.4rem",
                      borderRadius: "4px",
                      fontWeight: 700,
                      background: "var(--bg-input)",
                      color: "var(--text-muted)"
                    }}>
                      {item.category}
                    </span>
                  </td>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {item.notes || "-"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                    ₱{item.totalAmountDue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--success)" }}>
                    ₱{item.totalPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: item.remainingBalance > 0 ? "var(--danger)" : "var(--text-muted)" }}>
                    ₱{item.remainingBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "999px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      background: item.status === "FULLY PAID" ? "var(--success-dim)" : "var(--warning-dim)",
                      color: item.status === "FULLY PAID" ? "var(--success)" : "var(--warning)"
                    }}>
                      {item.status}
                    </span>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.2rem", fontWeight: 700 }}>
                      🔄 {item.billingFrequency || "MONTHLY"}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }} className="no-print">
                    <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                      {item.remainingBalance > 0 && (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                          onClick={() => {
                            setSelectedPayable(item);
                            setPaymentAmount(item.remainingBalance.toString());
                            setShowPaymentModal(true);
                          }}
                        >
                          💸 Pay
                        </button>
                      )}
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => {
                          setSelectedPayable(item);
                          setShowLogsModal(true);
                        }}
                      >
                        📜 Logs ({getPaymentHistoryForPayable(item.id).length})
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => handleOpenEditPayable(item)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => handleDeletePayable(item)}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {/* Footer Totals */}
          <tfoot>
            <tr style={{ background: "var(--bg-surface)", fontWeight: 800, borderTop: "2px solid var(--border)" }}>
              <td colSpan={4} style={{ textTransform: "uppercase", color: "var(--text-muted)" }}>TOTALS</td>
              <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem" }}>
                ₱{totalPayablesDue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </td>
              <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", color: "var(--success)" }}>
                ₱{totalPaidAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </td>
              <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", color: "var(--danger)" }}>
                ₱{totalBalanceRemaining.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal: Add / Edit Payable / Loan */}
      {showPayableModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: "550px" }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingPayable ? `✏️ Edit Account Payable (${editingPayable.title})` : "🏢 Add Account Payable / Loan"}
              </h3>
              <button className="modal-close" onClick={() => setShowPayableModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSavePayable}>
              <div className="form-group">
                <label className="form-label">Particulars / Account Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. EVERJUST RENTAL (1619SQM), JMC AUTOLOAN"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={category}
                    onChange={(e: any) => setCategory(e.target.value)}
                  >
                    <option value="RENT & LEASE">Rent &amp; Lease</option>
                    <option value="LOAN & AMORTIZATION">Loan &amp; Amortization</option>
                    <option value="UTILITIES">Utilities</option>
                    <option value="SUPPLIER CREDIT">Supplier Credit</option>
                    <option value="EQUIPMENT LEASE">Equipment Lease</option>
                    <option value="GOVERNMENT TAX & DUES">Gov Tax &amp; Dues</option>
                    <option value="OTHER RECURRING">Other Recurring</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Vendor / Bank / Payee</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. BDO, RCBC, Everjust"
                    value={vendorPayee}
                    onChange={(e) => setVendorPayee(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Total Amount Due (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}
                    value={totalAmountDue}
                    onChange={(e) => setTotalAmountDue(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Frequency</label>
                  <select
                    className="form-select"
                    value={billingFrequency}
                    onChange={(e: any) => setBillingFrequency(e.target.value)}
                  >
                    <option value="MONTHLY">🔄 Monthly</option>
                    <option value="BI-WEEKLY">🗓️ Bi-Weekly (Every 14 Days)</option>
                    <option value="QUARTERLY">📊 Quarterly (Every 3 Months)</option>
                    <option value="SEMI-ANNUAL">🗓️ Semi-Annual (Every 6 Months)</option>
                    <option value="ANNUAL">🎁 Annual (Every 12 Months)</option>
                    <option value="ONE-TIME">📌 One-Time Payment</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Next Due Date</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reference / Voucher No. / Remarks</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. CB#252228, DEPOSIT TO RCBC-067"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="form-actions" style={{ marginTop: "1.5rem", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowPayableModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingPayable ? "💾 Update Account Payable" : "Save Account Payable"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Payment */}
      {showPaymentModal && selectedPayable && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: "500px" }}>
            <div className="modal-header">
              <h3 className="modal-title">💸 Record Payment: {selectedPayable.title}</h3>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>✕</button>
            </div>

            <form onSubmit={handleRecordPayment}>
              <div style={{ background: "var(--bg-main)", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Current Remaining Balance:</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--danger)", fontFamily: "JetBrains Mono, monospace" }}>
                  ₱{selectedPayable.remainingBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Payment Amount (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select
                    className="form-select"
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                  >
                    <option value="CHECK">CHECK</option>
                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                    <option value="CASH">CASH</option>
                    <option value="GCASH/MAYA">GCASH / MAYA</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Check / Reference No.</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. CB#252252"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Payment Notes / Remarks</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Optional notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>

              <div className="form-actions" style={{ marginTop: "1.5rem", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Payment History Logs */}
      {showLogsModal && selectedPayable && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: "650px" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">📜 Payment History Logs</h3>
                <div style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 700, marginTop: "2px" }}>
                  {selectedPayable.title} - {selectedPayable.vendorPayee}
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowLogsModal(false)}>✕</button>
            </div>

            <div style={{ background: "var(--bg-main)", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Total Due: </span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>₱{selectedPayable.totalAmountDue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong>
              </div>
              <div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Total Paid: </span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--success)" }}>₱{selectedPayable.totalPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong>
              </div>
              <div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Remaining: </span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--danger)" }}>₱{selectedPayable.remainingBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Date Paid</th>
                    <th>Payment Method</th>
                    <th>Ref / Check #</th>
                    <th style={{ textAlign: "right" }}>Amount Paid</th>
                    <th>Paid By / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {getPaymentHistoryForPayable(selectedPayable.id).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        No payments recorded yet for this account.
                      </td>
                    </tr>
                  ) : (
                    getPaymentHistoryForPayable(selectedPayable.id).map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>{p.paymentDate}</td>
                        <td style={{ fontWeight: 600 }}>{p.paymentMethod}</td>
                        <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem", color: "var(--primary)" }}>{p.referenceNo || "-"}</td>
                        <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: "var(--success)" }}>
                          ₱{p.amountPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{p.notes || p.paidBy || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="form-actions" style={{ marginTop: "1.5rem", justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setShowLogsModal(false)}>
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
