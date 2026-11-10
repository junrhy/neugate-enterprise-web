import { useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Employee, WorkSchedule } from "../types";
import { executeQuery } from "../utils/dbHelper";

interface WorkSchedulesProps {
  db: Database | null;
  employees: Employee[];
  schedules: WorkSchedule[];
  onRefreshSchedules: () => void;
}

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function WorkSchedules({ db, employees, schedules, onRefreshSchedules }: WorkSchedulesProps) {
  const [activeSubTab, setActiveSubTab] = useState<"assign" | "overview">("assign");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("DEFAULT");
  const [scheduleType, setScheduleType] = useState<"weekly" | "date">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday
  const [specificDate, setSpecificDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [shiftStart, setShiftStart] = useState<string>("08:00");
  const [shiftEnd, setShiftEnd] = useState<string>("17:00");
  const [breakStart, setBreakStart] = useState<string>("12:00");
  const [breakEnd, setBreakEnd] = useState<string>("13:00");
  const [gracePeriodMins, setGracePeriodMins] = useState<number>(15);
  const [isRestDay, setIsRestDay] = useState<boolean>(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Preset shifts helper
  const applyShiftPreset = (preset: "standard" | "night" | "flexi") => {
    if (preset === "standard") {
      setShiftStart("08:00");
      setShiftEnd("17:00");
      setBreakStart("12:00");
      setBreakEnd("13:00");
      setGracePeriodMins(15);
      setIsRestDay(false);
    } else if (preset === "night") {
      setShiftStart("22:00");
      setShiftEnd("07:00");
      setBreakStart("02:00");
      setBreakEnd("03:00");
      setGracePeriodMins(15);
      setIsRestDay(false);
    } else if (preset === "flexi") {
      setShiftStart("09:00");
      setShiftEnd("18:00");
      setBreakStart("12:00");
      setBreakEnd("13:00");
      setGracePeriodMins(30);
      setIsRestDay(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      if (!db) throw new Error("Database connection not ready");

      const empId = selectedEmployeeId;
      const dow = scheduleType === "weekly" ? dayOfWeek : null;
      const sDate = scheduleType === "date" ? specificDate : null;

      // Delete any existing schedule conflict for this target
      if (scheduleType === "weekly") {
        await executeQuery(
          db,
          "DELETE FROM neugate.work_schedules WHERE employee_id = $1 AND day_of_week = $2 AND specific_date IS NULL",
          [empId, dow !== null ? parseInt(String(dow), 10) : null]
        );
      } else {
        await executeQuery(
          db,
          "DELETE FROM neugate.work_schedules WHERE employee_id = $1 AND specific_date = $2",
          [empId, sDate]
        );
      }

      await executeQuery(
        db,
        `INSERT INTO neugate.work_schedules (employee_id, day_of_week, specific_date, shift_start, shift_end, break_start, break_end, grace_period_mins, is_rest_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          empId,
          dow !== null ? parseInt(String(dow), 10) : null,
          sDate,
          shiftStart,
          shiftEnd,
          breakStart,
          breakEnd,
          parseInt(String(gracePeriodMins), 10) || 15,
          isRestDay ? 1 : 0,
        ]
      );

      setMsg({ type: "success", text: "✅ Work schedule saved successfully!" });
      onRefreshSchedules();
    } catch (err: any) {
      console.error("Save schedule error:", err);
      setMsg({ type: "error", text: "Failed to save work schedule: " + (err.message || err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (id: number | string) => {
    if (!confirm("Are you sure you want to delete this schedule rule?")) return;
    try {
      if (db) {
        const numericId = typeof id === "number" ? id : parseInt(String(id), 10);
        await executeQuery(db, "DELETE FROM neugate.work_schedules WHERE id = $1", [isNaN(numericId) ? id : numericId]);
        onRefreshSchedules();
      }
    } catch (err) {
      console.error("Delete schedule error:", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            📅 Work Schedule & Shift Management
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Set employee shift times by day of week or specific dates to automatically calculate On Time, Late, Overtime, and Over Break statuses.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`btn ${activeSubTab === "assign" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setActiveSubTab("assign")}
            style={{ fontSize: "0.8rem" }}
          >
            ✏️ Assign Shift Schedule
          </button>
          <button
            className={`btn ${activeSubTab === "overview" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setActiveSubTab("overview")}
            style={{ fontSize: "0.8rem" }}
          >
            📋 Schedule Roster ({schedules.length})
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)",
          background: msg.type === "success" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
          border: `1px solid ${msg.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
          color: msg.type === "success" ? "var(--success)" : "var(--danger)",
          fontSize: "0.85rem", fontWeight: 600,
        }}>
          {msg.text}
        </div>
      )}

      {activeSubTab === "assign" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
          {/* Schedule Form */}
          <form onSubmit={handleSaveSchedule} className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Configure Work Shift Schedule</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Target Employee</label>
                <select
                  className="form-input"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                >
                  <option value="DEFAULT">🏢 Default Shift (All Employees)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      👤 {emp.name} ({emp.departmentJobTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Schedule Mode</label>
                <select
                  className="form-input"
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value as any)}
                >
                  <option value="weekly">📅 Weekly Recurring Day</option>
                  <option value="date">📆 Specific Calendar Date</option>
                </select>
              </div>
            </div>

            {scheduleType === "weekly" ? (
              <div className="form-group">
                <label className="form-label">Day of Week</label>
                <select
                  className="form-input"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                >
                  {DAYS_OF_WEEK.map((day, idx) => (
                    <option key={idx} value={idx}>{day}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Specific Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Presets row */}
            <div>
              <label className="form-label" style={{ marginBottom: "0.4rem" }}>Shift Quick Presets</label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-outline" style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }} onClick={() => applyShiftPreset("standard")}>
                  ☀️ Regular 8AM - 5PM (15m Grace)
                </button>
                <button type="button" className="btn btn-outline" style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }} onClick={() => applyShiftPreset("night")}>
                  🌙 Night Shift 10PM - 7AM
                </button>
                <button type="button" className="btn btn-outline" style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }} onClick={() => applyShiftPreset("flexi")}>
                  ⚖️ Flexi 9AM - 6PM (30m Grace)
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Shift Start Time (Check-In)</label>
                <input
                  type="time"
                  className="form-input"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Shift End Time (Check-Out)</label>
                <input
                  type="time"
                  className="form-input"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Break Start Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Break End Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Grace Period (Minutes)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="form-input"
                  value={gracePeriodMins}
                  onChange={(e) => setGracePeriodMins(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "var(--bg-input)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <input
                type="checkbox"
                id="isRestDay"
                checked={isRestDay}
                onChange={(e) => setIsRestDay(e.target.checked)}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <label htmlFor="isRestDay" style={{ cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                🌴 Mark as Official Rest Day / Day Off (Scans will be flagged as "REST DAY SCAN")
              </label>
            </div>

            <div style={{ marginTop: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: "100%", justifyContent: "center" }}>
                {saving ? "Saving Schedule..." : "💾 Save & Apply Work Schedule"}
              </button>
            </div>
          </form>

          {/* Info Side Card */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card" style={{ padding: "1.25rem", background: "var(--primary-dim)", border: "1px solid var(--border-focus)", borderRadius: "var(--radius-lg)" }}>
              <h4 style={{ fontSize: "0.9rem", color: "var(--primary)", margin: "0 0 0.5rem 0", fontWeight: 700 }}>ℹ️ Attendance Rules Engine</h4>
              <ul style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, paddingLeft: "1.1rem", lineHeight: 1.6 }}>
                <li><strong>🟢 ON TIME:</strong> Employee scans check-in on or before shift start + grace period.</li>
                <li><strong>🔴 LATE:</strong> Employee scans check-in after shift start + grace period.</li>
                <li><strong>☕ OVER BREAK:</strong> Check-in scan happens after scheduled break end.</li>
                <li><strong>⚠️ EARLY DEPARTURE:</strong> Employee scans check-out before shift end time.</li>
                <li><strong>⚡ OVERTIME:</strong> Employee scans check-out 15+ minutes past shift end time.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "overview" && (
        <div className="table-card">
          {schedules.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <p>No custom work schedules assigned yet. Default schedule is 8:00 AM - 5:00 PM (15m grace period).</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee / Scope</th>
                  <th>Schedule Pattern</th>
                  <th>Shift Hours</th>
                  <th>Break Hours</th>
                  <th>Grace Period</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((sch) => {
                  const emp = employees.find((e) => e.id === sch.employeeId);
                  return (
                    <tr key={sch.id}>
                      <td>
                        <strong>{sch.employeeId === "DEFAULT" ? "🏢 Default (All Staff)" : `👤 ${emp?.name || sch.employeeId}`}</strong>
                      </td>
                      <td>
                        {sch.isRestDay ? (
                          <span className="badge badge-warning">🌴 REST DAY</span>
                        ) : sch.specificDate ? (
                          <span className="badge badge-primary">📆 Date: {sch.specificDate}</span>
                        ) : (
                          <span className="badge badge-primary">🔄 Every {sch.dayOfWeek !== null && sch.dayOfWeek !== undefined ? DAYS_OF_WEEK[sch.dayOfWeek] : "Day"}</span>
                        )}
                      </td>
                      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}>
                        {sch.shiftStart} - {sch.shiftEnd}
                      </td>
                      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}>
                        {sch.breakStart} - {sch.breakEnd}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {sch.gracePeriodMins} mins
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                          onClick={() => sch.id && handleDeleteSchedule(sch.id)}
                        >
                          Delete Rule
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

