import { useState, useEffect } from "react";
import { Employee } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { useToast } from "../context/ToastContext";
import { selectQuery, executeQuery } from "../utils/dbHelper";

interface CashAdvanceItem {
  id?: number;
  employeeId: string;
  employeeName: string;
  advancesFromBirada: number;
  shAdvances: number;
  totalCa: number;
  deductionCutoff: number;
  balance: number;
  notes: string;
  createdAt: string;
}

interface CashAdvancesConsoleProps {
  db: Database | null;
  employees: Employee[];
  enableBiradaAdvances?: boolean;
  enableShAdvances?: boolean;
}

export default function CashAdvancesConsole({
  db,
  employees,
  enableBiradaAdvances = false,
  enableShAdvances = true,
}: CashAdvancesConsoleProps) {
  const toast = useToast();
  const [items, setItems] = useState<CashAdvanceItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [reportStart, setReportStart] = useState<string>("2026-08-28");
  const [reportEnd, setReportEnd] = useState<string>("2026-09-12");

  // Form State
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [biradaAmount, setBiradaAmount] = useState<string>("");
  const [shAmount, setShAmount] = useState<string>("");
  const [deductionAmount, setDeductionAmount] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");

  const loadRecords = async () => {
    if (!db) {
      try {
        const saved = localStorage.getItem("neugate_cash_advances");
        setItems(saved ? JSON.parse(saved) : []);
      } catch {
        setItems([]);
      }
      return;
    }

    try {
      const rows = await selectQuery<any>(
        db,
        `SELECT ca.*, e.name as employee_name
         FROM neugate.cash_advances ca
         JOIN neugate.employees e ON e.id = ca.employee_id
         ORDER BY ca.id DESC`
      );
      setItems(
        rows.map((r) => {
          const tot = (r.advances_from_birada || 0) + (r.sh_advances || 0);
          return {
            id: r.id,
            employeeId: r.employee_id,
            employeeName: r.employee_name || "Employee",
            advancesFromBirada: r.advances_from_birada || 0,
            shAdvances: r.sh_advances || 0,
            totalCa: tot,
            deductionCutoff: r.deduction_cutoff || 0,
            balance: tot - (r.deduction_cutoff || 0),
            notes: r.notes || "",
            createdAt: r.created_at || new Date().toISOString(),
          };
        })
      );
    } catch (err) {
      console.error("Failed to load cash advances:", err);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [db]);

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (db) {
      try {
        await executeQuery(db, `DELETE FROM neugate.cash_advances WHERE id = $1`, [id]);
        toast.success("Cash Advance record deleted.", "Record Deleted");
        await loadRecords();
      } catch (err: any) {
        toast.error(`Failed to delete record: ${err?.message || err}`, "Delete Error");
      }
    } else {
      setItems((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        try {
          localStorage.setItem("neugate_cash_advances", JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to update localStorage:", err);
        }
        return updated;
      });
      toast.success("Cash Advance record deleted.", "Record Deleted");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) {
      toast.error("Please select an employee.", "Validation Error");
      return;
    }

    const emp = employees.find((x) => x.id === selectedEmpId);
    const biradaVal = enableBiradaAdvances ? (parseFloat(biradaAmount) || 0) : 0;
    const shVal = enableShAdvances ? (parseFloat(shAmount) || 0) : 0;
    const dedVal = parseFloat(deductionAmount) || 0;
    const tot = biradaVal + shVal;
    const bal = tot - dedVal;

    if (db) {
      try {
        await executeQuery(
          db,
          `INSERT INTO neugate.cash_advances (employee_id, advances_from_birada, sh_advances, deduction_cutoff, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [selectedEmpId, biradaVal, shVal, dedVal, notesInput, new Date().toISOString()]
        );
        toast.success("Cash Advance record saved successfully!", "Cash Advance Created");
        await loadRecords();
      } catch (err: any) {
        console.error("DB Execute Error:", err);
        const errDetail = err?.message || String(err);
        toast.error(`Database error: ${errDetail}`, "Failed to Save Cash Advance");
      }
    } else {
      const newItem: CashAdvanceItem = {
        id: Date.now(),
        employeeId: selectedEmpId,
        employeeName: emp ? emp.name : "Selected Employee",
        advancesFromBirada: biradaVal,
        shAdvances: shVal,
        totalCa: tot,
        deductionCutoff: dedVal,
        balance: bal,
        notes: notesInput,
        createdAt: new Date().toISOString(),
      };
      setItems((prev) => {
        const updated = [newItem, ...prev];
        try {
          localStorage.setItem("neugate_cash_advances", JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to save cash advances to localStorage:", err);
        }
        return updated;
      });
      toast.success("Cash Advance record created!", "Record Added");
    }

    setShowModal(false);
    setSelectedEmpId("");
    setBiradaAmount("");
    setShAmount("");
    setDeductionAmount("");
    setNotesInput("");
  };

  const totalBirada = items.reduce((s, i) => s + i.advancesFromBirada, 0);
  const totalSh = items.reduce((s, i) => s + i.shAdvances, 0);
  const grandTotalCa = items.reduce((s, i) => s + i.totalCa, 0);
  const totalDeductions = items.reduce((s, i) => s + i.deductionCutoff, 0);
  const totalBalance = items.reduce((s, i) => s + i.balance, 0);

  const kpiCount = (enableBiradaAdvances ? 1 : 0) + (enableShAdvances ? 1 : 0) + 2;
  const colSpanCount = 6 + (enableBiradaAdvances ? 1 : 0) + (enableShAdvances ? 1 : 0);
  const formColsCount = (enableBiradaAdvances ? 1 : 0) + (enableShAdvances ? 1 : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            💸 Cash Advances Ledger &amp; Management
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Record employee cash advances, cutoff deductions, and track outstanding balances.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ➕ Record Cash Advance
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="no-print" style={{ display: "grid", gridTemplateColumns: `repeat(${kpiCount}, 1fr)`, gap: "1rem" }}>
        {enableBiradaAdvances && (
          <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>BIRADA ADVANCES</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--primary)" }}>
              ₱{totalBirada.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}

        {enableShAdvances && (
          <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>REGULAR (SH) ADVANCES</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem" }}>
              ₱{totalSh.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}

        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL DEDUCTIONS CUTOFF</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--danger)" }}>
            ₱{totalDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL OUTSTANDING BALANCE</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--warning)" }}>
            ₱{totalBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div id="printable-ca-report" className="table-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 800 }}>
            PERIOD CUTOFF: <span>{new Date(reportStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {new Date(reportEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</span>
          </div>

          <div className="no-print" style={{ display: "flex", gap: "0.4rem", alignItems: "center", background: "var(--bg-main)", padding: "0.3rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-sub)" }}>📅 Cutoff Range:</span>
            <input
              type="date"
              className="form-input"
              value={reportStart}
              onChange={(e) => setReportStart(e.target.value)}
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem", width: "125px" }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-sub)" }}>to</span>
            <input
              type="date"
              className="form-input"
              value={reportEnd}
              onChange={(e) => setReportEnd(e.target.value)}
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem", width: "125px" }}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace" }}>
            <thead>
              <tr style={{ background: "var(--bg-main)", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "left" }}>EMPLOYEE NAME</th>
                {enableBiradaAdvances && (
                  <th style={{ padding: "0.6rem", textAlign: "right", background: "rgba(59, 130, 246, 0.08)" }}>ADVANCES FROM BIRADA</th>
                )}
                {enableShAdvances && (
                  <th style={{ padding: "0.6rem", textAlign: "right", background: "rgba(59, 130, 246, 0.08)" }}>SH ADVANCES</th>
                )}
                <th style={{ padding: "0.6rem", textAlign: "right", fontWeight: 800, background: "rgba(59, 130, 246, 0.14)" }}>TOTAL CA</th>
                <th style={{ padding: "0.6rem", textAlign: "right", background: "rgba(244, 63, 94, 0.08)" }}>DEDUCTION ({new Date(reportEnd).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })})</th>
                <th style={{ padding: "0.6rem", textAlign: "right", fontWeight: 800, color: "var(--primary)" }}>BALANCE</th>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "left" }}>REMARKS &amp; NOTES</th>
                <th className="no-print" style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={colSpanCount} style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
                    No cash advance entries found. Click "Record Cash Advance" to add one.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.55rem 0.75rem", fontWeight: 700 }}>{item.employeeName}</td>
                    {enableBiradaAdvances && (
                      <td style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>{item.advancesFromBirada ? `₱${item.advancesFromBirada.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "-"}</td>
                    )}
                    {enableShAdvances && (
                      <td style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>{item.shAdvances ? `₱${item.shAdvances.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "-"}</td>
                    )}
                    <td style={{ padding: "0.55rem 0.75rem", textAlign: "right", fontWeight: 800 }}>₱{item.totalCa.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "0.55rem 0.75rem", textAlign: "right", color: "var(--danger)", fontWeight: 700 }}>₱{item.deductionCutoff.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "0.55rem 0.75rem", textAlign: "right", fontWeight: 900, color: item.balance > 0 ? "var(--warning)" : "var(--success)" }}>
                      ₱{item.balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "var(--text-sub)", fontSize: "0.72rem" }}>{item.notes || "-"}</td>
                    <td className="no-print" style={{ padding: "0.4rem 0.5rem", textAlign: "center" }}>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--danger)", borderColor: "rgba(244,63,94,0.4)" }}
                        onClick={() => handleDelete(item.id)}
                        title="Delete Entry"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "var(--bg-main)" }}>
                  <td style={{ padding: "0.6rem 0.75rem" }}>TOTALS:</td>
                  {enableBiradaAdvances && (
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>₱{totalBirada.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  )}
                  {enableShAdvances && (
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>₱{totalSh.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  )}
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>₱{grandTotalCa.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "var(--danger)" }}>₱{totalDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "var(--primary)" }}>₱{totalBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td></td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Entry Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-header">
              <span className="modal-title">💸 Record New Cash Advance Entry</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Select Employee</label>
                <select
                  className="form-select"
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id})
                    </option>
                  ))}
                </select>
              </div>

              {formColsCount > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: formColsCount === 2 ? "1fr 1fr" : "1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                  {enableBiradaAdvances && (
                    <div className="form-group">
                      <label className="form-label">Advances from Birada (₱)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        placeholder="0.00"
                        value={biradaAmount}
                        onChange={(e) => setBiradaAmount(e.target.value)}
                      />
                    </div>
                  )}
                  {enableShAdvances && (
                    <div className="form-group">
                      <label className="form-label">SH Advances (₱)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        placeholder="0.00"
                        value={shAmount}
                        onChange={(e) => setShAmount(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Cutoff Deduction Amount (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={deductionAmount}
                  onChange={(e) => setDeductionAmount(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label className="form-label">Audit Remarks &amp; Notes</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ADD 300 CA 6/24/2026"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
