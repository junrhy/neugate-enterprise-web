import { useState } from "react";
import { Employee, EmployeeRate } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { useToast } from "../context/ToastContext";
import { executeQuery } from "../utils/dbHelper";

interface CompensationRatesProps {
  db: Database | null;
  employees: Employee[];
  rates: EmployeeRate[];
  onRefreshData: () => void;
}

export default function CompensationRates({
  db,
  employees,
  rates,
  onRefreshData,
}: CompensationRatesProps) {
  const toast = useToast();
  const [selectedEmpForRate, setSelectedEmpForRate] = useState<Employee | null>(null);
  const [editingRate, setEditingRate] = useState<EmployeeRate>({
    employeeId: "",
    salaryType: "MONTHLY",
    basicSalary: 25000,
    overtimeRatePerHour: 180,
    lateDeductionRatePerMin: 2,
    sssDeduction: 1125,
    philhealthDeduction: 450,
    pagibigDeduction: 200,
    taxDeduction: 1200,
  });

  const handleOpenRateModal = (emp: Employee) => {
    setSelectedEmpForRate(emp);
    const existing = rates.find((r) => r.employeeId === emp.id);
    if (existing) {
      setEditingRate({ ...existing });
    } else {
      setEditingRate({
        employeeId: emp.id,
        salaryType: "MONTHLY",
        basicSalary: 25000,
        overtimeRatePerHour: 180,
        lateDeductionRatePerMin: 2,
        sssDeduction: 1125,
        philhealthDeduction: 450,
        pagibigDeduction: 200,
        taxDeduction: 1200,
      });
    }
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpForRate) return;

    if (!db) {
      toast.warning("Database not loaded. Operating in offline demo mode.", "Demo Mode");
      setSelectedEmpForRate(null);
      return;
    }

    try {
      await executeQuery(
        db,
        `INSERT INTO neugate.employee_rates (employee_id, salary_type, basic_salary, overtime_rate_per_hour, late_deduction_rate_per_min, sss_deduction, philhealth_deduction, pagibig_deduction, tax_deduction)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(employee_id) DO UPDATE SET
           salary_type=excluded.salary_type,
           basic_salary=excluded.basic_salary,
           overtime_rate_per_hour=excluded.overtime_rate_per_hour,
           late_deduction_rate_per_min=excluded.late_deduction_rate_per_min,
           sss_deduction=excluded.sss_deduction,
           philhealth_deduction=excluded.philhealth_deduction,
           pagibig_deduction=excluded.pagibig_deduction,
           tax_deduction=excluded.tax_deduction`,
        [
          editingRate.employeeId,
          editingRate.salaryType,
          editingRate.basicSalary,
          editingRate.overtimeRatePerHour,
          editingRate.lateDeductionRatePerMin,
          editingRate.sssDeduction,
          editingRate.philhealthDeduction,
          editingRate.pagibigDeduction,
          editingRate.taxDeduction,
        ]
      );

      toast.success(`Updated compensation rates for ${selectedEmpForRate.name}`, "Rate Configured");
      setSelectedEmpForRate(null);
      onRefreshData();
    } catch (err) {
      console.error("Failed to save rate:", err);
      toast.error("Failed to update employee rate settings.", "Save Error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
            💵 Employee Compensation &amp; Salary Rates
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", margin: "0.2rem 0 0 0" }}>
            Configure basic salaries, daily/hourly rates, overtime multipliers, late penalties, and statutory contribution rates.
          </p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>ID Number</th>
              <th>Department &amp; Title</th>
              <th>Pay Structure</th>
              <th>Basic Salary</th>
              <th>OT / Late Rates</th>
              <th>Statutory Contributions</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--text-sub)" }}>
                  No employees found in directory. Add employees to configure rates.
                </td>
              </tr>
            ) : (
              employees.map((emp) => {
                const rate = rates.find((r) => r.employeeId === emp.id) || {
                  salaryType: "MONTHLY",
                  basicSalary: 25000,
                  overtimeRatePerHour: 180,
                  lateDeductionRatePerMin: 2,
                  sssDeduction: 1125,
                  philhealthDeduction: 450,
                  pagibigDeduction: 200,
                  taxDeduction: 1200,
                };

                return (
                  <tr key={emp.id}>
                    <td><strong>{emp.name}</strong></td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace" }}>{emp.id}</td>
                    <td style={{ color: "var(--text-sub)" }}>{emp.departmentJobTitle}</td>
                    <td>
                      <span className="badge badge-info">{rate.salaryType}</span>
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                      ₱{rate.basicSalary.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>
                      ⚡ OT: <strong>₱{rate.overtimeRatePerHour}</strong>/hr<br />
                      ⌛ Late: <strong>₱{rate.lateDeductionRatePerMin}</strong>/min
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-sub)" }}>
                      SSS: <strong>₱{rate.sssDeduction}</strong> | PH: <strong>₱{rate.philhealthDeduction}</strong><br />
                      Pag-IBIG: <strong>₱{rate.pagibigDeduction}</strong> | Tax: <strong>₱{rate.taxDeduction}</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }}
                        onClick={() => handleOpenRateModal(emp)}
                      >
                        ⚙️ Configure Rates
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Rate Modal */}
      {selectedEmpForRate && (
        <div className="modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && setSelectedEmpForRate(null)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">⚙️ Configure Rates for {selectedEmpForRate.name}</span>
              <button className="modal-close" onClick={() => setSelectedEmpForRate(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveRate}>
              <div className="form-group">
                <label className="form-label">Salary Computation Basis</label>
                <select
                  className="form-select"
                  value={editingRate.salaryType}
                  onChange={(e) => setEditingRate({ ...editingRate, salaryType: e.target.value as any })}
                >
                  <option value="MONTHLY">MONTHLY (Fixed Semi-Monthly Division)</option>
                  <option value="DAILY">DAILY (Paid per Day Worked)</option>
                  <option value="HOURLY">HOURLY (Paid per Hour Logged)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Basic Rate (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={editingRate.basicSalary}
                  onChange={(e) => setEditingRate({ ...editingRate, basicSalary: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">OT Rate / Hour (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={editingRate.overtimeRatePerHour}
                    onChange={(e) => setEditingRate({ ...editingRate, overtimeRatePerHour: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Late Penalty / Min (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={editingRate.lateDeductionRatePerMin}
                    onChange={(e) => setEditingRate({ ...editingRate, lateDeductionRatePerMin: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              <h4 style={{ margin: "1.25rem 0 0.5rem 0", fontSize: "0.85rem", color: "var(--primary)" }}>
                Statutory Deductions (Monthly Basis)
              </h4>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">SSS Contribution (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={editingRate.sssDeduction}
                    onChange={(e) => setEditingRate({ ...editingRate, sssDeduction: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">PhilHealth Contribution (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={editingRate.philhealthDeduction}
                    onChange={(e) => setEditingRate({ ...editingRate, philhealthDeduction: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pag-IBIG Contribution (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={editingRate.pagibigDeduction}
                    onChange={(e) => setEditingRate({ ...editingRate, pagibigDeduction: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Withholding Tax (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={editingRate.taxDeduction}
                    onChange={(e) => setEditingRate({ ...editingRate, taxDeduction: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setSelectedEmpForRate(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Save Rates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
