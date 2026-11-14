export interface EmployeeFingerprint {
  finger: string; // e.g. "Right Thumb", "Right Index", "Left Thumb", etc.
  token: string;
  image?: string; // Base64 encoded image string (data:image/png;base64,...)
}

export interface Employee {
  id: string; // e.g. "EMP-1001"
  name: string;
  departmentJobTitle: string; // e.g. "Operations - Logistics Lead"
  email?: string; // Employee Email Address
  phone?: string; // Employee Phone / Contact Number
  rfidTag?: string; // RFID Tag card number (Optional if Fingerprint enrolled)
  biometricTag?: string; // Primary USB HID Fingerprint Token ID (for backwards compatibility)
  fingerprints?: EmployeeFingerprint[]; // Multi-fingerprint registry (up to 10 fingers)
  qrCode?: string; // QR Code string / token
  managerName: string; // Direct Leader / Manager Name
  managerPhone: string; // Direct Leader / Manager Phone Number
  emergencyContactName?: string; // Emergency Contact Name
  emergencyContactPhone?: string; // Emergency Contact Phone / Mobile Number
  photo: string; // Base64 image data or emoji / placeholder
  faceDescriptor?: number[]; // AI Facial Recognition feature vector
}

export interface BranchLocation {
  id: string;
  name: string;
  address: string;
  city?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // e.g. 150 meters radius allowed
  isActive: boolean;
}

export type AttendanceStatus = "ON TIME" | "LATE" | "OVERTIME" | "OVER BREAK" | "EARLY DEPARTURE" | "REST DAY SCAN";

export interface AttendanceLog {
  id?: number;
  employeeId: string;
  employeeName: string;
  departmentJobTitle: string;
  type: "IN" | "OUT";
  timestamp: string; // date time locale string
  smsStatus: "Sent" | "Failed" | "Pending";
  location?: string; // e.g. "Main Turnstile", "Subic Sub-Depot (GPS)"
  status?: AttendanceStatus;
  latitude?: number;
  longitude?: number;
}

export interface WorkSchedule {
  id?: number;
  employeeId: string; // Employee ID or 'DEFAULT'
  dayOfWeek?: number | null; // 0=Sunday..6=Saturday or null for specific date
  specificDate?: string | null; // 'YYYY-MM-DD'
  shiftStart: string; // e.g. "08:00"
  shiftEnd: string; // e.g. "17:00"
  breakStart: string; // e.g. "12:00"
  breakEnd: string; // e.g. "13:00"
  gracePeriodMins: number; // default 15
  isRestDay: boolean;
}

export interface SMSLog {
  id: string;
  employeeName: string;
  phone: string;
  message: string;
  timestamp: string;
  status: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role_id: string;
  is_active: boolean;
  force_password_change?: boolean;
  password_hash?: string;
  created_at?: string;
  updated_at?: string;
  permissions?: string[];
  geofence_enabled?: boolean;
  allowed_latitude?: number | null;
  allowed_longitude?: number | null;
  allowed_radius_meters?: number | null;
  geofence_label?: string | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeRate {
  employeeId: string;
  salaryType: "MONTHLY" | "DAILY" | "HOURLY";
  basicSalary: number; // e.g. 25000 (Monthly) or 600 (Daily) or 100 (Hourly)
  overtimeRatePerHour: number; // e.g. 150
  lateDeductionRatePerMin: number; // e.g. 2
  sssDeduction: number; // e.g. 1125
  sssEmployerShare?: number; // SSS Employer Share
  sssEmployeeShare?: number; // SSS Employee Share
  philhealthDeduction: number; // e.g. 450
  pagibigDeduction: number; // e.g. 200
  taxDeduction: number; // withholding tax
}

export interface PayrollRun {
  id?: number;
  title: string; // e.g. "September 1-15, 2026 Payroll Cut-off"
  periodStart: string; // "YYYY-MM-DD"
  periodEnd: string; // "YYYY-MM-DD"
  totalPayout: number;
  status: "Draft" | "Approved" | "Paid";
  createdAt: string;
}

export interface PayrollPayslip {
  id?: number;
  payrollRunId: number;
  employeeId: string;
  employeeName: string;
  departmentJobTitle: string;
  perDay?: number;
  perHour?: number;
  noDays?: number;
  overtimeHours: number;
  holiday100Count?: number;
  holiday30Count?: number;
  undertimeHours?: number;
  nightDiffHours?: number;
  lateMinutes: number;

  basicPay: number;
  overtimePay: number;
  holiday100Pay?: number;
  holiday30Pay?: number;
  nightDiffPay?: number;
  totalSalary?: number;
  undertimeDeductions?: number;
  lateDeductions: number;
  grossPay: number;
  totalNetBeforeDeductions?: number;

  sssEmployerShare?: number;
  sssEmployeeShare?: number;
  cashAdvanceDeductions?: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  tax: number;
  otherDeductions?: number;
  sssCashReturn?: number;
  totalDeductions: number;
  netPay: number;
  totalHoursWorked: number;
  createdAt: string;
}

export interface CashAdvanceRecord {
  id?: number;
  employeeId: string;
  employeeName?: string;
  departmentJobTitle?: string;
  advancesFromBirada: number;
  shAdvances: number;
  totalCa?: number;
  deductionCutoff: number; // deduction applied for period
  notes?: string; // e.g. "ADD 300 CA 6/24/2026"
  createdAt?: string;
}

export interface OtherDeductionRecord {
  id?: number;
  employeeId: string;
  employeeName?: string;
  departmentJobTitle?: string;
  forwardedBalance: number;
  particular: string; // e.g. "DAMAGE", "LICENSE", "LANDING GEAR"
  deductionCutoff: number; // deduction applied for period
  notes?: string; // e.g. "damage gas5314 ball mirror 2,475 7/31/2026"
  createdAt?: string;
}

export type DisbursementCategory =
  | "SALARIES & WAGES"
  | "PAYROLL"
  | "CASH ADVANCE"
  | "PETTY CASH"
  | "PETTY CASH & OPERATIONAL"
  | "OPERATIONAL EXPENSE"
  | "SUPPLIER / VENDOR PAYMENT"
  | "UTILITIES & POWER"
  | "UTILITIES & RENT"
  | "RENT & LEASE"
  | "REPAIRS & MAINTENANCE"
  | "TAXES & LICENSES"
  | "GOVERNMENT REMITTANCE (SSS/PH/PAGIBIG)"
  | "OTHER DISBURSEMENT";

export interface Disbursement {
  id?: number;
  disbursementNo: string; // Voucher / Reference No. e.g. "DISB-2026-001"
  payeeName: string; // Employee, Vendor, Supplier, or Recipient Name
  payeeType: "EMPLOYEE" | "VENDOR" | "GOVERNMENT" | "UTILITY" | "OTHER";
  category: DisbursementCategory;
  amount: number;
  paymentMethod: "CASH" | "CHECK" | "BANK TRANSFER" | "GCASH/MAYA";
  referenceNo?: string; // Check No / Bank Trans Ref / GCash Ref
  date: string; // YYYY-MM-DD
  description: string;
  approvedBy?: string;
  status: "PENDING" | "APPROVED" | "DISBURSED" | "VOIDED";
  notes?: string;
  createdAt: string;
}
export interface Payable {
  id?: number;
  title: string; // e.g., "Office Building Lease - HQ", "Bank Equipment Loan #489"
  category: "RENT & LEASE" | "LOAN & AMORTIZATION" | "UTILITIES" | "SUPPLIER CREDIT" | "EQUIPMENT LEASE" | "GOVERNMENT TAX & DUES" | "OTHER RECURRING";
  vendorPayee: string; // Landlord, Bank Name, Supplier
  totalAmountDue: number; // Total Loan Amount or Periodic Contract Amount
  totalPaid: number; // Sum of payments made so far
  remainingBalance: number; // totalAmountDue - totalPaid
  billingFrequency: "MONTHLY" | "BI-WEEKLY" | "QUARTERLY" | "SEMI-ANNUAL" | "ANNUAL" | "ONE-TIME";
  dueDate: string; // Next due date (YYYY-MM-DD)
  status: "ACTIVE" | "FULLY PAID" | "OVERDUE" | "PAUSED";
  notes?: string;
  createdAt: string;
}

export interface PayablePayment {
  id?: number;
  payableId: number;
  disbursementNo?: string; // Links to disbursement voucher if logged
  paymentDate: string; // YYYY-MM-DD
  amountPaid: number;
  paymentMethod: "CASH" | "CHECK" | "BANK TRANSFER" | "GCASH/MAYA";
  referenceNo?: string;
  paidBy?: string;
  notes?: string;
  createdAt: string;
}

export interface Permission {
  id: string;
  module_name: string;
  action_name: string;
}

export interface LeaveRequest {
  id?: number;
  employeeId: string;
  employeeName: string;
  departmentJobTitle: string;
  leaveType: "Sick Leave" | "Vacation Leave" | "Emergency Leave" | "Official Business (OB)" | "Maternity/Paternity Leave" | "Unpaid Leave";
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  approvedBy?: string;
  createdAt: string;
}

export interface OvertimeRequest {
  id?: number;
  employeeId: string;
  employeeName: string;
  departmentJobTitle: string;
  date: string; // YYYY-MM-DD
  hours: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  approvedBy?: string;
  createdAt: string;
}

export interface ThirteenthMonthPay {
  employeeId: string;
  employeeName: string;
  departmentJobTitle: string;
  totalBasicEarned: number; // Sum of basic pay over 12 months
  thirteenthMonthPay: number; // totalBasicEarned / 12
  taxExemptStatus: string; // e.g. "Tax Exempt (<= P90,000)" or "Taxable Portion Applied"
  annualTaxableIncome: number;
  projectedAnnualTax: number;
}

export type HolidayType = "REGULAR_100" | "SPECIAL_30";

export interface Holiday {
  id?: number;
  date: string; // YYYY-MM-DD
  name: string; // e.g. "Christmas Day", "Ninoy Aquino Day"
  type: HolidayType; // REGULAR_100 (100% premium) or SPECIAL_30 (30% premium)
}



