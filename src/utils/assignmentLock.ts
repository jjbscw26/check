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
      completedDates: Array.from(existingCompleted).sort(),
      missedDates: Array.from(existingMissed).sort(),
      reopenedDates: Array.from(existingReopened).sort(),
      nonCompliant: assignment.frequency === 'fecha_unica' ? false : assignment.nonCompliant,
      nonCompliantReason:
        assignment.frequency === 'fecha_unica' ? undefined : assignment.nonCompliantReason,
      nonCompliantAt:
        assignment.frequency === 'fecha_unica' ? undefined : assignment.nonCompliantAt,
      closed: assignment.frequency === 'fecha_unica' ? true : assignment.closed,
      closedAt:
        assignment.frequency === 'fecha_unica'
          ? assignment.closedAt || `${dateStr} ${nowTime}`.trim()
          : assignment.closedAt,
    };
  } else {
    if (dateStr) {
      existingCompleted.delete(dateStr);
      existingMissed.delete(dateStr);
      existingReopened.add(dateStr);
    }
    return {
      ...assignment,
      completedDates: Array.from(existingCompleted).sort(),
      missedDates: Array.from(existingMissed).sort(),
      reopenedDates: Array.from(existingReopened).sort(),
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
    missedDates: Array.from(existingMissed).sort(),
    reopenedDates: Array.from(existingReopened).sort(),
    nonCompliant: assignment.frequency === 'fecha_unica' ? true : assignment.nonCompliant,
    nonCompliantReason: reason,
    nonCompliantAt: assignment.nonCompliantAt || `${dateStr} ${nowTime}`.trim(),
  };
}

function areStringArraysEqual(a?: string[], b?: string[]): boolean {
  const arrA = a || [];
  const arrB = b || [];
  if (arrA.length !== arrB.length) return false;
  for (let i = 0; i < arrA.length; i++) {
    if (arrA[i] !== arrB[i]) return false;
  }
  return true;
}

/**
 * Merges completion, closure, and non-compliance states from a local ClassAssignment onto a server ClassAssignment
 * so previously completed, closed, or non-compliant assignments are never lost before syncing to Firestore.
 */
export function mergeAssignmentOperationalState(
  serverAsg: ClassAssignment,
  localAsg: ClassAssignment
): { merged: ClassAssignment; hasStateDiffFromServer: boolean } {
  const reopenedSet = new Set<string>([
    ...(serverAsg.reopenedDates || []),
    ...(localAsg.reopenedDates || []),
  ]);

  const completedSet = new Set<string>([
    ...(serverAsg.completedDates || []),
    ...(localAsg.completedDates || []),
  ]);
  reopenedSet.forEach((d) => completedSet.delete(d));

  const missedSet = new Set<string>([
    ...(serverAsg.missedDates || []),
    ...(localAsg.missedDates || []),
  ]);
  completedSet.forEach((d) => missedSet.delete(d));
  reopenedSet.forEach((d) => missedSet.delete(d));

  const completedDates = Array.from(completedSet).sort();
  const missedDates = Array.from(missedSet).sort();
  const reopenedDates = Array.from(reopenedSet).sort();

  const isExplicitlyReopenedSingle =
    serverAsg.frequency === 'fecha_unica' &&
    Boolean(serverAsg.date && reopenedSet.has(serverAsg.date));

  const closed = isExplicitlyReopenedSingle
    ? false
    : Boolean(
        serverAsg.closed ||
          localAsg.closed ||
          (serverAsg.frequency === 'fecha_unica' && completedDates.length > 0)
      );

  const closedAt = closed ? serverAsg.closedAt || localAsg.closedAt : undefined;

  const nonCompliant =
    closed || isExplicitlyReopenedSingle
      ? false
      : Boolean(
          serverAsg.nonCompliant ||
            localAsg.nonCompliant ||
            (serverAsg.frequency === 'fecha_unica' && missedDates.length > 0)
        );

  const nonCompliantReason =
    closed || isExplicitlyReopenedSingle
      ? undefined
      : serverAsg.nonCompliantReason ||
        localAsg.nonCompliantReason ||
        (missedDates.length > 0 ? 'fuera_de_horario' : undefined);

  const nonCompliantAt =
    closed || isExplicitlyReopenedSingle
      ? undefined
      : serverAsg.nonCompliantAt || localAsg.nonCompliantAt;

  const merged: ClassAssignment = {
    ...serverAsg,
    ...(completedDates.length > 0 || serverAsg.completedDates
      ? { completedDates }
      : {}),
    ...(missedDates.length > 0 || serverAsg.missedDates ? { missedDates } : {}),
    ...(reopenedDates.length > 0 || serverAsg.reopenedDates
      ? { reopenedDates }
      : {}),
    ...(closed || typeof serverAsg.closed === 'boolean' ? { closed } : {}),
    ...(closedAt ? { closedAt } : {}),
    ...(nonCompliant || typeof serverAsg.nonCompliant === 'boolean'
      ? { nonCompliant }
      : {}),
    ...(nonCompliantReason ? { nonCompliantReason } : {}),
    ...(nonCompliantAt ? { nonCompliantAt } : {}),
  };

  const hasStateDiffFromServer =
    Boolean(merged.closed) !== Boolean(serverAsg.closed) ||
    (merged.closedAt || '') !== (serverAsg.closedAt || '') ||
    Boolean(merged.nonCompliant) !== Boolean(serverAsg.nonCompliant) ||
    (merged.nonCompliantReason || '') !== (serverAsg.nonCompliantReason || '') ||
    (merged.nonCompliantAt || '') !== (serverAsg.nonCompliantAt || '') ||
    !areStringArraysEqual(merged.completedDates, serverAsg.completedDates) ||
    !areStringArraysEqual(merged.missedDates, serverAsg.missedDates) ||
    !areStringArraysEqual(merged.reopenedDates, serverAsg.reopenedDates);

  return { merged, hasStateDiffFromServer };
}

function getElapsedMonthDateStrings(todayStr: string): string[] {
  const parts = todayStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return [todayStr];
  const [year, month, day] = parts;
  const dates: string[] = [];
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  for (let d = 1; d <= day; d++) {
    dates.push(`${prefix}${String(d).padStart(2, '0')}`);
  }
  return dates;
}

/**
 * Reconciles all AttendanceRecords (Bitácora de Evidencias) and ClassAssignments so that:
 * 1. Overdue 'en_curso' records (+60 min past session end) transition to 'incumplido' ('sin_cierre_30m').
 * 2. Records missing assignmentId are linked to their matching ClassAssignment.
 * 3. Assignments with 'completado' records have their completedDates (and closed/closedAt for fecha_unica) populated.
 * 4. Assignments with 'incumplido' records or expired load windows (+10 min / past dates without check-in)
 *    have their missedDates, nonCompliant, nonCompliantReason, and nonCompliantAt populated.
 */
export function reconcileAssignmentsAndRecords(params: {
  assignments: ClassAssignment[];
  records: AttendanceRecord[];
  catalog?: ActivityCatalogItem[];
  nowMs?: number;
  skipInFlightRecordIds?: ReadonlySet<string>;
  skipInFlightAssignmentIds?: ReadonlySet<string>;
}): {
  assignments: ClassAssignment[];
  records: AttendanceRecord[];
  changedAssignmentIds: Set<string>;
  changedRecordIds: Set<string>;
} {
  const {
    assignments,
    records,
    catalog = [],
    nowMs = Date.now(),
    skipInFlightRecordIds,
    skipInFlightAssignmentIds,
  } = params;

  const nowDate = new Date(nowMs);
  const todayStr = formatLocalYYYYMMDD(nowDate);
  const nowTimeStr = nowDate.toLocaleTimeString('es-MX', { hour12: false });
  const elapsedMonthDates = getElapsedMonthDateStrings(todayStr);

  const changedRecordIds = new Set<string>();
  const changedAssignmentIds = new Set<string>();

  // Step 1: Reconcile records (+60m grace expiration & assignmentId linkage)
  const reconciledRecords: AttendanceRecord[] = records.map((rec) => {
    if (skipInFlightRecordIds?.has(rec.id)) {
      return rec;
    }

    let nextRec = rec;
    let mutated = false;

    const matchedAsg = findMatchingAssignmentForRecord(nextRec, assignments);
    if (matchedAsg && !nextRec.assignmentId) {
      nextRec = { ...nextRec, assignmentId: matchedAsg.id };
      mutated = true;
    }

    if (nextRec.status === 'en_curso' && !nextRec.checkOutTime) {
      const alarm = getSessionAlarmStatus(nextRec, catalog, nowMs);
      if (alarm.hasExceededUnclosedGrace) {
        const autoNote = `[Sistema BSCW] Salida pendiente dada por TERMINADA a los 60 min después de la hora de término (${alarm.autoLockDeadlineFormatted} hrs) y calificada como NO CERRADA.`;
        const rawMergedObs = nextRec.observations
          ? nextRec.observations.includes('[Sistema BSCW]')
            ? nextRec.observations
            : `${nextRec.observations} | ${autoNote}`
          : autoNote;

        nextRec = {
          ...nextRec,
          status: 'incumplido',
          nonComplianceReason: 'sin_cierre_30m',
          markedNonCompliantAt: alarm.autoLockDeadlineFormatted || nowTimeStr,
          durationMinutes: nextRec.durationMinutes ?? alarm.plannedDurationMinutes,
          alarmEnabled: false,
          alarmSnoozedUntilIso: null,
          observations: rawMergedObs.slice(0, 950),
        };
        mutated = true;
      }
    }

    if (mutated) {
      changedRecordIds.add(nextRec.id);
    }
    return nextRec;
  });

  // Step 2: Reconcile assignments (completadas, cerradas e incumplidas)
  const reconciledAssignments: ClassAssignment[] = assignments.map((asg) => {
    if (skipInFlightAssignmentIds?.has(asg.id)) {
      return asg;
    }

    const completedSet = new Set<string>(asg.completedDates || []);
    const missedSet = new Set<string>(asg.missedDates || []);
    const reopenedSet = new Set<string>(asg.reopenedDates || []);

    let closed = Boolean(asg.closed);
    let closedAt = asg.closedAt;
    let nonCompliant = Boolean(asg.nonCompliant);
    let nonCompliantReason = asg.nonCompliantReason;
    let nonCompliantAt = asg.nonCompliantAt;

    // 2A. Apply evidence records linked to this assignment
    for (const rec of reconciledRecords) {
      const matchesDirectly = Boolean(rec.assignmentId && rec.assignmentId === asg.id);
      const matchesByAttributes =
        !rec.assignmentId &&
        rec.trainerId === asg.trainerId &&
        rec.companyId === asg.companyId &&
        rec.sedeId === asg.sedeId &&
        doesAssignmentApplyToDate(asg, rec.date) &&
        (rec.scheduledTime === asg.time || rec.activityName === asg.activityName);

      if (!matchesDirectly && !matchesByAttributes) continue;
      if (!rec.date) continue;

      if (rec.status === 'completado') {
        completedSet.add(rec.date);
        missedSet.delete(rec.date);
        reopenedSet.delete(rec.date);
        if (asg.frequency === 'fecha_unica') {
          closed = true;
          closedAt =
            closedAt ||
            (rec.checkOutTime ? `${rec.date} ${rec.checkOutTime}` : `${rec.date} ${nowTimeStr}`);
          nonCompliant = false;
          nonCompliantReason = undefined;
          nonCompliantAt = undefined;
        }
      } else if (rec.status === 'incumplido') {
        if (!completedSet.has(rec.date) && !reopenedSet.has(rec.date)) {
          missedSet.add(rec.date);
          nonCompliantReason = rec.nonComplianceReason || nonCompliantReason || 'sin_cierre_30m';
          nonCompliantAt =
            nonCompliantAt ||
            (rec.markedNonCompliantAt
              ? `${rec.date} ${rec.markedNonCompliantAt}`
              : `${rec.date} ${nowTimeStr}`);
          if (asg.frequency === 'fecha_unica') {
            nonCompliant = true;
          }
        }
      }
    }

    // 2B. Apply expired schedule windows (+10 min post-start or elapsed dates without check-in)
    if (asg.active !== false && !closed) {
      const candidateDates: string[] = [];
      if (asg.frequency === 'fecha_unica' && asg.date) {
        candidateDates.push(asg.date);
      } else if (asg.frequency === 'semanal' || asg.frequency === 'mensual') {
        for (const dStr of elapsedMonthDates) {
          if (doesAssignmentApplyToDate(asg, dStr)) {
            candidateDates.push(dStr);
          }
        }
      }

      for (const checkDate of candidateDates) {
        if (completedSet.has(checkDate) || reopenedSet.has(checkDate)) continue;
        if (
          missedSet.has(checkDate) &&
          (asg.frequency !== 'fecha_unica' || (nonCompliant && Boolean(nonCompliantReason)))
        ) {
          continue;
        }

        const matchedRec = findMatchingRecordForAssignmentDate(asg, checkDate, reconciledRecords);
        if (matchedRec) continue;

        const win = getAssignmentScheduledWindowMs(asg, checkDate, catalog);
        if ((win && nowMs > win.loadCloseMs) || checkDate < todayStr) {
          missedSet.add(checkDate);
          nonCompliantReason = nonCompliantReason || 'fuera_de_horario';
          nonCompliantAt =
            nonCompliantAt ||
            `${checkDate} ${win?.loadCloseHHMM ? `${win.loadCloseHHMM}:00` : nowTimeStr}`;
          if (asg.frequency === 'fecha_unica') {
            nonCompliant = true;
          }
        }
      }
    }

    // Ensure single-date consistency if completedDates already had the date
    if (asg.frequency === 'fecha_unica' && completedSet.size > 0 && !reopenedSet.has(asg.date || '')) {
      closed = true;
      closedAt = closedAt || `${asg.date || todayStr} ${nowTimeStr}`;
      nonCompliant = false;
      nonCompliantReason = undefined;
      nonCompliantAt = undefined;
    }

    const nextCompletedDates = Array.from(completedSet).sort();
    const nextMissedDates = Array.from(missedSet).sort();
    const nextReopenedDates = Array.from(reopenedSet).sort();

    const changed =
      closed !== Boolean(asg.closed) ||
      (closedAt || '') !== (asg.closedAt || '') ||
      nonCompliant !== Boolean(asg.nonCompliant) ||
      (nonCompliantReason || '') !== (asg.nonCompliantReason || '') ||
      (nonCompliantAt || '') !== (asg.nonCompliantAt || '') ||
      !areStringArraysEqual(
        nextCompletedDates,
        asg.completedDates ? [...asg.completedDates].sort() : []
      ) ||
      !areStringArraysEqual(
        nextMissedDates,
        asg.missedDates ? [...asg.missedDates].sort() : []
      ) ||
      !areStringArraysEqual(
        nextReopenedDates,
        asg.reopenedDates ? [...asg.reopenedDates].sort() : []
      );

    if (!changed) {
      return asg;
    }

    changedAssignmentIds.add(asg.id);

    const updatedAsg: ClassAssignment = {
      ...asg,
      ...(nextCompletedDates.length > 0 || asg.completedDates
        ? { completedDates: nextCompletedDates }
        : {}),
      ...(nextMissedDates.length > 0 || asg.missedDates
        ? { missedDates: nextMissedDates }
        : {}),
      ...(nextReopenedDates.length > 0 || asg.reopenedDates
        ? { reopenedDates: nextReopenedDates }
        : {}),
      ...(closed || typeof asg.closed === 'boolean' ? { closed } : {}),
      ...(closed && closedAt ? { closedAt } : {}),
      ...(nonCompliant || typeof asg.nonCompliant === 'boolean' ? { nonCompliant } : {}),
      ...(nonCompliantReason ? { nonCompliantReason } : {}),
      ...(nonCompliantAt ? { nonCompliantAt } : {}),
    };

    if (!closed) {
      delete updatedAsg.closedAt;
    }
    if (!nonCompliant && nextMissedDates.length === 0) {
      delete updatedAsg.nonCompliantReason;
      delete updatedAsg.nonCompliantAt;
    }

    return updatedAsg;
  });

  return {
    assignments: reconciledAssignments,
    records: reconciledRecords,
    changedAssignmentIds,
    changedRecordIds,
  };
}

