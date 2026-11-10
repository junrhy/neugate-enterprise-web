import { AttendanceLog, WorkSchedule, EmployeeRate, PayrollPayslip, Employee, Holiday } from "../types";

import { calculateAttendanceStatus } from "./schedule";

/** Default Official Philippine National Holidays (User Configurable via 🎉 Official Holidays Page) */
export const DEFAULT_PHILIPPINE_HOLIDAYS: Holiday[] = [];

export interface PayrollCalculationInput {
  employee: Employee;
  logs: AttendanceLog[];
  schedules: WorkSchedule[];
  rate: EmployeeRate;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  payrollRunId: number;
  holidays?: Holiday[];
  cashAdvances?: { employeeId: string; deductionCutoff: number }[];
  otherDeductionsList?: { employeeId: string; deductionCutoff: number }[];
}

export function computeEmployeePayslip(input: PayrollCalculationInput): PayrollPayslip {
  const {
    employee,
    logs,
    schedules,
    rate,
    periodStart,
    periodEnd,
    payrollRunId,
    holidays = DEFAULT_PHILIPPINE_HOLIDAYS,
    cashAdvances = [],
    otherDeductionsList = [],
  } = input;

  const startMs = new Date(`${periodStart}T00:00:00`).getTime();
  const endMs = new Date(`${periodEnd}T23:59:59`).getTime();

  // Filter logs for this employee in the cutoff window
  const empLogs = logs.filter((l) => {
    if (l.employeeId !== employee.id) return false;
    const logTime = new Date(l.timestamp).getTime();
    return !isNaN(logTime) && logTime >= startMs && logTime <= endMs;
  });

  // Group logs by date
  const logsByDate: Record<string, AttendanceLog[]> = {};
  empLogs.forEach((l) => {
    const d = new Date(l.timestamp);
    if (isNaN(d.getTime())) return;
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!logsByDate[dateKey]) logsByDate[dateKey] = [];
    logsByDate[dateKey].push(l);
  });

  let totalHoursWorked = 0;
  let totalLateMinutes = 0;
  let totalUndertimeMinutes = 0;
  let totalOvertimeHours = 0;
  let totalNightDiffHours = 0;

  let holiday100Count = 0;
  let holiday30Count = 0;

  Object.entries(logsByDate).forEach(([dateStr, dayLogs]) => {
    const sortedLogs = [...dayLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const inLog = sortedLogs.find((l) => l.type === "IN");
    const outLog = sortedLogs.find((l) => l.type === "OUT");

    const matchedHoliday = holidays.find((h) => h.date === dateStr);

    if (inLog && outLog) {
      const inTime = new Date(inLog.timestamp);
      const outTime = new Date(outLog.timestamp);
      const durationHours = Math.max(0, (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60));
      totalHoursWorked += durationHours;

      if (matchedHoliday) {
        if (matchedHoliday.type === "REGULAR_100") holiday100Count += 1;
        else if (matchedHoliday.type === "SPECIAL_30") holiday30Count += 1;
      }

      // Find applicable work schedule
      const schedule = schedules.find((s) => s.employeeId === employee.id && s.specificDate === dateStr) ||
                       schedules.find((s) => s.employeeId === employee.id && s.dayOfWeek === inTime.getDay()) ||
                       schedules.find((s) => s.employeeId === "DEFAULT");

      // 1. Late Minutes Computation
      const status = calculateAttendanceStatus("IN", inTime, employee.id, schedules);
      if (status === "LATE" && schedule) {
        const [sh, sm] = schedule.shiftStart.split(":").map(Number);
        const shiftStartMs = new Date(inTime).setHours(sh, sm, 0, 0);
        const lateDiffMins = Math.max(0, Math.floor((inTime.getTime() - shiftStartMs) / (1000 * 60)));
        totalLateMinutes += lateDiffMins;
      }

      // 2. Undertime Minutes Computation
      if (schedule) {
        const [eh, em] = schedule.shiftEnd.split(":").map(Number);
        const shiftEndMs = new Date(outTime).setHours(eh, em, 0, 0);
        if (outTime.getTime() < shiftEndMs) {
          const utDiffMins = Math.max(0, Math.floor((shiftEndMs - outTime.getTime()) / (1000 * 60)));
          totalUndertimeMinutes += utDiffMins;
        }
      }

      // 3. Overtime Hours Computation
      if (durationHours > 9) { // Standard 8h work + 1h break
        totalOvertimeHours += Math.floor(durationHours - 9);
      }

      // 4. Night Differential Hours Computation (10:00 PM to 6:00 AM)
      let nightMins = 0;
      let curr = new Date(inTime.getTime());
      while (curr.getTime() < outTime.getTime()) {
        const hour = curr.getHours();
        if (hour >= 22 || hour < 6) {
          nightMins += 1;
        }
        curr.setMinutes(curr.getMinutes() + 1);
      }
      totalNightDiffHours += Math.round((nightMins / 60) * 10) / 10;
    } else if (inLog) {
      totalHoursWorked += 8; // Default estimated day if single scan
      if (matchedHoliday) {
        if (matchedHoliday.type === "REGULAR_100") holiday100Count += 1;
        else if (matchedHoliday.type === "SPECIAL_30") holiday30Count += 1;
      }
    }
  });

  // Basic Pay & Rates Calculation
  const perDay = rate.salaryType === "DAILY" ? rate.basicSalary : rate.basicSalary / 26;
  const perHour = perDay / 8;
  const perMinute = perHour / 60;
  const noDays = Math.round((totalHoursWorked / 8) * 10) / 10;

  let basicPay = rate.basicSalary;
  if (rate.salaryType === "MONTHLY") {
    basicPay = rate.basicSalary / 2; // Semi-monthly cutoff
  } else if (rate.salaryType === "DAILY") {
    basicPay = rate.basicSalary * noDays;
  } else if (rate.salaryType === "HOURLY") {
    basicPay = rate.basicSalary * totalHoursWorked;
  }

  const overtimePay = totalOvertimeHours * (rate.overtimeRatePerHour || perHour * 1.25);

  // DOLE Statutory Holiday Rates Calculation
  const holiday100Pay = holiday100Count * perDay * 1.0; // 100% additional premium pay on regular holidays
  const holiday30Pay = holiday30Count * perDay * 0.30;   // 30% additional premium pay on special non-working days
  
  // DOLE Statutory Night Shift Differential (10% additional premium pay per hour worked between 10PM and 6AM)
  const nightDiffPay = totalNightDiffHours * (perHour * 0.10);

  const totalSalary = basicPay + overtimePay + holiday100Pay + holiday30Pay + nightDiffPay;
  
  // Disciplinary Deductions (Undertime + Late)
  const undertimeDeductions = totalUndertimeMinutes * perMinute;
  const lateDeductions = totalLateMinutes * (rate.lateDeductionRatePerMin || perMinute);
  const totalNetBeforeDeductions = totalSalary - (undertimeDeductions + lateDeductions);

  // Statutory & Company Deductions
  const sssEe = (rate.sssEmployeeShare || rate.sssDeduction || 420) / 2;
  const sssEr = (rate.sssEmployerShare || 630) / 2;
  const sss = sssEe;
  const philhealth = (rate.philhealthDeduction || 0) / 2;
  const pagibig = (rate.pagibigDeduction || 0) / 2;
  const tax = (rate.taxDeduction || 0) / 2;

  // Live Cash Advance & Other Deductions Lookup
  const empCaRecord = cashAdvances.find((ca) => ca.employeeId === employee.id);
  const cashAdvanceDeductions = empCaRecord ? empCaRecord.deductionCutoff : 0;

  const empOdRecords = otherDeductionsList.filter((od) => od.employeeId === employee.id);
  const otherDeductions = empOdRecords.reduce((sum, od) => sum + od.deductionCutoff, 0);

  const sssCashReturn = 0;

  const totalDeductions = sssEe + philhealth + pagibig + tax + cashAdvanceDeductions + otherDeductions - sssCashReturn;
  const netPay = Math.max(0, totalNetBeforeDeductions - totalDeductions);

  return {
    payrollRunId,
    employeeId: employee.id,
    employeeName: employee.name,
    departmentJobTitle: employee.departmentJobTitle,
    perDay: Math.round(perDay * 100) / 100,
    perHour: Math.round(perHour * 100) / 100,
    noDays,
    overtimeHours: totalOvertimeHours,
    holiday100Count: holiday100Count,
    holiday30Count: holiday30Count,
    undertimeHours: Math.round((totalUndertimeMinutes / 60) * 10) / 10,
    nightDiffHours: totalNightDiffHours,
    lateMinutes: totalLateMinutes,

    basicPay: Math.round(basicPay * 100) / 100,
    overtimePay: Math.round(overtimePay * 100) / 100,
    holiday100Pay: Math.round(holiday100Pay * 100) / 100,
    holiday30Pay: Math.round(holiday30Pay * 100) / 100,
    nightDiffPay: Math.round(nightDiffPay * 100) / 100,
    totalSalary: Math.round(totalSalary * 100) / 100,
    undertimeDeductions: Math.round(undertimeDeductions * 100) / 100,
    lateDeductions: Math.round(lateDeductions * 100) / 100,
    grossPay: Math.round((totalSalary - (undertimeDeductions + lateDeductions)) * 100) / 100,
    totalNetBeforeDeductions: Math.round(totalNetBeforeDeductions * 100) / 100,

    sssEmployerShare: Math.round(sssEr * 100) / 100,
    sssEmployeeShare: Math.round(sssEe * 100) / 100,
    cashAdvanceDeductions,
    sss: Math.round(sss * 100) / 100,
    philhealth: Math.round(philhealth * 100) / 100,
    pagibig: Math.round(pagibig * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    otherDeductions,
    sssCashReturn,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay: Math.round(netPay * 100) / 100,
    totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
    createdAt: new Date().toISOString(),
  };
}
