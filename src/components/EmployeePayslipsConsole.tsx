import { useState } from "react";
import { Employee, AttendanceLog, WorkSchedule, EmployeeRate, PayrollPayslip, PayrollRun } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { computeEmployeePayslip } from "../utils/payroll";
import { useToast } from "../context/ToastContext";
import { executeQuery } from "../utils/dbHelper";

interface EmployeePayslipsConsoleProps {
  db: Database | null;
  employees: Employee[];
  logs: AttendanceLog[];
  schedules: WorkSchedule[];
  rates: EmployeeRate[];
  payrollRuns: PayrollRun[];
  payslips: PayrollPayslip[];
  onRefreshData: () => void;
}

export default function EmployeePayslipsConsole({
  db,
  employees,
  logs,
  schedules,
  rates,
  payrollRuns,
  payslips,
  onRefreshData,
}: EmployeePayslipsConsoleProps) {
  const toast = useToast();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [viewPayslip, setViewPayslip] = useState<PayrollPayslip | null>(null);

  // New Payroll Run Modal State
  const [showRunModal, setShowRunModal] = useState(false);
  const [runTitle, setRunTitle] = useState<string>("Regular Semi-Monthly Payroll");
  const [periodStart, setPeriodStart] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
  });

  const filteredPayslips = selectedRunId
    ? payslips.filter((p) => p.payrollRunId === selectedRunId)
    : payslips;

  const handlePrint = () => {
    try {
      window.print();
    } catch (err) {
      console.error("Print Error:", err);
      toast.error("Failed to launch print dialog.", "Print Error");
    }
  };

  const handleCreatePayrollRun = async () => {
    if (employees.length === 0) {
      toast.warning("No employees available to process payroll.", "Cannot Run Payroll");
      return;
    }

    try {
      const nowStr = new Date().toLocaleString("en-PH");
      let newRunId = Date.now();

      if (db) {
        const res: any = await executeQuery(
          db,
          "INSERT INTO neugate.payroll_runs (title, period_start, period_end, total_payout, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
          [runTitle, periodStart, periodEnd, 0, "Approved", nowStr]
        );
        newRunId = res.lastInsertId ?? newRunId;
      }

      let runTotalPayout = 0;

      for (const emp of employees) {
        const empRate = rates.find((r) => r.employeeId === emp.id) || {
          employeeId: emp.id,
          salaryType: "MONTHLY",
          basicSalary: 25000,
          overtimeRatePerHour: 180,
          lateDeductionRatePerMin: 2,
          sssDeduction: 1125,
          philhealthDeduction: 450,
          pagibigDeduction: 200,
          taxDeduction: 1200,
        };

        const payslip = computeEmployeePayslip({
          employee: emp,
          logs,
          schedules,
          rate: empRate,
          periodStart,
          periodEnd,
          payrollRunId: newRunId,
        });

        runTotalPayout += payslip.netPay;

        if (db) {
          await executeQuery(
            db,
            `INSERT INTO neugate.payroll_payslips 
             (payroll_run_id, employee_id, employee_name, department_job_title, basic_pay, overtime_pay, late_deductions, gross_pay, sss, philhealth, pagibig, tax, total_deductions, net_pay, total_hours_worked, late_minutes, overtime_hours, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              newRunId,
              payslip.employeeId,
              payslip.employeeName,
              payslip.departmentJobTitle,
              payslip.basicPay,
              payslip.overtimePay,
              payslip.lateDeductions,
              payslip.grossPay,
              payslip.sss,
              payslip.philhealth,
              payslip.pagibig,
              payslip.tax,
              payslip.totalDeductions,
              payslip.netPay,
              payslip.totalHoursWorked,
              payslip.lateMinutes,
              payslip.overtimeHours,
              nowStr,
            ]
          );
        }
      }

      if (db) {
        await executeQuery(db, "UPDATE neugate.payroll_runs SET total_payout = $1 WHERE id = $2", [runTotalPayout, newRunId]);
      }

      onRefreshData();
      setShowRunModal(false);
      setSelectedRunId(newRunId);
      toast.success(`Payroll Run processed successfully! Total Payout: ₱${runTotalPayout.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, "Payroll Complete");
    } catch (err) {
      console.error("Failed to generate payroll:", err);
      toast.error("Failed to process payroll run.", "Payroll Error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            📄 Employee Payslips &amp; Digital Vouchers
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            View, verify, print official pay vouchers, or process new semi-monthly payroll cut-offs from RFID logs.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowRunModal(true)} style={{ fontSize: "0.8rem" }}>
          ⚡ Process New Cut-off
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", background: "var(--bg-card)", padding: "0.85rem 1.25rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Filter Cut-off Period:</span>
        <select
          className="form-select"
          style={{ width: "360px", fontSize: "0.82rem" }}
          value={selectedRunId || ""}
          onChange={(e) => setSelectedRunId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">-- All Payroll Cut-offs ({payslips.length} Payslips Generated) --</option>
          {payrollRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {run.title} ({run.periodStart} to {run.periodEnd}) - ₱{run.totalPayout.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </option>
          ))}
        </select>
      </div>

      {/* Main Payslips Table */}
      <div className="table-card">
        {filteredPayslips.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-sub)" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📄</div>
            <div style={{ fontWeight: 700 }}>No Payslips Available</div>
            <div style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
              Click "Process New Cut-off" above to compute salaries from RFID attendance logs.
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Employee ID</th>
                <th>Department &amp; Job Title</th>
                <th>Hours Worked</th>
                <th>Basic Pay</th>
                <th>Overtime Pay</th>
                <th>Deductions</th>
                <th>Net Take-Home Pay</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayslips.map((p, idx) => (
                <tr key={idx}>
                  <td><strong>{p.employeeName}</strong></td>
                  <td style={{ fontFamily: "JetBrains Mono, monospace" }}>{p.employeeId}</td>
                  <td style={{ color: "var(--text-sub)" }}>{p.departmentJobTitle}</td>
                  <td style={{ fontSize: "0.8rem" }}>⏱️ {p.totalHoursWorked} hrs</td>
                  <td style={{ fontFamily: "JetBrains Mono, monospace" }}>₱{p.basicPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: "var(--success)", fontFamily: "JetBrains Mono, monospace" }}>+₱{p.overtimePay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: "var(--danger)", fontFamily: "JetBrains Mono, monospace" }}>-₱{p.totalDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: "var(--primary)", fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
                    ₱{p.netPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                      onClick={() => setViewPayslip(p)}
                    >
                      🖨️ View &amp; Print Payslip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* PROCESS PAYROLL CUTOFF MODAL */}
      {showRunModal && (
        <div className="modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && setShowRunModal(false)}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-header">
              <span className="modal-title">⚡ Process New Payroll Cut-off</span>
              <button className="modal-close" onClick={() => setShowRunModal(false)}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label className="form-label">Cut-off Title / Description</label>
              <input
                type="text"
                className="form-input"
                value={runTitle}
                onChange={(e) => setRunTitle(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div className="form-group">
                <label className="form-label">Cutoff Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cutoff End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-outline" onClick={() => setShowRunModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreatePayrollRun}>
                ⚡ Compute &amp; Generate Payslips
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Payslip Modal */}
      {viewPayslip && (
        <div className="printable-modal-overlay" onClick={(e) => e.target === e.currentTarget && setViewPayslip(null)}>
          <div className="printable-modal-container" style={{ maxWidth: 650 }}>
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
              <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>🖨️ Official Employee Payslip Voucher</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-primary" onClick={handlePrint}>🖨️ Print</button>
                <button className="btn btn-outline" onClick={() => setViewPayslip(null)}>✕ Close</button>
              </div>
            </div>

            <div id="payslip-ticket" className="printable-ticket">
              <div style={{ textAlign: "center", borderBottom: "2px dashed #e5e7eb", paddingBottom: "1rem", marginBottom: "1rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", color: "#111827" }}>
                  ACME CORPORATION
                </h2>
                <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.15rem" }}>ELECTRONIC PAYSLIP VOUCHER</div>
                <div style={{ fontSize: "0.75rem", color: "#374151", fontWeight: 700, marginTop: "0.35rem" }}>
                  Pay Period: {viewPayslip.createdAt ? new Date(viewPayslip.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "Regular Cutoff"}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>EMPLOYEE NAME</div>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#111827" }}>{viewPayslip.employeeName}</div>
                  <div style={{ fontSize: "0.85rem", color: "#374151" }}>{viewPayslip.departmentJobTitle}</div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>EMPLOYEE ID</div>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#111827", fontFamily: "monospace" }}>{viewPayslip.employeeId}</div>
                  <div style={{ fontSize: "0.85rem", color: "#374151" }}>Hours Worked: <strong>{viewPayslip.totalHoursWorked} hrs</strong></div>
                </div>
              </div>

              {/* EARNINGS & DEDUCTIONS TABLE */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
                <div>
                  <h4 style={{ margin: "0 0 0.5rem 0", color: "#059669", borderBottom: "2px solid #10b981", paddingBottom: "0.25rem", fontSize: "0.85rem", textTransform: "uppercase" }}>EARNINGS</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                    <span>Basic Pay:</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.basicPay.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                    <span>Overtime Pay ({viewPayslip.overtimeHours} hrs):</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.overtimePay.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #e5e7eb", paddingTop: "0.4rem", marginTop: "0.5rem" }}>
                    <span>Gross Earnings:</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.grossPay.toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: "0 0 0.5rem 0", color: "#dc2626", borderBottom: "2px solid #ef4444", paddingBottom: "0.25rem", fontSize: "0.85rem", textTransform: "uppercase" }}>DEDUCTIONS</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                    <span>Late ({viewPayslip.lateMinutes} mins):</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.lateDeductions.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                    <span>SSS:</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.sss.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                    <span>PhilHealth:</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.philhealth.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                    <span>Pag-IBIG:</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.pagibig.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                    <span>Withholding Tax:</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.tax.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #e5e7eb", paddingTop: "0.4rem", marginTop: "0.5rem" }}>
                    <span>Total Deductions:</span>
                    <span style={{ fontFamily: "monospace" }}>₱{viewPayslip.totalDeductions.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* NET TAKE HOME */}
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "1rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <span style={{ fontSize: "1rem", fontWeight: 800, color: "#065f46" }}>NET TAKE-HOME PAY</span>
                <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#047857", fontFamily: "monospace" }}>
                  ₱{viewPayslip.netPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ textAlign: "center", fontSize: "0.7rem", color: "#9ca3af", borderTop: "1px dashed #e5e7eb", paddingTop: "0.5rem" }}>
                Generated electronically by neuHR System. Valid without signature.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
