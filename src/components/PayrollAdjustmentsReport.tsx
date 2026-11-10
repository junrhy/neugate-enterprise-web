import { useState } from "react";
import { Employee, AttendanceLog, WorkSchedule, EmployeeRate } from "../types";
import { computeEmployeePayslip } from "../utils/payroll";
import { useToast } from "../context/ToastContext";

interface PayrollAdjustmentsReportProps {
  employees: Employee[];
  logs: AttendanceLog[];
  schedules: WorkSchedule[];
  rates: EmployeeRate[];
}

interface AdjustmentRow {
  no: number;
  empId: string;
  name: string;
  position: string;
  perDay: number;
  perHour: number;
  noDays: number;
  overtimeHours: number;
  holiday100Hours: number;
  holiday30Hours: number;
  regularSalary: number;
  overtimePay: number;
  holiday30Pay: number;
  totalSalary: number;
  undertimeDed: number;
  lateDed: number;
  totalNet: number;
  sssEe: number;
  caDeductions: number;
  otherDeductions: number;
  sssCashReturn: number;
  totalDeduction: number;
  totalNetSalary: number;
  adjustmentFromSalary: number;
  additional: number;
}

export default function PayrollAdjustmentsReport({
  employees,
  logs,
  schedules,
  rates,
}: PayrollAdjustmentsReportProps) {
  const toast = useToast();
  const [reportStart, setReportStart] = useState<string>("2026-08-28");
  const [reportEnd, setReportEnd] = useState<string>("2026-09-12");

  // State to hold custom adjustments per employee, loaded from localStorage
  const [customDeclaredMap, setCustomDeclaredMap] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("neugate_payroll_declared_map");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleDeclaredChange = (empId: string, val: string) => {
    const parsed = parseFloat(val) || 0;
    setCustomDeclaredMap((prev) => {
      const updated = { ...prev, [empId]: parsed };
      try {
        localStorage.setItem("neugate_payroll_declared_map", JSON.stringify(updated));
      } catch (err) {
        console.error("Failed to save declared map to localStorage:", err);
      }
      return updated;
    });
  };

  const rows: AdjustmentRow[] = employees.map((emp, index) => {
    const empRate = rates.find((r) => r.employeeId === emp.id);

    const payslip = computeEmployeePayslip({
      employee: emp,
      logs,
      schedules,
      rate: empRate || {
        employeeId: emp.id,
        salaryType: "MONTHLY",
        basicSalary: 0,
        overtimeRatePerHour: 0,
        lateDeductionRatePerMin: 0,
        sssDeduction: 0,
        philhealthDeduction: 0,
        pagibigDeduction: 0,
        taxDeduction: 0,
      },
      periodStart: reportStart,
      periodEnd: reportEnd,
      payrollRunId: 0,
    });

    const perDay = empRate?.basicSalary ? empRate.basicSalary / 26 : (payslip.perDay || 0);
    const perHour = payslip.perHour || (perDay > 0 ? perDay / 8 : 0);
    const noDays = payslip.noDays || (payslip.totalHoursWorked ? Math.round((payslip.totalHoursWorked / 8) * 10) / 10 : 0);
    const overtimeHours = payslip.overtimeHours || 0;
    const holiday30Hours = payslip.holiday30Count || 0;

    const regSalary = payslip.basicPay || (perDay * noDays);
    const otPay = payslip.overtimePay || 0;
    const hol30Pay = payslip.holiday30Pay || 0;
    const totSalary = payslip.grossPay || (regSalary + otPay + hol30Pay);

    const undertimeDed = payslip.undertimeDeductions || 0;
    const lateDed = payslip.lateDeductions || 0;
    const totNet = totSalary - (undertimeDed + lateDed);

    const sssEe = empRate?.sssDeduction || payslip.sss || payslip.sssEmployeeShare || 0;
    const caDed = payslip.cashAdvanceDeductions || 0;
    const otherDed = payslip.otherDeductions || 0;
    const sssReturn = payslip.sssCashReturn || 0;
    const totDed = payslip.totalDeductions || (sssEe + caDed + otherDed - sssReturn);
    const totalNetSalary = payslip.netPay || (totNet - totDed);

    // Use custom declared base if set by user in localStorage, otherwise default to totalNetSalary
    const customDeclared = customDeclaredMap[emp.id];
    const declaredBase = customDeclared !== undefined ? customDeclared : totalNetSalary;
    const additional = Math.max(0, totalNetSalary - declaredBase);

    return {
      no: index + 1,
      empId: emp.id,
      name: emp.name,
      position: emp.departmentJobTitle || "Staff",
      perDay,
      perHour,
      noDays,
      overtimeHours,
      holiday100Hours: 0,
      holiday30Hours,
      regularSalary: regSalary,
      overtimePay: otPay,
      holiday30Pay: hol30Pay,
      totalSalary: totSalary,
      undertimeDed,
      lateDed,
      totalNet: totNet,
      sssEe,
      caDeductions: caDed,
      otherDeductions: otherDed,
      sssCashReturn: sssReturn,
      totalDeduction: totDed,
      totalNetSalary,
      adjustmentFromSalary: declaredBase,
      additional,
    };
  });

  // Summary totals
  const totals = rows.reduce(
    (acc, r) => ({
      regularSalary: acc.regularSalary + r.regularSalary,
      overtimePay: acc.overtimePay + r.overtimePay,
      holiday30Pay: acc.holiday30Pay + r.holiday30Pay,
      totalSalary: acc.totalSalary + r.totalSalary,
      undertimeDed: acc.undertimeDed + r.undertimeDed,
      lateDed: acc.lateDed + r.lateDed,
      totalNet: acc.totalNet + r.totalNet,
      sssEe: acc.sssEe + r.sssEe,
      caDeductions: acc.caDeductions + r.caDeductions,
      otherDeductions: acc.otherDeductions + r.otherDeductions,
      sssCashReturn: acc.sssCashReturn + r.sssCashReturn,
      totalDeduction: acc.totalDeduction + r.totalDeduction,
      totalNetSalary: acc.totalNetSalary + r.totalNetSalary,
      adjustmentFromSalary: acc.adjustmentFromSalary + r.adjustmentFromSalary,
      additional: acc.additional + r.additional,
    }),
    {
      regularSalary: 0,
      overtimePay: 0,
      holiday30Pay: 0,
      totalSalary: 0,
      undertimeDed: 0,
      lateDed: 0,
      totalNet: 0,
      sssEe: 0,
      caDeductions: 0,
      otherDeductions: 0,
      sssCashReturn: 0,
      totalDeduction: 0,
      totalNetSalary: 0,
      adjustmentFromSalary: 0,
      additional: 0,
    }
  );

  const handleExportCsv = () => {
    if (rows.length === 0) {
      toast.warning("No records to export.", "CSV Export");
      return;
    }

    const headers = [
      "NO'S",
      "NAME",
      "POSITION",
      "PER DAY",
      "PER HOUR",
      "NO. DAYS",
      "OVERTIME",
      "HOLIDAY (100%)",
      "HOLIDAY (30%)",
      "REGULAR SALARY",
      "OVERTIME",
      "HOLIDAY 30%",
      "TOTAL SALARY",
      "UNDERTIME",
      "LATE",
      "TOTAL NET",
      "SSS EE",
      "CA DEDUCTIONS",
      "OTHER DEDUCTIONS",
      "SSS CASH RETURN",
      "TOTAL DEDUCTION",
      "TOTAL NET SALARY",
      "ADJUSTMENT FROM SALARY",
      "ADDITIONAL",
    ];

    const csvRows = rows.map((r) => [
      r.no,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.position.replace(/"/g, '""')}"`,
      r.perDay.toFixed(2),
      r.perHour.toFixed(2),
      r.noDays,
      r.overtimeHours || "",
      r.holiday100Hours || "",
      r.holiday30Hours || "",
      r.regularSalary.toFixed(2),
      r.overtimePay ? r.overtimePay.toFixed(2) : "-",
      r.holiday30Pay ? r.holiday30Pay.toFixed(2) : "-",
      r.totalSalary.toFixed(2),
      r.undertimeDed ? r.undertimeDed.toFixed(2) : "-",
      r.lateDed ? r.lateDed.toFixed(2) : "-",
      r.totalNet.toFixed(2),
      r.sssEe ? r.sssEe.toFixed(2) : "-",
      r.caDeductions ? r.caDeductions.toFixed(2) : "-",
      r.otherDeductions ? r.otherDeductions.toFixed(2) : "-",
      r.sssCashReturn ? r.sssCashReturn.toFixed(2) : "-",
      r.totalDeduction.toFixed(2),
      r.totalNetSalary.toFixed(2),
      r.adjustmentFromSalary.toFixed(2),
      r.additional.toFixed(2),
    ].join(","));

    // Add Summary Row
    csvRows.push([
      "",
      "TOTALS",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totals.regularSalary.toFixed(2),
      totals.overtimePay.toFixed(2),
      totals.holiday30Pay.toFixed(2),
      totals.totalSalary.toFixed(2),
      totals.undertimeDed.toFixed(2),
      totals.lateDed.toFixed(2),
      totals.totalNet.toFixed(2),
      totals.sssEe.toFixed(2),
      totals.caDeductions.toFixed(2),
      totals.otherDeductions.toFixed(2),
      totals.sssCashReturn.toFixed(2),
      totals.totalDeduction.toFixed(2),
      totals.totalNetSalary.toFixed(2),
      totals.adjustmentFromSalary.toFixed(2),
      totals.additional.toFixed(2),
    ].join(","));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Payroll_Adjustments_Report_${reportStart}_to_${reportEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Payroll Adjustments CSV exported successfully!", "Export Success");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            📝 Payroll Tax &amp; Salary Adjustments Sheet
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Compare statutory declared base payroll (for tax/SSS filings) vs. actual non-taxable additional allowances.
          </p>
        </div>
      </div>

      {/* Main Printable Card Container matching Salaries & Wages Report */}
      <div id="printable-report" className="table-card" style={{ padding: "1.25rem" }}>
        
        {/* Action & Date Filter Bar */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-sub)" }}>
              Period Cutoff: <strong>{new Date(reportStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {new Date(reportEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</strong>
            </div>
          </div>

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
              onClick={handleExportCsv}
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

        {/* Report Summary Cards matching Salaries and Wages Comprehensive Report */}
        <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL REGULAR SALARY</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem" }}>
              ₱{totals.regularSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>DECLARED BASE (TAX BASE)</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--warning)" }}>
              ₱{totals.adjustmentFromSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>NON-TAXABLE ADDITIONAL</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--success)" }}>
              ₱{totals.additional.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL NET PAYOUT</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--primary)" }}>
              ₱{totals.totalNetSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Grouped Table View matching Salaries and Wages Report Structure */}
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem", fontFamily: "JetBrains Mono, monospace" }}>
            <thead>
              {/* Category Grouping Row */}
              <tr style={{ background: "var(--bg-main)", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                <th colSpan={3} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>EMPLOYEE INFO</th>
                <th colSpan={3} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>BASE RATES &amp; DAYS</th>
                <th colSpan={2} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>LOGGED METRICS &amp; HOURS</th>
                <th colSpan={4} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(16,185,129,0.05)" }}>GROSS SALARY BREAKDOWN</th>
                <th colSpan={1} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(244,63,94,0.05)" }}>DISCIPLINARY</th>
                <th colSpan={5} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(168,85,247,0.05)" }}>STATUTORY &amp; DEDUCTIONS</th>
                <th colSpan={1} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(0,212,255,0.08)" }}>TOTAL PAYOUT</th>
                <th colSpan={2} style={{ padding: "0.4rem", background: "rgba(245,158,11,0.08)" }}>TAX ADJUSTMENT SPLIT</th>
              </tr>

              {/* Individual Column Header Row */}
              <tr style={{ background: "var(--bg-main)", borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "0.45rem", whiteSpace: "nowrap" }}>NO'S</th>
                <th style={{ padding: "0.45rem", whiteSpace: "nowrap" }}>NAME</th>
                <th style={{ padding: "0.45rem", whiteSpace: "nowrap", borderRight: "1px solid var(--border)" }}>POSITION</th>

                <th style={{ padding: "0.45rem", textAlign: "right" }}>PER DAY</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>PER HOUR</th>
                <th style={{ padding: "0.45rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>DAYS</th>

                <th style={{ padding: "0.45rem", textAlign: "right" }}>OT (HRS)</th>
                <th style={{ padding: "0.45rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>HOL (30%)</th>

                <th style={{ padding: "0.45rem", textAlign: "right" }}>REGULAR SALARY</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>OVERTIME</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>HOLIDAY 30%</th>
                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOTAL SALARY</th>

                <th style={{ padding: "0.45rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>UNDERTIME</th>

                <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS EE</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>CA DEDUCTIONS</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>OTHER DEDUCTIONS</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS CASH RETURN</th>
                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOTAL DEDUCTIONS</th>

                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, color: "var(--primary)", borderRight: "1px solid var(--border)" }}>TOTAL NET SALARY</th>
                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, color: "var(--warning)" }}>ADJUSTMENT FROM SALARY</th>
                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, color: "var(--success)" }}>ADDITIONAL</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={21} style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
                    No employee records found. Add employees in the Workforce &amp; HR menu to compute payroll tax &amp; salary adjustments.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0.5rem", color: "var(--text-sub)" }}>{r.no}</td>
                  <td style={{ padding: "0.4rem 0.5rem", fontWeight: 700, whiteSpace: "nowrap" }}>{r.name}</td>
                  <td style={{ padding: "0.4rem 0.5rem", color: "var(--text-sub)", borderRight: "1px solid var(--border)", whiteSpace: "nowrap" }}>{r.position}</td>

                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>₱{r.perDay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--text-sub)" }}>₱{r.perHour.toFixed(2)}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 700, borderRight: "1px solid var(--border)" }}>{r.noDays}</td>

                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{r.overtimeHours || "-"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>{r.holiday30Hours || "-"}</td>

                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>₱{r.regularSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{r.overtimePay ? `₱${r.overtimePay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "-"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{r.holiday30Pay ? `₱${r.holiday30Pay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "-"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 700, borderRight: "1px solid var(--border)" }}>₱{r.totalSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>

                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--danger)", borderRight: "1px solid var(--border)" }}>{r.undertimeDed ? `₱${r.undertimeDed.toFixed(2)}` : "-"}</td>

                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--text-sub)" }}>{r.sssEe ? `₱${r.sssEe.toFixed(2)}` : "-"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--text-sub)" }}>{r.caDeductions ? `₱${r.caDeductions.toFixed(2)}` : "-"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--text-sub)" }}>{r.otherDeductions ? `₱${r.otherDeductions.toFixed(2)}` : "-"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--text-sub)" }}>{r.sssCashReturn ? `₱${r.sssCashReturn.toFixed(2)}` : "-"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 700, color: "var(--danger)", borderRight: "1px solid var(--border)" }}>₱{r.totalDeduction.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>

                  {/* Total Net Salary */}
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 900, color: "var(--primary)", borderRight: "1px solid var(--border)" }}>
                    ₱{r.totalNetSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>

                  {/* Editable Adjustment Base */}
                  <td style={{ padding: "0.3rem 0.5rem", textAlign: "right" }}>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      style={{
                        width: "120px",
                        textAlign: "right",
                        padding: "0.2rem 0.4rem",
                        fontSize: "0.75rem",
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 700,
                        color: "var(--warning)",
                        borderColor: "rgba(245, 158, 11, 0.4)",
                      }}
                      value={r.adjustmentFromSalary || ""}
                      onChange={(e) => handleDeclaredChange(r.empId, e.target.value)}
                    />
                  </td>

                  {/* Additional Non-Taxable Top-Up */}
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 900, color: "var(--success)" }}>
                    ₱{r.additional.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              )))}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "var(--bg-main)" }}>
                <td colSpan={8} style={{ padding: "0.6rem 0.5rem", borderRight: "1px solid var(--border)" }}>TOTALS:</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>₱{totals.regularSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>₱{totals.overtimePay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>₱{totals.holiday30Pay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", borderRight: "1px solid var(--border)" }}>₱{totals.totalSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "var(--danger)", borderRight: "1px solid var(--border)" }}>₱{totals.undertimeDed.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>₱{totals.sssEe.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>₱{totals.caDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>₱{totals.otherDeductions.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>₱{totals.sssCashReturn.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "var(--danger)", borderRight: "1px solid var(--border)" }}>₱{totals.totalDeduction.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "var(--primary)", borderRight: "1px solid var(--border)" }}>₱{totals.totalNetSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "var(--warning)" }}>₱{totals.adjustmentFromSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "var(--success)" }}>₱{totals.additional.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signatories Footer matching Salaries and Wages Report */}
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
    </div>
  );
}
