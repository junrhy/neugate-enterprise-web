import { useAuth } from "../hooks/useAuth";

export type Tab = "gate" | "directory" | "schedules" | "holidays" | "logs" | "payroll" | "sms" | "settings" | "leaves" | "overtime" | "analytics" | "thirteenth" | "cash-advances" | "other-deductions" | "salaries-report" | "rates" | "payslips" | "disbursements" | "payroll-adjustments" | "payables" | "geofence";

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  schoolName: string;
  schoolTagline: string;
  schoolLogo: string;
  onOpenLogin: () => void;
  onOpenChangePassword: () => void;
  isKioskMode?: boolean;
  onToggleKiosk?: () => void;
}

export default function Header({
  activeTab,
  setActiveTab,
  schoolName,
  schoolTagline,
  schoolLogo,
  onOpenLogin,
  onOpenChangePassword,
  isKioskMode,
  onToggleKiosk,
}: HeaderProps) {
  const { user, logout, hasPermission } = useAuth();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });

  return (
    <header>
      <div className="brand-section">
        <div className="brand-logo">
          {schoolLogo ? (
            <img src={schoolLogo} alt="App Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <img src="/app-icon.png" alt="App Icon" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
        <div>
          <div className="brand-name">{schoolName}</div>
          <div className="brand-tag">{schoolTagline}</div>
        </div>
      </div>

      <div className="nav-tabs" style={{ display: "flex", gap: "0.5rem", position: "relative" }}>
        {/* Operations Dropdown */}
        {hasPermission("gate") && (
          <div className="nav-dropdown" style={{ position: "relative" }}>
            <button
              className={`tab-btn ${activeTab === "gate" ? "active" : ""}`}
              onClick={() => setActiveTab("gate")}
            >
              🚪 Operations ▾
            </button>
            <div className="dropdown-menu">
              <button
                className={`dropdown-item ${activeTab === "gate" ? "active" : ""}`}
                onClick={() => setActiveTab("gate")}
              >
                🚪 Access Terminal
              </button>
            </div>
          </div>
        )}

        {/* HR & Timekeeping Group */}
        {(hasPermission("directory") ||
          hasPermission("rates") ||
          hasPermission("schedules") ||
          hasPermission("logs") ||
          hasPermission("leaves") ||
          hasPermission("overtime") ||
          hasPermission("analytics")) && (
            <div className="nav-dropdown" style={{ position: "relative" }}>
              <button
                className={`tab-btn ${["directory", "schedules", "rates", "logs", "leaves", "overtime", "analytics"].includes(activeTab) ? "active" : ""}`}
                onClick={() => setActiveTab("directory")}
              >
                👔 Workforce &amp; HR ▾
              </button>
              <div className="dropdown-menu">
                {hasPermission("directory") && (
                  <button
                    className={`dropdown-item ${activeTab === "directory" ? "active" : ""}`}
                    onClick={() => setActiveTab("directory")}
                  >
                    👔 Employees Directory
                  </button>
                )}
                {hasPermission("rates") && (
                  <button
                    className={`dropdown-item ${activeTab === "rates" ? "active" : ""}`}
                    onClick={() => setActiveTab("rates")}
                  >
                    💵 Compensation &amp; Salary Rates
                  </button>
                )}
                {hasPermission("schedules") && (
                  <button
                    className={`dropdown-item ${activeTab === "schedules" ? "active" : ""}`}
                    onClick={() => setActiveTab("schedules")}
                  >
                    📅 Work Schedules
                  </button>
                )}
                {hasPermission("schedules") && (
                  <button
                    className={`dropdown-item ${activeTab === "holidays" ? "active" : ""}`}
                    onClick={() => setActiveTab("holidays")}
                  >
                    🎉 Official Holidays
                  </button>
                )}
                {hasPermission("logs") && (
                  <button
                    className={`dropdown-item ${activeTab === "logs" ? "active" : ""}`}
                    onClick={() => setActiveTab("logs")}
                  >
                    📋 Attendance Logs
                  </button>
                )}
                {hasPermission("leaves") && (
                  <button
                    className={`dropdown-item ${activeTab === "leaves" ? "active" : ""}`}
                    onClick={() => setActiveTab("leaves")}
                  >
                    🌴 Leave &amp; Absence
                  </button>
                )}
                {hasPermission("overtime") && (
                  <button
                    className={`dropdown-item ${activeTab === "overtime" ? "active" : ""}`}
                    onClick={() => setActiveTab("overtime")}
                  >
                    ⏱️ Overtime Workflow
                  </button>
                )}
                {hasPermission("analytics") && (
                  <button
                    className={`dropdown-item ${activeTab === "analytics" ? "active" : ""}`}
                    onClick={() => setActiveTab("analytics")}
                  >
                    📊 HR Analytics &amp; Form 48
                  </button>
                )}
                {hasPermission("directory") && (
                  <button
                    className={`dropdown-item ${activeTab === "geofence" ? "active" : ""}`}
                    onClick={() => setActiveTab("geofence")}
                  >
                    📍 Worksite &amp; Geofence Policy
                  </button>
                )}
              </div>
            </div>
          )}

        {/* Finance & Payroll Group */}
        {(hasPermission("payroll") ||
          hasPermission("thirteenth") ||
          hasPermission("disbursements") ||
          hasPermission("payables")) && (
            <div className="nav-dropdown" style={{ position: "relative" }}>
              <button
                className={`tab-btn ${["payslips", "thirteenth", "disbursements", "payables"].includes(activeTab) ? "active" : ""}`}
                onClick={() => setActiveTab("payslips")}
              >
                💰 Payroll &amp; Finance ▾
              </button>
              <div className="dropdown-menu">
                {hasPermission("payroll") && (
                  <button
                    className={`dropdown-item ${activeTab === "payslips" ? "active" : ""}`}
                    onClick={() => setActiveTab("payslips")}
                  >
                    📄 Employee Payslips
                  </button>
                )}
                {hasPermission("thirteenth") && (
                  <button
                    className={`dropdown-item ${activeTab === "thirteenth" ? "active" : ""}`}
                    onClick={() => setActiveTab("thirteenth")}
                  >
                    🎁 13th Month &amp; Annual Tax
                  </button>
                )}
                {hasPermission("disbursements") && (
                  <button
                    className={`dropdown-item ${activeTab === "disbursements" ? "active" : ""}`}
                    onClick={() => setActiveTab("disbursements")}
                  >
                    💸 Disbursements
                  </button>
                )}
                {hasPermission("payables") && (
                  <button
                    className={`dropdown-item ${activeTab === "payables" ? "active" : ""}`}
                    onClick={() => setActiveTab("payables")}
                  >
                    🏢 Accounts Payables &amp; Loans
                  </button>
                )}
              </div>
            </div>
          )}

        {/* Dedicated Reports Group */}
        {hasPermission("reports") && (
          <div className="nav-dropdown" style={{ position: "relative" }}>
            <button
              className={`tab-btn ${["salaries-report", "payroll-adjustments", "cash-advances", "other-deductions"].includes(activeTab) ? "active" : ""}`}
              onClick={() => setActiveTab("salaries-report")}
            >
              📊 Reports ▾
            </button>
            <div className="dropdown-menu">
              <button
                className={`dropdown-item ${activeTab === "salaries-report" ? "active" : ""}`}
                onClick={() => setActiveTab("salaries-report")}
              >
                📊 Salaries &amp; Wages Report
              </button>
              <button
                className={`dropdown-item ${activeTab === "payroll-adjustments" ? "active" : ""}`}
                onClick={() => setActiveTab("payroll-adjustments")}
              >
                📝 Payroll Tax &amp; Salary Adjustments
              </button>
              <button
                className={`dropdown-item ${activeTab === "cash-advances" ? "active" : ""}`}
                onClick={() => setActiveTab("cash-advances")}
              >
                💸 Cash Advances Ledger
              </button>
              <button
                className={`dropdown-item ${activeTab === "other-deductions" ? "active" : ""}`}
                onClick={() => setActiveTab("other-deductions")}
              >
                📉 Deductions Report
              </button>
            </div>
          </div>
        )}

        {/* Administration & Settings Group */}
        {(hasPermission("sms") || hasPermission("settings") || hasPermission("users")) && (
          <div className="nav-dropdown" style={{ position: "relative" }}>
            <button
              className={`tab-btn ${["sms", "settings"].includes(activeTab) ? "active" : ""}`}
              onClick={() => setActiveTab(hasPermission("sms") ? "sms" : "settings")}
            >
              ⚙️ Administration ▾
            </button>
            <div className="dropdown-menu">
              {hasPermission("sms") && (
                <button
                  className={`dropdown-item ${activeTab === "sms" ? "active" : ""}`}
                  onClick={() => setActiveTab("sms")}
                >
                  💬 SMS Console &amp; Logs
                </button>
              )}
              {hasPermission("settings") && (
                <button
                  className={`dropdown-item ${activeTab === "settings" ? "active" : ""}`}
                  onClick={() => setActiveTab("settings")}
                >
                  ⚙️ System Settings
                </button>
              )}
            </div>
          </div>
        )}
      </div>



      <div className="header-controls" style={{ gap: "0.85rem" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{dateStr}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--primary)", fontWeight: 700 }}>
            {user ? user.name : "Guest Session"}
          </div>
        </div>

        {user ? (
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              onClick={onOpenChangePassword}
              className="btn btn-sm btn-outline"
              style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
              title="Change Account Password"
            >
              🔑 Password
            </button>
            <button
              onClick={logout}
              className="btn btn-sm btn-outline"
              style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
              title="Logout Session"
            >
              🚪 Logout
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLogin}
            className="btn btn-sm btn-primary"
            style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
          >
            🔑 Login
          </button>
        )}

        {onToggleKiosk && (
          <button
            onClick={onToggleKiosk}
            className="btn btn-sm btn-outline"
            style={{ fontSize: "0.7rem", padding: "0.25rem 0.55rem" }}
            title={isKioskMode ? "Exit Fullscreen Kiosk Mode (Esc)" : "Enter Fullscreen Kiosk Mode (Hide Top Bar)"}
          >
            {isKioskMode ? "🗗 Exit Kiosk" : "⛶ Fullscreen"}
          </button>
        )}

        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 8px var(--success)", flexShrink: 0 }} />
      </div>
    </header>
  );
}
