import { useState, useRef } from "react";
import { Employee, AttendanceLog } from "../types";

interface HRAnalyticsProps {
  employees: Employee[];
  attendanceLogs: AttendanceLog[];
  companyName: string;
}

export default function HRAnalytics({ employees, attendanceLogs }: HRAnalyticsProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employees[0]?.id || "");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const printRef = useRef<HTMLDivElement>(null);

  // Compute overall KPI metrics
  const totalEmployees = employees.length;
  const totalLogs = attendanceLogs.length;
  const lateLogs = attendanceLogs.filter((l) => l.status === "LATE").length;
  const onTimeLogs = attendanceLogs.filter((l) => l.status === "ON TIME").length;
  const punctualityRate = totalLogs > 0 ? ((onTimeLogs / totalLogs) * 100).toFixed(1) : "100.0";

  // Filter logs for Form 48 DTR export
  const selectedEmp = employees.find((e) => e.id === selectedEmployeeId);

  // Days 1 to 31 table generator for Philippine Form 48
  const yearMonth = selectedMonth.split("-");
  const year = parseInt(yearMonth[0]) || 2026;
  const monthIdx = (parseInt(yearMonth[1]) || 9) - 1;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const handlePrintDTR = () => {
    window.print();
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            📊 HR Analytics &amp; Official Form 48 DTR Exporter
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Track organizational attendance KPIs and print standard Daily Time Records (Civil Service Form 48).
          </p>
        </div>
        <button onClick={handlePrintDTR} className="btn btn-primary">
          🖨️ Print Form 48 DTR
        </button>
      </div>

      {/* Analytics KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>TOTAL HEADCOUNT</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--primary)" }}>
            {totalEmployees}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--success)", marginTop: "0.25rem" }}>Active Personnel</div>
        </div>

        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>TOTAL CLOCK SCANS</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--text-main)" }}>
            {totalLogs}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>System Verified</div>
        </div>

        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>PUNCTUALITY RATE</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--success)" }}>
            {punctualityRate}%
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>On-Time Arrival</div>
        </div>

        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>LATE / TARDY SCANS</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem", color: "var(--danger)" }}>
            {lateLogs}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "0.25rem" }}>Deductions Applicable</div>
        </div>
      </div>

      {/* Form 48 DTR Preview */}
      <div className="table-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
            📜 Standard Daily Time Record (Civil Service Form No. 48)
          </h3>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <select
              className="form-input"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              style={{ width: "240px" }}
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.id})
                </option>
              ))}
            </select>
            <input
              type="month"
              className="form-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ width: "160px" }}
            />
          </div>
        </div>

        <div id="dtr-form" ref={printRef} style={{ background: "#ffffff", color: "#111827", padding: "2rem", border: "1px solid #e5e7eb", borderRadius: "8px", fontFamily: "serif" }}>
          {/* Form 48 Header */}
          <div style={{ textAlign: "center", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "1px" }}>Civil Service Form No. 48</div>
            <div style={{ fontSize: "1.3rem", fontWeight: "bold", textTransform: "uppercase", margin: "0.25rem 0" }}>
              DAILY TIME RECORD
            </div>
            <div style={{ fontSize: "1rem", fontWeight: "bold", textDecoration: "underline", marginTop: "0.5rem" }}>
              {selectedEmp ? selectedEmp.name.toUpperCase() : "EMPLOYEE NAME"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#4b5563" }}>
              (Name in Block Letters)
            </div>
            <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
              For the month of <strong>{new Date(year, monthIdx).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
            </div>
            <div style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
              Official hours for arrival and departure: <strong>08:00 AM - 05:00 PM</strong>
            </div>
          </div>

          {/* DTR Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textTransform: "uppercase" }}>
            <thead>
              <tr style={{ borderTop: "2px solid #000", borderBottom: "2px solid #000", textAlign: "center" }}>
                <th style={{ borderRight: "1px solid #000", padding: "4px", width: "40px" }} rowSpan={2}>Day</th>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }} colSpan={2}>A.M.</th>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }} colSpan={2}>P.M.</th>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }} colSpan={2}>Undertime / Late</th>
              </tr>
              <tr style={{ borderBottom: "2px solid #000", textAlign: "center" }}>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }}>Arrival</th>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }}>Departure</th>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }}>Arrival</th>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }}>Departure</th>
                <th style={{ borderRight: "1px solid #000", padding: "4px" }}>Hours</th>
                <th style={{ padding: "4px" }}>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
                const d = new Date(year, monthIdx, dayNum);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const paddedMonth = String(monthIdx + 1).padStart(2, "0");
                const paddedDay = String(dayNum).padStart(2, "0");
                
                // Formats to match timestamp strings (e.g., "2026-09-10", "9/10/2026", "09/10/2026")
                const isoFormat = `${year}-${paddedMonth}-${paddedDay}`;
                const slashFormat = `${monthIdx + 1}/${dayNum}/${year}`;
                const slashPaddedFormat = `${paddedMonth}/${paddedDay}/${year}`;

                // Find scans for this specific employee & date
                const dayScans = attendanceLogs.filter((l) => {
                  if (l.employeeId !== selectedEmployeeId) return false;
                  return (
                    l.timestamp.includes(isoFormat) ||
                    l.timestamp.includes(slashFormat) ||
                    l.timestamp.includes(slashPaddedFormat)
                  );
                });

                const inScan = dayScans.find((l) => l.type === "IN");
                const outScan = dayScans.find((l) => l.type === "OUT");

                // Helper to format scan timestamp to readable time string (e.g., 08:15 AM)
                const formatTime = (ts?: string) => {
                  if (!ts) return "";
                  if (ts.includes(",")) return ts.split(",")[1].trim();
                  const timeParts = ts.split(" ");
                  return timeParts.length > 1 ? timeParts.slice(1).join(" ") : ts;
                };

                const amIn = inScan ? formatTime(inScan.timestamp) : isWeekend ? "REST DAY" : "";
                const amOut = inScan ? "12:00 PM" : "";
                const pmIn = outScan ? "01:00 PM" : "";
                const pmOut = outScan ? formatTime(outScan.timestamp) : isWeekend ? "REST DAY" : "";

                return (
                  <tr key={dayNum} style={{ borderBottom: "1px solid #d1d5db", textAlign: "center" }}>
                    <td style={{ borderRight: "1px solid #000", fontWeight: "bold", padding: "3px" }}>{dayNum}</td>
                    <td style={{ borderRight: "1px solid #000", padding: "3px" }}>{amIn}</td>
                    <td style={{ borderRight: "1px solid #000", padding: "3px" }}>{amOut}</td>
                    <td style={{ borderRight: "1px solid #000", padding: "3px" }}>{pmIn}</td>
                    <td style={{ borderRight: "1px solid #000", padding: "3px" }}>{pmOut}</td>
                    <td style={{ borderRight: "1px solid #000", padding: "3px" }}>-</td>
                    <td style={{ padding: "3px" }}>-</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Verification Footnote */}
          <div style={{ marginTop: "1.5rem", fontSize: "0.8rem", lineHeight: "1.4" }}>
            <p style={{ textIndent: "2rem", margin: "0 0 1rem 0" }}>
              I CERTIFY on my honor that the above is a true and correct record of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
              <div style={{ textAlign: "center", width: "40%" }}>
                <div style={{ borderBottom: "1px solid #000", height: "1px", marginBottom: "4px" }}></div>
                <div>Employee Signature</div>
              </div>
              <div style={{ textAlign: "center", width: "40%" }}>
                <div style={{ borderBottom: "1px solid #000", height: "1px", marginBottom: "4px" }}></div>
                <div>In-Charge / Department Manager</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
