import { useState, useMemo } from "react";
import { AttendanceLog, Employee } from "../types";
import { useToast } from "../context/ToastContext";

interface AttendanceLogsProps {
  logs: AttendanceLog[];
  employees?: Employee[];
  onAddManualLog?: (log: Omit<AttendanceLog, "id">) => void;
}

export default function AttendanceLogs({ logs, employees = [], onAddManualLog }: AttendanceLogsProps) {
  const toast = useToast();
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split("T")[0]);
  const [typeFilter, setTypeFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [search, setSearch] = useState("");

  // Manual Log Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [manualType, setManualType] = useState<"IN" | "OUT">("IN");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [manualTime, setManualTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [manualLocation, setManualLocation] = useState("Manual Entry / Supervisor Override");

  const handleSaveManualLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) {
      toast.warning("Please select an employee.", "Validation Error");
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmpId);
    if (!emp) return;

    // Build locale timestamp string
    const [year, month, day] = manualDate.split("-");
    const [hrs, mins] = manualTime.split(":");
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hrs), parseInt(mins));
    const timestamp = d.toLocaleString("en-PH");

    if (onAddManualLog) {
      onAddManualLog({
        employeeId: emp.id,
        employeeName: emp.name,
        departmentJobTitle: emp.departmentJobTitle,
        type: manualType,
        timestamp,
        smsStatus: "Pending",
        location: manualLocation,
        status: "ON TIME",
      });
    }

    setShowManualModal(false);
    toast.success(`Manual ${manualType} log created for ${emp.name}!`, "Manual Log Saved");
  };

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      let matchDate = true;
      if (dateFilter) {
        const [year, month, day] = dateFilter.split("-");
        const match = `${parseInt(month)}/${parseInt(day)}/${year}`;
        matchDate = log.timestamp.includes(match) || log.timestamp.includes(dateFilter);
      }
      const matchType = typeFilter === "ALL" || log.type === typeFilter;
      const matchSearch = search
        ? log.employeeName.toLowerCase().includes(search.toLowerCase()) || log.employeeId.toLowerCase().includes(search.toLowerCase())
        : true;
      return matchDate && matchType && matchSearch;
    });
  }, [logs, dateFilter, typeFilter, search]);

  const todayIn = filtered.filter((l) => l.type === "IN").length;
  const todayOut = filtered.filter((l) => l.type === "OUT").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-info">
            <span className="stat-title">Total Scans</span>
            <span className="stat-number">{filtered.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--success-dim)" }}>🟢</div>
          <div className="stat-info">
            <span className="stat-title">Entries (IN)</span>
            <span className="stat-number">{todayIn}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--warning-dim)" }}>🟡</div>
          <div className="stat-info">
            <span className="stat-title">Exits (OUT)</span>
            <span className="stat-number">{todayOut}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--purple-dim)" }}>💬</div>
          <div className="stat-info">
            <span className="stat-title">SMS Sent</span>
            <span className="stat-number">{filtered.filter((l) => l.smsStatus === "Sent").length}</span>
          </div>
        </div>
      </div>

      {/* Filters & Action Bar */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ flex: 1, fontSize: "1rem", fontWeight: 700, minWidth: "200px" }}>
          Timekeeping &amp; Access Logs
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> ({filtered.length} records)</span>
        </h2>

        <button
          className="btn btn-primary"
          style={{ padding: "0.45rem 0.85rem", height: "36px", fontSize: "0.85rem" }}
          onClick={() => setShowManualModal(true)}
        >
          ✍️ Manual Entry
        </button>

        <div className="search-wrapper" style={{ maxWidth: "240px" }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search employee..."
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <input
          type="date"
          className="form-input"
          style={{ width: "160px" }}
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />

        <select
          className="form-select"
          style={{ width: "120px" }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "ALL" | "IN" | "OUT")}
        >
          <option value="ALL">All Types</option>
          <option value="IN">IN Only</option>
          <option value="OUT">OUT Only</option>
        </select>

        <button
          className="btn btn-outline"
          style={{ padding: "0.55rem 0.85rem", height: "36px", display: "flex", alignItems: "center", gap: "0.4rem" }}
          onClick={async () => {
            if (filtered.length === 0) return;
            const headers = ["#", "Employee Name", "Department & Job Title", "Employee ID", "Type", "Location", "Timestamp", "SMS Status"];
            const rows = filtered.map((log, index) => [
              filtered.length - index,
              `"${log.employeeName.replace(/"/g, '""')}"`,
              `"${log.departmentJobTitle.replace(/"/g, '""')}"`,
              `"${log.employeeId.replace(/"/g, '""')}"`,
              log.type,
              `"${log.location || "Main Turnstile"}"`,
              `"${log.timestamp}"`,
              log.smsStatus,
            ]);
            
            const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            
            try {
              const { save } = await import("@tauri-apps/plugin-dialog");
              const { writeTextFile } = await import("@tauri-apps/plugin-fs");
              
              const defaultName = `attendance_logs_${new Date().toISOString().split("T")[0]}.csv`;
              const filePath = await save({
                title: "Save Attendance Logs CSV",
                defaultPath: defaultName,
                filters: [{ name: "CSV", extensions: ["csv"] }]
              });
              
              if (filePath) {
                await writeTextFile(filePath, csvContent);
              }
            } catch (error) {
              console.warn("Tauri native save failed, falling back to browser download:", error);
              const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
              const link = document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", `attendance_logs_${new Date().toISOString().split("T")[0]}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          }}
          disabled={filtered.length === 0}
          title="Export filtered logs to CSV"
        >
          📥 Export
        </button>
      </div>

      {/* Manual Time Log Modal */}
      {showManualModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: "460px" }}>
            <div className="modal-header">
              <h3 className="modal-title">✍️ Manual Time Log Entry</h3>
              <button className="modal-close" onClick={() => setShowManualModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveManualLog} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Employee *
                </label>
                <select
                  className="form-input"
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  required
                >
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Scan Type *
                  </label>
                  <select
                    className="form-input"
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as "IN" | "OUT")}
                  >
                    <option value="IN">🟢 Clock IN</option>
                    <option value="OUT">🟡 Clock OUT</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Location / Source
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Time *
                  </label>
                  <input
                    type="time"
                    className="form-input"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowManualModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Save Manual Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="table-card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <p>No attendance records for the selected filters.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Employee Name</th>
                <th>Department &amp; Job Title</th>
                <th>Employee ID</th>
                <th>Type</th>
                <th>Shift Status</th>
                <th>Location</th>
                <th>Timestamp</th>
                <th>SMS Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => {
                const status = log.status || "ON TIME";
                let statusBadgeClass = "badge-success";
                let statusIcon = "🟢";

                if (status === "LATE") {
                  statusBadgeClass = "badge-danger";
                  statusIcon = "🔴";
                } else if (status === "OVERTIME") {
                  statusBadgeClass = "badge-primary";
                  statusIcon = "⚡";
                } else if (status === "OVER BREAK") {
                  statusBadgeClass = "badge-warning";
                  statusIcon = "☕";
                } else if (status === "EARLY DEPARTURE") {
                  statusBadgeClass = "badge-warning";
                  statusIcon = "⚠️";
                } else if (status === "REST DAY SCAN") {
                  statusBadgeClass = "badge-purple";
                  statusIcon = "🌴";
                }

                return (
                  <tr key={log.id ?? i}>
                    <td style={{ color: "var(--text-dim)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem" }}>
                      {filtered.length - i}
                    </td>
                    <td><strong>{log.employeeName}</strong></td>
                    <td>{log.departmentJobTitle}</td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>{log.employeeId}</td>
                    <td>
                      <span className={`badge ${log.type === "IN" ? "badge-success" : "badge-warning"}`}>
                        {log.type === "IN" ? "🟢 IN" : "🟡 OUT"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass}`} style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                        {statusIcon} {status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", background: "var(--bg-input)", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>
                        📍 {log.location || "Main Turnstile"}
                      </span>
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem" }}>{log.timestamp}</td>
                    <td>
                      <span className={`badge ${log.smsStatus === "Sent" ? "badge-primary" : log.smsStatus === "Failed" ? "badge-danger" : "badge-purple"}`}>
                        {log.smsStatus === "Sent" ? "✓ Sent" : log.smsStatus === "Failed" ? "✕ Failed" : "⏳ Pending"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
