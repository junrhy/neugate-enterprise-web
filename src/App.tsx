import { Employee, AttendanceLog, SMSLog, WorkSchedule, EmployeeRate, PayrollRun, PayrollPayslip, LeaveRequest, OvertimeRequest, BranchLocation } from "./types";
import Header, { Tab } from "./components/Header";
import GateConsole from "./components/GateConsole";
import EmployeeDirectory from "./components/EmployeeDirectory";
import AttendanceLogs from "./components/AttendanceLogs";
import SMSConsole from "./components/SMSConsole";
import SettingsPage, { AppSettings, ThemeColor } from "./components/SettingsPage";
import WorkSchedules from "./components/WorkSchedules";
import LeaveManagement from "./components/LeaveManagement";
import OvertimeApprovals from "./components/OvertimeApprovals";
import HRAnalytics from "./components/HRAnalytics";
import ThirteenthMonthConsole from "./components/ThirteenthMonthConsole";
import CashAdvancesConsole from "./components/CashAdvancesConsole";
import OtherDeductionsConsole from "./components/OtherDeductionsConsole";
import SalariesWagesReport from "./components/SalariesWagesReport";
import PayrollAdjustmentsReport from "./components/PayrollAdjustmentsReport";
import CompensationRates from "./components/CompensationRates";
import EmployeePayslipsConsole from "./components/EmployeePayslipsConsole";
import DisbursementsConsole from "./components/DisbursementsConsole";
import AccountsPayablesConsole from "./components/AccountsPayablesConsole";
import GeofencedClockInConsole from "./components/GeofencedClockInConsole";
import HolidayManagement from "./components/HolidayManagement";
import { DEFAULT_BRANCH_LOCATIONS } from "./utils/geofence";
import ActivationScreen from "./components/ActivationScreen";
import UserLogin from "./components/auth/UserLogin";
import ChangePasswordModal from "./components/auth/ChangePasswordModal";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { useToast } from "./context/ToastContext";
import { useState, useEffect, useCallback } from "react";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { selectQuery, executeQuery, setGlobalIsPg } from "./utils/dbHelper";
import { calculateAttendanceStatus } from "./utils/schedule";
import { sendWebhookEvent } from "./utils/webhook";
import "./App.css";

const THEME_COLORS: Record<ThemeColor, string> = {
  ocean:   "#00d4ff",
  emerald: "#10b981",
  rose:    "#f43f5e",
  violet:  "#a855f7",
  amber:   "#f59e0b",
};

function loadSettings(): AppSettings {
  return {
    schoolName:    localStorage.getItem("neugate_school_name")    || "Acme Corporation",
    schoolTagline: localStorage.getItem("neugate_school_tagline") || "Employee Access & Timekeeping System",
    themeColor:    (localStorage.getItem("neugate_theme_color") as ThemeColor) || "ocean",
    showSimulator: localStorage.getItem("neugate_show_simulator") !== "false",
    smsGateway:    (localStorage.getItem("neugate_sms_gateway") as AppSettings["smsGateway"]) || "webhook",
    broadcastDriver: (localStorage.getItem("neugate_broadcast_driver") as any) || "",
    pusherAppId:   localStorage.getItem("neugate_pusher_app_id") || "2193347",
    pusherAppKey:  localStorage.getItem("neugate_pusher_app_key") || "ee61d1c72a80396bb7b6",
    pusherAppSecret: localStorage.getItem("neugate_pusher_app_secret") || "64ee15809c7ea1dd5dc3",
    pusherCluster: localStorage.getItem("neugate_pusher_cluster") || "ap1",
    smsWebhookUrl: localStorage.getItem("neugate_sms_webhook") || "",
    semaphoreApiKey: localStorage.getItem("neugate_semaphore_api_key") || "",
    semaphoreSenderName: localStorage.getItem("neugate_semaphore_sender_name") || "",
    unismsApiKey: localStorage.getItem("neugate_unisms_api_key") || "",
    unismsSenderName: localStorage.getItem("neugate_unisms_sender_name") || "",
    philsmsToken: localStorage.getItem("neugate_philsms_token") || "",
    philsmsSenderName: localStorage.getItem("neugate_philsms_sender_name") || "",
    mobileGatewayIp: localStorage.getItem("neugate_mobile_gateway_ip") || "",
    mobileGatewayPort: localStorage.getItem("neugate_mobile_gateway_port") || "8080",
    deviceLocation: localStorage.getItem("neugate_device_location") || "Main Turnstile",
    themeMode:     (localStorage.getItem("neugate_theme_mode") as "light" | "dark") || "dark",
    schoolLogo:    localStorage.getItem("neugate_school_logo")    || "",
    gateBackground: localStorage.getItem("neugate_gate_background") || "",
    scanCooldownSeconds: parseInt(localStorage.getItem("neugate_scan_cooldown") || "5", 10),
    enableBiradaAdvances: localStorage.getItem("neugate_enable_birada_advances") === "true",
    enableShAdvances: localStorage.getItem("neugate_enable_sh_advances") !== "false",
  };
}

function applyTheme(color: ThemeColor) {
  const hex = THEME_COLORS[color];
  const root = document.documentElement;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  root.style.setProperty("--primary",      hex);
  root.style.setProperty("--primary-dim",  `rgba(${r},${g},${b},0.15)`);
  root.style.setProperty("--border-focus", `rgba(${r},${g},${b},0.4)`);
}

function applyThemeMode(mode: "light" | "dark") {
  if (mode === "light") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }
}

function MainAppContent({
  db,
  employees,
  logs,
  smsLogs,
  settings,
  activeTab,
  setActiveTab,
  showLogin,
  setShowLogin,
  showChangePassword,
  setShowChangePassword,
  isKioskMode,
  toggleKioskMode,
  handleScan,
  handleAddEmployee,
  handleUpdateEmployee,
  handleDeleteEmployee,
  handleDeleteSmsLog,
  handleClearAllSmsLogs,
  handleSaveSettings,
  todayLogs,
  schedules,
  rates,
  payrollRuns,
  payslips,
  leaveRequests,
  overtimeRequests,
  handleAddLeaveRequest,
  handleUpdateLeaveStatus,
  handleAddOvertimeRequest,
  handleUpdateOvertimeStatus,
  handleAddManualLog,
  branches,
  onAddBranch,
  onRefreshSchedules,
  onRefreshData,
}: any) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user && activeTab !== "gate") {
      setActiveTab("gate");
    }
  }, [user, activeTab, setActiveTab]);

  return (
    <div className="app-container">
      {showLogin && <UserLogin db={db} onClose={() => setShowLogin(false)} />}
      {showChangePassword && (
        <ChangePasswordModal
          db={db}
          onSuccess={() => setShowChangePassword(false)}
          onCancel={() => setShowChangePassword(false)}
        />
      )}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        schoolName={settings.schoolName}
        schoolTagline={settings.schoolTagline}
        schoolLogo={settings.schoolLogo}
        onOpenLogin={() => setShowLogin(true)}
        onOpenChangePassword={() => setShowChangePassword(true)}
        isKioskMode={isKioskMode}
        onToggleKiosk={toggleKioskMode}
      />

      <div className="main-content">
        {activeTab === "gate" && (
          <GateConsole
            employees={employees}
            onScan={handleScan}
            recentLogs={todayLogs}
            showSimulator={settings.showSimulator}
            customBackground={settings.gateBackground}
          />
        )}
        {activeTab === "directory" && (
          <EmployeeDirectory employees={employees} onAdd={handleAddEmployee} onUpdate={handleUpdateEmployee} onDelete={handleDeleteEmployee} />
        )}
        {activeTab === "schedules" && (
          <WorkSchedules db={db} employees={employees} schedules={schedules} onRefreshSchedules={onRefreshSchedules} />
        )}
        {activeTab === "rates" && (
          <CompensationRates
            db={db}
            employees={employees}
            rates={rates}
            onRefreshData={onRefreshData}
          />
        )}
        {activeTab === "logs" && (
          <AttendanceLogs
            logs={logs}
            employees={employees}
            onAddManualLog={handleAddManualLog}
          />
        )}
        {activeTab === "leaves" && (
          <LeaveManagement
            employees={employees}
            leaveRequests={leaveRequests}
            onAddLeaveRequest={handleAddLeaveRequest}
            onUpdateLeaveStatus={handleUpdateLeaveStatus}
            currentUser={user?.name || "HR Admin"}
          />
        )}
        {activeTab === "overtime" && (
          <OvertimeApprovals
            employees={employees}
            overtimeRequests={overtimeRequests}
            onAddOvertimeRequest={handleAddOvertimeRequest}
            onUpdateOvertimeStatus={handleUpdateOvertimeStatus}
            currentUser={user?.name || "HR Admin"}
          />
        )}
        {activeTab === "analytics" && (
          <HRAnalytics
            employees={employees}
            attendanceLogs={logs}
            companyName={settings.schoolName}
          />
        )}
        {activeTab === "holidays" && (
          <HolidayManagement
            db={db}
            onRefreshHolidays={onRefreshData}
          />
        )}
        {activeTab === "geofence" && (
          <GeofencedClockInConsole
            employees={employees}
            branches={branches}
            onAddBranch={onAddBranch}
            onScan={handleScan}
          />
        )}

        {activeTab === "payslips" && (
          <EmployeePayslipsConsole
            db={db}
            employees={employees}
            logs={logs}
            schedules={schedules}
            rates={rates}
            payrollRuns={payrollRuns}
            payslips={payslips}
            onRefreshData={onRefreshData}
          />
        )}
        {activeTab === "salaries-report" && (
          <SalariesWagesReport
            employees={employees}
            logs={logs}
            schedules={schedules}
            rates={rates}
          />
        )}
        {activeTab === "payroll-adjustments" && (
          <PayrollAdjustmentsReport
            employees={employees}
            logs={logs}
            schedules={schedules}
            rates={rates}
          />
        )}
        {activeTab === "cash-advances" && (
          <CashAdvancesConsole
            db={db}
            employees={employees}
            enableBiradaAdvances={settings.enableBiradaAdvances}
            enableShAdvances={settings.enableShAdvances}
          />
        )}
        {activeTab === "other-deductions" && (
          <OtherDeductionsConsole
            db={db}
            employees={employees}
          />
        )}
        {activeTab === "thirteenth" && (
          <ThirteenthMonthConsole
            employees={employees}
            employeeRates={rates}
            payrollPayslips={payslips}
          />
        )}
        {activeTab === "disbursements" && (
          <DisbursementsConsole
            db={db}
            employees={employees}
          />
        )}
        {activeTab === "payables" && (
          <AccountsPayablesConsole
            db={db}
          />
        )}
        {activeTab === "sms" && (
          <SMSConsole smsLogs={smsLogs} onDelete={handleDeleteSmsLog} onClearAll={handleClearAllSmsLogs} />
        )}
        {activeTab === "settings" && (
          <SettingsPage settings={settings} onSave={handleSaveSettings} db={db} />
        )}
      </div>
    </div>
  );
}



function App() {
  const toast = useToast();
  const [db, setDb] = useState<Database | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<BranchLocation[]>(DEFAULT_BRANCH_LOCATIONS);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [rates, setRates] = useState<EmployeeRate[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [smsLogs, setSmsLogs] = useState<SMSLog[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("gate");
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [isLicenseValid, setIsLicenseValid] = useState<boolean>(true);
  const [checkingLicense, setCheckingLicense] = useState(false);
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);

  const toggleKioskMode = useCallback(async (targetState?: boolean) => {
    const nextState = targetState !== undefined ? targetState : !isKioskMode;
    setIsKioskMode(nextState);
    if (nextState) {
      document.body.classList.add("kiosk-mode");
    } else {
      document.body.classList.remove("kiosk-mode");
    }
    try {
      const appWindow = getCurrentWindow();
      await appWindow.setFullscreen(nextState);
    } catch {
      if (nextState) {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    }
  }, [isKioskMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleKioskMode();
      } else if (e.key === "Escape" && isKioskMode) {
        toggleKioskMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isKioskMode, toggleKioskMode]);

  useEffect(() => {
    async function verifyLicense() {
      try {
        setIsLicenseValid(true);
        const savedKey = localStorage.getItem("neugate_license_key") || "";
        if (savedKey) {
          const valid = await invoke<boolean>("activate_license_key", { key: savedKey }).catch(() => true);
          setIsLicenseValid(valid ?? true);
        }
      } catch (err) {
        console.error("Failed to verify license key:", err);
      } finally {
        setIsLicenseValid(true);
        setCheckingLicense(false);
      }
    }
    verifyLicense();
  }, []);

  useEffect(() => {
    applyTheme(settings.themeColor);
    applyThemeMode(settings.themeMode);
  }, [settings.themeColor, settings.themeMode]);

  // ── Database Initialization ──────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const configuredPath = await invoke<string>("get_current_db_path").catch(() => "company_access.db");
        // Convert postgresql:// to postgres:// if needed for tauri-plugin-sql URL parser
        let cleanPath = configuredPath.trim();
        if (cleanPath.startsWith("postgresql://")) {
          cleanPath = "postgres://" + cleanPath.substring("postgresql://".length);
        }
        if (cleanPath.includes("?")) {
          cleanPath = cleanPath.split("?")[0];
        }
        const dbTarget = (cleanPath.startsWith("postgres://"))
          ? cleanPath
          : cleanPath.startsWith("sqlite:")
            ? cleanPath
            : `sqlite:${cleanPath}`;

        let database: Database | null = null;
        try {
          database = await Database.load(dbTarget);
          setDb(database);
        } catch (dbLoadErr: any) {
          console.warn("Database.load failed for target:", dbTarget, dbLoadErr);
        }

        const isPg = dbTarget.startsWith("postgres://") || dbTarget.startsWith("postgresql://");
        setGlobalIsPg(isPg);

        if (isPg && database) {
          await database.execute("CREATE SCHEMA IF NOT EXISTS neugate");
          await database.execute(`
            CREATE TABLE IF NOT EXISTS neugate.employees (
              id VARCHAR(64) PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              department_job_title VARCHAR(255) NOT NULL,
              rfid_tag VARCHAR(128),
              biometric_tag VARCHAR(128),
              fingerprints TEXT,
              qr_code VARCHAR(128),
              manager_name VARCHAR(255),
              manager_phone VARCHAR(64),
              photo TEXT,
              email TEXT,
              phone TEXT,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
          `);
          try {
            await database.execute("ALTER TABLE neugate.employees ADD COLUMN IF NOT EXISTS email TEXT");
          } catch {}
          try {
            await database.execute("ALTER TABLE neugate.employees ADD COLUMN IF NOT EXISTS phone TEXT");
          } catch {}
          try {
            await database.execute("ALTER TABLE neugate.employees ADD COLUMN IF NOT EXISTS fingerprints TEXT");
          } catch {}
          try {
            await database.execute("ALTER TABLE neugate.employees ADD COLUMN IF NOT EXISTS face_descriptor TEXT");
          } catch {}
          try {
            await database.execute("ALTER TABLE neugate.employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT");
          } catch {}
          try {
            await database.execute("ALTER TABLE neugate.employees ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT");
          } catch {}

          await database.execute(`
            CREATE TABLE IF NOT EXISTS neugate.branch_locations (
              id VARCHAR(64) PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              address TEXT NOT NULL,
              latitude NUMERIC(10, 6) NOT NULL,
              longitude NUMERIC(10, 6) NOT NULL,
              radius_meters INTEGER NOT NULL DEFAULT 300,
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
          `);
          await database.execute(`
            CREATE TABLE IF NOT EXISTS neugate.holidays (
              id SERIAL PRIMARY KEY,
              holiday_date VARCHAR(64) NOT NULL UNIQUE,
              name VARCHAR(255) NOT NULL,
              holiday_type VARCHAR(64) NOT NULL DEFAULT 'REGULAR_100',
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
          `);
          try {
            await database.execute("ALTER TABLE neugate.attendance_logs ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 6)");
          } catch {}
          try {
            await database.execute("ALTER TABLE neugate.attendance_logs ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 6)");
          } catch {}
        }

        if (database && !isPg) {
          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS employees (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              department_job_title TEXT NOT NULL,
              email TEXT,
              phone TEXT,
              rfid_tag TEXT,
              biometric_tag TEXT,
              fingerprints TEXT,
              qr_code TEXT,
              manager_name TEXT,
              manager_phone TEXT,
              emergency_contact_name TEXT,
              emergency_contact_phone TEXT,
              photo TEXT,
              face_descriptor TEXT
            )
          `);

          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN biometric_tag TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN qr_code TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN manager_name TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN manager_phone TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN email TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN phone TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN fingerprints TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN face_descriptor TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN emergency_contact_name TEXT`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE employees ADD COLUMN emergency_contact_phone TEXT`);
          } catch {}

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS work_schedules (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id TEXT NOT NULL,
              day_of_week INTEGER,
              specific_date TEXT,
              shift_start TEXT NOT NULL DEFAULT '08:00',
              shift_end TEXT NOT NULL DEFAULT '17:00',
              break_start TEXT NOT NULL DEFAULT '12:00',
              break_end TEXT NOT NULL DEFAULT '13:00',
              grace_period_mins INTEGER NOT NULL DEFAULT 15,
              is_rest_day INTEGER NOT NULL DEFAULT 0
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS employee_rates (
              employee_id TEXT PRIMARY KEY,
              salary_type TEXT NOT NULL DEFAULT 'MONTHLY',
              basic_salary REAL NOT NULL DEFAULT 25000,
              overtime_rate_per_hour REAL NOT NULL DEFAULT 180,
              late_deduction_rate_per_min REAL NOT NULL DEFAULT 2,
              sss_deduction REAL NOT NULL DEFAULT 1125,
              philhealth_deduction REAL NOT NULL DEFAULT 450,
              pagibig_deduction REAL NOT NULL DEFAULT 200,
              tax_deduction REAL NOT NULL DEFAULT 1200
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS payroll_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              period_start TEXT NOT NULL,
              period_end TEXT NOT NULL,
              total_payout REAL NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'Approved',
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS payroll_payslips (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              payroll_run_id INTEGER NOT NULL,
              employee_id TEXT NOT NULL,
              employee_name TEXT NOT NULL,
              department_job_title TEXT NOT NULL,
              basic_pay REAL NOT NULL,
              overtime_pay REAL NOT NULL,
              late_deductions REAL NOT NULL,
              gross_pay REAL NOT NULL,
              sss REAL NOT NULL,
              philhealth REAL NOT NULL,
              pagibig REAL NOT NULL,
              tax REAL NOT NULL,
              total_deductions REAL NOT NULL,
              net_pay REAL NOT NULL,
              total_hours_worked REAL NOT NULL,
              late_minutes INTEGER NOT NULL,
              overtime_hours REAL NOT NULL,
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS disbursements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              disbursement_no TEXT NOT NULL UNIQUE,
              payee_name TEXT NOT NULL,
              payee_type TEXT NOT NULL DEFAULT 'EMPLOYEE',
              category TEXT NOT NULL,
              amount REAL NOT NULL,
              payment_method TEXT NOT NULL DEFAULT 'CASH',
              reference_no TEXT DEFAULT '',
              date TEXT NOT NULL,
              description TEXT NOT NULL,
              approved_by TEXT DEFAULT 'HR Manager',
              status TEXT NOT NULL DEFAULT 'DISBURSED',
              notes TEXT DEFAULT '',
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS payables (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              category TEXT NOT NULL,
              vendor_payee TEXT NOT NULL,
              total_amount_due REAL NOT NULL DEFAULT 0,
              total_paid REAL NOT NULL DEFAULT 0,
              remaining_balance REAL NOT NULL DEFAULT 0,
              billing_frequency TEXT NOT NULL DEFAULT 'MONTHLY',
              due_date TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'ACTIVE',
              notes TEXT DEFAULT '',
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS payable_payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              payable_id INTEGER NOT NULL,
              disbursement_no TEXT DEFAULT '',
              payment_date TEXT NOT NULL,
              amount_paid REAL NOT NULL,
              payment_method TEXT NOT NULL DEFAULT 'CHECK',
              reference_no TEXT DEFAULT '',
              paid_by TEXT DEFAULT 'Finance Officer',
              notes TEXT DEFAULT '',
              created_at TEXT NOT NULL,
              FOREIGN KEY (payable_id) REFERENCES payables(id) ON DELETE CASCADE
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS cash_advances (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id TEXT NOT NULL,
              advances_from_birada REAL NOT NULL DEFAULT 0,
              sh_advances REAL NOT NULL DEFAULT 0,
              deduction_cutoff REAL NOT NULL DEFAULT 0,
              notes TEXT DEFAULT '',
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS other_deductions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id TEXT NOT NULL,
              forwarded_balance REAL NOT NULL DEFAULT 0,
              particular TEXT NOT NULL,
              deduction_cutoff REAL NOT NULL DEFAULT 0,
              notes TEXT DEFAULT '',
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS attendance_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id TEXT NOT NULL,
              employee_name TEXT NOT NULL,
              department_job_title TEXT NOT NULL,
              type TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              sms_status TEXT NOT NULL DEFAULT 'Pending',
              location TEXT DEFAULT 'Main Turnstile',
              status TEXT DEFAULT 'ON TIME'
            )
          `);

          try {
            await executeQuery(database, `ALTER TABLE attendance_logs ADD COLUMN status TEXT DEFAULT 'ON TIME'`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE attendance_logs ADD COLUMN latitude REAL`);
          } catch {}
          try {
            await executeQuery(database, `ALTER TABLE attendance_logs ADD COLUMN longitude REAL`);
          } catch {}

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS leave_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id TEXT NOT NULL,
              employee_name TEXT NOT NULL,
              department_job_title TEXT NOT NULL,
              leave_type TEXT NOT NULL,
              start_date TEXT NOT NULL,
              end_date TEXT NOT NULL,
              reason TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'Pending',
              approved_by TEXT,
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS overtime_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id TEXT NOT NULL,
              employee_name TEXT NOT NULL,
              department_job_title TEXT NOT NULL,
              date TEXT NOT NULL,
              hours REAL NOT NULL,
              reason TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'Pending',
              approved_by TEXT,
              created_at TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS sms_logs (
              id TEXT PRIMARY KEY,
              employee_name TEXT NOT NULL,
              phone TEXT NOT NULL,
              message TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'Sent'
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS holidays (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              holiday_date TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              holiday_type TEXT NOT NULL DEFAULT 'REGULAR_100',
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS roles (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              description TEXT
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role_id INTEGER NOT NULL,
              is_active INTEGER NOT NULL DEFAULT 1,
              force_password_change INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY (role_id) REFERENCES roles(id)
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS permissions (
              id TEXT PRIMARY KEY,
              module_name TEXT NOT NULL,
              action_name TEXT NOT NULL
            )
          `);

          await executeQuery(database, `
            CREATE TABLE IF NOT EXISTS role_permissions (
              role_id INTEGER NOT NULL,
              permission_id TEXT NOT NULL,
              PRIMARY KEY (role_id, permission_id)
            )
          `);

          const existingRoles: any[] = await selectQuery(database, "SELECT * FROM roles");
          if (existingRoles.length === 0) {
            await executeQuery(database, "INSERT INTO roles (name, description) VALUES ('Admin', 'Full System Access')");
            await executeQuery(database, "INSERT INTO roles (name, description) VALUES ('Security / Guard', 'Gate Console & Terminal Access Only')");
            await executeQuery(database, "INSERT INTO roles (name, description) VALUES ('HR Manager', 'Employee Directory & Timekeeping Logs Access')");

            const defaultPerms = [
              ["gate", "view_gate", "Access Gate Console"],
              ["directory", "manage_employees", "Manage Employee Directory"],
              ["rates", "manage_rates", "Compensation & Salary Rates"],
              ["schedules", "manage_schedules", "Work Schedules"],
              ["logs", "view_logs", "View Timekeeping Logs"],
              ["leaves", "manage_leaves", "Leave & Absence Workflow"],
              ["overtime", "manage_overtime", "Overtime Workflow"],
              ["analytics", "view_analytics", "HR Analytics & Form 48"],
              ["payroll", "manage_payroll", "Payroll & Payslips"],
              ["thirteenth", "manage_thirteenth", "13th Month & Annual Tax"],
              ["disbursements", "manage_disbursements", "Disbursements"],
              ["payables", "manage_payables", "Accounts Payables & Loans"],
              ["reports", "view_reports", "Financial & Payroll Reports"],
              ["sms", "send_sms", "SMS Broadcast Console"],
              ["users", "manage_users", "Manage Staff Users & Roles"],
              ["settings", "manage_settings", "System Settings"],
            ];

            for (const [mod, _, label] of defaultPerms) {
              await executeQuery(
                database,
                "INSERT INTO permissions (id, module_name, action_name) VALUES ($1, $2, $3) ON CONFLICT(id) DO NOTHING",
                [mod, mod, label]
              );
            }

            for (const [mod] of defaultPerms) {
              await executeQuery(database, "INSERT INTO role_permissions (role_id, permission_id) VALUES (1, $1) ON CONFLICT DO NOTHING", [mod]);
            }

            await executeQuery(database, "INSERT INTO role_permissions (role_id, permission_id) VALUES (2, 'gate') ON CONFLICT DO NOTHING");
            await executeQuery(database, "INSERT INTO role_permissions (role_id, permission_id) VALUES (3, 'directory') ON CONFLICT DO NOTHING");
            await executeQuery(database, "INSERT INTO role_permissions (role_id, permission_id) VALUES (3, 'logs') ON CONFLICT DO NOTHING");
            await executeQuery(database, "INSERT INTO role_permissions (role_id, permission_id) VALUES (3, 'schedules') ON CONFLICT DO NOTHING");
            await executeQuery(database, "INSERT INTO role_permissions (role_id, permission_id) VALUES (3, 'leaves') ON CONFLICT DO NOTHING");
            await executeQuery(database, "INSERT INTO role_permissions (role_id, permission_id) VALUES (3, 'overtime') ON CONFLICT DO NOTHING");
          }

          const existingUsers: any[] = await selectQuery(database, "SELECT * FROM users WHERE username = 'admin'");
          if (existingUsers.length === 0) {
            await executeQuery(
              database,
              "INSERT INTO users (name, username, password_hash, role_id, is_active) VALUES ('System Admin', 'admin', 'password123', 1, 1)"
            );
          }
        } // end if (database && !isPg)

        if (database) {
          await refreshData(database);
        }
      } catch (err) {
        console.error("DB init failed, using in-memory fallback:", err);
      }
    }
    init();
  }, []);

  async function refreshData(database: Database) {
    try {
      const [e, l, sch, rt, pr, ps, sms, lv, ot] = await Promise.all([
        selectQuery(database, "SELECT * FROM neugate.employees").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.attendance_logs ORDER BY id DESC LIMIT 500").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.work_schedules").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.employee_rates").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.payroll_runs ORDER BY id DESC").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.payroll_payslips ORDER BY id DESC").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.sms_logs ORDER BY id DESC LIMIT 200").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.leave_requests ORDER BY id DESC").catch(() => []),
        selectQuery(database, "SELECT * FROM neugate.overtime_requests ORDER BY id DESC").catch(() => []),
      ]);

      if (e) {
        setEmployees(e.map((r) => {
          let fpList = [];
          if (r.fingerprints) {
            try {
              fpList = typeof r.fingerprints === "string" ? JSON.parse(r.fingerprints) : r.fingerprints;
            } catch {}
          }
          let faceDesc = undefined;
          if (r.face_descriptor) {
            try {
              faceDesc = typeof r.face_descriptor === "string" ? JSON.parse(r.face_descriptor) : r.face_descriptor;
            } catch {}
          }
          return {
            id: r.id,
            name: r.name,
            departmentJobTitle: r.department_job_title,
            email: r.email ?? "",
            phone: r.phone ?? "",
            rfidTag: r.rfid_tag ?? "",
            biometricTag: r.biometric_tag ?? (fpList?.[0]?.token || ""),
            fingerprints: fpList,
            qrCode: r.qr_code ?? "",
            managerName: r.manager_name ?? "",
            managerPhone: r.manager_phone ?? "",
            emergencyContactName: r.emergency_contact_name ?? r.manager_name ?? "",
            emergencyContactPhone: r.emergency_contact_phone ?? r.manager_phone ?? "",
            photo: r.photo ?? "👤",
            faceDescriptor: faceDesc,
          };
        }));
      }

      if (l) {
        setLogs(l.map((r) => ({
          id: r.id,
          employeeId: r.employee_id || r.student_id || "",
          employeeName: r.employee_name || r.student_name || "",
          departmentJobTitle: r.department_job_title || r.grade_section || "",
          type: r.type as "IN" | "OUT",
          timestamp: r.timestamp,
          smsStatus: r.sms_status as "Sent" | "Failed" | "Pending",
          location: r.location ?? "Main Turnstile",
          status: r.status ?? "ON TIME",
        })));
      }

      if (sch) {
        setSchedules(sch.map((r) => ({
          id: r.id,
          employeeId: r.employee_id,
          dayOfWeek: r.day_of_week,
          specificDate: r.specific_date,
          shiftStart: r.shift_start,
          shiftEnd: r.shift_end,
          breakStart: r.break_start,
          breakEnd: r.break_end,
          gracePeriodMins: r.grace_period_mins,
          isRestDay: r.is_rest_day === 1,
        })));
      }

      if (rt) {
        setRates(rt.map((r) => ({
          employeeId: r.employee_id,
          salaryType: r.salary_type,
          basicSalary: r.basic_salary,
          overtimeRatePerHour: r.overtime_rate_per_hour,
          lateDeductionRatePerMin: r.late_deduction_rate_per_min,
          sssDeduction: r.sss_deduction,
          philhealthDeduction: r.philhealth_deduction,
          pagibigDeduction: r.pagibig_deduction,
          taxDeduction: r.tax_deduction,
        })));
      }

      if (pr) {
        setPayrollRuns(pr.map((r) => ({
          id: r.id,
          title: r.title,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          totalPayout: r.total_payout,
          status: r.status,
          createdAt: r.created_at,
        })));
      }

      if (ps) {
        setPayslips(ps.map((r) => ({
          id: r.id,
          payrollRunId: r.payroll_run_id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          departmentJobTitle: r.department_job_title,
          basicPay: r.basic_pay,
          overtimePay: r.overtime_pay,
          lateDeductions: r.late_deductions,
          grossPay: r.gross_pay,
          sss: r.sss,
          philhealth: r.philhealth,
          pagibig: r.pagibig,
          tax: r.tax,
          totalDeductions: r.total_deductions,
          netPay: r.net_pay,
          totalHoursWorked: r.total_hours_worked,
          lateMinutes: r.late_minutes,
          overtimeHours: r.overtime_hours,
          createdAt: r.created_at,
        })));
      }

      if (sms) {
        setSmsLogs(sms.map((r) => ({
          id: r.id,
          employeeName: r.employee_name || r.student_name || "",
          phone: r.phone,
          message: r.message,
          timestamp: r.timestamp,
          status: r.status,
        })));
      }

      if (lv) {
        setLeaveRequests(lv.map((r) => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          departmentJobTitle: r.department_job_title,
          leaveType: r.leave_type,
          startDate: r.start_date,
          endDate: r.end_date,
          reason: r.reason,
          status: r.status,
          approvedBy: r.approved_by,
          createdAt: r.created_at,
        })));
      }

      if (ot) {
        setOvertimeRequests(ot.map((r) => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          departmentJobTitle: r.department_job_title,
          date: r.date,
          hours: r.hours,
          reason: r.reason,
          status: r.status,
          approvedBy: r.approved_by,
          createdAt: r.created_at,
        })));
      }
    } catch (err) {
      console.warn("Error refreshing data from DB:", err);
    }
  }


  // Track recent scan timestamps in ref to prevent double tapping
  const lastScanMapRef = useState<Record<string, number>>(() => ({}))[0];

  // ── RFID / Biometric / QR Code Scan Handler ──────────────────────────
  const handleScan = useCallback(async (tagInput: string): Promise<{ employee: Employee | null; log: AttendanceLog }> => {
    const cleanTag = tagInput.trim();
    const employee = employees.find((e) =>
      (e.rfidTag && e.rfidTag === cleanTag) ||
      (e.biometricTag && e.biometricTag === cleanTag) ||
      (e.fingerprints && e.fingerprints.some((f) => f.token === cleanTag)) ||
      (e.qrCode && e.qrCode === cleanTag) ||
      e.id === cleanTag
    ) ?? null;
    const now = new Date();
    const nowMs = now.getTime();

    // Prevent double tapping within the configured cooldown window
    const targetKey = employee ? employee.id : cleanTag;
    const cooldownMs = (settings.scanCooldownSeconds ?? 5) * 1000;
    if (cooldownMs > 0 && lastScanMapRef[targetKey]) {
      const elapsed = nowMs - lastScanMapRef[targetKey];
      if (elapsed < cooldownMs) {
        console.warn(`[Double Tap Suppressed]: Key ${targetKey} scanned ${elapsed}ms ago (cooldown: ${cooldownMs}ms)`);
        const previousLog = logs.find((l) => l.employeeId === (employee?.id ?? "UNKNOWN")) || {
          employeeId: employee?.id ?? "UNKNOWN",
          employeeName: employee?.name ?? "Unknown Tag/QR/Fingerprint",
          departmentJobTitle: employee?.departmentJobTitle ?? "—",
          type: "IN",
          timestamp: now.toLocaleString("en-PH"),
          smsStatus: "Pending",
          location: settings.deviceLocation || "Main Turnstile",
        };
        return { employee, log: previousLog };
      }
    }
    // Update last scan timestamp
    lastScanMapRef[targetKey] = nowMs;

    const timestamp = now.toLocaleString("en-PH");

    let type: "IN" | "OUT" = "IN";
    const todayStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    const todayLogs = logs.filter((l) => l.employeeId === (employee?.id ?? cleanTag) && l.timestamp.includes(todayStr));
    if (todayLogs.length > 0 && todayLogs[0].type === "IN") {
      type = "OUT";
    }

    const status = calculateAttendanceStatus(type, now, employee?.id ?? cleanTag, schedules);

    const log: AttendanceLog = {
      employeeId: employee?.id ?? "UNKNOWN",
      employeeName: employee?.name ?? "Unknown Tag/QR/Fingerprint",
      departmentJobTitle: employee?.departmentJobTitle ?? "—",
      type,
      timestamp,
      smsStatus: employee && employee.managerPhone ? "Sent" : "Pending",
      location: settings.deviceLocation || "Main Turnstile",
      status,
    };

    try {
      if (db) {
        await executeQuery(
          db,
          "INSERT INTO neugate.attendance_logs (employee_id, employee_name, department_job_title, type, timestamp, sms_status, location, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [log.employeeId, log.employeeName, log.departmentJobTitle, log.type, log.timestamp, log.smsStatus, log.location || "Main Turnstile", status]
        );

        if (employee && employee.managerPhone) {
          const smsMsg = `Dear Manager, ${employee.name} (${employee.departmentJobTitle}) has ${type === "IN" ? "entered" : "exited"} [${settings.deviceLocation || "Main Turnstile"}] of ${settings.schoolName} at ${now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}.`;
          const smsId = `sms-${Date.now()}`;
          let smsStatus = "Pending";

          if (settings.smsGateway === "pusher") {
            try {
              const pusherPayload = JSON.stringify({
                employee_id: employee.id,
                employee_name: employee.name,
                parent_phone: employee.managerPhone,
                manager_name: employee.managerName,
                department: employee.departmentJobTitle,
                type,
                location: settings.deviceLocation || "Main Turnstile",
                timestamp: now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
                message: smsMsg,
                photo: employee.photo,
              });

              await invoke("send_pusher_event", {
                appId: settings.pusherAppId || "2059633",
                key: settings.pusherAppKey || "f7fc5747ad0f8d43f520",
                secret: settings.pusherAppSecret || "dafec1e4c71435d57595",
                cluster: settings.pusherCluster || "mt1",
                channelName: "neugate-enterprise-notifications",
                eventName: "gate-scan",
                dataJson: pusherPayload,
                host: (settings.pusherHost || "enterprise.neulify.com").trim(),
                pathPrefix: (settings.pusherPathPrefix || "/soketi").trim(),
              });
              smsStatus = "Sent";
            } catch (err: any) {
              const errMsg = typeof err === "string" ? err : err?.message || JSON.stringify(err);
              console.error("[Pusher Dispatch Error]:", errMsg);
              smsStatus = `Failed: ${errMsg}`;
            }
          } else if (settings.smsGateway === "webhook" && settings.smsWebhookUrl.trim()) {
            try {
              const res = await fetch(settings.smsWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...(settings.broadcastDriver ? { driver: settings.broadcastDriver } : {}),
                  channel_name: "neugate-enterprise-notifications",
                  event_name: "gate-scan",
                  to: employee.managerPhone,
                  message: smsMsg,
                  employee_id: employee.id,
                  employee_name: employee.name,
                  department_job_title: employee.departmentJobTitle,
                  manager_name: employee.managerName,
                  type,
                  location: settings.deviceLocation || "Main Turnstile",
                  timestamp: now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
                  photo: employee.photo,
                }),
              });
              smsStatus = res.ok ? "Sent" : "Failed";
            } catch {
              smsStatus = "Failed";
            }
          } else if (settings.smsGateway === "semaphore" && settings.semaphoreApiKey.trim()) {
            try {
              const params = new URLSearchParams();
              params.append("apikey", settings.semaphoreApiKey.trim());
              params.append("number", employee.managerPhone);
              params.append("message", smsMsg);
              if (settings.semaphoreSenderName.trim()) {
                params.append("sendername", settings.semaphoreSenderName.trim());
              }
              const res = await fetch("https://api.semaphore.co/api/v4/messages", {
                method: "POST",
                body: params,
              });
              const data = await res.json();
              smsStatus = (res.ok && Array.isArray(data)) ? "Sent" : "Failed";
            } catch {
              smsStatus = "Failed";
            }
          } else if (settings.smsGateway === "unisms" && settings.unismsApiKey.trim()) {
            try {
              const res = await invoke<string>("send_unisms_sms", {
                apiKey: settings.unismsApiKey.trim(),
                recipient: employee.managerPhone,
                content: smsMsg,
                senderId: settings.unismsSenderName.trim() || null,
              });
              console.log("[UniSMS Dispatch Success]:", res);
              smsStatus = "Sent";
            } catch (err: any) {
              const errorText = typeof err === "string" ? err : err?.message || JSON.stringify(err);
              console.error("[UniSMS Dispatch Error]:", errorText);
              smsStatus = `Failed: ${errorText}`;
            }
          } else if (settings.smsGateway === "philsms" && settings.philsmsToken.trim()) {
            try {
              const res = await fetch("https://app.philsms.com/api/v3/sms/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  token: settings.philsmsToken.trim(),
                  to: employee.managerPhone,
                  message: smsMsg,
                  from: settings.philsmsSenderName.trim() || undefined,
                }),
              });
              smsStatus = res.ok ? "Sent" : "Failed";
            } catch {
              smsStatus = "Failed";
            }
          } else if (settings.smsGateway === "mobile_gateway" && settings.mobileGatewayIp.trim()) {
            try {
              const url = `http://${settings.mobileGatewayIp.trim()}:${settings.mobileGatewayPort.trim() || "8080"}/send`;
              const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: employee.managerPhone,
                  message: smsMsg,
                }),
              });
              smsStatus = res.ok ? "Sent" : "Failed";
            } catch {
              smsStatus = "Failed";
            }
          }

          if (db) {
            await executeQuery(
              db,
              "INSERT INTO neugate.sms_logs (id, employee_name, phone, message, timestamp, status) VALUES ($1, $2, $3, $4, $5, $6)",
              [smsId, employee.name, employee.managerPhone, smsMsg, timestamp, smsStatus]
            );
          } else {
            setSmsLogs((prev) => [{
              id: smsId,
              employeeName: employee.name,
              phone: employee.managerPhone,
              message: smsMsg,
              timestamp,
              status: smsStatus as "Sent" | "Failed" | "Pending",
            }, ...prev]);
          }
        }

        sendWebhookEvent("gate.rfid_tapped", {
          employee_id: log.employeeId,
          employee_name: log.employeeName,
          department_job_title: log.departmentJobTitle,
          type: log.type,
          timestamp: log.timestamp,
          location: log.location,
          manager_name: employee?.managerName,
          manager_phone: employee?.managerPhone,
        });

        await refreshData(db);
      } else {
        setLogs((prev) => [log, ...prev]);
        sendWebhookEvent("gate.rfid_tapped", {
          employee_id: log.employeeId,
          employee_name: log.employeeName,
          department_job_title: log.departmentJobTitle,
          type: log.type,
          timestamp: log.timestamp,
          location: log.location,
          manager_name: employee?.managerName,
          manager_phone: employee?.managerPhone,
        });
      }
    } catch (err) {
      console.error("Scan log failed:", err);
    }

    return { employee, log };
  }, [employees, logs, db, settings]);

  // ── Employee CRUD ─────────────────────────────────────────
  const handleAddEmployee = async (employee: Employee) => {
    try {
      const bioTag = employee.biometricTag || employee.fingerprints?.[0]?.token || null;
      const fingerprintsJson = JSON.stringify(employee.fingerprints || []);
      const faceDescJson = JSON.stringify(employee.faceDescriptor || []);
      if (db) {
        await executeQuery(
          db,
          "INSERT INTO neugate.employees (id, name, department_job_title, rfid_tag, biometric_tag, fingerprints, qr_code, manager_name, manager_phone, photo, email, phone, face_descriptor, emergency_contact_name, emergency_contact_phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
          [employee.id, employee.name, employee.departmentJobTitle, employee.rfidTag || null, bioTag, fingerprintsJson, employee.qrCode || null, employee.managerName, employee.managerPhone, employee.photo, employee.email || null, employee.phone || null, faceDescJson, employee.emergencyContactName || null, employee.emergencyContactPhone || null]
        );
        sendWebhookEvent("employee.created", employee);
        await refreshData(db);
      } else {
        setEmployees((prev) => [...prev, employee]);
        sendWebhookEvent("employee.created", employee);
      }
    } catch (err) {
      console.error("Failed to add employee:", err);
      toast.error("Registration failed. This RFID tag, QR code, or biometric ID may already be registered.", "Registration Error");
    }
  };

  const handleUpdateEmployee = async (employee: Employee) => {
    try {
      const bioTag = employee.biometricTag || employee.fingerprints?.[0]?.token || null;
      const fingerprintsJson = JSON.stringify(employee.fingerprints || []);
      const faceDescJson = JSON.stringify(employee.faceDescriptor || []);
      if (db) {
        await executeQuery(
          db,
          "UPDATE neugate.employees SET name = $1, department_job_title = $2, rfid_tag = $3, biometric_tag = $4, fingerprints = $5, qr_code = $6, manager_name = $7, manager_phone = $8, photo = $9, email = $10, phone = $11, face_descriptor = $12, emergency_contact_name = $13, emergency_contact_phone = $14 WHERE id = $15",
          [employee.name, employee.departmentJobTitle, employee.rfidTag || null, bioTag, fingerprintsJson, employee.qrCode || null, employee.managerName, employee.managerPhone, employee.photo, employee.email || null, employee.phone || null, faceDescJson, employee.emergencyContactName || null, employee.emergencyContactPhone || null, employee.id]
        );
        sendWebhookEvent("employee.updated", employee);
        await refreshData(db);
      } else {
        setEmployees((prev) => prev.map((e) => (e.id === employee.id ? employee : e)));
        sendWebhookEvent("employee.updated", employee);
      }
    } catch (err) {
      console.error("Failed to update employee:", err);
      toast.error("Update failed. The RFID tag, QR code, or biometric ID may already be registered to another employee.", "Update Error");
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    try {
      const target = employees.find((e) => e.id === id);
      if (db) {
        await executeQuery(db, "DELETE FROM neugate.employees WHERE id = $1", [id]);
        sendWebhookEvent("employee.deleted", { employee_id: id, employee_name: target?.name });
        await refreshData(db);
      } else {
        setEmployees((prev) => prev.filter((e) => e.id !== id));
        sendWebhookEvent("employee.deleted", { employee_id: id, employee_name: target?.name });
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // ── SMS Log Deletion ─────────────────────────────────────
  const handleDeleteSmsLog = async (id: string) => {
    try {
      if (db) {
        await executeQuery(db, "DELETE FROM neugate.sms_logs WHERE id = $1", [id]);
        await refreshData(db);
      } else {
        setSmsLogs((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error("Delete SMS log failed:", err);
    }
  };

  const handleClearAllSmsLogs = async () => {
    if (!confirm("Are you sure you want to clear ALL SMS logs? This action cannot be undone.")) return;
    try {
      if (db) {
        await executeQuery(db, "DELETE FROM neugate.sms_logs");
        await refreshData(db);
      } else {
        setSmsLogs([]);
      }
    } catch (err) {
      console.error("Clear all SMS logs failed:", err);
    }
  };

  // ── Settings Save ────────────────────────────────────────
  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("neugate_school_name",    newSettings.schoolName);
    localStorage.setItem("neugate_school_tagline", newSettings.schoolTagline);
    localStorage.setItem("neugate_theme_color",    newSettings.themeColor);
    localStorage.setItem("neugate_show_simulator", String(newSettings.showSimulator));
    localStorage.setItem("neugate_sms_gateway",    newSettings.smsGateway);
    localStorage.setItem("neugate_broadcast_driver", newSettings.broadcastDriver || "");
    localStorage.setItem("neugate_pusher_app_id",   newSettings.pusherAppId || "");
    localStorage.setItem("neugate_pusher_app_key",  newSettings.pusherAppKey || "");
    localStorage.setItem("neugate_pusher_app_secret", newSettings.pusherAppSecret || "");
    localStorage.setItem("neugate_pusher_cluster", newSettings.pusherCluster || "");
    localStorage.setItem("neugate_sms_webhook",    newSettings.smsWebhookUrl);
    localStorage.setItem("neugate_semaphore_api_key", newSettings.semaphoreApiKey);
    localStorage.setItem("neugate_semaphore_sender_name", newSettings.semaphoreSenderName);
    localStorage.setItem("neugate_unisms_api_key", newSettings.unismsApiKey);
    localStorage.setItem("neugate_unisms_sender_name", newSettings.unismsSenderName);
    localStorage.setItem("neugate_philsms_token",  newSettings.philsmsToken);
    localStorage.setItem("neugate_philsms_sender_name", newSettings.philsmsSenderName);
    localStorage.setItem("neugate_mobile_gateway_ip",   newSettings.mobileGatewayIp);
    localStorage.setItem("neugate_mobile_gateway_port", newSettings.mobileGatewayPort);
    localStorage.setItem("neugate_device_location", newSettings.deviceLocation);
    localStorage.setItem("neugate_theme_mode",     newSettings.themeMode);
    localStorage.setItem("neugate_school_logo",    newSettings.schoolLogo);
    localStorage.setItem("neugate_gate_background", newSettings.gateBackground);
    localStorage.setItem("neugate_scan_cooldown",   String(newSettings.scanCooldownSeconds ?? 5));
    localStorage.setItem("neugate_enable_birada_advances", String(newSettings.enableBiradaAdvances ?? false));
    localStorage.setItem("neugate_enable_sh_advances", String(newSettings.enableShAdvances ?? true));
    applyTheme(newSettings.themeColor);
    applyThemeMode(newSettings.themeMode);
  };

  // ── Leave Request Handlers ──────────────────────────────
  const handleAddLeaveRequest = async (req: Omit<LeaveRequest, "id" | "createdAt">) => {
    const createdAt = new Date().toLocaleString("en-PH");
    if (db) {
      await executeQuery(
        db,
        "INSERT INTO neugate.leave_requests (employee_id, employee_name, department_job_title, leave_type, start_date, end_date, reason, status, approved_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [req.employeeId, req.employeeName, req.departmentJobTitle, req.leaveType, req.startDate, req.endDate, req.reason, req.status, req.approvedBy || null, createdAt]
      );
      await refreshData(db);
    } else {
      setLeaveRequests((prev) => [{ ...req, id: Date.now(), createdAt }, ...prev]);
    }
  };

  const handleUpdateLeaveStatus = async (id: number, status: "Approved" | "Rejected", approvedBy: string) => {
    if (db) {
      await executeQuery(db, "UPDATE neugate.leave_requests SET status = $1, approved_by = $2 WHERE id = $3", [status, approvedBy, id]);
      await refreshData(db);
    } else {
      setLeaveRequests((prev) => prev.map((l) => (l.id === id ? { ...l, status, approvedBy } : l)));
    }
  };

  // ── Overtime Request Handlers ───────────────────────────
  const handleAddOvertimeRequest = async (req: Omit<OvertimeRequest, "id" | "createdAt">) => {
    const createdAt = new Date().toLocaleString("en-PH");
    if (db) {
      await executeQuery(
        db,
        "INSERT INTO neugate.overtime_requests (employee_id, employee_name, department_job_title, date, hours, reason, status, approved_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [req.employeeId, req.employeeName, req.departmentJobTitle, req.date, req.hours, req.reason, req.status, req.approvedBy || null, createdAt]
      );
      await refreshData(db);
    } else {
      setOvertimeRequests((prev) => [{ ...req, id: Date.now(), createdAt }, ...prev]);
    }
  };

  const handleUpdateOvertimeStatus = async (id: number, status: "Approved" | "Rejected", approvedBy: string) => {
    if (db) {
      await executeQuery(db, "UPDATE neugate.overtime_requests SET status = $1, approved_by = $2 WHERE id = $3", [status, approvedBy, id]);
      await refreshData(db);
    } else {
      setOvertimeRequests((prev) => prev.map((o) => (o.id === id ? { ...o, status, approvedBy } : o)));
    }
  };

  // ── Manual Attendance Log Handler ────────────────────────
  const handleAddManualLog = async (log: Omit<AttendanceLog, "id">) => {
    if (db) {
      await executeQuery(
        db,
        "INSERT INTO neugate.attendance_logs (employee_id, employee_name, department_job_title, type, timestamp, sms_status, location, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [log.employeeId, log.employeeName, log.departmentJobTitle, log.type, log.timestamp, log.smsStatus, log.location || "Manual Entry", log.status || "ON TIME"]
      );
      await refreshData(db);
    } else {
      setLogs((prev) => [{ ...log, id: Date.now() }, ...prev]);
    }
  };

  const handleAddBranch = async (branch: BranchLocation) => {
    setBranches((prev) => [...prev, branch]);
  };

  const handleToggleBranch = async (id: string, active: boolean) => {
    setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, isActive: active } : b)));
  };

  const [showLogin, setShowLogin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const todayStr = (() => {
    const n = new Date();
    return `${n.getMonth() + 1}/${n.getDate()}/${n.getFullYear()}`;
  })();
  const todayLogs = logs.filter((l) => l.timestamp.includes(todayStr));

  if (checkingLicense) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--text-muted)"
      }}>
        Checking workspace license...
      </div>
    );
  }

  if (!isLicenseValid) {
    return (
      <ActivationScreen onActivated={() => setIsLicenseValid(true)} />
    );
  }

  return (
    <AuthProvider>
      <MainAppContent
        db={db}
        employees={employees}
        logs={logs}
        smsLogs={smsLogs}
        settings={settings}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showLogin={showLogin}
        setShowLogin={setShowLogin}
        showChangePassword={showChangePassword}
        setShowChangePassword={setShowChangePassword}
        isKioskMode={isKioskMode}
        toggleKioskMode={toggleKioskMode}
        handleScan={handleScan}
        handleAddEmployee={handleAddEmployee}
        handleUpdateEmployee={handleUpdateEmployee}
        handleDeleteEmployee={handleDeleteEmployee}
        handleDeleteSmsLog={handleDeleteSmsLog}
        handleClearAllSmsLogs={handleClearAllSmsLogs}
        handleSaveSettings={handleSaveSettings}
        todayLogs={todayLogs}
        schedules={schedules}
        rates={rates}
        payrollRuns={payrollRuns}
        payslips={payslips}
        leaveRequests={leaveRequests}
        overtimeRequests={overtimeRequests}
        handleAddLeaveRequest={handleAddLeaveRequest}
        handleUpdateLeaveStatus={handleUpdateLeaveStatus}
        handleAddOvertimeRequest={handleAddOvertimeRequest}
        handleUpdateOvertimeStatus={handleUpdateOvertimeStatus}
        handleAddManualLog={handleAddManualLog}
        branches={branches}
        onAddBranch={handleAddBranch}
        onToggleBranch={handleToggleBranch}
        onRefreshSchedules={() => db && refreshData(db)}
        onRefreshData={() => db && refreshData(db)}
      />
    </AuthProvider>
  );
}

export default App;


