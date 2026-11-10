import { useState, useEffect } from "react";
import { Employee } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { useToast } from "../context/ToastContext";
import { selectQuery, executeQuery } from "../utils/dbHelper";

interface OtherDeductionItem {
  id?: number;
  employeeId: string;
  employeeName: string;
  forwardedBalance: number;
  particular: string;
  totalDeduction: number;
  deductionCutoff: number;
  balance: number;
  notes: string;
  createdAt: string;
}

interface OtherDeductionsConsoleProps {
  db: Database | null;
  employees: Employee[];
}

export default function OtherDeductionsConsole({ db, employees }: OtherDeductionsConsoleProps) {
  const toast = useToast();
  const [items, setItems] = useState<OtherDeductionItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [reportStart, setReportStart] = useState<string>("2026-08-28");
  const [reportEnd, setReportEnd] = useState<string>("2026-09-12");

  // Form State
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [forwardedBalanceInput, setForwardedBalanceInput] = useState<string>("");
  const [particularInput, setParticularInput] = useState<string>("LICENSE");
  const [customParticular, setCustomParticular] = useState<string>("");
  const [deductionCutoffInput, setDeductionCutoffInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");

  const loadRecords = async () => {
    if (!db) {
      try {
        const saved = localStorage.getItem("neugate_other_deductions");
        setItems(saved ? JSON.parse(saved) : []);
      } catch {
        setItems([]);
      }
      return;
    }

    try {
      const rows = await selectQuery<any>(
        db,
        `SELECT od.*, e.name as employee_name
         FROM neugate.other_deductions od
         JOIN neugate.employees e ON e.id = od.employee_id
         ORDER BY od.id DESC`
      );
      setItems(
        rows.map((r) => {
          const fwd = r.forwarded_balance || 0;
          const ded = r.deduction_cutoff || 0;
          return {
            id: r.id,
            employeeId: r.employee_id,
            employeeName: r.employee_name || "Employee",
            forwardedBalance: fwd,
            particular: r.particular || "LICENSE",
            totalDeduction: fwd,
            deductionCutoff: ded,
            balance: fwd - ded,
            notes: r.notes || "",
            createdAt: r.created_at || new Date().toISOString(),
          };
        })
      );
    } catch (err) {
      console.error("Failed to load other deductions:", err);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [db]);

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (db) {
      try {
        await executeQuery(db, `DELETE FROM neugate.other_deductions WHERE id = $1`, [id]);
        toast.success("Other Deduction record deleted.", "Record Deleted");
        await loadRecords();
      } catch (err: any) {
        toast.error(`Failed to delete record: ${err?.message || err}`, "Delete Error");
      }
    } else {
      setItems((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        try {
          localStorage.setItem("neugate_other_deductions", JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to update localStorage:", err);
        }
        return updated;
      });
      toast.success("Other Deduction record deleted.", "Record Deleted");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) {
      toast.error("Please select an employee.", "Validation Error");
      return;
    }

    const emp = employees.find((x) => x.id === selectedEmpId);
    const fwdVal = parseFloat(forwardedBalanceInput) || 0;
    const dedVal = parseFloat(deductionCutoffInput) || 0;
    const partVal = particularInput === "OTHER" ? customParticular : particularInput;
    const bal = fwdVal - dedVal;

    if (db) {
      try {
        await executeQuery(
          db,
          `INSERT INTO neugate.other_deductions (employee_id, forwarded_balance, particular, deduction_cutoff, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [selectedEmpId, fwdVal, partVal, dedVal, notesInput, new Date().toISOString()]
        );
        toast.success("Other Deduction record created successfully!", "Deduction Saved");
        await loadRecords();
      } catch (err: any) {
        console.error("DB Execute Error:", err);
        const errDetail = err?.message || String(err);
        toast.error(`Database error: ${errDetail}`, "Failed to Save Deduction");
      }
    } else {
      const newItem: OtherDeductionItem = {
        id: Date.now(),
        employeeId: selectedEmpId,
        employeeName: emp ? emp.name : "Selected Employee",
        forwardedBalance: fwdVal,
        particular: partVal,
        totalDeduction: fwdVal,
        deductionCutoff: dedVal,
        balance: bal,
        notes: notesInput,
        createdAt: new Date().toISOString(),
      };
      setItems((prev) => {
        const updated = [newItem, ...prev];
        try {
          localStorage.setItem("neugate_other_deductions", JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to save other deductions to localStorage:", err);
        }
        return updated;
      });
      toast.success("Deduction entry created!", "Record Added");
    }

    setShowModal(false);
    setSelectedEmpId("");
    setForwardedBalanceInput("");
    setParticularInput("LICENSE");
    setCustomParticular("");
    setDeductionCutoffInput("");
    setNotesInput("");
  };

  const totalForwarded = items.reduce((s, i) => s + i.forwardedBalance, 0);
  const totalDeductions = items.reduce((s, i) => s + i.deductionCutoff, 0);
  const totalBalance = items.reduce((s, i) => s + i.balance, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            📉 Deductions Management
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Track forwarded balances, equipment/license particulars, damages, and cutoff deductions.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ➕ Record Deduction Entry
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL FORWARDED DEDUCTIONS</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--primary)" }}>
            ₱{totalForwarded.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>PERIOD CUTOFF DEDUCTION</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--danger)" }}>
            ₱{totalDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>REMAINING UNPAID BALANCE</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--warning)" }}>
            ₱{totalBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div id="printable-deductions-report" className="table-card" style={{ padding: "1.25rem" }}>
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
                <th style={{ padding: "0.6rem", textAlign: "right", background: "rgba(168, 85, 247, 0.08)" }}>FORWARDED BALANCE</th>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "left" }}>PARTICULAR / REASON</th>
                <th style={{ padding: "0.6rem", textAlign: "right", fontWeight: 800, background: "rgba(168, 85, 247, 0.14)" }}>TOTAL DEDUCTIONS</th>
                <th style={{ padding: "0.6rem", textAlign: "right", background: "rgba(244, 63, 94, 0.08)" }}>DEDUCTION CUTOFF</th>
                <th style={{ padding: "0.6rem", textAlign: "right", fontWeight: 800, color: "var(--primary)" }}>BALANCE</th>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "left" }}>AUDIT NOTES</th>
                <th className="no-print" style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
                    No deduction entries found. Click "Record Deduction Entry" to add one.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.55rem 0.75rem", fontWeight: 700 }}>{item.employeeName}</td>
                    <td style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>₱{item.forwardedBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "0.55rem 0.75rem", fontWeight: 700, color: "var(--primary)" }}>{item.particular}</td>
                    <td style={{ padding: "0.55rem 0.75rem", textAlign: "right", fontWeight: 800 }}>₱{item.totalDeduction.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
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
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>₱{totalForwarded.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td></td>
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>₱{totalForwarded.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
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
              <span className="modal-title">📉 Record Other Deduction Entry</span>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Forwarded Balance (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={forwardedBalanceInput}
                    onChange={(e) => setForwardedBalanceInput(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Deduction Cutoff (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={deductionCutoffInput}
                    onChange={(e) => setDeductionCutoffInput(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Particular / Reason</label>
                <select
                  className="form-select"
                  value={particularInput}
                  onChange={(e) => setParticularInput(e.target.value)}
                >
                  <option value="LICENSE">LICENSE</option>
                  <option value="DAMAGE">DAMAGE / VEHICLE MIRROR</option>
                  <option value="LANDING GEAR">LANDING GEAR</option>
                  <option value="ILO-ILO( GAP2672)/ADD LTO">LTO / ADD REGISTRATION</option>
                  <option value="UNIFORM / BADGE">UNIFORM / BADGE</option>
                  <option value="OTHER">OTHER (CUSTOM PARTICULARS)</option>
                </select>
              </div>

              {particularInput === "OTHER" && (
                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Specify Custom Particular</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. TOOL DAMAGE"
                    value={customParticular}
                    onChange={(e) => setCustomParticular(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label className="form-label">Audit Notes &amp; Item Details</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. damage gas5314 ball mirror 2,475 7/31/2026"
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
