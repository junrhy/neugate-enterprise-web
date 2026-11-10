import { useState, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Employee, EmployeeRate, PayrollPayslip, ThirteenthMonthPay } from "../types";
import { useToast } from "../context/ToastContext";

interface ThirteenthMonthConsoleProps {
  employees: Employee[];
  employeeRates: EmployeeRate[];
  payrollPayslips: PayrollPayslip[];
}

export default function ThirteenthMonthConsole({
  employees,
  employeeRates,
  payrollPayslips,
}: ThirteenthMonthConsoleProps) {
  const toast = useToast();
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [search, setSearch] = useState("");
  const [previewAdvice, setPreviewAdvice] = useState<ThirteenthMonthPay | null>(null);
  const adviceModalRef = useRef<HTMLDivElement>(null);

  // Calculate 13th Month Pay & Annual Tax for each employee
  const computations: ThirteenthMonthPay[] = employees.map((emp) => {
    // Sum basic pay earned by employee in this year across all payroll runs
    const empPayslips = payrollPayslips.filter((p) => p.employeeId === emp.id);
    const rate = employeeRates.find((r) => r.employeeId === emp.id);

    const totalBasicEarned = empPayslips.length > 0
      ? empPayslips.reduce((sum, p) => sum + p.basicPay, 0)
      : (rate ? rate.basicSalary * 12 : 240000); // Default to annual basic standard if no runs yet

    const thirteenthMonthPay = Math.round((totalBasicEarned / 12) * 100) / 100;
    
    // Under PH Tax Code (TRAIN Law), 13th Month Pay & Other Benefits up to P90,000 are TAX-EXEMPT
    const taxExemptLimit = 90000;
    const taxable13thMonth = Math.max(0, thirteenthMonthPay - taxExemptLimit);
    const taxExemptStatus = thirteenthMonthPay <= taxExemptLimit
      ? `Tax Exempt (₱${thirteenthMonthPay.toLocaleString()} <= ₱90,000)`
      : `Taxable Portion: ₱${taxable13thMonth.toLocaleString()}`;

    // Estimated Annual Taxable Income & Tax
    const annualGross = totalBasicEarned + taxable13thMonth;
    const annualTaxableIncome = Math.max(0, annualGross - 90000);
    // Simple PH Annual Graduated Tax Bracket Estimate (TRAIN Law)
    let projectedAnnualTax = 0;
    if (annualTaxableIncome > 250000 && annualTaxableIncome <= 400000) {
      projectedAnnualTax = (annualTaxableIncome - 250000) * 0.15;
    } else if (annualTaxableIncome > 400000 && annualTaxableIncome <= 800000) {
      projectedAnnualTax = 22500 + (annualTaxableIncome - 400000) * 0.20;
    } else if (annualTaxableIncome > 800000) {
      projectedAnnualTax = 102500 + (annualTaxableIncome - 800000) * 0.25;
    }

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      departmentJobTitle: emp.departmentJobTitle,
      totalBasicEarned,
      thirteenthMonthPay,
      taxExemptStatus,
      annualTaxableIncome,
      projectedAnnualTax: Math.round(projectedAnnualTax * 100) / 100,
    };
  });

  const filteredComputations = computations.filter(
    (c) =>
      c.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      c.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      c.departmentJobTitle.toLowerCase().includes(search.toLowerCase())
  );

  const total13thMonthPayout = computations.reduce((sum, c) => sum + c.thirteenthMonthPay, 0);

  const handlePrintAdvice = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!adviceModalRef.current || !previewAdvice) return;
    try {
      const canvas = await html2canvas(adviceModalRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "pt", "a4");
      const imgWidth = 595.28;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`13th_Month_Advice_${previewAdvice.employeeId}_${selectedYear}.pdf`);
      toast.success("13th Month Advice PDF downloaded!", "Export Success");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF.", "Export Error");
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            🎁 13th Month Pay &amp; Annual Tax Computation Engine
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Automated PH Labor Code 13th Month Pay computation and BIR TRAIN Law annual tax exemption reconciliation.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Tax Year:</label>
          <select
            className="form-input"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{ width: "110px", padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>TOTAL 13TH MONTH PAYOUT</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--primary)" }}>
            ₱{total13thMonthPayout.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--success)", marginTop: "0.25rem" }}>Mandatory Annual Bonus</div>
        </div>

        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>BIR TAX-EXEMPT CAP</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--success)" }}>
            ₱90,000.00
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Per Employee Max Exemption</div>
        </div>

        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>ELIGIBLE EMPLOYEES</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--text-main)" }}>
            {computations.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Full Corporate Roster</div>
        </div>
      </div>

      {/* Main Computations Table */}
      <div className="table-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
            📋 Annual 13th Month Pay &amp; Tax Audit Roster ({selectedYear})
          </h3>
          <input
            type="text"
            className="form-input"
            placeholder="Search employee or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "260px", padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
          />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Employee</th>
                <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Total Basic Earned</th>
                <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "right" }}>13th Month Pay</th>
                <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>BIR Tax Status</th>
                <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Est. Annual Tax</th>
                <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredComputations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                    No employees found matching search.
                  </td>
                </tr>
              ) : (
                filteredComputations.map((c) => (
                  <tr key={c.employeeId} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "0.75rem" }}>
                      <div style={{ fontWeight: 600 }}>{c.employeeName}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.employeeId} • {c.departmentJobTitle}</div>
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                      ₱{c.totalBasicEarned.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>
                      ₱{c.thirteenthMonthPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <span className="badge badge-success" style={{ fontSize: "0.75rem" }}>
                        {c.taxExemptStatus}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "right", fontFamily: "monospace" }}>
                      ₱{c.projectedAnnualTax.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "0.75rem", textAlign: "center" }}>
                      <button
                        onClick={() => setPreviewAdvice(c)}
                        className="btn btn-sm btn-outline"
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                      >
                        📄 Payslip Advice
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 13th Month Advice Slip Preview Modal */}
      {previewAdvice && (
        <div className="printable-modal-overlay">
          <div className="printable-modal-container" style={{ width: "650px", maxWidth: "90vw" }}>
            {/* Modal Actions Header */}
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid #e5e7eb", paddingBottom: "0.75rem" }}>
              <div style={{ fontWeight: 700, color: "#111827" }}>🎁 13th Month Pay Advice Preview</div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={handlePrintAdvice} className="btn btn-sm btn-primary">
                  🖨️ Print Preview
                </button>
                <button onClick={handleDownloadPDF} className="btn btn-sm btn-outline" style={{ color: "#111827", borderColor: "#d1d5db" }}>
                  📥 Download PDF
                </button>
                <button onClick={() => setPreviewAdvice(null)} className="btn btn-sm btn-outline" style={{ color: "#ef4444", borderColor: "#fca5a5" }}>
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Advice Slip Document Content */}
            <div ref={adviceModalRef} style={{ background: "#ffffff", color: "#111827", padding: "2rem", border: "1px solid #e5e7eb", borderRadius: "8px", fontFamily: "sans-serif" }}>
              {/* Company Header */}
              <div style={{ textAlign: "center", borderBottom: "2px solid #111827", paddingBottom: "1rem", marginBottom: "1.25rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>
                  ACME CORPORATION
                </h2>
                <div style={{ fontSize: "0.85rem", color: "#4b5563", marginTop: "0.2rem" }}>
                  13TH MONTH PAY ADVICE SLIP (YEAR {selectedYear})
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.1rem" }}>
                  Pursuant to Presidential Decree No. 851 &amp; PH BIR TRAIN Law
                </div>
              </div>

              {/* Employee Particulars */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.85rem", marginBottom: "1.25rem", background: "#f9fafb", padding: "0.85rem", borderRadius: "6px" }}>
                <div>
                  <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>Employee Name:</div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{previewAdvice.employeeName}</div>
                  <div style={{ color: "#4b5563", fontSize: "0.8rem", marginTop: "2px" }}>{previewAdvice.departmentJobTitle}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>Employee ID:</div>
                  <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{previewAdvice.employeeId}</div>
                  <div style={{ color: "#6b7280", fontSize: "0.75rem", marginTop: "2px" }}>Date Issued: {new Date().toLocaleDateString("en-PH")}</div>
                </div>
              </div>

              {/* Breakdown Table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #d1d5db", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 700 }}>Item Description</th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 700, textAlign: "right" }}>Amount (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.6rem 0.75rem" }}>Total Annual Basic Earned ({selectedYear})</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontFamily: "monospace" }}>
                      ₱{previewAdvice.totalBasicEarned.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#ecfdf5" }}>
                    <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700, color: "#065f46" }}>Gross 13th Month Pay (Basic Earned ÷ 12)</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#065f46", fontSize: "1rem" }}>
                      ₱{previewAdvice.thirteenthMonthPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.6rem 0.75rem" }}>BIR Tax-Exempt Status (TRAIN Law Ceiling: ₱90,000)</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>
                      <span style={{ background: "#d1fae5", color: "#065f46", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 }}>
                        {previewAdvice.taxExemptStatus}
                      </span>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "2px solid #111827", background: "#f9fafb" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 800, fontSize: "0.95rem" }}>NET 13TH MONTH PAYOUT</td>
                    <td style={{ padding: "0.75rem", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: "1.1rem", color: "#0284c7" }}>
                      ₱{previewAdvice.thirteenthMonthPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Signatures Footer */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "3rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: "0.75rem", color: "#4b5563" }}>
                <div>
                  <div style={{ borderBottom: "1px solid #000", height: "30px", marginBottom: "4px" }}></div>
                  <div style={{ fontWeight: 700 }}>Prepared By</div>
                  <div>HR / Payroll Officer</div>
                </div>
                <div>
                  <div style={{ borderBottom: "1px solid #000", height: "30px", marginBottom: "4px" }}></div>
                  <div style={{ fontWeight: 700 }}>Approved By</div>
                  <div>Finance Director</div>
                </div>
                <div>
                  <div style={{ borderBottom: "1px solid #000", height: "30px", marginBottom: "4px" }}></div>
                  <div style={{ fontWeight: 700 }}>Received By</div>
                  <div>Employee Signature &amp; Date</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

