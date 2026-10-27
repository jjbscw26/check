import { ActivityType, ClassAssignment, Company, Trainer } from '../types';
import { doesAssignmentApplyToDate } from './assignmentLock';

export const MONTH_NAMES_FULL_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const WEEKDAY_MONDAY_FULL_ES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

export const WEEKDAY_MONDAY_SHORT_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export type MonthSelectionPattern =
  | 'weekdays'
  | 'mwf'
  | 'tth'
  | 'saturdays'
  | 'all'
  | 'from_today';

export interface MonthDayCell {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  mondayDayOfWeek: number; // 1 = Lunes ... 7 = Domingo
}

export function getMondayDayOfWeek(d: Date): number {
  const jsDay = d.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const parts = yearMonth.split('-').map(Number);
  const year = Number.isFinite(parts[0]) ? parts[0] : new Date().getFullYear();
  const monthIdx = Number.isFinite(parts[1]) ? parts[1] - 1 : new Date().getMonth();
  const shifted = new Date(year, monthIdx + deltaMonths, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

export function buildMonthGridCells(yearMonth: string): {
  year: number;
  monthIndex: number;
  monthName: string;
  daysInMonth: number;
  cells: MonthDayCell[];
} {
  const parts = yearMonth.split('-').map(Number);
  const now = new Date();
  const year = Number.isFinite(parts[0]) && parts[0] >= 2020 ? parts[0] : now.getFullYear();
  const monthIndex =
    Number.isFinite(parts[1]) && parts[1] >= 1 && parts[1] <= 12
      ? parts[1] - 1
      : now.getMonth();

  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const startDow = getMondayDayOfWeek(firstDay);
  const daysInMonth = lastDay.getDate();

  const cells: MonthDayCell[] = [];

  // Leading days from previous month
  const prevMonthDays = new Date(year, monthIndex, 0).getDate();
  for (let i = startDow - 1; i > 0; i--) {
    const dayNum = prevMonthDays - i + 1;
    const d = new Date(year, monthIndex - 1, dayNum);
    cells.push({
      dateStr: formatDateYMD(d),
      dayNumber: dayNum,
      isCurrentMonth: false,
      mondayDayOfWeek: getMondayDayOfWeek(d),
    });
  }

  // Current month days
  for (let dNum = 1; dNum <= daysInMonth; dNum++) {
    const d = new Date(year, monthIndex, dNum);
    cells.push({
      dateStr: formatDateYMD(d),
      dayNumber: dNum,
      isCurrentMonth: true,
      mondayDayOfWeek: getMondayDayOfWeek(d),
    });
  }

  // Trailing days to complete 35 or 42 cells
  const totalSlots = cells.length > 35 ? 42 : 35;
  const remaining = totalSlots - cells.length;
  for (let dNum = 1; dNum <= remaining; dNum++) {
    const d = new Date(year, monthIndex + 1, dNum);
    cells.push({
      dateStr: formatDateYMD(d),
      dayNumber: dNum,
      isCurrentMonth: false,
      mondayDayOfWeek: getMondayDayOfWeek(d),
    });
  }

  return {
    year,
    monthIndex,
    monthName: MONTH_NAMES_FULL_ES[monthIndex] || MONTH_NAMES_FULL_ES[0],
    daysInMonth,
    cells,
  };
}

export function getMonthDatesByPattern(
  yearMonth: string,
  pattern: MonthSelectionPattern,
  todayStr: string
): string[] {
  const { cells } = buildMonthGridCells(yearMonth);
  const currentMonthCells = cells.filter((c) => c.isCurrentMonth);

  return currentMonthCells
    .filter((cell) => {
      if (pattern === 'weekdays') {
        return cell.mondayDayOfWeek >= 1 && cell.mondayDayOfWeek <= 5;
      }
      if (pattern === 'mwf') {
        return (
          cell.mondayDayOfWeek === 1 ||
          cell.mondayDayOfWeek === 3 ||
          cell.mondayDayOfWeek === 5
        );
      }
      if (pattern === 'tth') {
        return cell.mondayDayOfWeek === 2 || cell.mondayDayOfWeek === 4;
      }
      if (pattern === 'saturdays') {
        return cell.mondayDayOfWeek === 6;
      }
      if (pattern === 'from_today') {
        return cell.dateStr >= todayStr && cell.mondayDayOfWeek <= 5;
      }
      return true;
    })
    .map((c) => c.dateStr);
}

export function toggleWeekdayDatesInMonth(
  yearMonth: string,
  currentSelectedDates: string[],
  mondayDayOfWeek: number
): string[] {
  const { cells } = buildMonthGridCells(yearMonth);
  const matchingDates = cells
    .filter((c) => c.isCurrentMonth && c.mondayDayOfWeek === mondayDayOfWeek)
    .map((c) => c.dateStr);

  if (matchingDates.length === 0) return currentSelectedDates;

  const selectedSet = new Set(currentSelectedDates);
  const allSelected = matchingDates.every((d) => selectedSet.has(d));

  if (allSelected) {
    matchingDates.forEach((d) => selectedSet.delete(d));
  } else {
    matchingDates.forEach((d) => selectedSet.add(d));
  }

  return Array.from(selectedSet).sort();
}

export function hasMatchingAssignmentOnDate(
  existingAssignments: ClassAssignment[],
  params: {
    trainerId: string;
    companyId: string;
    sedeId: string;
    dateStr: string;
    time: string;
    activityName: string;
  }
): boolean {
  const normTime = (params.time || '09:00').slice(0, 5);
  const normAct = params.activityName.trim().toLowerCase();

  return existingAssignments.some((asg) => {
    if (asg.active === false) return false;
    if (asg.trainerId !== params.trainerId) return false;
    if (asg.companyId !== params.companyId) return false;
    if (asg.sedeId && params.sedeId && asg.sedeId !== params.sedeId) return false;
    if ((asg.time || '').slice(0, 5) !== normTime) return false;
    if ((asg.activityName || '').trim().toLowerCase() !== normAct) return false;
    return doesAssignmentApplyToDate(asg, params.dateStr);
  });
}

export function buildMonthlyBatchAssignments(params: {
  dates: string[];
  existingAssignments: ClassAssignment[];
  trainer: Trainer;
  company: Company;
  sedeId: string;
  time: string;
  durationMinutes: number;
  activityType: ActivityType;
  activityName: string;
  locationArea: string;
  expectedAttendees: number;
  notes?: string;
  isVirtual?: boolean;
  virtualPlatform?: string;
  virtualMeetingUrl?: string;
  virtualMeetingId?: string;
  virtualPasscode?: string;
  active?: boolean;
}): { created: ClassAssignment[]; skippedDuplicates: number } {
  const {
    dates,
    existingAssignments,
    trainer,
    company,
    sedeId,
    time,
    durationMinutes,
    activityType,
    activityName,
    locationArea,
    expectedAttendees,
    notes = '',
    isVirtual = false,
    virtualPlatform = '',
    virtualMeetingUrl = '',
    virtualMeetingId = '',
    virtualPasscode = '',
    active = true,
  } = params;

  const uniqueSortedDates = Array.from(
    new Set(dates.filter((d) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)))
  ).sort();

  const sede = company.sedes.find((s) => s.id === sedeId) || company.sedes[0];
  const fallbackCompanySlug = company.id.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
  const resolvedSedeId = sede?.id || `sede_principal_${fallbackCompanySlug}`;
  const resolvedSedeName = sede?.name || 'Sede Principal';
  const resolvedSedeAddress = sede?.address || 'Dirección Sede Corporativa';
  const normalizedTime = (time || '09:00').slice(0, 5);
  const baseStamp = Date.now();

  const created: ClassAssignment[] = [];
  let skippedDuplicates = 0;

  uniqueSortedDates.forEach((dateStr, index) => {
    const isDup = hasMatchingAssignmentOnDate(existingAssignments, {
      trainerId: trainer.id,
      companyId: company.id,
      sedeId: resolvedSedeId,
      dateStr,
      time: normalizedTime,
      activityName,
    });

    if (isDup) {
      skippedDuplicates += 1;
      return;
    }

    const compactDate = dateStr.replace(/-/g, '');
    const id = `asg_${baseStamp}_${index}_${compactDate}`;

    created.push({
      id,
      trainerId: trainer.id,
      trainerName: trainer.name,
      companyId: company.id,
      companyName: company.name,
      sedeId: resolvedSedeId,
      sedeName: resolvedSedeName,
      sedeAddress: resolvedSedeAddress,
      frequency: 'fecha_unica',
      date: dateStr,
      time: normalizedTime,
      durationMinutes,
      activityType,
      activityName,
      locationArea:
        locationArea.trim() ||
        (isVirtual ? `Sala Virtual (${virtualPlatform.trim() || 'En línea'})` : 'Área Principal'),
      expectedAttendees: Math.max(0, Math.round(expectedAttendees) || 0),
      notes: notes.trim(),
      ...(isVirtual
        ? {
            isVirtual: true,
            virtualPlatform: virtualPlatform.trim() || 'Google Meet',
            virtualMeetingUrl: virtualMeetingUrl.trim(),
            ...(virtualMeetingId.trim() ? { virtualMeetingId: virtualMeetingId.trim() } : {}),
            ...(virtualPasscode.trim() ? { virtualPasscode: virtualPasscode.trim() } : {}),
          }
        : {}),
      active,
      closed: false,
      completedDates: [],
      nonCompliant: false,
      missedDates: [],
      reopenedDates: [],
    });
  });

  return { created, skippedDuplicates };
}

