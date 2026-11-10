import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { User, Role } from "../../types";
import { selectQuery, executeQuery } from "../../utils/dbHelper";

interface UserManagementProps {
  db: Database | null;
}

export default function UserManagement({ db }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [userPassword, setUserPassword] = useState("password123");

  const loadData = async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
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
      if (editingUser.id) {
        await executeQuery(
          db,
          "UPDATE neugate.users SET name = $1, role_id = $2, is_active = $3 WHERE id = $4",
          [editingUser.name, editingUser.role_id, editingUser.is_active ? 1 : 0, editingUser.id]
        );
      } else {
        await executeQuery(
          db,
          "INSERT INTO neugate.users (name, username, password_hash, role_id, is_active, force_password_change) VALUES ($1, $2, $3, $4, $5, 1)",
          [editingUser.name, editingUser.username?.trim(), userPassword, editingUser.role_id, 1]
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
          <h3 style={{ margin: "0 0 0.25rem 0", color: "var(--text-main)" }}>👤 School Staff User Accounts</h3>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Register gate guards, registrars, and admin accounts.
          </p>
        </div>
        {!isFormOpen && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingUser({ name: "", username: "", role_id: roles[0]?.id || "1", is_active: true });
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
    </div>
  );
}
