-- ==============================================================================
-- PostgreSQL Schema Isolation Setup for NeuGate Enterprise Database
-- Schema: `neugate` - Access Control, Timekeeping, Payroll, Disbursements & HR Analytics
-- ==============================================================================

-- 1. Create Isolated Schema
CREATE SCHEMA IF NOT EXISTS neugate;

-- Set default search path for NeuGate connections
SET search_path TO neugate, public;

-- ==============================================================================
-- NEUGATE ENTERPRISE TABLES
-- ==============================================================================

-- 1. Employees / Staff Directory
CREATE TABLE IF NOT EXISTS neugate.employees (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    department_job_title VARCHAR(255) NOT NULL,
    email TEXT,
    phone TEXT,
    rfid_tag VARCHAR(128),
    biometric_tag VARCHAR(128),
    fingerprints TEXT,
    qr_code VARCHAR(128),
    manager_name VARCHAR(255),
    manager_phone VARCHAR(64),
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    photo TEXT,
    face_descriptor TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1.1 Branch Locations & Geofence Boundaries
CREATE TABLE IF NOT EXISTS neugate.branch_locations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 6) NOT NULL,
    longitude NUMERIC(10, 6) NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 300,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1.2 Official Philippine & Company Holidays
CREATE TABLE IF NOT EXISTS neugate.holidays (
    id SERIAL PRIMARY KEY,
    holiday_date VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    holiday_type VARCHAR(64) NOT NULL DEFAULT 'REGULAR_100',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Work Schedules & Shift Roster
CREATE TABLE IF NOT EXISTS neugate.work_schedules (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    day_of_week INTEGER,
    specific_date VARCHAR(64),
    shift_start VARCHAR(16) NOT NULL DEFAULT '08:00',
    shift_end VARCHAR(16) NOT NULL DEFAULT '17:00',
    break_start VARCHAR(16) NOT NULL DEFAULT '12:00',
    break_end VARCHAR(16) NOT NULL DEFAULT '13:00',
    grace_period_mins INTEGER NOT NULL DEFAULT 15,
    is_rest_day INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Employee Compensation & Statutory Rates
CREATE TABLE IF NOT EXISTS neugate.employee_rates (
    employee_id VARCHAR(64) PRIMARY KEY,
    salary_type VARCHAR(32) NOT NULL DEFAULT 'MONTHLY',
    basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 25000,
    overtime_rate_per_hour NUMERIC(10, 2) NOT NULL DEFAULT 180,
    late_deduction_rate_per_min NUMERIC(10, 2) NOT NULL DEFAULT 2,
    sss_deduction NUMERIC(10, 2) NOT NULL DEFAULT 1125,
    sss_employer_share NUMERIC(10, 2),
    sss_employee_share NUMERIC(10, 2),
    philhealth_deduction NUMERIC(10, 2) NOT NULL DEFAULT 450,
    pagibig_deduction NUMERIC(10, 2) NOT NULL DEFAULT 200,
    tax_deduction NUMERIC(10, 2) NOT NULL DEFAULT 1200,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Payroll Runs / Cut-Off Payout Summaries
CREATE TABLE IF NOT EXISTS neugate.payroll_runs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    period_start VARCHAR(64) NOT NULL,
    period_end VARCHAR(64) NOT NULL,
    total_payout NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status VARCHAR(64) NOT NULL DEFAULT 'Approved',
    created_at VARCHAR(128) NOT NULL
);

-- 5. Individual Itemized Payslips
CREATE TABLE IF NOT EXISTS neugate.payroll_payslips (
    id SERIAL PRIMARY KEY,
    payroll_run_id INTEGER NOT NULL REFERENCES neugate.payroll_runs(id) ON DELETE CASCADE,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    department_job_title VARCHAR(255) NOT NULL,
    per_day NUMERIC(12, 2),
    per_hour NUMERIC(12, 2),
    no_days NUMERIC(10, 2),
    overtime_hours NUMERIC(10, 2) NOT NULL,
    holiday100_count NUMERIC(10, 2),
    holiday30_count NUMERIC(10, 2),
    undertime_hours NUMERIC(10, 2),
    night_diff_hours NUMERIC(10, 2),
    late_minutes INTEGER NOT NULL,
    basic_pay NUMERIC(12, 2) NOT NULL,
    overtime_pay NUMERIC(12, 2) NOT NULL,
    holiday100_pay NUMERIC(12, 2),
    holiday30_pay NUMERIC(12, 2),
    night_diff_pay NUMERIC(12, 2),
    total_salary NUMERIC(12, 2),
    undertime_deductions NUMERIC(12, 2),
    late_deductions NUMERIC(12, 2) NOT NULL,
    gross_pay NUMERIC(12, 2) NOT NULL,
    total_net_before_deductions NUMERIC(12, 2),
    sss_employer_share NUMERIC(10, 2),
    sss_employee_share NUMERIC(10, 2),
    cash_advance_deductions NUMERIC(12, 2),
    sss NUMERIC(10, 2) NOT NULL,
    philhealth NUMERIC(10, 2) NOT NULL,
    pagibig NUMERIC(10, 2) NOT NULL,
    tax NUMERIC(10, 2) NOT NULL,
    other_deductions NUMERIC(12, 2),
    sss_cash_return NUMERIC(12, 2),
    total_deductions NUMERIC(12, 2) NOT NULL,
    net_pay NUMERIC(12, 2) NOT NULL,
    total_hours_worked NUMERIC(10, 2) NOT NULL,
    created_at VARCHAR(128) NOT NULL
);

-- 6. Financial Disbursements & Vouchers
CREATE TABLE IF NOT EXISTS neugate.disbursements (
    id SERIAL PRIMARY KEY,
    disbursement_no VARCHAR(64) NOT NULL UNIQUE,
    payee_name VARCHAR(255) NOT NULL,
    payee_type VARCHAR(64) NOT NULL DEFAULT 'EMPLOYEE',
    category VARCHAR(128) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    payment_method VARCHAR(64) NOT NULL DEFAULT 'CASH',
    reference_no VARCHAR(128) DEFAULT '',
    date VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    approved_by VARCHAR(255) DEFAULT 'HR Manager',
    status VARCHAR(64) NOT NULL DEFAULT 'DISBURSED',
    notes TEXT DEFAULT '',
    created_at VARCHAR(128) NOT NULL
);

-- 7. Accounts Payables Register
CREATE TABLE IF NOT EXISTS neugate.payables (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(128) NOT NULL,
    vendor_payee VARCHAR(255) NOT NULL,
    total_amount_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
    billing_frequency VARCHAR(64) NOT NULL DEFAULT 'MONTHLY',
    due_date VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
    notes TEXT DEFAULT '',
    created_at VARCHAR(128) NOT NULL
);

-- 8. Accounts Payable Payment Logs
CREATE TABLE IF NOT EXISTS neugate.payable_payments (
    id SERIAL PRIMARY KEY,
    payable_id INTEGER NOT NULL REFERENCES neugate.payables(id) ON DELETE CASCADE,
    disbursement_no VARCHAR(64) DEFAULT '',
    payment_date VARCHAR(64) NOT NULL,
    amount_paid NUMERIC(14, 2) NOT NULL,
    payment_method VARCHAR(64) NOT NULL DEFAULT 'CHECK',
    reference_no VARCHAR(128) DEFAULT '',
    paid_by VARCHAR(255) DEFAULT 'Finance Officer',
    notes TEXT DEFAULT '',
    created_at VARCHAR(128) NOT NULL
);

-- 9. Cash Advances Monitor
CREATE TABLE IF NOT EXISTS neugate.cash_advances (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    advances_from_birada NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sh_advances NUMERIC(12, 2) NOT NULL DEFAULT 0,
    deduction_cutoff NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at VARCHAR(128) NOT NULL
);

-- 10. Other Deductions Console
CREATE TABLE IF NOT EXISTS neugate.other_deductions (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    forwarded_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    particular VARCHAR(255) NOT NULL,
    deduction_cutoff NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at VARCHAR(128) NOT NULL
);

-- 11. Gate Entry & Exit Attendance Audit Logs
CREATE TABLE IF NOT EXISTS neugate.attendance_logs (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    department_job_title VARCHAR(255) NOT NULL,
    type VARCHAR(16) NOT NULL,
    timestamp VARCHAR(128) NOT NULL,
    sms_status VARCHAR(64) NOT NULL DEFAULT 'Pending',
    location VARCHAR(255) DEFAULT 'Main Turnstile',
    status VARCHAR(64) DEFAULT 'ON TIME',
    latitude NUMERIC(10, 6),
    longitude NUMERIC(10, 6)
);

-- 12. Employee Leave Requests
CREATE TABLE IF NOT EXISTS neugate.leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    department_job_title VARCHAR(255) NOT NULL,
    leave_type VARCHAR(128) NOT NULL,
    start_date VARCHAR(64) NOT NULL,
    end_date VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'Pending',
    approved_by VARCHAR(255),
    created_at VARCHAR(128) NOT NULL
);

-- 13. Employee Overtime Requests
CREATE TABLE IF NOT EXISTS neugate.overtime_requests (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    department_job_title VARCHAR(255) NOT NULL,
    date VARCHAR(64) NOT NULL,
    hours NUMERIC(10, 2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'Pending',
    approved_by VARCHAR(255),
    created_at VARCHAR(128) NOT NULL
);

-- 14. SMS Broadcast Logs
CREATE TABLE IF NOT EXISTS neugate.sms_logs (
    id VARCHAR(128) PRIMARY KEY,
    employee_name VARCHAR(255) NOT NULL,
    phone VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    timestamp VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'Sent'
);

-- 15. Roles Management
CREATE TABLE IF NOT EXISTS neugate.roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Staff User Accounts
CREATE TABLE IF NOT EXISTS neugate.users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER NOT NULL REFERENCES neugate.roles(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    force_password_change INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. System Module Permissions
CREATE TABLE IF NOT EXISTS neugate.permissions (
    id VARCHAR(128) PRIMARY KEY,
    module_name VARCHAR(128) NOT NULL,
    action_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. Role Permissions Junction Table
CREATE TABLE IF NOT EXISTS neugate.role_permissions (
    role_id INTEGER NOT NULL REFERENCES neugate.roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(128) NOT NULL REFERENCES neugate.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ==============================================================================
-- SEED DATA SETUP
-- ==============================================================================

-- Seed Default System Roles
INSERT INTO neugate.roles (id, name, description)
VALUES 
    (1, 'Admin', 'Full System Access'),
    (2, 'Security / Guard', 'Gate Console & Terminal Access Only'),
    (3, 'HR Manager', 'Employee Directory & Timekeeping Logs Access')
ON CONFLICT (id) DO NOTHING;

-- Seed Default Module Permissions
INSERT INTO neugate.permissions (id, module_name, action_name) VALUES
    ('gate', 'gate', 'Access Gate Console'),
    ('directory', 'directory', 'Manage Employee Directory'),
    ('rates', 'rates', 'Compensation & Salary Rates'),
    ('schedules', 'schedules', 'Work Schedules'),
    ('logs', 'logs', 'View Timekeeping Logs'),
    ('leaves', 'leaves', 'Leave & Absence Workflow'),
    ('overtime', 'overtime', 'Overtime Workflow'),
    ('analytics', 'analytics', 'HR Analytics & Form 48'),
    ('payroll', 'payroll', 'Payroll & Payslips'),
    ('thirteenth', 'thirteenth', '13th Month & Annual Tax'),
    ('disbursements', 'disbursements', 'Disbursements'),
    ('payables', 'payables', 'Accounts Payables & Loans'),
    ('reports', 'reports', 'Financial & Payroll Reports'),
    ('sms', 'sms', 'SMS Broadcast Console'),
    ('users', 'users', 'Manage Staff Users & Roles'),
    ('settings', 'settings', 'System Settings')
ON CONFLICT (id) DO UPDATE SET module_name = EXCLUDED.module_name, action_name = EXCLUDED.action_name;

-- Seed Admin Role Permissions
INSERT INTO neugate.role_permissions (role_id, permission_id) VALUES
    (1, 'gate'), (1, 'directory'), (1, 'rates'), (1, 'schedules'), (1, 'logs'), 
    (1, 'leaves'), (1, 'overtime'), (1, 'analytics'), (1, 'payroll'), (1, 'thirteenth'), 
    (1, 'disbursements'), (1, 'payables'), (1, 'reports'), (1, 'sms'), (1, 'users'), (1, 'settings')
ON CONFLICT DO NOTHING;

-- Seed Guard Role Permissions
INSERT INTO neugate.role_permissions (role_id, permission_id) VALUES
    (2, 'gate')
ON CONFLICT DO NOTHING;

-- Seed HR Manager Role Permissions
INSERT INTO neugate.role_permissions (role_id, permission_id) VALUES
    (3, 'directory'), (3, 'schedules'), (3, 'logs'), (3, 'leaves'), (3, 'overtime'), (3, 'analytics')
ON CONFLICT DO NOTHING;

-- Seed Default System Administrator User Account (admin / password123)
INSERT INTO neugate.users (name, username, password_hash, role_id, is_active)
VALUES 
    ('System Admin', 'admin', 'password123', 1, 1)
ON CONFLICT (username) DO NOTHING;
