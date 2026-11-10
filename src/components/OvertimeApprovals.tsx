import { useState } from "react";
import { Employee, OvertimeRequest } from "../types";
import { useToast } from "../context/ToastContext";

interface OvertimeApprovalsProps {
  employees: Employee[];
  overtimeRequests: OvertimeRequest[];
  onAddOvertimeRequest: (req: Omit<OvertimeRequest, "id" | "createdAt">) => void;
  onUpdateOvertimeStatus: (id: number, status: "Approved" | "Rejected", approvedBy: string) => void;
  currentUser: string;
}

export default function OvertimeApprovals({
  employees,
  overtimeRequests,
  onAddOvertimeRequest,
  onUpdateOvertimeStatus,
  currentUser,
}: OvertimeApprovalsProps) {
  const toast = useToast();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [hours, setHours] = useState(2);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      toast.warning("Please select an employee.", "Validation Error");
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;

    onAddOvertimeRequest({
      employeeId: emp.id,
      employeeName: emp.name,
      departmentJobTitle: emp.departmentJobTitle,
      date,
      hours: Number(hours),
      reason,
      status: "Pending",
    });

    setReason("");
    toast.success(`Overtime (OT) pre-authorization filed for ${emp.name}!`, "OT Filed");
  };

  const filteredRequests = overtimeRequests.filter((req) => {
    const matchesSearch =
      req.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      req.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      req.reason.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeClass = (status: string) => {
    if (status === "Approved") return "badge-success";
    if (status === "Rejected") return "badge-danger";
    return "badge-warning";
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
          ⏱️ Overtime Request &amp; Approval Workflow
        </h2>
        <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          File overtime pre-authorizations and approve overtime hours to feed into automated payroll calculations.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Form Card */}
        <div className="table-card" style={{ padding: "1.25rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem" }}>
            ⏱️ File Overtime Pre-Authorization
          </h3>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Employee *
              </label>
              <select
                className="form-input"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
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
                  OT Date *
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Hours *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="16"
                  className="form-input"
                  value={hours}
                  onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Project / Operational Reason *
              </label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Explain necessity for extra shift work..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                style={{ resize: "vertical" }}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}>
              📨 Submit OT Request
            </button>
          </form>
        </div>

        {/* OT Requests Table Card */}
        <div className="table-card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
              📋 Overtime Log ({filteredRequests.length})
            </h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search employee, reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "220px", padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
              />
              <select
                className="form-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: "130px", padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
              >
                <option value="ALL">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Date &amp; Hours</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Reason / Task</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                      No overtime requests found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => (
                    <tr key={req.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "0.75rem" }}>
                        <div style={{ fontWeight: 600 }}>{req.employeeName}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{req.employeeId} • {req.departmentJobTitle}</div>
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <div style={{ fontWeight: 600 }}>{req.hours} Hrs</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{req.date}</div>
                      </td>
                      <td style={{ padding: "0.75rem", maxWidth: "250px", wordBreak: "break-word" }}>
                        {req.reason}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <span className={`badge ${getStatusBadgeClass(req.status)}`}>
                          {req.status}
                        </span>
                        {req.approvedBy && (
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            by {req.approvedBy}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>
                        {req.status === "Pending" ? (
                          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => req.id && onUpdateOvertimeStatus(req.id, "Approved", currentUser)}
                              className="btn btn-sm btn-primary"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => req.id && onUpdateOvertimeStatus(req.id, "Rejected", currentUser)}
                              className="btn btn-sm btn-outline"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "var(--danger)" }}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Decided</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
