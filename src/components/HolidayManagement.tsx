import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Holiday, HolidayType } from "../types";
import { useToast } from "../context/ToastContext";
import { selectQuery, executeQuery } from "../utils/dbHelper";
import { DEFAULT_PHILIPPINE_HOLIDAYS } from "../utils/payroll";

interface HolidayManagementProps {
  db: Database | null;
  onRefreshHolidays?: () => void;
}

export default function HolidayManagement({ db, onRefreshHolidays }: HolidayManagementProps) {
  const toast = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>(DEFAULT_PHILIPPINE_HOLIDAYS);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Partial<Holiday> | null>(null);
  const [filterYear, setFilterYear] = useState<string>("2026");

  const loadHolidays = async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const rows: any[] = await selectQuery(
        db,
        "SELECT * FROM neugate.holidays ORDER BY holiday_date ASC"
      );
      if (rows && rows.length > 0) {
        setHolidays(
          rows.map((r) => ({
            id: r.id,
            date: r.holiday_date,
            name: r.name,
            type: r.holiday_type as HolidayType,
          }))
        );
      } else {
        setHolidays([]);
      }
    } catch (err: any) {
      console.warn("Could not query neugate.holidays, using defaults:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, [db]);

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHoliday || !editingHoliday.date || !editingHoliday.name || !editingHoliday.type) {
      toast.warning("Please fill in all required holiday fields.", "Missing Fields");
      return;
    }

    try {
      if (db) {
        if (editingHoliday.id) {
          await executeQuery(
            db,
            "UPDATE neugate.holidays SET holiday_date = $1, name = $2, holiday_type = $3 WHERE id = $4",
            [editingHoliday.date, editingHoliday.name, editingHoliday.type, editingHoliday.id]
          );
          toast.success("Holiday updated successfully!", "Holiday Saved");
        } else {
          await executeQuery(
            db,
            "INSERT INTO neugate.holidays (holiday_date, name, holiday_type) VALUES ($1, $2, $3)",
            [editingHoliday.date, editingHoliday.name, editingHoliday.type]
          );
          toast.success("New official holiday added!", "Holiday Created");
        }
        await loadHolidays();
        if (onRefreshHolidays) onRefreshHolidays();
      } else {
        // Fallback local state if db not connected
        if (editingHoliday.id) {
          setHolidays((prev) =>
            prev.map((h) => (h.id === editingHoliday.id ? (editingHoliday as Holiday) : h))
          );
        } else {
          setHolidays((prev) => [
            ...prev,
            { ...editingHoliday, id: Date.now() } as Holiday,
          ]);
        }
        toast.success("Holiday saved to session!", "Holiday Saved");
      }
      setIsModalOpen(false);
      setEditingHoliday(null);
    } catch (err: any) {
      toast.error(err.message || String(err), "Save Error");
    }
  };

  const handleDeleteHoliday = async (h: Holiday) => {
    if (!confirm(`Are you sure you want to remove ${h.name} (${h.date})?`)) return;

    try {
      if (db && h.id) {
        await executeQuery(db, "DELETE FROM neugate.holidays WHERE id = $1", [h.id]);
        toast.success(`Holiday "${h.name}" deleted.`, "Deleted");
        await loadHolidays();
        if (onRefreshHolidays) onRefreshHolidays();
      } else {
        setHolidays((prev) => prev.filter((item) => item.date !== h.date || item.name !== h.name));
        toast.success(`Holiday "${h.name}" removed from view.`, "Removed");
      }
    } catch (err: any) {
      toast.error(err.message || String(err), "Delete Error");
    }
  };

  const filteredHolidays = holidays.filter((h) => h.date.startsWith(filterYear));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            🎉 Official Philippine &amp; Company Holiday Calendar
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Manage DOLE regular holidays (100% premium pay) and special non-working days (30% premium pay) used in payroll calculations.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select
            className="form-input"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", width: "110px" }}
          >
            <option value="2025">Year 2025</option>
            <option value="2026">Year 2026</option>
            <option value="2027">Year 2027</option>
          </select>

          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingHoliday({
                date: `${filterYear}-01-01`,
                name: "",
                type: "REGULAR_100",
              });
              setIsModalOpen(true);
            }}
            style={{ fontSize: "0.8rem" }}
          >
            ➕ Add Holiday
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "10px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>
            TOTAL CONFIGURED HOLIDAYS ({filterYear})
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--text-main)" }}>
            {filteredHolidays.length} Days
          </div>
        </div>

        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "10px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>
            REGULAR HOLIDAYS (100% PREMIUM)
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--success)" }}>
            {filteredHolidays.filter((h) => h.type === "REGULAR_100").length} Days
          </div>
        </div>

        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "10px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-sub)", fontWeight: 700, textTransform: "uppercase" }}>
            SPECIAL NON-WORKING DAYS (30% PREMIUM)
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "0.2rem", color: "var(--warning)" }}>
            {filteredHolidays.filter((h) => h.type === "SPECIAL_30").length} Days
          </div>
        </div>
      </div>

      {/* Holidays Table */}
      <div className="table-card" style={{ padding: "1.25rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
            Loading holiday calendar database...
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-main)", borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "0.6rem 0.75rem" }}>HOLIDAY DATE</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>HOLIDAY NAME</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>HOLIDAY TYPE &amp; RATE</th>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredHolidays.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
                    No holidays configured for year {filterYear}. Click "Add Holiday" to create one.
                  </td>
                </tr>
              ) : (
                filteredHolidays.map((h, idx) => {
                  const d = new Date(`${h.date}T00:00:00`);
                  const formattedDate = !isNaN(d.getTime())
                    ? d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
                    : h.date;

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                        📅 {formattedDate}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{h.name}</td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        {h.type === "REGULAR_100" ? (
                          <span className="badge badge-green" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>
                            🔴 Regular Holiday (+100% Pay)
                          </span>
                        ) : (
                          <span className="badge badge-yellow" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>
                            🟡 Special Non-Working Day (+30% Pay)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-outline"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => {
                              setEditingHoliday(h);
                              setIsModalOpen(true);
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleDeleteHoliday(h)}
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Holiday Modal */}
      {isModalOpen && editingHoliday && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "480px",
              padding: "1.5rem",
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 800 }}>
              {editingHoliday.id ? "✏️ Edit Holiday Date" : "🎉 Add New Official Holiday"}
            </h3>

            <form onSubmit={handleSaveHoliday} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Holiday Date</label>
                <input
                  type="date"
                  required
                  className="form-input"
                  value={editingHoliday.date || ""}
                  onChange={(e) => setEditingHoliday({ ...editingHoliday, date: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Holiday Title / Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Subic Foundation Day, Independence Day"
                  value={editingHoliday.name || ""}
                  onChange={(e) => setEditingHoliday({ ...editingHoliday, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Holiday Classification &amp; Premium Rate</label>
                <select
                  className="form-input"
                  value={editingHoliday.type || "REGULAR_100"}
                  onChange={(e) => setEditingHoliday({ ...editingHoliday, type: e.target.value as HolidayType })}
                >
                  <option value="REGULAR_100">Regular Holiday (+100% Regular Pay / 200% Total)</option>
                  <option value="SPECIAL_30">Special Non-Working Day (+30% Premium Pay / 130% Total)</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingHoliday(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
