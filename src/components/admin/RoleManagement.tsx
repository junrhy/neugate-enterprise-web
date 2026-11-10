import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Role, Permission } from "../../types";
import { useToast } from "../../context/ToastContext";
import { selectQuery, executeQuery } from "../../utils/dbHelper";

interface RoleManagementProps {
  db: Database | null;
}

const DEFAULT_MODULES = [
  { id: "gate", name: "🚪 Access Terminal & RFID Scanner" },
  { id: "directory", name: "👔 Employee Directory Management" },
  { id: "rates", name: "💵 Compensation & Salary Rates" },
  { id: "schedules", name: "📅 Work Schedules" },
  { id: "holidays", name: "🎉 Official Holidays Calendar" },
  { id: "logs", name: "📋 Attendance Logs & Export" },
  { id: "leaves", name: "🌴 Leave & Absence Workflow" },
  { id: "overtime", name: "⏱️ Overtime Workflow" },
  { id: "analytics", name: "📊 HR Analytics & Form 48" },
  { id: "payroll", name: "💰 Payroll & Payslips" },
  { id: "thirteenth", name: "🎁 13th Month & Annual Tax" },
  { id: "disbursements", name: "💸 Disbursements" },
  { id: "payables", name: "🏢 Accounts Payables & Loans" },
  { id: "reports", name: "📊 Financial & Payroll Reports" },
  { id: "sms", name: "💬 SMS Broadcast Console" },
  { id: "users", name: "👥 Users & Roles Administration" },
  { id: "settings", name: "⚙️ System & Hardware Settings" },
];

export default function RoleManagement({ db }: RoleManagementProps) {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<(Partial<Role> & { permission_ids: string[] }) | null>(null);

  const loadData = async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [rolesData, permsData] = (await Promise.all([
        selectQuery(db, "SELECT * FROM neugate.roles ORDER BY id ASC"),
        selectQuery(db, "SELECT * FROM neugate.permissions ORDER BY module_name ASC"),
      ])) as [any[], any[]];

      setRoles(
        rolesData.map((r) => ({
          id: String(r.id),
          name: r.name,
          description: r.description,
        }))
      );

      setPermissions(
        permsData.map((p) => ({
          id: String(p.id),
          module_name: p.module_name,
          action_name: p.action_name,
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

  const handleEditRole = async (r: Role) => {
    if (!db) return;
    try {
      const numericRoleId = typeof r.id === "number" ? r.id : parseInt(String(r.id), 10);
      const rolePerms: any[] = await selectQuery(
        db,
        "SELECT permission_id FROM neugate.role_permissions WHERE role_id = $1",
        [isNaN(numericRoleId) ? r.id : numericRoleId]
      );
      setEditingRole({
        ...r,
        permission_ids: rolePerms.map((rp) => String(rp.permission_id)),
      });
      setIsFormOpen(true);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole || !db) return;

    try {
      let roleId: string | number | undefined = editingRole.id;
      if (roleId) {
        const numericRoleId = typeof roleId === "number" ? roleId : parseInt(String(roleId), 10);
        const finalRoleId = isNaN(numericRoleId) ? roleId : numericRoleId;

        await executeQuery(db, "UPDATE neugate.roles SET name = $1, description = $2 WHERE id = $3", [
          editingRole.name,
          editingRole.description || "",
          finalRoleId,
        ]);
        await executeQuery(db, "DELETE FROM neugate.role_permissions WHERE role_id = $1", [finalRoleId]);
        roleId = finalRoleId;
      } else {
        const res: any = await executeQuery(db, "INSERT INTO neugate.roles (name, description) VALUES ($1, $2)", [
          editingRole.name,
          editingRole.description || "",
        ]);
        roleId = res.lastInsertId;
      }

      const numericRoleId = typeof roleId === "number" ? roleId : parseInt(String(roleId), 10);
      const finalRoleId = isNaN(numericRoleId) ? roleId : numericRoleId;

      for (const pId of editingRole.permission_ids) {
        await executeQuery(db, "INSERT INTO neugate.role_permissions (role_id, permission_id) VALUES ($1, $2)", [
          finalRoleId,
          pId,
        ]);
      }

      setIsFormOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  const togglePermission = (permId: string) => {
    if (!editingRole) return;
    const exists = editingRole.permission_ids.includes(permId);
    const updated = exists
      ? editingRole.permission_ids.filter((id) => id !== permId)
      : [...editingRole.permission_ids, permId];
    setEditingRole({ ...editingRole, permission_ids: updated });
  };

  const handleDeleteRole = async (r: Role) => {
    if (!db) return;

    if (r.name === "Admin") {
      toast.warning("The System Admin role cannot be deleted.", "Protected Role");
      return;
    }

    try {
      const numericRoleId = typeof r.id === "number" ? r.id : parseInt(String(r.id), 10);
      const finalRoleId = isNaN(numericRoleId) ? r.id : numericRoleId;

      // Check if any active/inactive users are currently assigned to this role
      const assignedUsers: any[] = await selectQuery(
        db,
        "SELECT id, name FROM neugate.users WHERE role_id = $1 LIMIT 5",
        [finalRoleId]
      );

      if (assignedUsers.length > 0) {
        const names = assignedUsers.map((u) => u.name).join(", ");
        toast.error(`Cannot delete role "${r.name}" because it is currently assigned to user(s): ${names}. Please reassign those users first.`, "Role In Use");
        return;
      }

      if (confirm(`Are you sure you want to delete the role "${r.name}"?`)) {
        await executeQuery(db, "DELETE FROM neugate.role_permissions WHERE role_id = $1", [finalRoleId]);
        await executeQuery(db, "DELETE FROM neugate.roles WHERE id = $1", [finalRoleId]);
        toast.success(`Role "${r.name}" deleted successfully.`, "Role Deleted");
        loadData();
      }
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: "0 0 0.25rem 0", color: "var(--text-main)" }}>🛡️ System Roles &amp; Access Matrix</h3>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Configure custom roles and module access permissions.
          </p>
        </div>
        {!isFormOpen && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingRole({ name: "", description: "", permission_ids: permissions.map((p) => p.id) });
              setIsFormOpen(true);
            }}
          >
            ➕ Create Custom Role
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
            {editingRole?.id ? "✏️ Edit Role Permissions" : "✨ Create New Role"}
          </h4>

          <form onSubmit={handleSaveRole} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Role Name</label>
                <input
                  type="text"
                  required
                  disabled={editingRole?.name === "Admin"}
                  className="form-input"
                  value={editingRole?.name || ""}
                  onChange={(e) => setEditingRole({ ...editingRole!, name: e.target.value })}
                  placeholder="e.g. Security Guard"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingRole?.description || ""}
                  onChange={(e) => setEditingRole({ ...editingRole!, description: e.target.value })}
                  placeholder="Role responsibilities and access scope..."
                />
              </div>
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "1.25rem", background: "rgba(255,255,255,0.02)" }}>
              <h5 style={{ margin: "0 0 1rem 0", color: "var(--text-main)" }}>Granted Module Permissions</h5>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                {DEFAULT_MODULES.map((mod) => {
                  const modPerms = permissions.filter((p) => p.module_name === mod.id);
                  return (
                    <div key={mod.id} style={{ padding: "0.85rem", background: "var(--bg-card)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--primary)" }}>
                        {mod.name}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {modPerms.length === 0 ? (
                          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={editingRole?.permission_ids.includes(mod.id)}
                              onChange={() => togglePermission(mod.id)}
                              disabled={editingRole?.name === "Admin"}
                            />
                            Access {mod.name}
                          </label>
                        ) : (
                          modPerms.map((p) => (
                            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={editingRole?.permission_ids.includes(p.id)}
                                onChange={() => togglePermission(p.id)}
                                disabled={editingRole?.name === "Admin"}
                              />
                              {p.action_name}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={editingRole?.name === "Admin"}>
                💾 Save Role &amp; Matrix
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>Loading roles...</div>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Description</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="badge badge-purple">🛡️ {r.name}</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{r.description || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                        onClick={() => handleEditRole(r)}
                      >
                        ✏️ Edit Matrix
                      </button>
                      {r.name !== "Admin" && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                          onClick={() => handleDeleteRole(r)}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
