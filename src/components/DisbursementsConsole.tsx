import React, { useState, useEffect } from "react";
import { Disbursement, DisbursementCategory, Employee } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { useToast } from "../context/ToastContext";
import { isPostgresTarget, selectQuery, executeQuery } from "../utils/dbHelper";

interface DisbursementsConsoleProps {
  db: Database | null;
  employees: Employee[];
}

export default function DisbursementsConsole({ db, employees }: DisbursementsConsoleProps) {
  const toast = useToast();
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Disbursement | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [payeeTypeFilter, setPayeeTypeFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Form State for New Disbursement
  const [payeeType, setPayeeType] = useState<"EMPLOYEE" | "VENDOR" | "GOVERNMENT" | "UTILITY" | "OTHER">("VENDOR");
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [payeeNameInput, setPayeeNameInput] = useState<string>("");
  const [category, setCategory] = useState<DisbursementCategory>("SUPPLIER / VENDOR PAYMENT");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CHECK" | "BANK TRANSFER" | "GCASH/MAYA">("CHECK");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [disbursementDate, setDisbursementDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState<string>("");
  const [approvedBy, setApprovedBy] = useState<string>("Finance Officer");
  const [notes, setNotes] = useState<string>("");

  // Initial state when DB is not ready

  const loadDisbursements = async () => {
    if (!db) {
      setDisbursements([]);
      return;
    }

    try {
      const dbPath = String((db as any).path || (db as any).connection?.url || "");
      const isPg = isPostgresTarget(dbPath);

      const rows = await selectQuery<any>(
        db,
        isPg,
        "SELECT * FROM neugate.disbursements ORDER BY id DESC"
      );

      if (rows && rows.length > 0) {
        setDisbursements(
          rows.map((r) => ({
            id: r.id,
            disbursementNo: r.disbursement_no,
            payeeName: r.payee_name,
            payeeType: r.payee_type,
            category: r.category,
            amount: r.amount,
            paymentMethod: r.payment_method,
            referenceNo: r.reference_no,
            date: r.date,
            description: r.description,
            approvedBy: r.approved_by,
            status: r.status,
            notes: r.notes,
            createdAt: r.created_at,
          }))
        );
      } else {
        setDisbursements([]);
      }
    } catch (err) {
      console.error("Failed to fetch disbursements:", err);
      setDisbursements([]);
    }
  };

  useEffect(() => {
    loadDisbursements();
  }, [db]);

  const [editingDisbursement, setEditingDisbursement] = useState<Disbursement | null>(null);

  const resetForm = () => {
    setEditingDisbursement(null);
    setPayeeType("VENDOR");
    setSelectedEmpId("");
    setPayeeNameInput("");
    setCategory("SUPPLIER / VENDOR PAYMENT");
    setAmount("");
    setPaymentMethod("CHECK");
    setReferenceNo("");
    setDisbursementDate(new Date().toISOString().split("T")[0]);
    setDescription("");
    setApprovedBy("Finance Officer");
    setNotes("");
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (voucher: Disbursement) => {
    setEditingDisbursement(voucher);
    setPayeeType(voucher.payeeType);
    const foundEmp = employees.find(e => e.name === voucher.payeeName);
    if (voucher.payeeType === "EMPLOYEE" && foundEmp) {
      setSelectedEmpId(foundEmp.id);
      setPayeeNameInput("");
    } else {
      setSelectedEmpId("");
      setPayeeNameInput(voucher.payeeName);
    }
    setCategory(voucher.category);
    setAmount(String(voucher.amount));
    setPaymentMethod(voucher.paymentMethod);
    setReferenceNo(voucher.referenceNo || "");
    setDisbursementDate(voucher.date);
    setDescription(voucher.description);
    setApprovedBy(voucher.approvedBy || "Finance Officer");
    setNotes(voucher.notes || "");
    setShowModal(true);
  };

  const handleDeleteDisbursement = async (voucher: Disbursement) => {
    if (!confirm(`Are you sure you want to delete disbursement voucher "${voucher.disbursementNo}"?`)) return;

    if (db) {
      try {
        const dbPath = String((db as any).path || (db as any).connection?.url || "");
        const isPg = isPostgresTarget(dbPath);
        const numericId = typeof voucher.id === "number" ? voucher.id : parseInt(String(voucher.id), 10);

        await executeQuery(
          db,
          isPg,
          "DELETE FROM neugate.disbursements WHERE id = $1 OR disbursement_no = $2",
          [isNaN(numericId) ? voucher.id : numericId, voucher.disbursementNo]
        );
        toast.success(`Disbursement Voucher ${voucher.disbursementNo} deleted successfully.`, "Deleted");
        await loadDisbursements();
      } catch (err) {
        console.error("Failed to delete disbursement:", err);
        toast.error("Database error while deleting disbursement voucher.", "Error");
      }
    } else {
      setDisbursements(disbursements.filter(d => d.disbursementNo !== voucher.disbursementNo));
      toast.success(`Disbursement Voucher ${voucher.disbursementNo} deleted (Demo Mode).`, "Deleted");
    }
  };

  const handleSaveDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalPayeeName = payeeType === "EMPLOYEE" 
      ? (employees.find(x => x.id === selectedEmpId)?.name || payeeNameInput)
      : payeeNameInput;

    if (!finalPayeeName || !amount || parseFloat(amount) <= 0 || !description) {
      toast.error("Please fill in payee name, valid amount, and description.", "Validation Error");
      return;
    }

    const dbPath = db ? String((db as any).path || (db as any).connection?.url || "") : "";
    const isPg = db ? isPostgresTarget(dbPath) : false;

    if (editingDisbursement) {
      const updatedRecord: Disbursement = {
        ...editingDisbursement,
        payeeName: finalPayeeName,
        payeeType: payeeType,
        category: category,
        amount: parseFloat(amount),
        paymentMethod: paymentMethod,
        referenceNo: referenceNo || "N/A",
        date: disbursementDate,
        description: description,
        approvedBy: approvedBy || "Finance Officer",
        notes: notes || "",
      };

      if (db) {
        try {
          const numericId = typeof editingDisbursement.id === "number" ? editingDisbursement.id : parseInt(String(editingDisbursement.id), 10);
          const finalId = isNaN(numericId) ? editingDisbursement.id : numericId;

          await executeQuery(
            db,
            isPg,
            `UPDATE neugate.disbursements SET
              payee_name = $1, payee_type = $2, category = $3, amount = $4, payment_method = $5,
              reference_no = $6, date = $7, description = $8, approved_by = $9, notes = $10
             WHERE id = $11 OR disbursement_no = $12`,
            [
              updatedRecord.payeeName,
              updatedRecord.payeeType,
              updatedRecord.category,
              updatedRecord.amount,
              updatedRecord.paymentMethod,
              updatedRecord.referenceNo,
              updatedRecord.date,
              updatedRecord.description,
              updatedRecord.approvedBy,
              updatedRecord.notes,
              finalId,
              editingDisbursement.disbursementNo,
            ]
          );
          toast.success(`Disbursement Voucher ${editingDisbursement.disbursementNo} updated successfully!`, "Updated");
          await loadDisbursements();
        } catch (err) {
          console.error("Failed to update disbursement:", err);
          toast.error("Database error while updating disbursement voucher.", "Error");
        }
      } else {
        setDisbursements(disbursements.map(d => d.disbursementNo === editingDisbursement.disbursementNo ? updatedRecord : d));
        toast.success(`Disbursement Voucher ${editingDisbursement.disbursementNo} updated (Demo Mode).`, "Updated");
      }
    } else {
      const nextNo = `DISB-2026-${String(disbursements.length + 1).padStart(3, "0")}`;
      const newRecord: Disbursement = {
        disbursementNo: nextNo,
        payeeName: finalPayeeName,
        payeeType: payeeType,
        category: category,
        amount: parseFloat(amount),
        paymentMethod: paymentMethod,
        referenceNo: referenceNo || "N/A",
        date: disbursementDate,
        description: description,
        approvedBy: approvedBy || "Finance Officer",
        status: "DISBURSED",
        notes: notes || "",
        createdAt: new Date().toISOString(),
      };

      if (db) {
        try {
          await executeQuery(
            db,
            isPg,
            `INSERT INTO neugate.disbursements (
              disbursement_no, payee_name, payee_type, category, amount, payment_method, reference_no, date, description, approved_by, status, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              newRecord.disbursementNo,
              newRecord.payeeName,
              newRecord.payeeType,
              newRecord.category,
              newRecord.amount,
              newRecord.paymentMethod,
              newRecord.referenceNo,
              newRecord.date,
              newRecord.description,
              newRecord.approvedBy,
              newRecord.status,
              newRecord.notes,
              newRecord.createdAt,
            ]
          );
          toast.success(`Disbursement Voucher ${nextNo} recorded successfully!`, "Success");
          await loadDisbursements();
        } catch (err) {
          console.error("Failed to save disbursement:", err);
          toast.error("Database error while creating disbursement voucher.", "Error");
        }
      } else {
        setDisbursements([newRecord, ...disbursements]);
        toast.success(`Disbursement Voucher ${nextNo} added (Demo Mode).`, "Success");
      }
    }

    setShowModal(false);
    resetForm();
  };

  const handlePrintVoucher = (voucher: Disbursement) => {
    setSelectedVoucher(voucher);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Filter Computations
  const filteredDisbursements = disbursements.filter((item) => {
    const matchesSearch = 
      item.payeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.disbursementNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.referenceNo && item.referenceNo.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesPayee = payeeTypeFilter === "ALL" || item.payeeType === payeeTypeFilter;
    const matchesCategory = categoryFilter === "ALL" || item.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    
    let matchesDate = true;
    if (startDate) matchesDate = matchesDate && item.date >= startDate;
    if (endDate) matchesDate = matchesDate && item.date <= endDate;

    return matchesSearch && matchesPayee && matchesCategory && matchesStatus && matchesDate;
  });

  const totalDisbursed = filteredDisbursements.reduce((sum, item) => sum + item.amount, 0);
  const employeeDisbursed = filteredDisbursements.filter(x => x.payeeType === "EMPLOYEE").reduce((sum, item) => sum + item.amount, 0);
  const vendorDisbursed = filteredDisbursements.filter(x => x.payeeType === "VENDOR" || x.payeeType === "UTILITY").reduce((sum, item) => sum + item.amount, 0);
  const govDisbursed = filteredDisbursements.filter(x => x.payeeType === "GOVERNMENT").reduce((sum, item) => sum + item.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text)" }}>
            💸 Disbursements &amp; Expense Monitoring
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.2rem 0 0 0" }}>
            Track, approve, and issue disbursement vouchers across all company payouts (Employees, Vendors, Utilities &amp; Gov).
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            ➕ Record New Disbursement
          </button>
          <button className="btn btn-outline" onClick={() => window.print()} style={{ fontSize: "0.8rem" }}>
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="stats-grid no-print">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--success-dim)", color: "var(--success)" }}>
            💰
          </div>
          <div className="stat-info">
            <div className="stat-title">TOTAL DISBURSED</div>
            <div className="stat-number" style={{ color: "var(--success)", fontFamily: "JetBrains Mono, monospace" }}>
              ₱{totalDisbursed.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{filteredDisbursements.length} Vouchers Listed</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--primary-dim)", color: "var(--primary)" }}>
            👨‍💼
          </div>
          <div className="stat-info">
            <div className="stat-title">PAYROLL &amp; EMPLOYEES</div>
            <div className="stat-number" style={{ color: "var(--primary)", fontFamily: "JetBrains Mono, monospace" }}>
              ₱{employeeDisbursed.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Salaries, Advances &amp; Stipends</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--warning-dim)", color: "var(--warning)" }}>
            🏢
          </div>
          <div className="stat-info">
            <div className="stat-title">VENDORS &amp; UTILITIES</div>
            <div className="stat-number" style={{ color: "var(--warning)", fontFamily: "JetBrains Mono, monospace" }}>
              ₱{vendorDisbursed.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Suppliers &amp; Power/Water</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--purple-dim)", color: "var(--purple)" }}>
            🏛️
          </div>
          <div className="stat-info">
            <div className="stat-title">GOVT &amp; TAXES</div>
            <div className="stat-number" style={{ color: "var(--purple)", fontFamily: "JetBrains Mono, monospace" }}>
              ₱{govDisbursed.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>BIR, SSS, PhilHealth, Pag-IBIG</span>
          </div>
        </div>
      </div>

      {/* Filter and Controls */}
      <div className="directory-actions no-print" style={{ background: "var(--bg-card)", padding: "0.85rem 1.1rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", gap: "0.75rem", flexWrap: "wrap" }}>
        <div className="search-wrapper" style={{ minWidth: "220px" }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search Payee, Voucher #, Ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="form-select"
          style={{ width: "auto" }}
          value={payeeTypeFilter}
          onChange={(e) => setPayeeTypeFilter(e.target.value)}
        >
          <option value="ALL">All Payee Types</option>
          <option value="EMPLOYEE">Employees</option>
          <option value="VENDOR">Vendors / Suppliers</option>
          <option value="GOVERNMENT">Government &amp; Tax</option>
          <option value="UTILITY">Utilities &amp; Power</option>
          <option value="OTHER">Other Payees</option>
        </select>

        <select
          className="form-select"
          style={{ width: "auto" }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="ALL">All Categories</option>
          <option value="SALARIES & WAGES">Salaries &amp; Wages</option>
          <option value="CASH ADVANCE">Cash Advance</option>
          <option value="SUPPLIER / VENDOR PAYMENT">Supplier / Vendor</option>
          <option value="UTILITIES & POWER">Utilities &amp; Power</option>
          <option value="RENT & LEASE">Rent &amp; Lease</option>
          <option value="REPAIRS & MAINTENANCE">Repairs &amp; Maintenance</option>
          <option value="TAXES & LICENSES">Taxes &amp; Licenses</option>
          <option value="GOVERNMENT REMITTANCE (SSS/PH/PAGIBIG)">Gov Remittances</option>
          <option value="PETTY CASH & OPERATIONAL">Petty Cash &amp; Ops</option>
          <option value="OTHER DISBURSEMENT">Other Expense</option>
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          <span>From:</span>
          <input
            type="date"
            className="form-input"
            style={{ width: "auto", padding: "0.35rem 0.6rem", fontSize: "0.78rem" }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span>To:</span>
          <input
            type="date"
            className="form-input"
            style={{ width: "auto", padding: "0.35rem 0.6rem", fontSize: "0.78rem" }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <button
          className="btn btn-outline"
          style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "0.4rem 0.75rem" }}
          onClick={() => {
            setSearchQuery("");
            setPayeeTypeFilter("ALL");
            setCategoryFilter("ALL");
            setStatusFilter("ALL");
            setStartDate("");
            setEndDate("");
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Main Table */}
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Voucher No.</th>
              <th>Date</th>
              <th>Payee Name &amp; Type</th>
              <th>Expense Category</th>
              <th>Payment Method &amp; Ref</th>
              <th style={{ textAlign: "right" }}>Amount Disbursed</th>
              <th style={{ textAlign: "center" }}>Status</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDisbursements.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>💸</div>
                  No disbursement records found matching your filters.
                </td>
              </tr>
            ) : (
              filteredDisbursements.map((item) => (
                <tr key={item.id || item.disbursementNo}>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--primary)" }}>
                    {item.disbursementNo}
                  </td>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {item.date}
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{item.payeeName}</div>
                    <span style={{
                      display: "inline-block",
                      fontSize: "0.65rem",
                      padding: "0.15rem 0.4rem",
                      borderRadius: "4px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      marginTop: "0.2rem",
                      background: item.payeeType === "EMPLOYEE" ? "var(--primary-dim)" :
                        item.payeeType === "VENDOR" ? "var(--warning-dim)" :
                        item.payeeType === "GOVERNMENT" ? "var(--purple-dim)" :
                        item.payeeType === "UTILITY" ? "var(--success-dim)" : "var(--bg-input)",
                      color: item.payeeType === "EMPLOYEE" ? "var(--primary)" :
                        item.payeeType === "VENDOR" ? "var(--warning)" :
                        item.payeeType === "GOVERNMENT" ? "var(--purple)" :
                        item.payeeType === "UTILITY" ? "var(--success)" : "var(--text-muted)"
                    }}>
                      {item.payeeType}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>{item.category}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description}
                    </div>
                  </td>
                  <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>{item.paymentMethod}</div>
                    {item.referenceNo && item.referenceNo !== "N/A" && (
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Ref: {item.referenceNo}</div>
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: "0.95rem", color: "var(--success)" }}>
                    ₱{item.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "999px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      background: "var(--success-dim)",
                      color: "var(--success)"
                    }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => handlePrintVoucher(item)}
                      >
                        🖨️ Print
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => handleOpenEdit(item)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => handleDeleteDisbursement(item)}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Record / Edit Disbursement Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: "600px" }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingDisbursement ? `✏️ Edit Disbursement Voucher (${editingDisbursement.disbursementNo})` : "💸 Record Disbursement Voucher"}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveDisbursement}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Payee Type</label>
                  <select
                    className="form-select"
                    value={payeeType}
                    onChange={(e: any) => setPayeeType(e.target.value)}
                  >
                    <option value="VENDOR">Vendor / Supplier</option>
                    <option value="EMPLOYEE">Employee (Salaries/Advances)</option>
                    <option value="GOVERNMENT">Government Agency (BIR/SSS/etc)</option>
                    <option value="UTILITY">Utility Provider (VECO/MCWD/etc)</option>
                    <option value="OTHER">Other Payee</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Payee Name</label>
                  {payeeType === "EMPLOYEE" ? (
                    <select
                      className="form-select"
                      value={selectedEmpId}
                      onChange={(e) => setSelectedEmpId(e.target.value)}
                    >
                      <option value="">Select Employee...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. VECO, Ace Hardware, BIR"
                      value={payeeNameInput}
                      onChange={(e) => setPayeeNameInput(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Disbursement Category</label>
                  <select
                    className="form-select"
                    value={category}
                    onChange={(e: any) => setCategory(e.target.value)}
                  >
                    <option value="SUPPLIER / VENDOR PAYMENT">Supplier / Vendor Payment</option>
                    <option value="SALARIES & WAGES">Salaries &amp; Wages</option>
                    <option value="CASH ADVANCE">Cash Advance</option>
                    <option value="UTILITIES & POWER">Utilities &amp; Power</option>
                    <option value="RENT & LEASE">Rent &amp; Lease</option>
                    <option value="REPAIRS & MAINTENANCE">Repairs &amp; Maintenance</option>
                    <option value="TAXES & LICENSES">Taxes &amp; Licenses</option>
                    <option value="GOVERNMENT REMITTANCE (SSS/PH/PAGIBIG)">Gov Remittances (SSS/PH/Pagibig)</option>
                    <option value="PETTY CASH & OPERATIONAL">Petty Cash &amp; Operational</option>
                    <option value="OTHER DISBURSEMENT">Other Disbursement</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Disbursement Amount (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
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
                  <label className="form-label">Ref / Check No.</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. CHK-1002"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Disbursement Date</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                    value={disbursementDate}
                    onChange={(e) => setDisbursementDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Particulars / Description</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Describe transaction details, invoice or receipt reference..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Approved By</label>
                  <input
                    type="text"
                    className="form-input"
                    value={approvedBy}
                    onChange={(e) => setApprovedBy(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Internal Notes / Remarks</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Optional internal note"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "1.5rem", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Disbursement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden Printable Voucher */}
      {selectedVoucher && (
        <div id="disbursement-voucher" className="printable-ticket" style={{ display: "none" }}>
          <div style={{ border: "2px solid #000", padding: "1.5rem", borderRadius: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: "1rem", marginBottom: "1rem" }}>
              <div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 900, textTransform: "uppercase", margin: 0 }}>DISBURSEMENT VOUCHER</h1>
                <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#374151", margin: "0.2rem 0 0 0" }}>NEUHR ENTERPRISE &amp; SOLUTIONS</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "1.1rem", fontFamily: "monospace", fontWeight: 800, margin: 0 }}>{selectedVoucher.disbursementNo}</p>
                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#4b5563", margin: "0.2rem 0 0 0" }}>Date: {selectedVoucher.date}</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem" }}>
              <div>
                <span style={{ color: "#6b7280", textTransform: "uppercase", fontSize: "0.75rem", display: "block" }}>Payee Name:</span>
                <span style={{ fontSize: "1.1rem", fontWeight: 800 }}>{selectedVoucher.payeeName}</span>
                <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#6b7280" }}>({selectedVoucher.payeeType})</span>
              </div>
              <div>
                <span style={{ color: "#6b7280", textTransform: "uppercase", fontSize: "0.75rem", display: "block" }}>Payment Details:</span>
                <span>{selectedVoucher.paymentMethod} {selectedVoucher.referenceNo ? `- Ref: ${selectedVoucher.referenceNo}` : ""}</span>
              </div>
            </div>

            <div style={{ border: "1px solid #000", marginBottom: "1.5rem" }}>
              <div style={{ background: "#f3f4f6", padding: "0.5rem 0.75rem", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid #000", display: "grid", gridTemplateColumns: "3fr 1fr" }}>
                <span>Particulars / Category</span>
                <span style={{ textAlign: "right" }}>Amount</span>
              </div>
              <div style={{ padding: "1rem", display: "grid", gridTemplateColumns: "3fr 1fr", minHeight: "100px" }}>
                <div>
                  <p style={{ fontWeight: 800, fontSize: "0.95rem", margin: 0 }}>{selectedVoucher.category}</p>
                  <p style={{ fontSize: "0.8rem", marginTop: "0.3rem", color: "#374151" }}>{selectedVoucher.description}</p>
                  {selectedVoucher.notes && <p style={{ fontSize: "0.75rem", color: "#6b7280", fontStyle: "italic", marginTop: "0.5rem" }}>Notes: {selectedVoucher.notes}</p>}
                </div>
                <div style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: "1.2rem" }}>
                  ₱{selectedVoucher.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.5rem", paddingTop: "2.5rem", textAlign: "center", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>
              <div style={{ borderTop: "1px solid #000", paddingTop: "0.5rem" }}>
                <p style={{ margin: 0 }}>Prepared By</p>
              </div>
              <div style={{ borderTop: "1px solid #000", paddingTop: "0.5rem" }}>
                <p style={{ margin: 0 }}>{selectedVoucher.approvedBy || "Approved By"}</p>
              </div>
              <div style={{ borderTop: "1px solid #000", paddingTop: "0.5rem" }}>
                <p style={{ margin: 0 }}>Received By (Signature)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
