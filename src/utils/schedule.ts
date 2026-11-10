import { AttendanceStatus, WorkSchedule } from "../types";

export function calculateAttendanceStatus(
  type: "IN" | "OUT",
  scanDate: Date,
  employeeId: string,
  schedules: WorkSchedule[]
): AttendanceStatus {
  const dateStr = scanDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const dayOfWeek = scanDate.getDay(); // 0=Sun..6=Sat
  const scanMins = scanDate.getHours() * 60 + scanDate.getMinutes();

  // Find matching schedule: Specific date first, then employee weekly, then default weekly
  let activeSchedule = schedules.find(
    (s) => s.employeeId === employeeId && s.specificDate === dateStr
  );

  if (!activeSchedule) {
    activeSchedule = schedules.find(
      (s) => s.employeeId === employeeId && s.dayOfWeek === dayOfWeek
    );
  }

  if (!activeSchedule) {
    activeSchedule = schedules.find(
      (s) => s.employeeId === "DEFAULT" && s.dayOfWeek === dayOfWeek
    );
  }

  if (!activeSchedule) {
    activeSchedule = schedules.find((s) => s.employeeId === "DEFAULT");
  }

  // Fallback default if no database rule exists: 8:00 AM - 5:00 PM, Break 12:00 - 13:00, 15m grace
  const shiftStartStr = activeSchedule?.shiftStart || "08:00";
  const shiftEndStr = activeSchedule?.shiftEnd || "17:00";
  const breakEndStr = activeSchedule?.breakEnd || "13:00";
  const graceMins = activeSchedule?.gracePeriodMins ?? 15;
  const isRestDay = activeSchedule?.isRestDay ?? (dayOfWeek === 0 || dayOfWeek === 6); // Sat/Sun rest day by default

  if (isRestDay) {
    return "REST DAY SCAN";
  }

  const parseMins = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const shiftStartMins = parseMins(shiftStartStr);
  const shiftEndMins = parseMins(shiftEndStr);
  const breakEndMins = parseMins(breakEndStr);


  if (type === "IN") {
    // Check if check-in is after break end
    if (scanMins > breakEndMins && scanMins < shiftEndMins) {
      return "OVER BREAK";
    }
    // Check-in on time vs late
    if (scanMins <= shiftStartMins + graceMins) {
      return "ON TIME";
    } else {
      return "LATE";
    }
  } else {
    // Check-out logic
    if (scanMins < shiftEndMins - 15) {
      return "EARLY DEPARTURE";
    } else if (scanMins > shiftEndMins + 15) {
      return "OVERTIME";
    } else {
      return "ON TIME";
    }
  }
}
