import { useState } from "react";
import { Employee, AttendanceLog, WorkSchedule, EmployeeRate, PayrollPayslip } from "../types";
import { computeEmployeePayslip } from "../utils/payroll";
import { useToast } from "../context/ToastContext";

interface SalariesWagesReportProps {
  employees: Employee[];
  logs: AttendanceLog[];
  schedules: WorkSchedule[];
  rates: EmployeeRate[];
}

export default function SalariesWagesReport({
  employees,
  logs,
  schedules,
  rates,
}: SalariesWagesReportProps) {
  const toast = useToast();
  const [reportStart, setReportStart] = useState<string>("2026-08-27");
  const [reportEnd, setReportEnd] = useState<string>("2026-09-12");

  const reportPayslips: PayrollPayslip[] = employees.length > 0
    ? employees.map((emp) => {
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
      })
    : [];

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
      "HOLIDAY 100% PAY",
      "HOLIDAY 30% PAY",
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            📊 Salaries and Wages Comprehensive Report
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Comprehensive salary breakdown, attendance hours logged, gross additions, disciplinary deductions, and net payout.
          </p>
        </div>
      </div>

      <div id="printable-report" className="table-card" style={{ padding: "1.25rem" }}>
        {/* Action & Filter Control Bar */}
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
            <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>TOTAL OVERTIME PAY</div>
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
              <tr style={{ background: "var(--bg-main)", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                <th colSpan={2} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>EMPLOYEE INFO</th>
                <th colSpan={3} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>BASE RATES &amp; DAYS</th>
                <th colSpan={6} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)" }}>LOGGED METRICS &amp; HOURS</th>
                <th colSpan={6} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(16,185,129,0.05)" }}>GROSS SALARY BREAKDOWN</th>
                <th colSpan={3} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(244,63,94,0.05)" }}>DISCIPLINARY DEDUCTIONS</th>
                <th colSpan={7} style={{ padding: "0.4rem", borderRight: "1px solid var(--border)", background: "rgba(168,85,247,0.05)" }}>STATUTORY &amp; OTHER DEDUCTIONS</th>
                <th style={{ padding: "0.4rem", background: "rgba(0,212,255,0.08)" }}>NET PAY</th>
              </tr>
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

                <th style={{ padding: "0.45rem", textAlign: "right" }}>REGULAR SALARY</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>OVERTIME</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>HOLIDAY 100%</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>HOLIDAY 30%</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>NIGHT DIFF</th>
                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOTAL SALARY</th>

                <th style={{ padding: "0.45rem", textAlign: "right" }}>UNDERTIME</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>LATE</th>
                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOTAL NET</th>

                <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS EMPLOYER SHARE</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS EMPLOYEE SHARE</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>CASH ADVANCE DEDUCTIONS</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>OTHER DEDUCTIONS</th>
                <th style={{ padding: "0.45rem", textAlign: "right" }}>SSS CASH RETURN</th>
                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, borderRight: "1px solid var(--border)" }}>TOTAL DEDUCTIONS</th>

                <th style={{ padding: "0.45rem", textAlign: "right", fontWeight: 800, color: "var(--primary)" }}>TOTAL NET SALARY</th>
              </tr>
            </thead>
            <tbody>
              {reportPayslips.length === 0 ? (
                <tr>
                  <td colSpan={27} style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
                    No payroll data available for selected date cutoff.
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
                      <td style={{ padding: "0.4rem 0.5rem", color: "var(--text-sub)", borderRight: "1px solid var(--border)", whiteSpace: "nowrap" }}>{p.departmentJobTitle}</td>

                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{perDay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{perHour.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
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
    </div>
  );
}
