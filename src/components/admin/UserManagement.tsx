import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { User, Role, BranchLocation } from "../../types";
import { selectQuery, executeQuery } from "../../utils/dbHelper";
import GeofenceMapPickerModal from "./GeofenceMapPickerModal";

interface UserManagementProps {
  db: Database | null;
  branches?: BranchLocation[];
}

export default function UserManagement({ db, branches }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [userPassword, setUserPassword] = useState("password123");
  const [fetchingGps, setFetchingGps] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Available company worksites (for quick preset dropdown)
  const [worksites, setWorksites] = useState<BranchLocation[]>(() => {
    if (branches && branches.length > 0) return branches;
    try {
      const saved = localStorage.getItem("neugate_branch_locations");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (branches && branches.length > 0) {
      setWorksites(branches);
    }
  }, [branches]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser or environment.");
      return;
    }
    setFetchingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditingUser((prev) => ({
          ...prev!,
          allowed_latitude: Number(pos.coords.latitude.toFixed(6)),
          allowed_longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setFetchingGps(false);
      },
      (err) => {
        alert("Failed to acquire device GPS coordinates: " + err.message);
        setFetchingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const loadData = async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      // Auto-migrate geofence columns on neugate.users / users table if not existing
      try {
        await executeQuery(db, "ALTER TABLE neugate.users ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN DEFAULT FALSE");
      } catch {
        try { await executeQuery(db, "ALTER TABLE users ADD COLUMN geofence_enabled INTEGER DEFAULT 0"); } catch {}
      }
      try {
        await executeQuery(db, "ALTER TABLE neugate.users ADD COLUMN IF NOT EXISTS allowed_latitude NUMERIC(10, 6)");
      } catch {
        try { await executeQuery(db, "ALTER TABLE users ADD COLUMN allowed_latitude REAL"); } catch {}
      }
      try {
        await executeQuery(db, "ALTER TABLE neugate.users ADD COLUMN IF NOT EXISTS allowed_longitude NUMERIC(10, 6)");
      } catch {
        try { await executeQuery(db, "ALTER TABLE users ADD COLUMN allowed_longitude REAL"); } catch {}
      }
      try {
        await executeQuery(db, "ALTER TABLE neugate.users ADD COLUMN IF NOT EXISTS allowed_radius_meters INTEGER DEFAULT 500");
      } catch {
        try { await executeQuery(db, "ALTER TABLE users ADD COLUMN allowed_radius_meters INTEGER DEFAULT 500"); } catch {}
      }
      try {
        await executeQuery(db, "ALTER TABLE neugate.users ADD COLUMN IF NOT EXISTS geofence_label TEXT");
      } catch {
        try { await executeQuery(db, "ALTER TABLE users ADD COLUMN geofence_label TEXT"); } catch {}
      }

      const [usersData, rolesData] = (await Promise.all([
        selectQuery(db, "SELECT * FROM neugate.users ORDER BY id DESC"),
        selectQuery(db, "SELECT * FROM neugate.roles ORDER BY name ASC"),
      ])) as [any[], any[]];

      setUsers(
        usersData.map((u) => ({
          id: String(u.id),
          name: u.name,
          username: u.username,
          role_id: String(u.role_id),
          is_active: u.is_active === 1 || u.is_active === true,
          geofence_enabled: Boolean(u.geofence_enabled),
          allowed_latitude: u.allowed_latitude !== null && u.allowed_latitude !== undefined ? Number(u.allowed_latitude) : null,
          allowed_longitude: u.allowed_longitude !== null && u.allowed_longitude !== undefined ? Number(u.allowed_longitude) : null,
          allowed_radius_meters: u.allowed_radius_meters ? Number(u.allowed_radius_meters) : 500,
          geofence_label: u.geofence_label || "",
        }))
      );
      setRoles(
        rolesData.map((r) => ({
          id: String(r.id),
          name: r.name,
          description: r.description,
        }))
      );
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [db]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !db) return;

    try {
      const isActive = editingUser.is_active ? 1 : 0;
      const geofenceEnabled = editingUser.geofence_enabled ? 1 : 0;
      const allowedLat = editingUser.allowed_latitude != null && !isNaN(Number(editingUser.allowed_latitude))
        ? Number(editingUser.allowed_latitude)
        : null;
      const allowedLng = editingUser.allowed_longitude != null && !isNaN(Number(editingUser.allowed_longitude))
        ? Number(editingUser.allowed_longitude)
        : null;
      const allowedRadius = editingUser.allowed_radius_meters ? Number(editingUser.allowed_radius_meters) : 500;
      const geofenceLabel = editingUser.geofence_label?.trim() || "";

      if (editingUser.id) {
        await executeQuery(
          db,
          `UPDATE neugate.users 
           SET name = $1, role_id = $2, is_active = $3,
               geofence_enabled = $4, allowed_latitude = $5, allowed_longitude = $6,
               allowed_radius_meters = $7, geofence_label = $8
           WHERE id = $9`,
          [
            editingUser.name,
            editingUser.role_id,
            isActive,
            geofenceEnabled,
            allowedLat,
            allowedLng,
            allowedRadius,
            geofenceLabel,
            editingUser.id,
          ]
        );
      } else {
        await executeQuery(
          db,
          `INSERT INTO neugate.users 
           (name, username, password_hash, role_id, is_active, force_password_change, geofence_enabled, allowed_latitude, allowed_longitude, allowed_radius_meters, geofence_label) 
           VALUES ($1, $2, $3, $4, 1, 1, $5, $6, $7, $8, $9)`,
          [
            editingUser.name,
            editingUser.username?.trim(),
            userPassword,
            editingUser.role_id,
            geofenceEnabled,
            allowedLat,
            allowedLng,
            allowedRadius,
            geofenceLabel,
          ]
        );
      }
      setIsFormOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  const toggleUserActive = async (u: User) => {
    if (!db) return;
    try {
      await executeQuery(db, "UPDATE neugate.users SET is_active = $1 WHERE id = $2", [
        u.is_active ? 0 : 1,
        u.id,
      ]);
      loadData();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: "0 0 0.25rem 0", color: "var(--text-main)" }}>👤 Company Staff User Accounts</h3>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Register gate guards, HR staff, dispatchers, and administrator accounts with geolocation security.
          </p>
        </div>
        {!isFormOpen && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingUser({
                name: "",
                username: "",
                role_id: roles[0]?.id || "1",
                is_active: true,
                geofence_enabled: false,
                allowed_radius_meters: 500,
                allowed_latitude: null,
                allowed_longitude: null,
                geofence_label: "",
              });
              setUserPassword("password123");
              setIsFormOpen(true);
            }}
          >
            ➕ Register Staff User
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(244, 63, 94, 0.15)", borderRadius: "8px", color: "#f43f5e", fontSize: "0.85rem", fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {isFormOpen && (
        <div style={{ padding: "1.5rem", background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <h4 style={{ margin: "0 0 1.25rem 0", color: "var(--text-main)" }}>
            {editingUser?.id ? "✏️ Edit Staff User" : "✨ Register New Staff Account"}
          </h4>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={editingUser?.name || ""}
                  onChange={(e) => setEditingUser({ ...editingUser!, name: e.target.value })}
                  placeholder="e.g. Maria Santos"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  required
                  disabled={!!editingUser?.id}
                  className="form-input"
                  value={editingUser?.username || ""}
                  onChange={(e) => setEditingUser({ ...editingUser!, username: e.target.value })}
                  placeholder="e.g. guard_santos"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Assigned Role</label>
                <select
                  className="form-input"
                  value={editingUser?.role_id || ""}
                  onChange={(e) => setEditingUser({ ...editingUser!, role_id: e.target.value })}
                  required
                >
                  <option value="" disabled>Select role...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {!editingUser?.id && (
              <div className="form-group">
                <label className="form-label">Temporary Initial Password</label>
                <input
                  type="text"
                  className="form-input"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  style={{ fontFamily: "monospace" }}
                />
              </div>
            )}

            {/* Geolocation Access Restriction Section */}
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "1.1rem",
                marginTop: "0.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span>📍</span> Geolocation Access Restriction
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
                    Restrict this user so they can only access the enterprise app while physically present at an authorized branch or terminal.
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(editingUser?.geofence_enabled)}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser!,
                        geofence_enabled: e.target.checked,
                        allowed_radius_meters: editingUser?.allowed_radius_meters || 500,
                      })
                    }
                  />
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: editingUser?.geofence_enabled ? "var(--primary)" : "var(--text-dim)",
                    }}
                  >
                    {editingUser?.geofence_enabled ? "Restricted (Geofence Enforced)" : "Unrestricted (Access Anywhere)"}
                  </span>
                </label>
              </div>

              {editingUser?.geofence_enabled && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                    marginTop: "1rem",
                    paddingTop: "0.85rem",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {/* Quick Preset from registered company worksites */}
                  {worksites.length > 0 && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "0.78rem" }}>🏢 Quick Preset: Select Company Worksite</label>
                      <select
                        className="form-input"
                        style={{ fontSize: "0.82rem" }}
                        onChange={(e) => {
                          const picked = worksites.find((b) => b.id === e.target.value);
                          if (picked) {
                            setEditingUser({
                              ...editingUser!,
                              geofence_label: picked.name,
                              allowed_latitude: picked.latitude,
                              allowed_longitude: picked.longitude,
                              allowed_radius_meters: picked.radiusMeters || 500,
                            });
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Choose from registered company branches...</option>
                        {worksites.map((b) => (
                          <option key={b.id} value={b.id}>
                            📍 {b.name} ({b.address}) - {b.radiusMeters}m radius
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "1rem" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "0.78rem" }}>Facility / Geofence Label *</label>
                      <input
                        type="text"
                        required={editingUser.geofence_enabled}
                        className="form-input"
                        placeholder="e.g. Main Plant / Warehouse Gate 1"
                        value={editingUser?.geofence_label || ""}
                        onChange={(e) => setEditingUser({ ...editingUser!, geofence_label: e.target.value })}
                        style={{ fontSize: "0.82rem" }}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "0.78rem" }}>Target Latitude *</label>
                      <input
                        type="number"
                        step="0.000001"
                        required={editingUser.geofence_enabled}
                        className="form-input"
                        placeholder="e.g. 14.599500"
                        value={editingUser?.allowed_latitude ?? ""}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser!,
                            allowed_latitude: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        style={{ fontSize: "0.82rem", fontFamily: "monospace" }}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: "0.78rem" }}>Target Longitude *</label>
                      <input
                        type="number"
                        step="0.000001"
                        required={editingUser.geofence_enabled}
                        className="form-input"
                        placeholder="e.g. 120.984200"
                        value={editingUser?.allowed_longitude ?? ""}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser!,
                            allowed_longitude: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        style={{ fontSize: "0.82rem", fontFamily: "monospace" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <label style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: 0 }}>Allowed Radius:</label>
                      <div style={{ display: "flex", gap: "0.3rem" }}>
                        {[100, 250, 500, 1000, 2000, 5000].map((radius) => (
                          <button
                            key={radius}
                            type="button"
                            className={`btn ${
                              editingUser?.allowed_radius_meters === radius ? "btn-primary" : "btn-outline"
                            }`}
                            style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", whiteSpace: "nowrap" }}
                            onClick={() => setEditingUser({ ...editingUser!, allowed_radius_meters: radius })}
                          >
                            {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="50"
                        step="50"
                        className="form-input"
                        style={{ width: "85px", fontSize: "0.78rem", padding: "0.25rem 0.4rem" }}
                        value={editingUser?.allowed_radius_meters || 500}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser!,
                            allowed_radius_meters: parseInt(e.target.value, 10) || 500,
                          })
                        }
                        title="Custom radius in meters"
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>meters</span>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowMapPicker(true)}
                        style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}
                      >
                        <span>🗺️</span> Select on Map
                      </button>

                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={handleGetCurrentLocation}
                        disabled={fetchingGps}
                        style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}
                      >
                        <span>📍</span> {fetchingGps ? "Acquiring GPS..." : "Set Current Location"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                💾 Save User Account
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>Loading staff users...</div>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Assigned Role</th>
                <th>Location Access</th>
                <th>Account Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roleName = roles.find((r) => r.id === u.role_id)?.name || u.role_id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--primary-dim)",
                          color: "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          border: "1px solid rgba(0, 212, 255, 0.2)"
                        }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <strong>{u.name}</strong>
                      </div>
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {u.username}
                    </td>
                    <td>
                      <span className="badge badge-primary">
                        🛡️ {roleName}
                      </span>
                    </td>
                    <td>
                      {u.geofence_enabled && u.allowed_latitude !== null && u.allowed_latitude !== undefined ? (
                        <span
                          className="badge badge-warning"
                          title={`Restricted to ${u.geofence_label || "Facility"} within ${u.allowed_radius_meters || 500}m`}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", whiteSpace: "nowrap" }}
                        >
                          <span>📍</span>
                          <span>
                            {u.geofence_label || "Geofenced"} ({u.allowed_radius_meters ? (u.allowed_radius_meters >= 1000 ? `${u.allowed_radius_meters / 1000}km` : `${u.allowed_radius_meters}m`) : "500m"})
                          </span>
                        </span>
                      ) : (
                        <span
                          className="badge"
                          style={{
                            background: "rgba(255,255,255,0.05)",
                            color: "var(--text-dim)",
                            border: "1px solid var(--border)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          🌐 Anywhere
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-success" : "badge-danger"}`}>
                        {u.is_active ? "🟢 Active" : "🔴 Deactivated"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                          onClick={() => {
                            setEditingUser(u);
                            setIsFormOpen(true);
                          }}
                        >
                          ✏️ Edit
                        </button>
                        {u.username !== "admin" && (
                          <button
                            className={`btn ${u.is_active ? "btn-danger" : "btn-success"}`}
                            style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                            onClick={() => toggleUserActive(u)}
                          >
                            {u.is_active ? "🔒 Deactivate" : "🔓 Activate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Map Location Picker Modal */}
      {showMapPicker && (
        <GeofenceMapPickerModal
          initialLat={editingUser?.allowed_latitude ?? null}
          initialLng={editingUser?.allowed_longitude ?? null}
          initialRadius={editingUser?.allowed_radius_meters || 500}
          initialLabel={editingUser?.geofence_label || ""}
          onConfirm={({ latitude, longitude, radiusMeters, label }) => {
            setEditingUser((prev) => ({
              ...prev!,
              allowed_latitude: latitude,
              allowed_longitude: longitude,
              allowed_radius_meters: radiusMeters,
              geofence_label: label,
            }));
            setShowMapPicker(false);
          }}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
}
