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

export const LOAD_WINDOW_MINUTES_BEFORE_START = 30;
export const LOAD_WINDOW_MINUTES_AFTER_START = 10;

export type AssignmentLoadWindowState =
  | 'en_ventana'
  | 'antes_de_30m'
  | 'cerrada_20m'
  | 'otro_dia'
  | 'bloqueada';

export interface AssignmentOccurrenceLockInfo {
  state: 'disponible' | 'en_curso' | 'completada_cerrada' | 'incumplida';
  isLocked: boolean;
  isCompletedAndClosed: boolean;
  isNonCompliant: boolean;
  nonComplianceReason?: NonComplianceReason;
  isManuallyClosed: boolean;
  canLoadNow: boolean;
  loadWindowState: AssignmentLoadWindowState;
  unlockTimeHHMM?: string;
  loadDeadlineHHMM?: string;
  secondsUntilLoadOpen?: number;
  secondsUntilLoadClose?: number;
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

function formatMsToHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  loadOpenMs: number;
  loadCloseMs: number;
  durationMinutes: number;
  endHHMM: string;
  loadOpenHHMM: string;
  loadCloseHHMM: string;
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
  const loadOpenMs = startMs - LOAD_WINDOW_MINUTES_BEFORE_START * 60 * 1000;
  const loadCloseMs = startMs + LOAD_WINDOW_MINUTES_AFTER_START * 60 * 1000;
  const endHHMM = calculateEndTimeHHMM(assignment.time, durationMinutes);
  const loadOpenHHMM = formatMsToHHMM(loadOpenMs);
  const loadCloseHHMM = formatMsToHHMM(loadCloseMs);

  return {
    startMs,
    endMs,
    loadOpenMs,
    loadCloseMs,
    durationMinutes,
    endHHMM,
    loadOpenHHMM,
    loadCloseHHMM,
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
 * - 'incumplida' (locked: either pending exit auto-terminated 60 min after session end as No Cerrada, OR not loaded within +10 min of start)
 * - 'en_curso' (locked, currently active and within the 60-min post-end grace window)
 * - 'disponible' (unlocked, can only be loaded on exact date between -30 min before start and +10 min after start)
 */
export function getAssignmentOccurrenceStatus(
  assignment: ClassAssignment,
  dateStr: string,
  records: AttendanceRecord[],
  catalog: ActivityCatalogItem[] = [],
  nowMs: number = Date.now()
): AssignmentOccurrenceLockInfo {
  const todayStr = formatLocalYYYYMMDD(new Date(nowMs));
  const win = getAssignmentScheduledWindowMs(assignment, dateStr, catalog);
  const matchedRecord = findMatchingRecordForAssignmentDate(assignment, dateStr, records);
  const inCompletedDates = Boolean(
    dateStr && assignment.completedDates && assignment.completedDates.includes(dateStr)
  );
  const globallyClosed = Boolean(assignment.closed);

  // 1. Completed and closed attendance record
  if (matchedRecord?.status === 'completado') {
    const checkOutPart = matchedRecord.checkOutTime
      ? ` · Salida ${matchedRecord.checkOutTime}`
      : '';
    return {
      state: 'completada_cerrada',
      isLocked: true,
      isCompletedAndClosed: true,
      isNonCompliant: false,
      isManuallyClosed: false,
      canLoadNow: false,
      loadWindowState: 'bloqueada',
      unlockTimeHHMM: win?.loadOpenHHMM,
      loadDeadlineHHMM: win?.loadCloseHHMM,
      record: matchedRecord,
      statusLabel: 'Completada y Cerrada · Bloqueada',
      shortLabel: 'Cerrada y Bloqueada',
      detailText: `Entrada ${matchedRecord.checkInTime}${checkOutPart} (${matchedRecord.attendeesCount} part.)`,
    };
  }

  // 2. Record explicitly marked as 'incumplido' (e.g., auto-terminated 60 minutes after end time as No Cerrada)
  if (matchedRecord?.status === 'incumplido') {
    const reason: NonComplianceReason = matchedRecord.nonComplianceReason || 'sin_cierre_30m';
    return {
      state: 'incumplida',
      isLocked: true,
      isCompletedAndClosed: false,
      isNonCompliant: true,
      nonComplianceReason: reason,
      isManuallyClosed: false,
      canLoadNow: false,
      loadWindowState: 'bloqueada',
      unlockTimeHHMM: win?.loadOpenHHMM,
      loadDeadlineHHMM: win?.loadCloseHHMM,
      record: matchedRecord,
      statusLabel:
        reason === 'sin_cierre_30m'
          ? 'Terminada (+60 min) · No Cerrada'
          : 'Cerrada por No Cargar (+10 min) · Bloqueada',
      shortLabel: reason === 'sin_cierre_30m' ? 'No Cerrada (+60m)' : 'Cerrada (+10m)',
      detailText:
        reason === 'sin_cierre_30m'
          ? `Entrada ${matchedRecord.checkInTime} · Salida pendiente dada por terminada a los 60 min de la hora de término y calificada como No Cerrada${
              matchedRecord.markedNonCompliantAt ? ` (${matchedRecord.markedNonCompliantAt} hrs)` : ''
            }`
          : 'Sesión dada por cerrada y bloqueada',
    };
  }

  // 3. Record currently 'en_curso' — check if 60 minutes have elapsed since session end time
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
        canLoadNow: false,
        loadWindowState: 'bloqueada',
        unlockTimeHHMM: win?.loadOpenHHMM,
        loadDeadlineHHMM: win?.loadCloseHHMM,
        record: matchedRecord,
        statusLabel: 'Terminada (+60 min) · No Cerrada',
        shortLabel: 'No Cerrada (+60m)',
        detailText: `Entrada ${matchedRecord.checkInTime} · Terminada a los 60 min después de la hora de término (${alarm.expectedEndTimeFormatted} hrs) y calificada como No Cerrada.`,
      };
    }

    return {
      state: 'en_curso',
      isLocked: true,
      isCompletedAndClosed: false,
      isNonCompliant: false,
      isManuallyClosed: false,
      canLoadNow: false,
      loadWindowState: 'bloqueada',
      unlockTimeHHMM: win?.loadOpenHHMM,
      loadDeadlineHHMM: win?.loadCloseHHMM,
      record: matchedRecord,
      statusLabel: 'En Curso · Ya Iniciada (Bloqueada)',
      shortLabel: 'En Curso',
      detailText: `Entrada registrada a las ${matchedRecord.checkInTime} · Pendiente registrar salida`,
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
      canLoadNow: false,
      loadWindowState: 'bloqueada',
      unlockTimeHHMM: win?.loadOpenHHMM,
      loadDeadlineHHMM: win?.loadCloseHHMM,
      statusLabel: 'Completada y Cerrada · Bloqueada',
      shortLabel: 'Cerrada y Bloqueada',
      detailText: assignment.closedAt
        ? `Cerrada oficialmente (${assignment.closedAt}) · No repetible`
        : 'Asignación cerrada y bloqueada para evitar repetición',
    };
  }

  // 5. Check +10 min post-start auto-close & past-date lock (unless Admin explicitly reopened this date)
  const isReopenedForDate = Boolean(
    dateStr && assignment.reopenedDates && assignment.reopenedDates.includes(dateStr)
  );
  const appliesToTargetDate = doesAssignmentApplyToDate(assignment, dateStr);

  if (!isReopenedForDate) {
    const inMissedDates = Boolean(
      dateStr && assignment.missedDates && assignment.missedDates.includes(dateStr)
    );
    const globallyNonCompliant = Boolean(assignment.nonCompliant);

    if (globallyNonCompliant || inMissedDates) {
      const reason: NonComplianceReason = assignment.nonCompliantReason || 'fuera_de_horario';
      const limitLabel = win?.loadCloseHHMM ? `${win.loadCloseHHMM} hrs` : '+10 min';
      return {
        state: 'incumplida',
        isLocked: true,
        isCompletedAndClosed: false,
        isNonCompliant: true,
        nonComplianceReason: reason,
        isManuallyClosed: false,
        canLoadNow: false,
        loadWindowState: reason === 'sin_cierre_30m' ? 'bloqueada' : 'cerrada_20m',
        unlockTimeHHMM: win?.loadOpenHHMM,
        loadDeadlineHHMM: win?.loadCloseHHMM,
        statusLabel:
          reason === 'sin_cierre_30m'
            ? 'Terminada (+60 min) · No Cerrada'
            : 'Sesión Cerrada · No Cargada (+10 min) · Bloqueada',
        shortLabel: reason === 'sin_cierre_30m' ? 'No Cerrada (+60m)' : 'Cerrada (+10m sin carga)',
        detailText:
          reason === 'sin_cierre_30m'
            ? 'Salida pendiente dada por terminada a los 60 minutos de la hora de término y calificada como No Cerrada'
            : `No se cargó dentro de los 10 min posteriores al inicio (límite ${limitLabel}) · Dada por cerrada`,
      };
    }

    // Past date without check-in record: closed
    if (dateStr && dateStr < todayStr && appliesToTargetDate) {
      return {
        state: 'incumplida',
        isLocked: true,
        isCompletedAndClosed: false,
        isNonCompliant: true,
        nonComplianceReason: 'fuera_de_horario',
        isManuallyClosed: false,
        canLoadNow: false,
        loadWindowState: 'cerrada_20m',
        unlockTimeHHMM: win?.loadOpenHHMM,
        loadDeadlineHHMM: win?.loadCloseHHMM,
        statusLabel: 'Sesión Cerrada · Fecha Vencida sin Carga',
        shortLabel: 'Cerrada (Sin carga)',
        detailText: `La fecha exacta de la sesión (${dateStr}) venció sin registro de entrada · Dada por cerrada`,
      };
    }

    // Exact day or scheduled occurrence where > 10 minutes after start have elapsed without loading/check-in
    if (win && appliesToTargetDate && nowMs > win.loadCloseMs) {
      return {
        state: 'incumplida',
        isLocked: true,
        isCompletedAndClosed: false,
        isNonCompliant: true,
        nonComplianceReason: 'fuera_de_horario',
        isManuallyClosed: false,
        canLoadNow: false,
        loadWindowState: 'cerrada_20m',
        unlockTimeHHMM: win.loadOpenHHMM,
        loadDeadlineHHMM: win.loadCloseHHMM,
        statusLabel: 'Sesión Cerrada · No Cargada (+10 min) · Bloqueada',
        shortLabel: 'Cerrada (+10m sin carga)',
        detailText: `Pasaron más de 10 min desde el inicio (${assignment.time} hrs, límite ${win.loadCloseHHMM} hrs) sin cargarse · Dada por cerrada`,
      };
    }
  }

  // 6. Enforce exact day of assignment (cannot load future or non-matching dates)
  if (dateStr !== todayStr || !appliesToTargetDate) {
    return {
      state: 'disponible',
      isLocked: false,
      isCompletedAndClosed: false,
      isNonCompliant: false,
      isManuallyClosed: false,
      canLoadNow: false,
      loadWindowState: 'otro_dia',
      unlockTimeHHMM: win?.loadOpenHHMM,
      loadDeadlineHHMM: win?.loadCloseHHMM,
      statusLabel: 'Programada · Solo Cargable el Día Exacto',
      shortLabel: 'Día Programado',
      detailText: win
        ? `Solo disponible el ${dateStr} de ${win.loadOpenHHMM} a ${win.loadCloseHHMM} hrs`
        : `Solo disponible el día exacto asignado (${dateStr})`,
    };
  }

  // 7. Exact day of assignment (today): check [-30 min, +10 min] load window
  if (win && !isReopenedForDate && nowMs < win.loadOpenMs) {
    const secondsUntilLoadOpen = Math.max(0, Math.ceil((win.loadOpenMs - nowMs) / 1000));
    return {
      state: 'disponible',
      isLocked: false,
      isCompletedAndClosed: false,
      isNonCompliant: false,
      isManuallyClosed: false,
      canLoadNow: false,
      loadWindowState: 'antes_de_30m',
      unlockTimeHHMM: win.loadOpenHHMM,
      loadDeadlineHHMM: win.loadCloseHHMM,
      secondsUntilLoadOpen,
      statusLabel: `Disponible Hoy desde ${win.loadOpenHHMM} hrs (-30 min)`,
      shortLabel: `Habilita ${win.loadOpenHHMM}`,
      detailText: `Podrás cargar los datos 30 min antes de iniciar (${win.loadOpenHHMM}–${win.loadCloseHHMM} hrs)`,
    };
  }

  const secondsUntilLoadClose =
    win && !isReopenedForDate ? Math.max(0, Math.floor((win.loadCloseMs - nowMs) / 1000)) : undefined;

  return {
    state: 'disponible',
    isLocked: false,
    isCompletedAndClosed: false,
    isNonCompliant: false,
    isManuallyClosed: false,
    canLoadNow: true,
    loadWindowState: 'en_ventana',
    unlockTimeHHMM: win?.loadOpenHHMM,
    loadDeadlineHHMM: win?.loadCloseHHMM,
    secondsUntilLoadClose,
    statusLabel: win
      ? `Habilitada para Cargar (${win.loadOpenHHMM}–${win.loadCloseHHMM} hrs)`
      : 'Disponible para Cargar',
    shortLabel: 'Cargar Ahora',
    detailText: win
      ? `Ventana activa hoy de ${win.loadOpenHHMM} a ${win.loadCloseHHMM} hrs`
      : undefined,
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
