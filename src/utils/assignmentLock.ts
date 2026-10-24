import {
  ActivityCatalogItem,
  AttendanceRecord,
  ClassAssignment,
  NonComplianceReason,
} from '../types';
import {
  calculateEndTimeHHMM,
  getAssignmentDurationMinutes,
  getSessionAlarmStatus,
} from './sessionAlarm';

export interface AssignmentOccurrenceLockInfo {
  state: 'disponible' | 'en_curso' | 'completada_cerrada' | 'incumplida';
  isLocked: boolean;
  isCompletedAndClosed: boolean;
  isNonCompliant: boolean;
  nonComplianceReason?: NonComplianceReason;
  isManuallyClosed: boolean;
  record?: AttendanceRecord;
  statusLabel: string;
  shortLabel: string;
  detailText?: string;
}

export function formatLocalYYYYMMDD(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMondayIndexedDowFromDateStr(dateStr: string): number | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const jsDay = d.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function getDayOfMonthFromDateStr(dateStr: string): number | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts[2];
}

export function doesAssignmentApplyToDate(assignment: ClassAssignment, dateStr: string): boolean {
  if (!dateStr) return false;
  if (assignment.frequency === 'fecha_unica') {
    return assignment.date === dateStr;
  }
  if (assignment.frequency === 'semanal') {
    const dow = getMondayIndexedDowFromDateStr(dateStr);
    return dow !== null && assignment.dayOfWeek === dow;
  }
  if (assignment.frequency === 'mensual') {
    const dom = getDayOfMonthFromDateStr(dateStr);
    return dom !== null && (assignment.dayOfMonth || 1) === dom;
  }
  return false;
}

export function getAssignmentScheduledWindowMs(
  assignment: ClassAssignment,
  dateStr: string,
  catalog: ActivityCatalogItem[] = []
): {
  startMs: number;
  endMs: number;
  durationMinutes: number;
  endHHMM: string;
} | null {
  if (!dateStr || !assignment.time || !assignment.time.includes(':')) return null;
  const dateParts = dateStr.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(isNaN)) return null;
  const [hStr, mStr] = assignment.time.split(':');
  const hh = parseInt(hStr, 10);
  const mm = parseInt(mStr, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  const durationMinutes = getAssignmentDurationMinutes(assignment, catalog);
  const startMs = new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    hh,
    mm,
    0,
    0
  ).getTime();
  const endMs = startMs + durationMinutes * 60 * 1000;
  const endHHMM = calculateEndTimeHHMM(assignment.time, durationMinutes);

  return {
    startMs,
    endMs,
    durationMinutes,
    endHHMM,
  };
}

/**
 * Finds an attendance record that corresponds to a specific ClassAssignment on a given date (YYYY-MM-DD).
 */
export function findMatchingRecordForAssignmentDate(
  assignment: ClassAssignment,
  dateStr: string,
  records: AttendanceRecord[]
): AttendanceRecord | undefined {
  if (!dateStr) return undefined;

  // 1. Direct ID match on that date (prefer 'completado', then 'incumplido', then 'en_curso')
  const directMatches = records.filter(
    (r) => r.date === dateStr && r.assignmentId && r.assignmentId === assignment.id
  );
  if (directMatches.length > 0) {
    return (
      directMatches.find((r) => r.status === 'completado') ||
      directMatches.find((r) => r.status === 'incumplido') ||
      directMatches.find((r) => r.status === 'en_curso') ||
      directMatches[0]
    );
  }

  // 2. Attribute match for records created without explicit assignmentId
  const fallbackMatches = records.filter(
    (r) =>
      !r.assignmentId &&
      r.date === dateStr &&
      r.trainerId === assignment.trainerId &&
      r.companyId === assignment.companyId &&
      r.sedeId === assignment.sedeId &&
      (r.scheduledTime === assignment.time || r.activityName === assignment.activityName)
  );

  if (fallbackMatches.length > 0) {
    return (
      fallbackMatches.find((r) => r.status === 'completado') ||
      fallbackMatches.find((r) => r.status === 'incumplido') ||
      fallbackMatches.find((r) => r.status === 'en_curso') ||
      fallbackMatches[0]
    );
  }

  return undefined;
}

/**
 * Finds the ClassAssignment associated with an AttendanceRecord so it can be automatically marked closed/completed or non-compliant.
 */
export function findMatchingAssignmentForRecord(
  record: AttendanceRecord,
  assignments: ClassAssignment[]
): ClassAssignment | undefined {
  if (record.assignmentId) {
    const byId = assignments.find((a) => a.id === record.assignmentId);
    if (byId) return byId;
  }

  return assignments.find(
    (a) =>
      a.trainerId === record.trainerId &&
      a.companyId === record.companyId &&
      a.sedeId === record.sedeId &&
      doesAssignmentApplyToDate(a, record.date) &&
      (a.time === record.scheduledTime || a.activityName === record.activityName)
  );
}

/**
 * Evaluates whether an assignment on a target date (YYYY-MM-DD) is:
 * - 'completada_cerrada' (locked, completed & closed)
 * - 'incumplida' (locked, out of schedule unreported OR not closed within 30 minutes after session end)
 * - 'en_curso' (locked, currently active and within the 30-min post-session grace window)
 * - 'disponible' (unlocked, ready for check-in)
 */
export function getAssignmentOccurrenceStatus(
  assignment: ClassAssignment,
  dateStr: string,
  records: AttendanceRecord[],
  catalog: ActivityCatalogItem[] = [],
  nowMs: number = Date.now()
): AssignmentOccurrenceLockInfo {
  const matchedRecord = findMatchingRecordForAssignmentDate(assignment, dateStr, records);
  const inCompletedDates = Boolean(
    dateStr && assignment.completedDates && assignment.completedDates.includes(dateStr)
  );
  const globallyClosed = Boolean(assignment.closed);

  // 1. Completed and closed attendance record
  if (matchedRecord?.status === 'completado') {
    const checkOutPart = matchedRecord.checkOutTime
      ? ` • Salida ${matchedRecord.checkOutTime}`
      : '';
    return {
      state: 'completada_cerrada',
      isLocked: true,
      isCompletedAndClosed: true,
      isNonCompliant: false,
      isManuallyClosed: false,
      record: matchedRecord,
      statusLabel: 'Completada y Cerrada • Bloqueada',
      shortLabel: 'Cerrada y Bloqueada',
      detailText: `Entrada ${matchedRecord.checkInTime}${checkOutPart} (${matchedRecord.attendeesCount} part.)`,
    };
  }

  // 2. Record explicitly marked as 'incumplido' (e.g., not closed after 30 minutes)
  if (matchedRecord?.status === 'incumplido') {
    const reason: NonComplianceReason = matchedRecord.nonComplianceReason || 'sin_cierre_30m';
    return {
      state: 'incumplida',
      isLocked: true,
      isCompletedAndClosed: false,
      isNonCompliant: true,
      nonComplianceReason: reason,
      isManuallyClosed: false,
      record: matchedRecord,
      statusLabel:
        reason === 'sin_cierre_30m'
          ? 'Incumplida • No Cerrada (+30 min) • Bloqueada'
          : 'Incumplida • Fuera de Horario • Bloqueada',
      shortLabel: reason === 'sin_cierre_30m' ? 'Incumplida (+30m)' : 'Incumplida',
      detailText:
        reason === 'sin_cierre_30m'
          ? `Entrada ${matchedRecord.checkInTime} sin registro de salida pasados 30 min del fin${
              matchedRecord.markedNonCompliantAt ? ` (${matchedRecord.markedNonCompliantAt})` : ''
            }`
          : 'Asignación marcada como incumplida y bloqueada',
    };
  }

  // 3. Record currently 'en_curso' — check if 30 minutes have elapsed since planned session end
  if (matchedRecord?.status === 'en_curso') {
    const alarm = getSessionAlarmStatus(matchedRecord, catalog, nowMs);
    if (alarm.hasExceededUnclosedGrace) {
      return {
        state: 'incumplida',
        isLocked: true,
        isCompletedAndClosed: false,
        isNonCompliant: true,
        nonComplianceReason: 'sin_cierre_30m',
        isManuallyClosed: false,
        record: matchedRecord,
        statusLabel: 'Incumplida • No Cerrada (+30 min) • Bloqueada',
        shortLabel: 'Incumplida (+30m)',
        detailText: `Entrada ${matchedRecord.checkInTime} • No se cerró en los 30 min posteriores al fin (${alarm.expectedEndTimeFormatted} hrs)`,
      };
    }

    return {
      state: 'en_curso',
      isLocked: true,
      isCompletedAndClosed: false,
      isNonCompliant: false,
      isManuallyClosed: false,
      record: matchedRecord,
      statusLabel: 'En Curso • Ya Iniciada (Bloqueada)',
      shortLabel: 'En Curso',
      detailText: `Entrada registrada a las ${matchedRecord.checkInTime} • Pendiente registrar salida`,
    };
  }

  // 4. Manually / globally marked as completed & closed
  if (globallyClosed || inCompletedDates) {
    return {
      state: 'completada_cerrada',
      isLocked: true,
      isCompletedAndClosed: true,
      isNonCompliant: false,
      isManuallyClosed: true,
      statusLabel: 'Completada y Cerrada • Bloqueada',
      shortLabel: 'Cerrada y Bloqueada',
      detailText: assignment.closedAt
        ? `Cerrada oficialmente (${assignment.closedAt}) • No repetible`
        : 'Asignación cerrada y bloqueada para evitar repetición',
    };
  }

  // 5. Check out-of-schedule & unreported non-compliance (unless Admin explicitly reopened this date)
  const isReopenedForDate = Boolean(
    dateStr && assignment.reopenedDates && assignment.reopenedDates.includes(dateStr)
  );

  if (!isReopenedForDate) {
    const inMissedDates = Boolean(
      dateStr && assignment.missedDates && assignment.missedDates.includes(dateStr)
    );
    const globallyNonCompliant = Boolean(assignment.nonCompliant);

    if (globallyNonCompliant || inMissedDates) {
      const reason: NonComplianceReason = assignment.nonCompliantReason || 'fuera_de_horario';
      const win = getAssignmentScheduledWindowMs(assignment, dateStr, catalog);
      const windowLabel = win?.endHHMM ? `${assignment.time}–${win.endHHMM}` : assignment.time;
      return {
        state: 'incumplida',
        isLocked: true,
        isCompletedAndClosed: false,
        isNonCompliant: true,
        nonComplianceReason: reason,
        isManuallyClosed: false,
        statusLabel:
          reason === 'sin_cierre_30m'
            ? 'Incumplida • No Cerrada (+30 min) • Bloqueada'
            : 'Incumplida • Fuera de Horario (No Reportada) • Bloqueada',
        shortLabel: reason === 'sin_cierre_30m' ? 'Incumplida (+30m)' : 'Incumplida (Sin Reportar)',
        detailText:
          reason === 'sin_cierre_30m'
            ? 'No fue cerrada después de 30 minutos de finalizar • Bloqueada'
            : `Fuera de horario (${windowLabel} hrs) sin reporte de entrada • Bloqueada`,
      };
    }

    const win = getAssignmentScheduledWindowMs(assignment, dateStr, catalog);
    if (win && doesAssignmentApplyToDate(assignment, dateStr) && nowMs > win.endMs) {
      const windowLabel = win.endHHMM ? `${assignment.time}–${win.endHHMM}` : assignment.time;
      return {
        state: 'incumplida',
        isLocked: true,
        isCompletedAndClosed: false,
        isNonCompliant: true,
        nonComplianceReason: 'fuera_de_horario',
        isManuallyClosed: false,
        statusLabel: 'Incumplida • Fuera de Horario (No Reportada) • Bloqueada',
        shortLabel: 'Incumplida (Sin Reportar)',
        detailText: `Fuera de horario (${windowLabel} hrs) sin reporte de entrada • Bloqueada`,
      };
    }
  }

  return {
    state: 'disponible',
    isLocked: false,
    isCompletedAndClosed: false,
    isNonCompliant: false,
    isManuallyClosed: false,
    statusLabel: 'Disponible',
    shortLabel: 'Disponible',
  };
}

/**
 * Returns an updated ClassAssignment with a specific date marked as completed & closed, or unlocked/reopened.
 */
export function toggleAssignmentDateLock(
  assignment: ClassAssignment,
  dateStr: string,
  shouldLock: boolean
): ClassAssignment {
  const existingCompleted = new Set(assignment.completedDates || []);
  const existingMissed = new Set(assignment.missedDates || []);
  const existingReopened = new Set(assignment.reopenedDates || []);

  if (shouldLock) {
    if (dateStr) {
      existingCompleted.add(dateStr);
      existingMissed.delete(dateStr);
      existingReopened.delete(dateStr);
    }
    const nowTime = new Date().toLocaleTimeString('es-MX', { hour12: false });
    return {
      ...assignment,
      completedDates: Array.from(existingCompleted),
      missedDates: Array.from(existingMissed),
      reopenedDates: Array.from(existingReopened),
      nonCompliant: assignment.frequency === 'fecha_unica' ? false : assignment.nonCompliant,
      closed: assignment.frequency === 'fecha_unica' ? true : assignment.closed,
      closedAt: assignment.frequency === 'fecha_unica' ? `${dateStr} ${nowTime}` : assignment.closedAt,
    };
  } else {
    if (dateStr) {
      existingCompleted.delete(dateStr);
      existingMissed.delete(dateStr);
      existingReopened.add(dateStr);
    }
    return {
      ...assignment,
      completedDates: Array.from(existingCompleted),
      missedDates: Array.from(existingMissed),
      reopenedDates: Array.from(existingReopened),
      closed: false,
      closedAt: undefined,
      nonCompliant: false,
      nonCompliantReason: undefined,
      nonCompliantAt: undefined,
    };
  }
}

/**
 * Marks or clears non-compliance ('incumplida') on a ClassAssignment for a given date.
 */
export function markAssignmentDateNonCompliant(
  assignment: ClassAssignment,
  dateStr: string,
  reason: NonComplianceReason = 'fuera_de_horario'
): ClassAssignment {
  const existingMissed = new Set(assignment.missedDates || []);
  const existingReopened = new Set(assignment.reopenedDates || []);
  if (dateStr) {
    existingMissed.add(dateStr);
    existingReopened.delete(dateStr);
  }
  const nowTime = new Date().toLocaleTimeString('es-MX', { hour12: false });
  return {
    ...assignment,
    missedDates: Array.from(existingMissed),
    reopenedDates: Array.from(existingReopened),
    nonCompliant: assignment.frequency === 'fecha_unica' ? true : assignment.nonCompliant,
    nonCompliantReason: reason,
    nonCompliantAt: `${dateStr} ${nowTime}`,
  };
}
