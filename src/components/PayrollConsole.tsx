import { useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Employee, AttendanceLog, WorkSchedule, EmployeeRate, PayrollRun, PayrollPayslip } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { computeEmployeePayslip } from "../utils/payroll";
import { useToast } from "../context/ToastContext";
import { executeQuery } from "../utils/dbHelper";

interface PayrollConsoleProps {
  db: Database | null;
  employees: Employee[];
  logs: AttendanceLog[];
  schedules: WorkSchedule[];
  rates: EmployeeRate[];
  payrollRuns: PayrollRun[];
  payslips: PayrollPayslip[];
  onRefreshData: () => void;
}

export default function PayrollConsole({
  db,
  employees,
  logs,
  schedules,
  rates,
  payrollRuns,
  payslips,
  onRefreshData,
}: PayrollConsoleProps) {
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<"runs" | "rates" | "payslips" | "report" | "ca" | "deductions">("runs");

  // Create Payroll Run Modal State
  const [showRunModal, setShowRunModal] = useState(false);
  const [periodStart, setPeriodStart] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
  });
  const [runTitle, setRunTitle] = useState<string>("Regular Semi-Monthly Payroll");

  // Edit Rate Modal State
  const [selectedEmpForRate, setSelectedEmpForRate] = useState<Employee | null>(null);
  const [editingRate, setEditingRate] = useState<EmployeeRate>({
    employeeId: "",
    salaryType: "MONTHLY",
    basicSalary: 25000,
    overtimeRatePerHour: 180,
    lateDeductionRatePerMin: 2,
    sssDeduction: 1125,
    philhealthDeduction: 450,
    pagibigDeduction: 200,
    taxDeduction: 1200,
  });

  // Selected Payslip for View / Print
  const [viewPayslip, setViewPayslip] = useState<PayrollPayslip | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSuccessMsg, setPdfSuccessMsg] = useState("");

  // Report Date Range Filter State
  const [reportStart, setReportStart] = useState<string>("2026-08-27");
  const [reportEnd, setReportEnd] = useState<string>("2026-09-12");

  const handleExportCsv = (records: PayrollPayslip[]) => {
    if (records.length === 0) {
      toast.warning("No records to export.", "CSV Export");
      return;
    }
    const headers = [
      "NAME",
      "POSITION",
      "PER DAY",
      "PER HOUR",
      "NO. DAYS",
      "OVERTIME HOURS",
      "HOLIDAY (100%)",
      "HOLIDAY (30%)",
      "UNDERTIME (MIN)",
      "NIGHT DIFF (MIN)",
      "LATE (MIN)",
      "REGULAR SALARY",
      "OVERTIME PAY",
      "HOLIDAY 100%",
      "HOLIDAY 30%",
      "NIGHT DIFF PAY",
      "TOTAL SALARY",
      "UNDERTIME DEDUCTION",
      "LATE DEDUCTION",
      "TOTAL NET BEFORE DEDUCTIONS",
      "SSS EMPLOYER SHARE",
      "SSS EMPLOYEE SHARE",
      "CASH ADVANCE DEDUCTIONS",
      "OTHER DEDUCTIONS",
      "SSS CASH RETURN",
      "TOTAL DEDUCTIONS",
      "TOTAL NET SALARY",
    ];

    const rows = records.map((p) => {
      const perDay = p.perDay ?? (p.basicPay ? p.basicPay / 15 : 540);
      const perHour = p.perHour ?? perDay / 8;
      const noDays = p.noDays ?? (p.totalHoursWorked ? Math.round((p.totalHoursWorked / 8) * 10) / 10 : 12);
      const overtimeHours = p.overtimeHours || 0;
      const holiday100 = p.holiday100Count || 0;
      const holiday30 = p.holiday30Count || 0;
      const undertimeMins = p.undertimeHours ? p.undertimeHours * 60 : 0;
      const nightDiffMins = p.nightDiffHours ? p.nightDiffHours * 60 : 0;
      const lateMins = p.lateMinutes || 0;

      const regSalary = p.basicPay || perDay * noDays;
      const otPay = p.overtimePay || 0;
      const hol100Pay = p.holiday100Pay || 0;
      const hol30Pay = p.holiday30Pay || 0;
      const nightDiffPay = p.nightDiffPay || 0;
      const totSalary = p.totalSalary ?? (regSalary + otPay + hol100Pay + hol30Pay + nightDiffPay);

      const undertimeDed = p.undertimeDeductions || 0;
      const lateDed = p.lateDeductions || 0;
      const totNet = p.totalNetBeforeDeductions ?? (totSalary - (undertimeDed + lateDed));

      const sssEmployerShare = p.sssEmployerShare || 630;
      const sssEmployeeShare = p.sssEmployeeShare || p.sss || 420;
      const caDed = p.cashAdvanceDeductions || 0;
      const otherDed = p.otherDeductions || 0;
      const sssReturn = p.sssCashReturn || 0;
      const totDed = p.totalDeductions ?? (sssEmployeeShare + caDed + otherDed - sssReturn);
      const netSalary = p.netPay ?? (totNet - totDed);

      return [
        `"${p.employeeName.replace(/"/g, '""')}"`,
        `"${p.departmentJobTitle.replace(/"/g, '""')}"`,
        perDay.toFixed(2),
        perHour.toFixed(2),
        noDays,
        overtimeHours,
        holiday100,
        holiday30,
        undertimeMins,
        nightDiffMins,
        lateMins,
        regSalary.toFixed(2),
        otPay.toFixed(2),
        hol100Pay.toFixed(2),
        hol30Pay.toFixed(2),
        nightDiffPay.toFixed(2),
        totSalary.toFixed(2),
        undertimeDed.toFixed(2),
        lateDed.toFixed(2),
        totNet.toFixed(2),
        sssEmployerShare.toFixed(2),
        sssEmployeeShare.toFixed(2),
        caDed.toFixed(2),
        otherDed.toFixed(2),
        sssReturn.toFixed(2),
        totDed.toFixed(2),
        netSalary.toFixed(2),
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Salaries_And_Wages_Report_${reportStart}_to_${reportEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Salaries and Wages report exported to CSV!", "CSV Exported");
  };

  const handlePrintPayslip = () => {
    try {
      window.print();
    } catch (err) {
      console.error("Window print error:", err);
      handleDownloadPdf();
    }
  };



  const handleDownloadPdf = async () => {
    const el = document.getElementById("payslip-ticket");
    if (!el || isGeneratingPdf || !viewPayslip) return;

    try {
      setIsGeneratingPdf(true);
      setPdfSuccessMsg("");

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);

      const fileName = `Payslip_${viewPayslip.employeeName.replace(/[^a-zA-Z0-9_-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      setPdfSuccessMsg(`Downloaded: ${fileName}`);
      setTimeout(() => setPdfSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      handlePrintPayslip();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // ── Save or Update Employee Compensation Rate ──────────────────────
  const handleSaveRate = async () => {
    if (!selectedEmpForRate) return;
    try {
      if (db) {
        await executeQuery(
          db,
          `INSERT INTO neugate.employee_rates 
           (employee_id, salary_type, basic_salary, overtime_rate_per_hour, late_deduction_rate_per_min, sss_deduction, philhealth_deduction, pagibig_deduction, tax_deduction)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT(employee_id) DO UPDATE SET
             salary_type=excluded.salary_type,
             basic_salary=excluded.basic_salary,
             overtime_rate_per_hour=excluded.overtime_rate_per_hour,
             late_deduction_rate_per_min=excluded.late_deduction_rate_per_min,
             sss_deduction=excluded.sss_deduction,
             philhealth_deduction=excluded.philhealth_deduction,
             pagibig_deduction=excluded.pagibig_deduction,
             tax_deduction=excluded.tax_deduction`,
          [
            selectedEmpForRate.id,
            editingRate.salaryType,
            editingRate.basicSalary,
            editingRate.overtimeRatePerHour,
            editingRate.lateDeductionRatePerMin,
            editingRate.sssDeduction,
            editingRate.philhealthDeduction,
            editingRate.pagibigDeduction,
            editingRate.taxDeduction,
          ]
        );
      }
      onRefreshData();
      setSelectedEmpForRate(null);
      toast.success(`Compensation rates updated for ${selectedEmpForRate.name}`, "Rates Saved");
    } catch (err) {
      console.error("Failed to save rate:", err);
      toast.error("Failed to save compensation rates.", "Error");
    }
  };

  // ── Generate Automated Payroll Run ─────────────────────────────────
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
      toast.success(`Payroll Run processed successfully! Total Payout: ₱${runTotalPayout.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, "Payroll Complete");
    } catch (err) {
      console.error("Failed to generate payroll:", err);
      toast.error("Failed to process payroll run.", "Payroll Error");
    }
  };

  const filteredPayslips = selectedRunId
    ? payslips.filter((p) => p.payrollRunId === selectedRunId)
    : payslips;

  // Dynamically compute report records based on selected report date range (reportStart - reportEnd)
  const reportPayslips = employees.length > 0 ? employees.map((emp) => {
    const empRate = rates.find((r) => r.employeeId === emp.id) || {
      employeeId: emp.id,
      salaryType: "MONTHLY" as const,
      basicSalary: 25000,
      overtimeRatePerHour: 180,
      lateDeductionRatePerMin: 2,
      sssDeduction: 1125,
      philhealthDeduction: 450,
      pagibigDeduction: 200,
      taxDeduction: 1200,
    };

    return computeEmployeePayslip({
      employee: emp,
      logs,
      schedules,
      rate: empRate,
      periodStart: reportStart,
      periodEnd: reportEnd,
      payrollRunId: 0,
    });
  }) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            💰 Corporate Payroll & Payslip Console
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Automate salary computations, manage compensation structures, and generate digital payslips directly from RFID logs.
          </p>
        </div>

        <div>
          <button className="btn btn-primary" onClick={() => setShowRunModal(true)} style={{ fontSize: "0.8rem" }}>
            + New Payroll Run
          </button>
        </div>
      </div>

      {/* PAYROLL RUNS */}
      <div className="table-card">
          {payrollRuns.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💰</div>
              <p>No payroll runs generated yet. Click "+ New Payroll Run" above to compute salaries from RFID attendance logs.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Title / Description</th>
                  <th>Period Range</th>
                  <th>Total Net Payout</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payrollRuns.map((run) => (
                  <tr key={run.id}>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>#{run.id}</td>
                    <td><strong>{run.title}</strong></td>
                    <td style={{ fontSize: "0.8rem" }}>📅 {run.periodStart} to {run.periodEnd}</td>
                    <td style={{ color: "var(--primary)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                      ₱{run.totalPayout.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span className="badge" style={{ background: "var(--primary-dim)", color: "var(--primary)" }}>
                        {run.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                        onClick={() => {
                          setSelectedRunId(run.id ?? null);
                          setActiveSubTab("payslips");
                        }}
                      >
                        📄 View Payslips
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      {/* SUB TAB 2: COMPENSATION RATES */}
      {activeSubTab === "rates" && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>ID Number</th>
                <th>Department &amp; Title</th>
                <th>Pay Structure</th>
                <th>Basic Salary</th>
                <th>OT / Late Rates</th>
                <th>Statutory Contributions</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const r = rates.find((rate) => rate.employeeId === emp.id) || {
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
                return (
                  <tr key={emp.id}>
                    <td><strong>{emp.name}</strong></td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>{emp.id}</td>
                    <td>{emp.departmentJobTitle}</td>
                    <td>
                      <span className="badge" style={{ background: "var(--primary-dim)", color: "var(--primary)" }}>
                        {r.salaryType}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                      ₱{r.basicSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>
                      <div>⚡ OT: ₱{r.overtimeRatePerHour}/hr</div>
                      <div>⏳ Late: ₱{r.lateDeductionRatePerMin}/min</div>
                    </td>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-sub)" }}>
                      <div>SSS: ₱{r.sssDeduction} | PH: ₱{r.philhealthDeduction}</div>
                      <div>Pag-IBIG: ₱{r.pagibigDeduction} | Tax: ₱{r.taxDeduction}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                        onClick={() => {
                          setSelectedEmpForRate(emp);
                          setEditingRate(r);
                        }}
                      >
                        ⚙️ Configure Rates
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SUB TAB 3: PAYSLIPS */}
      {activeSubTab === "payslips" && (
        <div className="table-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
              {selectedRunId ? `Payslips for Run #${selectedRunId}` : "All Generated Employee Payslips"}
            </h3>
            {selectedRunId && (
              <button className="btn btn-outline" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={() => setSelectedRunId(null)}>
                Show All Runs
              </button>
            )}
          </div>

          {filteredPayslips.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <p>No payslips found for this selection.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Hours Worked</th>
                  <th>Basic Pay</th>
                  <th>OT Pay</th>
                  <th>Deductions</th>
                  <th>Net Take-Home Pay</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayslips.map((p, idx) => (
                  <tr key={idx}>
                    <td><strong>{p.employeeName}</strong> <span style={{ fontSize: "0.75rem", color: "var(--text-sub)" }}>({p.employeeId})</span></td>
                    <td style={{ fontSize: "0.8rem" }}>⏱️ {p.totalHoursWorked} hrs</td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace" }}>₱{p.basicPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    <td style={{ color: "var(--success)", fontFamily: "JetBrains Mono, monospace" }}>+₱{p.overtimePay}</td>
                    <td style={{ color: "var(--danger)", fontFamily: "JetBrains Mono, monospace" }}>-₱{p.totalDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    <td style={{ color: "var(--primary)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                      ₱{p.netPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                        onClick={() => setViewPayslip(p)}
                      >
                        🖨️ Print Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SUB TAB 4: SALARIES AND WAGES REPORT */}
      {activeSubTab === "report" && (
        <div id="printable-report" className="table-card" style={{ padding: "1.25rem" }}>
          {/* Action & Filter Control Bar */}
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--text-main)" }}>
                📊 SALARIES AND WAGES REPORT
              </h3>
              <div style={{ fontSize: "0.8rem", color: "var(--text-sub)", marginTop: "0.15rem" }}>
                Period Cutoff: <strong>{new Date(reportStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {new Date(reportEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</strong>
              </div>
            </div>

            {/* Date Range Picker & Export Action Controls */}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", background: "var(--bg-main)", padding: "0.3rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-sub)" }}>📅 Date Range:</span>
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

              <button
                className="btn btn-outline"
                onClick={() => handleExportCsv(reportPayslips)}
                style={{ fontSize: "0.8rem" }}
              >
                📥 Export CSV
              </button>
              <button
                className="btn btn-primary"
                onClick={() => window.print()}
                style={{ fontSize: "0.8rem" }}
              >
                🖨️ Print Report
              </button>
            </div>
          </div>

          {/* Report Summary Cards */}
          <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL REGULAR SALARY</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem" }}>
                ₱{reportPayslips.reduce((s, p) => s + (p.basicPay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL OVERTIME &amp; HOLIDAYS</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--success)" }}>
                ₱{reportPayslips.reduce((s, p) => s + (p.overtimePay + (p.holiday100Pay || 0) + (p.holiday30Pay || 0) + (p.nightDiffPay || 0)), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL DEDUCTIONS</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--danger)" }}>
                ₱{reportPayslips.reduce((s, p) => s + (p.totalDeductions || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL NET PAYOUT</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--primary)" }}>
                ₱{reportPayslips.reduce((s, p) => s + (p.netPay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Grouped Table View */}
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem", fontFamily: "JetBrains Mono, monospace" }}>
              <thead>
                {/* Level 1 Group Header Row */}
                <tr style={{ background: "var(--bg-main)", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                  <th colSpan={2} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>EMPLOYEE INFO</th>
                  <th colSpan={3} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>BASE RATES &amp; DAYS</th>
                  <th colSpan={6} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>LOGGED METRICS &amp; HOURS</th>
                  <th colSpan={6} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(16,185,129,0.05)" }}>GROSS SALARY BREAKDOWN</th>
                  <th colSpan={3} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(244,63,94,0.05)" }}>DISCIPLINARY DEDUCTIONS</th>
                  <th colSpan={7} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(168,85,247,0.05)" }}>STATUTORY &amp; OTHER DEDUCTIONS</th>
                  <th style={{ padding: "0.4rem", background: "rgba(0,212,255,0.08)" }}>NET PAY</th>
                </tr>
                {/* Level 2 Individual Column Header Row */}
                <tr style={{ background: "var(--bg-main)", borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "0.45rem", whiteSpace: "nowrap" }}>NAME</th>
                  <th style={{ padding: "0.45rem", whiteSpace: "nowrap", borderRight: "1px solid var(--border)" }}>POSITION</th>

                  <th style={{ padding: "0.45rem", textAlign: "right" }}>PER DAY</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>PER HOUR</th>
                  <th style={{ padding: "0.45rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>DAYS</th>

                  <th style={{ padding: "0.45rem", textAlign: "right" }}>OT (HRS)</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>HOL (100%)</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>HOL (30%)</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>UT (MIN)</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>ND (MIN)</th>
                  <th style={{ padding: "0.45rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>LATE (MIN)</th>

                  <th style={{ padding: "0.45rem", textAlign: "right" }}>REGULAR</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>OT PAY</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>HOL 100%</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>HOL 30%</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>NIGHT DIFF</th>
                  <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOTAL SALARY</th>

                  <th style={{ padding: "0.45rem", textAlign: "right" }}>UT DED</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>LATE DED</th>
                  <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOTAL NET</th>

                  <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS ER</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS EE</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>CA DED</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>OTHER DED</th>
                  <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS RETURN</th>
                  <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOT DED</th>

                  <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 900 }}>NET SALARY</th>
                </tr>
              </thead>
            <tbody>
              {reportPayslips.length === 0 ? (
                <tr>
                  <td colSpan={27} style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
                    No payroll data available. Run payroll to generate report items.
                  </td>
                </tr>
              ) : (
                reportPayslips.map((p, idx) => {
                  const perDay = p.perDay ?? (p.basicPay ? p.basicPay / 15 : 540);
                  const perHour = p.perHour ?? perDay / 8;
                  const noDays = p.noDays ?? (p.totalHoursWorked ? Math.round((p.totalHoursWorked / 8) * 10) / 10 : 12);
                  const overtimeHours = p.overtimeHours || 0;
                  const holiday100 = p.holiday100Count || 0;
                  const holiday30 = p.holiday30Count || 0;
                  const undertimeMins = p.undertimeHours ? p.undertimeHours * 60 : 0;
                  const nightDiffMins = p.nightDiffHours ? p.nightDiffHours * 60 : 0;
                  const lateMins = p.lateMinutes || 0;

                  const regSalary = p.basicPay || perDay * noDays;
                  const otPay = p.overtimePay || 0;
                  const hol100Pay = p.holiday100Pay || 0;
                  const hol30Pay = p.holiday30Pay || 0;
                  const nightDiffPay = p.nightDiffPay || 0;
                  const totSalary = p.totalSalary ?? (regSalary + otPay + hol100Pay + hol30Pay + nightDiffPay);

                  const undertimeDed = p.undertimeDeductions || 0;
                  const lateDed = p.lateDeductions || 0;
                  const totNet = p.totalNetBeforeDeductions ?? (totSalary - (undertimeDed + lateDed));

                  const sssEmployerShare = p.sssEmployerShare || 630;
                  const sssEmployeeShare = p.sssEmployeeShare || p.sss || 420;
                  const caDed = p.cashAdvanceDeductions || 0;
                  const otherDed = p.otherDeductions || 0;
                  const sssReturn = p.sssCashReturn || 0;
                  const totDed = p.totalDeductions ?? (sssEmployeeShare + caDed + otherDed - sssReturn);
                  const netSalary = p.netPay ?? (totNet - totDed);

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.4rem 0.5rem", fontWeight: 700, whiteSpace: "nowrap" }}>{p.employeeName}</td>
                      <td style={{ padding: "0.4rem 0.5rem", whiteSpace: "nowrap", borderRight: "1px solid var(--border)" }}>{p.departmentJobTitle}</td>

                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{perDay.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{perHour.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>{noDays}</td>

                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{overtimeHours || "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{holiday100 || "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{holiday30 || "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{undertimeMins || "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{nightDiffMins || "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>{lateMins || "-"}</td>

                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{regSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{otPay ? otPay.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{hol100Pay ? hol100Pay.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{hol30Pay ? hol30Pay.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{nightDiffPay ? nightDiffPay.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 700, borderRight: "1px solid var(--border)" }}>{totSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>

                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{undertimeDed ? undertimeDed.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{lateDed ? lateDed.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 700, borderRight: "1px solid var(--border)" }}>{totNet.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>

                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{sssEmployerShare ? sssEmployerShare.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{sssEmployeeShare ? sssEmployeeShare.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{caDed ? caDed.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{otherDed ? otherDed.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{sssReturn ? sssReturn.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 700, borderRight: "1px solid var(--border)" }}>{totDed ? totDed.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>

                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 900, color: "var(--primary)" }}>{netSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {reportPayslips.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "var(--bg-main)" }}>
                  <td colSpan={11} style={{ padding: "0.6rem 0.5rem", borderRight: "1px solid var(--border)" }}>TOTALS:</td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.basicPay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.overtimePay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.holiday100Pay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.holiday30Pay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.nightDiffPay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.totalSalary || (p.basicPay + p.overtimePay)), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.undertimeDeductions || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.lateDeductions || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.totalNetBeforeDeductions || (p.basicPay + p.overtimePay - p.lateDeductions)), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.sssEmployerShare || 630), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.sssEmployeeShare || p.sss || 420), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.cashAdvanceDeductions || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.otherDeductions || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.sssCashReturn || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.totalDeductions || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "var(--primary)" }}>
                    ₱{reportPayslips.reduce((s, p) => s + (p.netPay || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
            </table>
          </div>

          {/* Signatories Footer */}
          {(() => {
            const preparedName = localStorage.getItem("neugate_sig_prepared_by") || "JANE D. DOE";
            const checkedName = localStorage.getItem("neugate_sig_checked_by") || "JOHN R. SMITH";
            const approvedName = localStorage.getItem("neugate_sig_approved_by") || "HENRY A. TAYLOR";
            const preparedImg = localStorage.getItem("neugate_sig_prepared_by_img") || "";
            const checkedImg = localStorage.getItem("neugate_sig_checked_by_img") || "";
            const approvedImg = localStorage.getItem("neugate_sig_approved_by_img") || "";

            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2rem", marginTop: "3rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", textAlign: "center", fontSize: "0.8rem" }}>
                <div>
                  <div style={{ height: "45px", display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: "4px" }}>
                    {preparedImg ? (
                      <img src={preparedImg} alt="Prepared By Signature" style={{ maxHeight: "40px", maxWidth: "150px", objectFit: "contain" }} />
                    ) : (
                      <div style={{ borderBottom: "1px solid var(--text-sub)", width: "100%", height: "1px" }}></div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, borderTop: preparedImg ? "1px solid var(--text-sub)" : "none", paddingTop: "2px" }}>{preparedName}</div>
                  <div style={{ color: "var(--text-sub)" }}>Prepared By</div>
                </div>

                <div>
                  <div style={{ height: "45px", display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: "4px" }}>
                    {checkedImg ? (
                      <img src={checkedImg} alt="Checked By Signature" style={{ maxHeight: "40px", maxWidth: "150px", objectFit: "contain" }} />
                    ) : (
                      <div style={{ borderBottom: "1px solid var(--text-sub)", width: "100%", height: "1px" }}></div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, borderTop: checkedImg ? "1px solid var(--text-sub)" : "none", paddingTop: "2px" }}>{checkedName}</div>
                  <div style={{ color: "var(--text-sub)" }}>Checked By</div>
                </div>

                <div>
                  <div style={{ height: "45px", display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: "4px" }}>
                    {approvedImg ? (
                      <img src={approvedImg} alt="Approved By Signature" style={{ maxHeight: "40px", maxWidth: "150px", objectFit: "contain" }} />
                    ) : (
                      <div style={{ borderBottom: "1px solid var(--text-sub)", width: "100%", height: "1px" }}></div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, borderTop: approvedImg ? "1px solid var(--text-sub)" : "none", paddingTop: "2px" }}>{approvedName}</div>
                  <div style={{ color: "var(--text-sub)" }}>Approved By</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB TAB 5: CASH ADVANCES LEDGER */}
      {activeSubTab === "ca" && (
        <div id="printable-ca-report" className="table-card" style={{ padding: "1.25rem" }}>
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--text-main)" }}>
                💸 CASH ADVANCES LEDGER & REPORT
              </h3>
              <div style={{ fontSize: "0.8rem", color: "var(--text-sub)", marginTop: "0.15rem" }}>
                Period Cutoff: <strong>{new Date(reportStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {new Date(reportEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</strong>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => window.print()} style={{ fontSize: "0.8rem" }}>
              🖨️ Print Cash Advances Report
            </button>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace" }}>
              <thead>
                <tr style={{ background: "var(--bg-main)", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                  <th style={{ padding: "0.5rem" }}>EMPLOYEE NAME</th>
                  <th style={{ padding: "0.5rem", background: "rgba(59, 130, 246, 0.08)" }}>ADVANCES FROM BIRADA</th>
                  <th style={{ padding: "0.5rem", background: "rgba(59, 130, 246, 0.08)" }}>SH ADVANCES</th>
                  <th style={{ padding: "0.5rem", fontWeight: 800, background: "rgba(59, 130, 246, 0.12)" }}>TOTAL CASH ADVANCE</th>
                  <th style={{ padding: "0.5rem", background: "rgba(244, 63, 94, 0.08)" }}>DEDUCTION ({new Date(reportEnd).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })})</th>
                  <th style={{ padding: "0.5rem", fontWeight: 800, color: "var(--primary)" }}>REMAINING BALANCE</th>
                  <th style={{ padding: "0.5rem", textAlign: "left" }}>REMARKS & NOTES</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, idx) => {
                  const caSample: Record<string, { birada: number; sh: number; ded: number; notes: string }> = {
                    "CYRIL ORTALLA": { birada: 0, sh: 2000, ded: 1000, notes: "" },
                    "JERAMIL MACABALI": { birada: 4000, sh: 0, ded: 4000, notes: "" },
                    "ISRAEL GAVIOAL": { birada: 2000, sh: 100, ded: 2100, notes: "" },
                    "MARICEL BAYUBAY": { birada: 0, sh: 1767, ded: 1000, notes: "" },
                    "EROCKLEO DUTERTE": { birada: 0, sh: 12000, ded: 1000, notes: "" },
                    "JOSELITO HORTELANO": { birada: 0, sh: 500, ded: 500, notes: "" },
                    "MELITON POGOY": { birada: 0, sh: 1000, ded: 1000, notes: "" },
                    "MARTIN TORRALBA": { birada: 0, sh: 500, ded: 500, notes: "" },
                    "EFREN DEMECILLO": { birada: 0, sh: 500, ded: 500, notes: "" },
                    "ANGEL HORTELANO": { birada: 0, sh: 4100, ded: 700, notes: "ADD 300 CA 6/24/2026" },
                    "REYMARK GECERA": { birada: 0, sh: 1500, ded: 500, notes: "" },
                    "JUNEFORT SUPERALES": { birada: 0, sh: 1000, ded: 1000, notes: "" },
                    "JOEL ACAIN": { birada: 0, sh: 4000, ded: 1000, notes: "" },
                  };

                  const key = Object.keys(caSample).find((k) => emp.name.toUpperCase().includes(k) || k.includes(emp.name.toUpperCase().split(" ")[0])) || "";
                  const item = key ? caSample[key] : { birada: idx === 0 ? 2000 : 0, sh: idx % 2 === 0 ? 1500 : 800, ded: 500, notes: "" };
                  const totalCa = item.birada + item.sh;
                  const balance = totalCa - item.ded;

                  return (
                    <tr key={emp.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.5rem 0.6rem", fontWeight: 700 }}>{emp.name}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>{item.birada ? item.birada.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>{item.sh ? item.sh.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontWeight: 700 }}>{totalCa ? totalCa.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", color: "var(--danger)", fontWeight: 700 }}>{item.ded ? item.ded.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "-"}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontWeight: 900, color: balance > 0 ? "var(--warning)" : "var(--success)" }}>{balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.5rem 0.6rem", color: "var(--text-sub)", fontSize: "0.7rem" }}>{item.notes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB TAB 6: OTHER DEDUCTIONS LEDGER */}
      {activeSubTab === "deductions" && (
        <div id="printable-deductions-report" className="table-card" style={{ padding: "1.25rem" }}>
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--text-main)" }}>
                📉 OTHER DEDUCTIONS LEDGER & PARTICULAR BREAKDOWN
              </h3>
              <div style={{ fontSize: "0.8rem", color: "var(--text-sub)", marginTop: "0.15rem" }}>
                Period Cutoff: <strong>{new Date(reportStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {new Date(reportEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</strong>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => window.print()} style={{ fontSize: "0.8rem" }}>
              🖨️ Print Other Deductions Report
            </button>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace" }}>
              <thead>
                <tr style={{ background: "var(--bg-main)", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                  <th style={{ padding: "0.5rem" }}>EMPLOYEE NAME</th>
                  <th style={{ padding: "0.5rem", background: "rgba(168, 85, 247, 0.08)" }}>FORWARDED BALANCE</th>
                  <th style={{ padding: "0.5rem", textAlign: "left" }}>PARTICULAR / REASON</th>
                  <th style={{ padding: "0.5rem", fontWeight: 800, background: "rgba(168, 85, 247, 0.12)" }}>TOTAL DEDUCTIONS</th>
                  <th style={{ padding: "0.5rem", background: "rgba(244, 63, 94, 0.08)" }}>DEDUCTION CUTOFF</th>
                  <th style={{ padding: "0.5rem", fontWeight: 800, color: "var(--primary)" }}>REMAINING BALANCE</th>
                  <th style={{ padding: "0.5rem", textAlign: "left" }}>AUDIT NOTES</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "FELIX SUMALINOG", fwd: 1000, particular: "DAMAGE", ded: 1000, notes: "damage gas5314 ball mirror 2,475 7/31/2026" },
                  { name: "JUNJUN TORRALBA", fwd: 5500, particular: "LICENSE", ded: 1000, notes: "" },
                  { name: "PELECIO JURADO", fwd: 7000, particular: "LICENSE", ded: 1000, notes: "" },
                  { name: "REIL JOHN CULANGO", fwd: 1750, particular: "LANDING GEAR", ded: 500, notes: "" },
                  { name: "CHRISTIAN MOHAMETANO", fwd: 19010, particular: "ILO-ILO( GAP2672)/ADD LTO", ded: 1000, notes: "" },
                  { name: "MARTURILLAS, RENATO", fwd: 8500, particular: "LICENSE", ded: 500, notes: "" },
                  { name: "HERMITA, GENEROSO", fwd: 8000, particular: "LICENSE", ded: 1000, notes: "" },
                  { name: "ANGELBERT HORTELANO", fwd: 225, particular: "UNIFORM / BADGE", ded: 225, notes: "" },
                  { name: "EDWARD LABANA", fwd: 225, particular: "UNIFORM / BADGE", ded: 225, notes: "" },
                  { name: "MELITON POGOY", fwd: 225, particular: "UNIFORM / BADGE", ded: 225, notes: "" },
                  { name: "EFREN DEMECILLO", fwd: 225, particular: "UNIFORM / BADGE", ded: 225, notes: "" },
                ].map((item, idx) => {
                  const balance = item.fwd - item.ded;
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.5rem 0.6rem", fontWeight: 700 }}>{item.name}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>₱{item.fwd.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--primary)" }}>{item.particular}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontWeight: 700 }}>₱{item.fwd.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", color: "var(--danger)", fontWeight: 700 }}>₱{item.ded.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontWeight: 900, color: balance > 0 ? "var(--warning)" : "var(--success)" }}>₱{balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.5rem 0.6rem", color: "var(--text-sub)", fontSize: "0.7rem" }}>{item.notes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showRunModal && (
        <div className="modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && setShowRunModal(false)}>
          <div className="modal" style={{ width: 450 }}>
            <div className="modal-header">
              <span className="modal-title">➕ Process New Payroll Run</span>
              <button className="modal-close" onClick={() => setShowRunModal(false)}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label className="form-label">Payroll Run Title</label>
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

            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setShowRunModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreatePayrollRun}>
                ⚡ Compute &amp; Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT COMPENSATION RATE MODAL */}
      {selectedEmpForRate && (
        <div className="modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && setSelectedEmpForRate(null)}>
          <div className="modal" style={{ width: 500 }}>
            <div className="modal-header">
              <span className="modal-title">⚙️ Compensation Setup: {selectedEmpForRate.name}</span>
              <button className="modal-close" onClick={() => setSelectedEmpForRate(null)}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Pay Structure</label>
                <select
                  className="form-input"
                  value={editingRate.salaryType}
                  onChange={(e) => setEditingRate({ ...editingRate, salaryType: e.target.value as any })}
                >
                  <option value="MONTHLY">Monthly Basic Rate</option>
                  <option value="DAILY">Daily Rate</option>
                  <option value="HOURLY">Hourly Rate</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Basic Salary (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingRate.basicSalary}
                  onChange={(e) => setEditingRate({ ...editingRate, basicSalary: Number(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div className="form-group">
                <label className="form-label">OT Rate (₱ / hr)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingRate.overtimeRatePerHour}
                  onChange={(e) => setEditingRate({ ...editingRate, overtimeRatePerHour: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Late Penalty (₱ / min)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingRate.lateDeductionRatePerMin}
                  onChange={(e) => setEditingRate({ ...editingRate, lateDeductionRatePerMin: Number(e.target.value) })}
                />
              </div>
            </div>

            <h4 style={{ margin: "1rem 0 0.5rem 0", fontSize: "0.85rem", color: "var(--text-sub)" }}>
              Statutory Contributions (Monthly Basis)
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: "0.75rem" }}>SSS (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingRate.sssDeduction}
                  onChange={(e) => setEditingRate({ ...editingRate, sssDeduction: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: "0.75rem" }}>PhilHealth (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingRate.philhealthDeduction}
                  onChange={(e) => setEditingRate({ ...editingRate, philhealthDeduction: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: "0.75rem" }}>Pag-IBIG (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingRate.pagibigDeduction}
                  onChange={(e) => setEditingRate({ ...editingRate, pagibigDeduction: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: "0.75rem" }}>Withholding Tax (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingRate.taxDeduction}
                  onChange={(e) => setEditingRate({ ...editingRate, taxDeduction: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setSelectedEmpForRate(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveRate}>
                💾 Save Rates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE PAYSLIP MODAL */}
      {viewPayslip && (
        <div className="printable-modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && setViewPayslip(null)}>
          <div className="printable-modal-container">
            {/* Top Control Bar (Hidden on Print) */}
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>📄 Printable Payslip ({viewPayslip.employeeName})</h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-outline"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  title="Download PDF directly to file"
                >
                  {isGeneratingPdf ? "⏳ Generating PDF..." : "📥 Download PDF"}
                </button>
                <button className="btn btn-primary" onClick={handlePrintPayslip}>
                  🖨️ Print Payslip
                </button>
                <button className="btn btn-outline" onClick={() => setViewPayslip(null)}>
                  ✕ Close
                </button>
              </div>
            </div>

            {pdfSuccessMsg && (
              <div style={{ background: "rgba(16,185,129,0.15)", color: "var(--success)", border: "1px solid rgba(16,185,129,0.3)", padding: "0.5rem 0.8rem", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.8rem", fontWeight: 600 }}>
                ✅ {pdfSuccessMsg}
              </div>
            )}


            {/* Printable Ticket Content Area */}
            <div className="printable-ticket" id="payslip-ticket">
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #111827", paddingBottom: "1rem", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ margin: 0, color: "#111827", textTransform: "uppercase", letterSpacing: "0.05em" }}>OFFICIAL PAYSLIP</h2>
                  <div style={{ color: "#4b5563", fontSize: "0.85rem", fontWeight: 600 }}>neuHR Corporate Timekeeping &amp; Payroll</div>
                </div>
                <div style={{ textAlign: "right", fontSize: "0.85rem", color: "#4b5563" }}>
                  <div>Date Generated: <strong>{new Date(viewPayslip.createdAt).toLocaleDateString()}</strong></div>
                  <div>Payslip ID: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>#{viewPayslip.payrollRunId}-{viewPayslip.employeeId}</span></div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem", background: "#f3f4f6", padding: "1rem", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>EMPLOYEE NAME</div>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#111827" }}>{viewPayslip.employeeName}</div>
                  <div style={{ fontSize: "0.85rem", color: "#374151" }}>{viewPayslip.departmentJobTitle}</div>
                </div>
                <div>
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

