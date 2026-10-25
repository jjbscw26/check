import React, { useState } from 'react';
import { 
  Building2, 
  MapPin, 
  Clock, 
  Activity, 
  Users, 
  FileCheck2, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  LogOut, 
  Sparkles,
  Flame,
  Calendar,
  CalendarDays,
  Search,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  X,
  Minus,
  Plus,
  ShieldCheck,
  Bell,
  BellOff,
  BellRing,
  AlarmClock,
  Volume2,
  Timer,
  Lock,
  AlertTriangle,
  Ban
} from 'lucide-react';
import { 
  AttendanceRecord, 
  Company, 
  Sede, 
  Trainer, 
  ActivityType, 
  GpsData, 
  PunctualityStatus,
  ClassAssignment,
  ActivityCatalogItem,
  TrainerBiometricSession,
} from '../types';
import { GpsVisualizer } from './GpsVisualizer';
import { CameraCapture } from './CameraCapture';
import { TrainerCheckOutModal } from './TrainerCheckOutModal';
import { SessionEndAlarmModal } from './SessionEndAlarmModal';
import {
  getDefaultDurationMinutes,
  getAssignmentDurationMinutes,
  calculateEndTimeHHMM,
  getSessionAlarmStatus,
  clampSnoozeIsoToGraceLimit,
  formatSecondsClock,
  requestAlarmNotificationPermission,
  playAlarmPattern,
  stopAlarmAudioImmediately,
  unlockMobileAlarmAudio,
  requestSessionWakeLock,
  releaseSessionWakeLock,
} from '../utils/sessionAlarm';
import {
  getAssignmentOccurrenceStatus,
  doesAssignmentApplyToDate,
  formatLocalYYYYMMDD,
} from '../utils/assignmentLock';
import confetti from 'canvas-confetti';

interface TrainerCheckInViewProps {
  currentTrainer: Trainer;
  trainerSession?: TrainerBiometricSession | null;
  onLogoutTrainerSession?: () => void;
  companies: Company[];
  records: AttendanceRecord[];
  assignments?: ClassAssignment[];
  activityCatalog?: ActivityCatalogItem[];
  onSaveRecord: (newRecord: AttendanceRecord) => void;
  onUpdateRecord: (updatedRecord: AttendanceRecord) => void;
}

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function formatDateFriendlySpanish(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const target = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const dayName = DAY_NAMES_ES[target.getDay()];
  const monthName = MONTH_NAMES_ES[target.getMonth()];
  return `${dayName}, ${parts[2]} de ${monthName} de ${parts[0]}`;
}

export function getAssignmentScheduleDetails(asg: ClassAssignment, refDate: Date = new Date()) {
  const todayStr = formatLocalYYYYMMDD(refDate);
  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);

  // 1. Fecha Única asignada
  if (asg.frequency === 'fecha_unica' && asg.date) {
    const [y, m, d] = asg.date.split('-').map(Number);
    const target = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayName = DAY_NAMES_ES[target.getDay()];
    const monthName = MONTH_NAMES_ES[target.getMonth()];
    const formattedLong = `${dayName}, ${d} de ${monthName} de ${y}`;
    const isToday = asg.date === todayStr;
    const isPast = target < ref && !isToday;

    return {
      dateStr: asg.date,
      formattedLong,
      formattedShort: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
      dayName,
      frequencyLabel: 'Fecha Única Asignada',
      frequencyType: 'fecha_unica' as const,
      isToday,
      isPast,
      badgeText: isToday ? '¡Hoy!' : isPast ? 'Fecha Pasada' : 'Fecha Específica',
      badgeClass: isToday 
        ? 'bg-red-600 text-white font-black' 
        : isPast 
          ? 'bg-slate-200 text-slate-700' 
          : 'bg-red-50 text-red-700 border border-red-200',
    };
  }

  // 2. Semanal
  if (asg.frequency === 'semanal') {
    const targetDow = asg.dayOfWeek || 1; // 1=Lunes .. 7=Domingo
    const jsDow = ref.getDay(); // 0=Sun .. 6=Sat
    const currentMondayIndexed = jsDow === 0 ? 7 : jsDow;

    let diffDays = targetDow - currentMondayIndexed;
    const isToday = diffDays === 0;

    // Next scheduled date (if today, next is today; if passed this week, next week)
    const nextSessionDate = new Date(ref);
    if (diffDays < 0) {
      diffDays += 7;
    }
    nextSessionDate.setDate(ref.getDate() + diffDays);

    const y = nextSessionDate.getFullYear();
    const m = nextSessionDate.getMonth() + 1;
    const d = nextSessionDate.getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayName = DAY_NAMES_ES[nextSessionDate.getDay()];
    const monthName = MONTH_NAMES_ES[nextSessionDate.getMonth()];
    const formattedLong = `${dayName}, ${d} de ${monthName} de ${y}`;

    return {
      dateStr,
      formattedLong,
      formattedShort: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
      dayName,
      frequencyLabel: `Semanal: Cada ${DAY_NAMES_ES[targetDow === 7 ? 0 : targetDow]}`,
      frequencyType: 'semanal' as const,
      isToday,
      isPast: false,
      badgeText: isToday ? '¡Hoy!' : diffDays === 1 ? 'Mañana' : `En ${diffDays} días`,
      badgeClass: isToday 
        ? 'bg-red-600 text-white font-black' 
        : 'bg-red-50 text-red-700 border border-red-200',
    };
  }

  // 3. Mensual
  const targetDom = asg.dayOfMonth || 1;
  const currentMonthSession = new Date(ref.getFullYear(), ref.getMonth(), targetDom, 0, 0, 0, 0);
  let nextSession = currentMonthSession;
  if (currentMonthSession < ref && currentMonthSession.getTime() !== ref.getTime()) {
    nextSession = new Date(ref.getFullYear(), ref.getMonth() + 1, targetDom, 0, 0, 0, 0);
  }

  const isToday = nextSession.getTime() === ref.getTime();
  const y = nextSession.getFullYear();
  const m = nextSession.getMonth() + 1;
  const d = nextSession.getDate();
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayName = DAY_NAMES_ES[nextSession.getDay()];
  const monthName = MONTH_NAMES_ES[nextSession.getMonth()];
  const formattedLong = `${dayName}, ${d} de ${monthName} de ${y}`;

  return {
    dateStr,
    formattedLong,
    formattedShort: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
    dayName,
    frequencyLabel: `Mensual: Día ${targetDom} de cada mes`,
    frequencyType: 'mensual' as const,
    isToday,
    isPast: false,
    badgeText: isToday ? '¡Hoy!' : `Día ${targetDom}`,
    badgeClass: isToday 
      ? 'bg-red-600 text-white font-black' 
      : 'bg-red-50 text-red-700 border border-red-200',
  };
}

export const TrainerCheckInView: React.FC<TrainerCheckInViewProps> = ({
  currentTrainer,
  trainerSession = null,
  onLogoutTrainerSession,
  companies,
  records,
  assignments = [],
  activityCatalog = [],
  onSaveRecord,
  onUpdateRecord,
}) => {
  // Strictly isolate records to the authenticated trainer only
  const trainerRecords = React.useMemo(
    () => records.filter((r) => r.trainerId === currentTrainer.id),
    [records, currentTrainer.id]
  );

  // Check if this trainer has an active session in progress
  const activeSession = trainerRecords.find((r) => r.status === 'en_curso');
  const autoBlockedSessionIdsRef = React.useRef<Set<string>>(new Set());

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [isTestAlarmModalOpen, setIsTestAlarmModalOpen] = useState(false);
  const [soundTestFeedback, setSoundTestFeedback] = useState<'idle' | 'ok' | 'blocked'>('idle');
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [notifPermission, setNotifPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  // Live 1-second tick + immediate wake catch-up for mobile screens
  React.useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, []);

  // Keep mobile screen awake (Screen Wake Lock API) while an active session has its alarm enabled
  React.useEffect(() => {
    let mounted = true;
    const shouldKeepAwake = Boolean(activeSession && activeSession.alarmEnabled !== false);

    if (!shouldKeepAwake) {
      releaseSessionWakeLock().then(() => {
        if (mounted) setWakeLockActive(false);
      });
      return;
    }

    const acquire = async () => {
      const ok = await requestSessionWakeLock();
      if (mounted) setWakeLockActive(ok);
    };

    acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldKeepAwake) {
        acquire();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeSession?.id, activeSession?.alarmEnabled]);

  // Form State — All fields start strictly BLANK and only fill when an assigned session is loaded
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const selectedCompany: Company | null = selectedCompanyId
    ? companies.find((c) => c.id === selectedCompanyId) || null
    : null;

  const [selectedSedeId, setSelectedSedeId] = useState<string>('');
  const selectedSede: Sede | null =
    selectedCompany && selectedSedeId
      ? selectedCompany.sedes.find((s) => s.id === selectedSedeId) || null
      : null;

  const now = new Date(nowMs);
  const todayYMD = formatLocalYYYYMMDD(now);

  const [sessionDate, setSessionDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [activityType, setActivityType] = useState<ActivityType | ''>('');
  const [activityName, setActivityName] = useState<string>('');
  const [plannedDurationInput, setPlannedDurationInput] = useState<string>('');
  const [alarmEnabled, setAlarmEnabled] = useState<boolean>(true);
  const [attendeesInput, setAttendeesInput] = useState<string>('');
  const [locationArea, setLocationArea] = useState<string>('');
  const [observations, setObservations] = useState<string>('');
  const [loadedAssignmentId, setLoadedAssignmentId] = useState<string | null>(null);

  // Trainer view filters for assignments
  const [assignmentFilterTab, setAssignmentFilterTab] = useState<
    'todas' | 'hoy' | 'proximas' | 'cerradas' | 'incumplidas'
  >('todas');
  const [assignmentViewMode, setAssignmentViewMode] = useState<'tarjetas' | 'calendario'>('tarjetas');
  const [assignmentSearch, setAssignmentSearch] = useState<string>('');
  const [calendarWeekOffset, setCalendarWeekOffset] = useState<number>(0);

  // Filter assignments for current trainer
  const trainerAssignments = assignments.filter((a) => a.trainerId === currentTrainer.id && a.active);
  const loadedAssignment = trainerAssignments.find((a) => a.id === loadedAssignmentId) || null;
  const loadedDateInfo = loadedAssignment ? getAssignmentScheduleDetails(loadedAssignment, now) : null;

  // Hardware / Verification state
  const [currentGps, setCurrentGps] = useState<GpsData | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearCheckInFormFields = React.useCallback(() => {
    setLoadedAssignmentId(null);
    setSelectedCompanyId('');
    setSelectedSedeId('');
    setSessionDate('');
    setScheduledTime('');
    setActivityType('');
    setActivityName('');
    setPlannedDurationInput('');
    setAttendeesInput('');
    setLocationArea('');
    setObservations('');
    setCurrentGps(null);
    setPhotoUrl(null);
  }, []);

  const handleLoadAssignment = (asg: ClassAssignment, targetDateOverride?: string) => {
    const details = getAssignmentScheduleDetails(asg, now);
    const targetDate = targetDateOverride || details.dateStr;
    const lockInfo = getAssignmentOccurrenceStatus(asg, targetDate, trainerRecords, activityCatalog, nowMs);

    if (lockInfo.isLocked) {
      if (loadedAssignmentId === asg.id) {
        clearCheckInFormFields();
      }
      if (lockInfo.isNonCompliant) {
        setValidationError(
          lockInfo.nonComplianceReason === 'sin_cierre_30m'
            ? `La sesión "${asg.activityName}" (${targetDate} · ${asg.time} hrs) se dio por NO CERRADA, fue bloqueada y su alarma quedó desactivada por exceder el máximo de 30 minutos sin cierre.`
            : `La sesión "${asg.activityName}" (${targetDate} · ${asg.time} hrs) superó los 20 minutos desde su inicio sin haberse cargado, por lo que se dio por CERRADA y bloqueada.`
        );
      } else if (lockInfo.isCompletedAndClosed) {
        setValidationError(
          `La sesión "${asg.activityName}" (${targetDate} · ${asg.time} hrs) ya fue completada y cerrada, por lo que está bloqueada.`
        );
      } else {
        setValidationError(
          `La sesión "${asg.activityName}" (${targetDate} · ${asg.time} hrs) ya se encuentra en curso y bloqueada.`
        );
      }
      return;
    }

    if (!lockInfo.canLoadNow) {
      if (loadedAssignmentId === asg.id) {
        clearCheckInFormFields();
      }
      if (lockInfo.loadWindowState === 'otro_dia') {
        setValidationError(
          `Solo se permite cargar datos el día exacto de la asignación (${targetDate}). Hoy es ${todayYMD}.`
        );
      } else if (lockInfo.loadWindowState === 'antes_de_30m') {
        setValidationError(
          `Aún no inicia el horario permitido de carga para "${asg.activityName}". Solo podrás cargar sus datos hoy desde 30 minutos antes de iniciar (${lockInfo.unlockTimeHHMM} hrs) y hasta máximo 20 minutos después de iniciada (${lockInfo.loadDeadlineHHMM} hrs).`
        );
      } else {
        setValidationError(
          `La sesión "${asg.activityName}" no se encuentra dentro de la ventana permitida de carga.`
        );
      }
      return;
    }

    setValidationError(null);
    const assignedDuration = getAssignmentDurationMinutes(asg, activityCatalog);
    setSelectedCompanyId(asg.companyId);
    setSelectedSedeId(asg.sedeId);
    setSessionDate(targetDate);
    setScheduledTime(asg.time);
    setActivityType(asg.activityType);
    setActivityName(asg.activityName);
    setPlannedDurationInput(String(assignedDuration));
    setLocationArea(asg.locationArea);
    setAttendeesInput('');
    setObservations('');
    setCurrentGps(null);
    setPhotoUrl(null);
    setLoadedAssignmentId(asg.id);

    const formEl = document.getElementById('nuevo-registro-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Clear all form fields, loaded assignment, and test modal if trainer changes
  React.useEffect(() => {
    clearCheckInFormFields();
    setValidationError(null);
    setIsTestAlarmModalOpen(false);
  }, [currentTrainer.id, clearCheckInFormFields]);

  // If a loaded session crosses +20 minutes after start without being registered, auto-clear and close it
  React.useEffect(() => {
    if (!loadedAssignment) return;
    const targetDate = sessionDate || todayYMD;
    const st = getAssignmentOccurrenceStatus(
      loadedAssignment,
      targetDate,
      trainerRecords,
      activityCatalog,
      nowMs
    );
    if (!st.canLoadNow) {
      const expiredName = loadedAssignment.activityName;
      const expiredTime = loadedAssignment.time;
      clearCheckInFormFields();
      if (st.loadWindowState === 'cerrada_20m' || st.isNonCompliant) {
        setValidationError(
          `Transcurrieron más de 20 minutos desde el inicio programado de "${expiredName}" (${expiredTime} hrs) sin registrar la entrada. La sesión se dio por cerrada y los campos volvieron a quedar en blanco.`
        );
      }
    }
  }, [loadedAssignment, sessionDate, todayYMD, trainerRecords, activityCatalog, nowMs, clearCheckInFormFields]);

  // Evaluate whether the currently loaded assignment is locked
  const activeFormLockCheck = (() => {
    if (!loadedAssignment) return null;
    const targetDate = sessionDate || todayYMD;
    const st = getAssignmentOccurrenceStatus(
      loadedAssignment,
      targetDate,
      trainerRecords,
      activityCatalog,
      nowMs
    );
    if (st.isLocked) {
      return { assignment: loadedAssignment, lockInfo: st };
    }
    return null;
  })();

  // Calculate punctuality relative to scheduled time
  const calculatePunctuality = (schedTime: string, nowTime: Date) => {
    const [schedH, schedM] = schedTime.split(':').map(Number);
    const schedDate = new Date(nowTime);
    schedDate.setHours(schedH, schedM, 0, 0);

    const diffMinutes = Math.round((schedDate.getTime() - nowTime.getTime()) / 60000);

    let punctualityStatus: PunctualityStatus = 'a_tiempo';
    if (diffMinutes < -5) {
      punctualityStatus = 'con_retraso';
    } else if (diffMinutes > 15) {
      punctualityStatus = 'adelantado';
    }

    return {
      status: punctualityStatus,
      diffMinutes,
    };
  };

  const handleCheckInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!loadedAssignment || !selectedCompany || !selectedSede || !activityType || !sessionDate || !scheduledTime) {
      setValidationError(
        'Debes cargar primero una sesión asignada del día de hoy (dentro de los 30 minutos previos al inicio y hasta 20 minutos después de iniciada) para llenar los datos de la sede.'
      );
      return;
    }

    const checkInDate = new Date();
    const dateFormatted = formatLocalYYYYMMDD(checkInDate);

    if (sessionDate !== dateFormatted || !doesAssignmentApplyToDate(loadedAssignment, dateFormatted)) {
      clearCheckInFormFields();
      setValidationError('Solo se permite registrar datos el día exacto de la asignación.');
      return;
    }

    const liveStatus = getAssignmentOccurrenceStatus(
      loadedAssignment,
      sessionDate,
      trainerRecords,
      activityCatalog,
      checkInDate.getTime()
    );

    if (liveStatus.isLocked || !liveStatus.canLoadNow) {
      clearCheckInFormFields();
      setValidationError(
        liveStatus.loadWindowState === 'cerrada_20m' || liveStatus.isNonCompliant
          ? `La sesión "${loadedAssignment.activityName}" superó los 20 minutos posteriores a su inicio sin cargarse y fue dada por cerrada.`
          : `La sesión "${loadedAssignment.activityName}" no está dentro del horario permitido de carga (-30 min a +20 min del inicio).`
      );
      return;
    }

    if (!photoUrl) {
      setValidationError('La foto obligatoria de presencia en el salón es OBLIGATORIA.');
      return;
    }

    unlockMobileAlarmAudio();
    if (alarmEnabled) {
      requestSessionWakeLock().then((ok) => setWakeLockActive(ok));
    }

    setIsSubmitting(true);

    const checkInTime = checkInDate.toLocaleTimeString('es-MX', { hour12: false });
    const checkInIso = checkInDate.toISOString();

    const { status: punctualityStatus, diffMinutes } = calculatePunctuality(
      scheduledTime,
      checkInDate
    );

    const fallbackGps: GpsData = currentGps || {
      lat: selectedSede.lat,
      lng: selectedSede.lng,
      accuracy: 6,
      distanceToSedeMeters: 12,
      isWithinGeofence: true,
      capturedAt: checkInTime,
    };

    const parsedDuration = Math.max(
      1,
      Math.min(
        240,
        parseInt(plannedDurationInput, 10) ||
          getDefaultDurationMinutes(activityType, activityName, activityCatalog)
      )
    );

    const newRecord: AttendanceRecord = {
      id: `rec_${Date.now()}`,
      assignmentId: loadedAssignment.id,
      trainerId: currentTrainer.id,
      trainerName: currentTrainer.name,
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      sedeId: selectedSede.id,
      sedeName: selectedSede.name,
      sedeAddress: selectedSede.address,
      date: sessionDate,
      scheduledTime,
      checkInTime,
      checkInIso,
      checkOutTime: null,
      status: 'en_curso',
      punctualityStatus,
      punctualityDiffMinutes: diffMinutes,
      activityType,
      activityName,
      attendeesCount: attendeesInput.trim() === '' ? 0 : Math.max(0, parseInt(attendeesInput, 10) || 0),
      locationArea,
      observations,
      checkInGps: fallbackGps,
      photoUrl,
      plannedDurationMinutes: parsedDuration,
      alarmEnabled,
      alarmSnoozedUntilIso: null,
      adminVerified: false,
    };

    onSaveRecord(newRecord);
    setIsSubmitting(false);

    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {}

    // Reset all fields back to blank after registering entry
    clearCheckInFormFields();
  };

  const handleCheckoutConfirm = (
    recordId: string,
    checkoutData: {
      checkOutTime: string;
      checkOutIso: string;
      finalAttendees: number;
      observations: string;
      exitPhotoUrl: string;
      exitGps?: GpsData;
      durationMinutes: number;
    }
  ) => {
    if (!activeSession) return;

    // Prevent checkout if 30-min unclosed deadline already passed
    const checkStatus = getSessionAlarmStatus(activeSession, activityCatalog, Date.now());
    if (checkStatus.hasExceededUnclosedGrace) {
      stopAlarmAudioImmediately();
      void releaseSessionWakeLock();
      setCheckoutModalOpen(false);
      setIsTestAlarmModalOpen(false);
      return;
    }

    stopAlarmAudioImmediately();
    const updated: AttendanceRecord = {
      ...activeSession,
      checkOutTime: checkoutData.checkOutTime,
      checkOutIso: checkoutData.checkOutIso,
      status: 'completado',
      attendeesCount: checkoutData.finalAttendees,
      observations: checkoutData.observations || activeSession.observations,
      exitPhotoUrl: checkoutData.exitPhotoUrl,
      checkOutGps: checkoutData.exitGps,
      durationMinutes: checkoutData.durationMinutes,
      alarmEnabled: false,
      alarmSnoozedUntilIso: null,
    };

    onUpdateRecord(updated);
    setCheckoutModalOpen(false);
    setIsTestAlarmModalOpen(false);
  };

  const activeSessionAlarm = activeSession
    ? getSessionAlarmStatus(activeSession, activityCatalog, nowMs)
    : null;

  // Immediate 1-second enforcement: if an unclosed session reaches 30 minutes max after ending,
  // mark it as not closed ('incumplido' / 'sin_cierre_30m'), lock it, and deactivate the alarm once.
  React.useEffect(() => {
    if (!activeSession || !activeSessionAlarm?.hasExceededUnclosedGrace) return;
    if (autoBlockedSessionIdsRef.current.has(activeSession.id)) return;
    autoBlockedSessionIdsRef.current.add(activeSession.id);

    stopAlarmAudioImmediately();
    void releaseSessionWakeLock();
    setWakeLockActive(false);
    setCheckoutModalOpen(false);
    setIsTestAlarmModalOpen(false);

    const nowTimeStr = new Date().toLocaleTimeString('es-MX', { hour12: false });
    const autoNote = `[Sistema BSCW] Sesión dada por NO CERRADA, bloqueada y alarma desactivada automáticamente en el lapso máximo de 30 min tras finalizar (${activeSessionAlarm.autoLockDeadlineFormatted} hrs).`;
    const mergedObs = activeSession.observations
      ? activeSession.observations.includes('[Sistema BSCW]')
        ? activeSession.observations
        : `${activeSession.observations} | ${autoNote}`
      : autoNote;

    onUpdateRecord({
      ...activeSession,
      status: 'incumplido',
      nonComplianceReason: 'sin_cierre_30m',
      markedNonCompliantAt: nowTimeStr,
      alarmEnabled: false,
      alarmSnoozedUntilIso: null,
      observations: mergedObs,
    });
  }, [activeSession, activeSessionAlarm?.hasExceededUnclosedGrace, activeSessionAlarm?.autoLockDeadlineFormatted, onUpdateRecord]);

  const recentAutoBlockedUnclosedSession = trainerRecords.find(
    (r) =>
      r.date === todayYMD &&
      r.status === 'incumplido' &&
      r.nonComplianceReason === 'sin_cierre_30m'
  );

  const handleSnoozeActiveAlarm = (minutes: number) => {
    if (!activeSession || !activeSessionAlarm) {
      setIsTestAlarmModalOpen(false);
      return;
    }
    const clampedSnoozeIso = clampSnoozeIsoToGraceLimit(activeSessionAlarm, minutes, Date.now());
    if (!clampedSnoozeIso) {
      stopAlarmAudioImmediately();
      setIsTestAlarmModalOpen(false);
      return;
    }
    onUpdateRecord({
      ...activeSession,
      alarmSnoozedUntilIso: clampedSnoozeIso,
    });
    setIsTestAlarmModalOpen(false);
  };

  const handleToggleActiveSessionAlarm = () => {
    if (!activeSession) return;
    const currentlyEnabled = activeSession.alarmEnabled !== false;
    if (currentlyEnabled) {
      stopAlarmAudioImmediately();
    }
    onUpdateRecord({
      ...activeSession,
      alarmEnabled: !currentlyEnabled,
      alarmSnoozedUntilIso: null,
    });
  };

  const handleAdjustActiveDuration = (deltaMinutes: number) => {
    if (!activeSession || !activeSessionAlarm) return;
    const nextDuration = Math.max(1, Math.min(240, activeSessionAlarm.plannedDurationMinutes + deltaMinutes));
    onUpdateRecord({
      ...activeSession,
      plannedDurationMinutes: nextDuration,
      alarmSnoozedUntilIso: null,
    });
  };

  const handleEnableBrowserNotif = async () => {
    const perm = await requestAlarmNotificationPermission();
    setNotifPermission(perm);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Notice if a session today exceeded the 30-min max closure window */}
      {!activeSession && recentAutoBlockedUnclosedSession && (
        <div className="bg-rose-950 text-white rounded-2xl p-4 sm:p-5 border border-rose-800 shadow-sm flex items-start space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-900 border border-rose-700 text-rose-200 flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5" />
          </div>
          <div className="text-xs sm:text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2 font-bold text-rose-200">
              <span>Sesión dada por No Cerrada y Bloqueada (30 min máx.)</span>
              <span aria-hidden="true">·</span>
              <span>Alarma Desactivada</span>
            </div>
            <p className="text-rose-100">
              La sesión <strong>{recentAutoBlockedUnclosedSession.activityName}</strong> en{' '}
              <strong>
                {recentAutoBlockedUnclosedSession.companyName} — {recentAutoBlockedUnclosedSession.sedeName}
              </strong>{' '}
              (entrada <span className="font-mono tabular-nums">{recentAutoBlockedUnclosedSession.checkInTime}</span>) no fue cerrada en el lapso máximo de 30 minutos posteriores a finalizar. Quedó bloqueada como no cerrada y su alarma fue desactivada automáticamente.
            </p>
          </div>
        </div>
      )}
      {/* Active Session Alert Banner with Live Countdown & Session-End Alarm */}
      {activeSession && activeSessionAlarm && (
        <div
          className={`text-white rounded-2xl p-5 shadow-xl relative overflow-hidden transition-colors ${
            activeSessionAlarm.isOverdue
              ? 'bg-gradient-to-r from-red-700 via-rose-700 to-amber-700 ring-2 ring-amber-300'
              : activeSessionAlarm.isNearEnd
                ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-red-600'
                : 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative">
            <div className="flex items-start space-x-3.5">
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 shadow-inner ${
                  activeSessionAlarm.isOverdue
                    ? 'bg-amber-300 border-amber-200 text-slate-950'
                    : 'bg-white/20 border-white/30 text-white'
                }`}
              >
                {activeSessionAlarm.isOverdue ? (
                  <BellRing className="w-6 h-6 stroke-[2.5]" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold tracking-wider shadow-sm ${
                      activeSessionAlarm.isOverdue
                        ? 'bg-amber-300 text-slate-950'
                        : 'bg-white text-red-700'
                    }`}
                  >
                    {activeSessionAlarm.isOverdue
                      ? 'SESIÓN FINALIZADA — SALIDA PENDIENTE'
                      : activeSessionAlarm.isNearEnd
                        ? 'SESIÓN POR FINALIZAR'
                        : 'SESIÓN EN CURSO'}
                  </span>
                  <span className="text-xs text-red-100 font-mono tabular-nums">
                    Fecha: {activeSession.date} · Inició: {activeSession.checkInTime}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white mt-1">
                  {activeSession.companyName} — {activeSession.sedeName}
                </h3>
                <p className="text-xs text-red-100">
                  {activeSession.activityName} ({activeSession.locationArea})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCheckoutModalOpen(true)}
              className={`px-5 py-3 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center space-x-2 transition hover:scale-105 active:scale-95 shrink-0 ${
                activeSessionAlarm.isOverdue
                  ? 'bg-amber-300 hover:bg-amber-200 text-slate-950'
                  : 'bg-slate-900 hover:bg-black text-white'
              }`}
            >
              <LogOut className={`w-4 h-4 ${activeSessionAlarm.isOverdue ? 'text-red-700' : 'text-red-400'}`} />
              <span>Registrar Salida de Sede</span>
            </button>
          </div>

          {/* Live Session Alarm & Countdown Bar */}
          <div className="mt-4 pt-3.5 border-t border-white/20 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center font-bold bg-black/25 px-2.5 py-1 rounded-lg">
                  <AlarmClock className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
                  {activeSessionAlarm.isOverdue ? (
                    <span>
                      Tiempo excedido sin registrar salida:{' '}
                      <strong className="font-mono text-amber-300 ml-1">
                        +{formatSecondsClock(activeSessionAlarm.overdueSeconds)}
                      </strong>
                    </span>
                  ) : (
                    <span>
                      Alarma de salida en:{' '}
                      <strong className="font-mono text-white ml-1">
                        {formatSecondsClock(activeSessionAlarm.remainingSeconds)}
                      </strong>
                    </span>
                  )}
                </span>

                <span className="text-[11px] text-red-100 font-mono">
                  Duración prog.: {activeSessionAlarm.plannedDurationMinutes} min (Fin est.{' '}
                  {activeSessionAlarm.expectedEndTimeFormatted})
                </span>

                {activeSessionAlarm.isSnoozed && activeSessionAlarm.snoozedUntilMs && (
                  <span className="px-2 py-0.5 rounded bg-amber-300/25 border border-amber-200/40 text-[10px] font-bold text-amber-100">
                    Pospuesta ({formatSecondsClock(Math.max(0, Math.floor((activeSessionAlarm.snoozedUntilMs - nowMs) / 1000)))})
                  </span>
                )}
              </div>

              {/* Quick Alarm Controls on Active Banner */}
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center bg-black/25 rounded-lg p-0.5 border border-white/15">
                  <button
                    type="button"
                    onClick={() => handleAdjustActiveDuration(-5)}
                    className="px-2 py-1 text-[11px] font-bold hover:bg-white/15 rounded-md transition"
                    title="Restar 5 minutos a la duración de la alarma"
                  >
                    -5m
                  </button>
                  <span className="px-1.5 text-[10px] font-mono text-red-100">
                    {activeSessionAlarm.plannedDurationMinutes}m
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAdjustActiveDuration(5)}
                    className="px-2 py-1 text-[11px] font-bold hover:bg-white/15 rounded-md transition"
                    title="Sumar 5 minutos a la duración de la alarma"
                  >
                    +5m
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleToggleActiveSessionAlarm}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center space-x-1 transition ${
                    activeSessionAlarm.alarmEnabled
                      ? 'bg-white/20 border-white/30 text-white hover:bg-white/30'
                      : 'bg-black/35 border-white/15 text-red-200 hover:bg-black/50'
                  }`}
                  title="Activar o desactivar alarma de fin de sesión"
                >
                  {activeSessionAlarm.alarmEnabled ? (
                    <>
                      <Bell className="w-3.5 h-3.5 text-amber-300" />
                      <span>Alarma Activa</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-3.5 h-3.5 text-red-200" />
                      <span>Alarma Off</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    unlockMobileAlarmAudio();
                    playAlarmPattern({ fromUserGesture: true });
                    setIsTestAlarmModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center space-x-1 transition"
                  title="Probar cómo suena y se muestra la alarma de salida en este celular"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-200" />
                  <span>Probar Alarma</span>
                </button>
                {wakeLockActive && (
                  <span
                    className="text-[10px] text-emerald-200 font-semibold px-1.5"
                    title="Pantalla activa para que el celular no suspenda la alarma durante la sesión"
                  >
                    ● Pantalla activa
                  </span>
                )}
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full h-2 rounded-full bg-black/25 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeSessionAlarm.isOverdue
                    ? 'bg-amber-300'
                    : activeSessionAlarm.isNearEnd
                      ? 'bg-amber-200'
                      : 'bg-white'
                }`}
                style={{ width: `${activeSessionAlarm.progressPercent}%` }}
              />
            </div>

            {/* 30-Minute Non-Compliance Grace Countdown Warning */}
            {activeSessionAlarm.isOverdue && (
              <div className="p-2.5 rounded-xl bg-black/30 border border-amber-300/60 text-[11px] text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start sm:items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5 sm:mt-0" />
                  <span>
                    <strong>Límite máximo de cierre (30 min):</strong> Si no registras la salida antes de las{' '}
                    <strong className="font-mono tabular-nums text-white">{activeSessionAlarm.autoLockDeadlineFormatted} hrs</strong>,
                    la sesión se dará por <strong>NO CERRADA, quedará BLOQUEADA y la alarma se desactivará</strong>.
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-300 text-slate-950 font-mono tabular-nums font-black text-xs shrink-0 self-start sm:self-center whitespace-nowrap">
                  Restan {formatSecondsClock(activeSessionAlarm.remainingBeforeNonComplianceSeconds)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trainer Individual Session Profile Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <img
            src={currentTrainer.avatar}
            alt={currentTrainer.name}
            className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm shrink-0"
          />
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h2 className="text-lg font-bold text-slate-900">{currentTrainer.name}</h2>
              <span className="text-xs text-slate-400" aria-hidden="true">·</span>
              <span className="text-xs font-semibold text-emerald-700">
                Sesión Individual Biométrica
                {trainerSession ? ` (${trainerSession.confidenceScore}%)` : ''}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentTrainer.email}
              {trainerSession ? ` · Acceso facial ${trainerSession.authenticatedAt}` : ''}
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {currentTrainer.specialties.join(' · ')}
            </p>
          </div>
        </div>

        {/* Mini stats + Session Actions */}
        <div className="flex flex-wrap sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-6 gap-3">
          <div className="flex items-center gap-5 text-center sm:text-right">
            <div>
              <span className="text-xs text-slate-500 block font-medium">Mis Visitas</span>
              <span className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                {trainerRecords.length}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block font-medium">Mis Asignaciones</span>
              <span className="text-lg font-bold text-red-600 font-mono tabular-nums">
                {trainerAssignments.length}
              </span>
            </div>
          </div>

          {onLogoutTrainerSession && (
            <button
              type="button"
              onClick={onLogoutTrainerSession}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-700 border border-red-200 hover:border-red-300 text-xs font-semibold transition whitespace-nowrap shrink-0"
              title="Cerrar mi sesión individual para otro entrenador"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Cerrar Mi Sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty state if authenticated trainer currently has no assigned sessions */}
      {trainerAssignments.length === 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 text-center space-y-2 shadow-sm">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">
            No tienes sesiones asignadas activas en tu perfil
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            En tu sesión individual solo se muestran las clases y sedes programadas específicamente para <strong>{currentTrainer.name}</strong>.
          </p>
        </div>
      )}

      {/* Assigned Classes Section with Explicit Dates and Schedules */}
      {trainerAssignments.length > 0 && (() => {
        const assignmentsWithDetails = trainerAssignments
          .map((asg) => {
            const details = getAssignmentScheduleDetails(asg, now);
            const lockInfo = getAssignmentOccurrenceStatus(
              asg,
              details.dateStr,
              trainerRecords,
              activityCatalog,
              nowMs
            );
            return {
              assignment: asg,
              details,
              lockInfo,
            };
          })
          .sort((a, b) => {
            // Keep available today first, in-progress second, upcoming third, non-compliant fourth, and completed/closed fifth
            const rank = (item: {
              details: ReturnType<typeof getAssignmentScheduleDetails>;
              lockInfo: ReturnType<typeof getAssignmentOccurrenceStatus>;
            }) => {
              if (item.lockInfo.isCompletedAndClosed) return 4;
              if (item.lockInfo.isNonCompliant) return 3;
              if (item.lockInfo.state === 'en_curso') return 1;
              if (item.details.isToday) return 0;
              return 2;
            };
            const diff = rank(a) - rank(b);
            if (diff !== 0) return diff;
            return a.assignment.time.localeCompare(b.assignment.time);
          });

        const todayAssignmentsCount = assignmentsWithDetails.filter(
          (item) =>
            item.details.isToday &&
            !item.lockInfo.isCompletedAndClosed &&
            !item.lockInfo.isNonCompliant
        ).length;
        const upcomingAssignmentsCount = assignmentsWithDetails.filter(
          (item) =>
            !item.details.isPast &&
            !item.details.isToday &&
            !item.lockInfo.isCompletedAndClosed &&
            !item.lockInfo.isNonCompliant
        ).length;
        const closedAssignmentsCount = assignmentsWithDetails.filter(
          (item) => item.lockInfo.isCompletedAndClosed
        ).length;
        const nonCompliantAssignmentsCount = assignmentsWithDetails.filter(
          (item) => item.lockInfo.isNonCompliant
        ).length;

        const filteredList = assignmentsWithDetails.filter(({ assignment, details, lockInfo }) => {
          if (
            assignmentFilterTab === 'hoy' &&
            (!details.isToday || lockInfo.isCompletedAndClosed || lockInfo.isNonCompliant)
          ) {
            return false;
          }
          if (
            assignmentFilterTab === 'proximas' &&
            (details.isPast ||
              details.isToday ||
              lockInfo.isCompletedAndClosed ||
              lockInfo.isNonCompliant)
          ) {
            return false;
          }
          if (assignmentFilterTab === 'cerradas' && !lockInfo.isCompletedAndClosed) return false;
          if (assignmentFilterTab === 'incumplidas' && !lockInfo.isNonCompliant) return false;

          if (assignmentSearch.trim()) {
            const q = assignmentSearch.toLowerCase();
            const matchAct = assignment.activityName.toLowerCase().includes(q);
            const matchComp = assignment.companyName.toLowerCase().includes(q);
            const matchSede = assignment.sedeName.toLowerCase().includes(q);
            const matchDate = details.formattedLong.toLowerCase().includes(q) || details.dateStr.includes(q);
            if (!matchAct && !matchComp && !matchSede && !matchDate) return false;
          }
          return true;
        });

        // 7-day week calculation for calendar mode
        const weekRefDate = new Date(now);
        const jsDay = weekRefDate.getDay();
        const monIdx = jsDay === 0 ? 7 : jsDay;
        weekRefDate.setDate(weekRefDate.getDate() - (monIdx - 1) + (calendarWeekOffset * 7));
        weekRefDate.setHours(0, 0, 0, 0);

        const weekDays = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(weekRefDate);
          d.setDate(weekRefDate.getDate() + i);
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          const dayNum = d.getDate();
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const isToday = dateStr === todayYMD;
          const dow = i + 1; // 1=Lunes .. 7=Domingo

          const dayAssignments = trainerAssignments.filter((asg) => {
            if (asg.frequency === 'fecha_unica') {
              return asg.date === dateStr;
            }
            if (asg.frequency === 'semanal') {
              return asg.dayOfWeek === dow;
            }
            if (asg.frequency === 'mensual') {
              return (asg.dayOfMonth || 1) === dayNum;
            }
            return false;
          });

          return {
            date: d,
            dateStr,
            dayNum,
            dayName: DAY_NAMES_ES[d.getDay()],
            monthName: MONTH_NAMES_ES[d.getMonth()],
            isToday,
            dayAssignments,
          };
        });

        return (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="flex items-start sm:items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0 shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      Clases y Horarios Asignados por Administración
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Solo se permite cargar datos el día exacto asignado, desde 30 min antes de iniciar hasta 20 min después de iniciada la sesión.
                  </p>
                </div>
              </div>

              {/* View Switcher: Cards vs Calendar */}
              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setAssignmentViewMode('tarjetas')}
                    className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition whitespace-nowrap shrink-0 ${
                      assignmentViewMode === 'tarjetas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-red-600" />
                    <span>Tarjetas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignmentViewMode('calendario')}
                    className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition whitespace-nowrap shrink-0 ${
                      assignmentViewMode === 'calendario'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CalendarDays className="w-3.5 h-3.5 text-red-600" />
                    <span>Mi Calendario</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Tabs and Quick Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
                <button
                  type="button"
                  onClick={() => setAssignmentFilterTab('todas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 tabular-nums ${
                    assignmentFilterTab === 'todas'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas ({trainerAssignments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilterTab('hoy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 flex items-center space-x-1.5 tabular-nums ${
                    assignmentFilterTab === 'hoy'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Para Hoy ({todayAssignmentsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilterTab('proximas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 tabular-nums ${
                    assignmentFilterTab === 'proximas'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Próximas Fechas ({upcomingAssignmentsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilterTab('cerradas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 flex items-center space-x-1.5 tabular-nums ${
                    assignmentFilterTab === 'cerradas'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>Completadas y Cerradas ({closedAssignmentsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilterTab('incumplidas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 flex items-center space-x-1.5 tabular-nums ${
                    assignmentFilterTab === 'incumplidas'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <Ban className="w-3 h-3" />
                  <span>Cerradas / No Cerradas ({nonCompliantAssignmentsCount})</span>
                </button>
              </div>

              {/* Quick Search */}
              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  placeholder="Buscar por sede, fecha, clase..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
                {assignmentSearch && (
                  <button
                    type="button"
                    onClick={() => setAssignmentSearch('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* View 1: Detailed Cards View */}
            {assignmentViewMode === 'tarjetas' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {filteredList.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    No se encontraron asignaciones con los filtros seleccionados.
                  </div>
                ) : (
                  filteredList.map(({ assignment: asg, details, lockInfo }) => {
                    const isLoaded =
                      loadedAssignmentId === asg.id && lockInfo.canLoadNow && !lockInfo.isLocked;
                    const isClosed = lockInfo.isCompletedAndClosed;
                    const isNonCompliant = lockInfo.isNonCompliant;
                    const isInProgress = lockInfo.state === 'en_curso';

                    return (
                      <div
                        key={asg.id}
                        className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-3 shadow-xs ${
                          isNonCompliant
                            ? 'border-rose-300 bg-rose-50/50 ring-1 ring-rose-200/80'
                            : isClosed
                              ? 'border-slate-300 bg-slate-100/80'
                              : isInProgress
                                ? 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-200'
                                : isLoaded
                                  ? 'border-red-500 bg-red-50/40 ring-2 ring-red-400/80 shadow-md'
                                  : details.isToday
                                    ? 'border-red-300 bg-red-50/20 hover:border-red-400 ring-1 ring-red-200'
                                    : 'border-slate-200 bg-white hover:border-red-200 hover:bg-slate-50/60'
                        }`}
                      >
                        {/* Top Prominent Date & Lock Status Banner */}
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2.5 border-b border-slate-200/80">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              {isNonCompliant ? (
                                <span className="inline-flex items-center font-bold text-rose-700">
                                  <Ban className="w-3.5 h-3.5 mr-1 text-rose-600" />
                                  {lockInfo.nonComplianceReason === 'sin_cierre_30m'
                                    ? 'No Cerrada (+30m) · Bloqueada'
                                    : 'Cerrada · No Cargada (+20m)'}
                                </span>
                              ) : isClosed ? (
                                <span className="inline-flex items-center font-bold text-emerald-800">
                                  <Lock className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                  Completada y Cerrada
                                </span>
                              ) : isInProgress ? (
                                <span className="inline-flex items-center font-bold text-amber-800">
                                  <Lock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                                  En Curso · Bloqueada
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center font-bold ${
                                    details.isToday ? 'text-red-600' : 'text-slate-700'
                                  }`}
                                >
                                  <Calendar className="w-3.5 h-3.5 mr-1 text-red-600" />
                                  {details.isToday ? 'Asignada Hoy' : details.badgeText}
                                </span>
                              )}
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums font-bold text-slate-700">
                                {details.formattedShort}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2 text-xs font-mono tabular-nums">
                              {(() => {
                                const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
                                const endHHMM = calculateEndTimeHHMM(asg.time, durMins);
                                return (
                                  <>
                                    <span
                                      className={`font-bold flex items-center ${
                                        isClosed || isNonCompliant
                                          ? 'text-slate-500 line-through'
                                          : 'text-red-600'
                                      }`}
                                    >
                                      <Clock className="w-3.5 h-3.5 mr-1 shrink-0" />
                                      {asg.time}{endHHMM ? `–${endHHMM}` : ' hrs'}
                                    </span>
                                    <span className="text-slate-300" aria-hidden="true">·</span>
                                    <span className="font-semibold text-slate-600">
                                      {durMins} min
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Full Date In Spanish Callout */}
                          <div className="mt-2 text-xs font-bold text-slate-900 flex items-center justify-between gap-2">
                            <span>{details.formattedLong}</span>
                            {!isNonCompliant && !isClosed && !isInProgress && lockInfo.unlockTimeHHMM && lockInfo.loadDeadlineHHMM && (
                              <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600">
                                Carga: {lockInfo.unlockTimeHHMM}–{lockInfo.loadDeadlineHHMM} hrs
                              </span>
                            )}
                          </div>

                          {/* Recurrence description */}
                          <div className="mt-1 flex items-center text-[11px] text-slate-500 font-medium">
                            <Repeat className="w-3 h-3 mr-1 text-slate-400" />
                            <span>{details.frequencyLabel}</span>
                          </div>

                          {/* Activity Name */}
                          <h4
                            className={`font-bold text-sm mt-2 leading-snug ${
                              isClosed ? 'text-slate-700' : isNonCompliant ? 'text-rose-950' : 'text-slate-900'
                            }`}
                          >
                            {asg.activityName}
                          </h4>

                          {/* Company & Sede */}
                          <div className="text-xs text-slate-700 mt-1.5 flex items-center flex-wrap gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-900">{asg.companyName}</span>
                            <span className="text-slate-300" aria-hidden="true">·</span>
                            <span className="text-slate-600 font-medium">{asg.sedeName}</span>
                          </div>

                          {/* Address & Room */}
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center flex-wrap gap-x-2 gap-y-0.5">
                            <span className="flex items-center">
                              <MapPin className="w-3 h-3 text-red-500 mr-0.5 shrink-0" />
                              {asg.locationArea}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">~{asg.expectedAttendees || 15} participantes</span>
                          </div>

                          {/* Non-Compliant / Closure / In-Progress Audit Seal */}
                          {isNonCompliant && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-rose-100/80 border border-rose-300 text-[11px] text-rose-950 flex items-start space-x-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-extrabold block text-rose-900">
                                  {lockInfo.nonComplianceReason === 'sin_cierre_30m'
                                    ? 'Sesión No Cerrada — Excedió 30 min máx. (Bloqueada · Alarma desactivada)'
                                    : 'Sesión Cerrada — No se cargó pasados 20 minutos de iniciada'}
                                </span>
                                {lockInfo.detailText && (
                                  <span className="text-rose-800 font-mono tabular-nums text-[10px] block mt-0.5">
                                    {lockInfo.detailText}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {isClosed && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-[11px] text-emerald-950 flex items-start space-x-2">
                              <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-extrabold block text-emerald-900">
                                  Sesión Completada y Cerrada (No se puede repetir)
                                </span>
                                {lockInfo.detailText && (
                                  <span className="text-emerald-800 font-mono tabular-nums text-[10px] block mt-0.5">
                                    {lockInfo.detailText}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {isInProgress && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex items-start space-x-2">
                              <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-extrabold block text-amber-900">
                                  Sesión Actualmente en Curso
                                </span>
                                {lockInfo.detailText && (
                                  <span className="text-amber-800 font-mono tabular-nums text-[10px] block mt-0.5">
                                    {lockInfo.detailText}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Admin Notes */}
                          {asg.notes && !isClosed && !isNonCompliant && (
                            <div className="mt-2 p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900">
                              <span className="font-bold">Nota de Admin:</span> {asg.notes}
                            </div>
                          )}
                        </div>

                        {/* Action Button — Enforces Exact Day & [-30 min, +20 min] Load Window */}
                        {lockInfo.isLocked ? (
                          <button
                            type="button"
                            disabled
                            className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center space-x-2 cursor-not-allowed select-none ${
                              isNonCompliant
                                ? 'bg-rose-200/80 text-rose-900 border-rose-300'
                                : isClosed
                                  ? 'bg-slate-200/90 text-slate-600 border-slate-300'
                                  : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {isNonCompliant
                                ? lockInfo.nonComplianceReason === 'sin_cierre_30m'
                                  ? 'No Cerrada (+30 min) — Bloqueada · Alarma Off'
                                  : 'Sesión Cerrada — No cargada (+20 min)'
                                : isClosed
                                  ? 'Bloqueada — Completada y Cerrada'
                                  : 'Bloqueada — Sesión en Curso'}
                            </span>
                          </button>
                        ) : !lockInfo.canLoadNow ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-2.5 px-3 rounded-xl font-bold text-xs border bg-slate-100 text-slate-500 border-slate-300 flex items-center justify-center space-x-2 cursor-not-allowed select-none"
                          >
                            {lockInfo.loadWindowState === 'antes_de_30m' ? (
                              <>
                                <Clock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                                <span className="font-mono tabular-nums truncate">
                                  Habilitada hoy {lockInfo.unlockTimeHHMM} hrs (-30m · en {formatSecondsClock(lockInfo.secondsUntilLoadOpen ?? 0)})
                                </span>
                              </>
                            ) : (
                              <>
                                <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                                <span className="truncate">
                                  Solo el día exacto ({details.formattedShort})
                                </span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLoadAssignment(asg, details.dateStr)}
                            className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2 ${
                              isLoaded
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/20'
                                : 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate tabular-nums">
                              {isLoaded
                                ? '✓ Sesión Cargada en Registro'
                                : `Cargar Sesión de Hoy (Cierra ${lockInfo.loadDeadlineHHMM} hrs)`}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* View 2: Weekly Interactive Schedule Calendar */}
            {assignmentViewMode === 'calendario' && (
              <div className="space-y-3 pt-1">
                {/* Week Navigation */}
                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setCalendarWeekOffset((prev) => prev - 1)}
                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs text-xs font-semibold flex items-center whitespace-nowrap shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4 mr-0.5" />
                    <span>Semana anterior</span>
                  </button>

                  <div className="text-center">
                    <span className="text-xs font-bold text-slate-900 block tabular-nums">
                      Semana del {weekDays[0].dayNum} {weekDays[0].monthName} al {weekDays[6].dayNum} {weekDays[6].monthName}
                    </span>
                    {calendarWeekOffset !== 0 && (
                      <button
                        type="button"
                        onClick={() => setCalendarWeekOffset(0)}
                        className="text-[10px] text-red-600 font-bold hover:underline"
                      >
                        Volver a semana actual
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCalendarWeekOffset((prev) => prev + 1)}
                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs text-xs font-semibold flex items-center whitespace-nowrap shrink-0"
                  >
                    <span>Semana siguiente</span>
                    <ChevronRight className="w-4 h-4 ml-0.5" />
                  </button>
                </div>

                {/* 7-Day Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                  {weekDays.map((day) => (
                    <div
                      key={day.dateStr}
                      className={`rounded-xl border p-2.5 flex flex-col justify-between min-h-[140px] transition ${
                        day.isToday
                          ? 'bg-red-50/40 border-red-300 ring-1 ring-red-400'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div>
                        {/* Day Header */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 mb-2">
                          <span className="text-xs font-bold text-slate-800">
                            {day.dayName}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums font-bold ${
                              day.isToday
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {day.dayNum}
                          </span>
                        </div>

                        {/* List of assignments on this day */}
                        {day.dayAssignments.length === 0 ? (
                          <div className="text-[10px] text-slate-400 italic py-2 text-center">
                            Sin clase
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {day.dayAssignments.map((asg) => {
                              const dayLock = getAssignmentOccurrenceStatus(
                                asg,
                                day.dateStr,
                                trainerRecords,
                                activityCatalog,
                                nowMs
                              );
                              const isDayLoaded =
                                loadedAssignmentId === asg.id &&
                                sessionDate === day.dateStr &&
                                dayLock.canLoadNow &&
                                !dayLock.isLocked;

                              return (
                                <div
                                  key={asg.id}
                                  className={`p-2 rounded-lg border text-left text-xs space-y-1 ${
                                    dayLock.isNonCompliant
                                      ? 'bg-rose-50 border-rose-300'
                                      : dayLock.isCompletedAndClosed
                                        ? 'bg-slate-100 border-slate-300'
                                        : dayLock.state === 'en_curso'
                                          ? 'bg-amber-50 border-amber-300'
                                          : isDayLoaded
                                            ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-400'
                                            : 'bg-slate-50 border-slate-200 hover:border-red-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={`font-mono tabular-nums text-[10px] font-bold ${
                                        dayLock.isCompletedAndClosed || dayLock.isNonCompliant
                                          ? 'text-slate-500 line-through'
                                          : 'text-red-600'
                                      }`}
                                    >
                                      {asg.time} ({getAssignmentDurationMinutes(asg, activityCatalog)}m)
                                    </span>
                                    {dayLock.isNonCompliant ? (
                                      <span className="text-[9px] font-extrabold text-rose-800">
                                        {dayLock.nonComplianceReason === 'sin_cierre_30m' ? 'No cerrada' : 'Cerrada'}
                                      </span>
                                    ) : dayLock.isCompletedAndClosed ? (
                                      <span className="text-[9px] font-extrabold text-emerald-800">
                                        Cerrada
                                      </span>
                                    ) : dayLock.state === 'en_curso' ? (
                                      <span className="text-[9px] font-extrabold text-amber-800">
                                        En curso
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold text-slate-500">
                                        {asg.activityType === 'pausa_activa' ? 'Pausa' : 'Fitness'}
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className={`font-bold text-[11px] line-clamp-2 leading-tight ${
                                      dayLock.isCompletedAndClosed
                                        ? 'text-slate-600'
                                        : dayLock.isNonCompliant
                                          ? 'text-rose-950'
                                          : 'text-slate-900'
                                    }`}
                                  >
                                    {asg.activityName}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {asg.companyName}
                                  </div>
                                  {dayLock.isLocked ? (
                                    <button
                                      type="button"
                                      disabled
                                      className={`w-full mt-1 py-1 rounded text-[10px] font-bold border flex items-center justify-center space-x-1 cursor-not-allowed ${
                                        dayLock.isNonCompliant
                                          ? 'bg-rose-200/80 border-rose-300 text-rose-900'
                                          : 'bg-slate-200 border-slate-300 text-slate-600'
                                      }`}
                                    >
                                      <Lock className="w-2.5 h-2.5" />
                                      <span>
                                        {dayLock.isNonCompliant
                                          ? dayLock.nonComplianceReason === 'sin_cierre_30m'
                                            ? 'No cerrada'
                                            : 'Cerrada (+20m)'
                                          : dayLock.isCompletedAndClosed
                                            ? 'Bloqueada'
                                            : 'En curso'}
                                      </span>
                                    </button>
                                  ) : !dayLock.canLoadNow ? (
                                    <button
                                      type="button"
                                      disabled
                                      className="w-full mt-1 py-1 rounded text-[10px] font-bold border bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed tabular-nums"
                                    >
                                      {dayLock.loadWindowState === 'antes_de_30m'
                                        ? `Abre ${dayLock.unlockTimeHHMM}`
                                        : dayLock.loadWindowState === 'otro_dia'
                                          ? 'Solo ese día'
                                          : 'Cerrada'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleLoadAssignment(asg, day.dateStr)}
                                      className="w-full mt-1 py-1 rounded text-[10px] font-bold bg-white border border-slate-200 text-red-700 hover:bg-red-50 hover:border-red-300 transition"
                                    >
                                      {isDayLoaded ? '✓ Cargada' : 'Cargar'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {day.isToday && (
                        <div className="mt-2 text-center">
                          <span className="text-[10px] font-bold text-red-700">
                            Hoy
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Check-In Form in Clean Light Theme — Fields start strictly blank until session is loaded */}
      <div id="nuevo-registro-form" className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-8 shadow-sm">
        <div className="border-b border-slate-200 pb-4 mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center">
            <FileCheck2 className="w-5 h-5 mr-2 text-red-600" />
            Nuevo Registro de Entrada en Sede
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Los campos permanecen en blanco y se llenan automáticamente al cargar tu sesión asignada del día (habilitada desde 30 min antes del inicio y hasta 20 min después de iniciada).
          </p>
        </div>

        {/* Notice when no session is loaded yet */}
        {!loadedAssignment && (
          <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-700 flex items-start space-x-3">
            <Info className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">
                Campos en blanco hasta cargar sesión asignada
              </p>
              <p className="mt-0.5 text-slate-600">
                Selecciona <strong>«Cargar Sesión de Hoy»</strong> en la sección superior para rellenar los datos de la sede y actividad. Solo se permite cargar el día exacto de la asignación, entre <strong>30 minutos antes</strong> de iniciar y máximo <strong>20 minutos después</strong> de iniciada.
              </p>
            </div>
          </div>
        )}

        {/* Banner if class assignment from administration is loaded */}
        {loadedAssignment && loadedDateInfo && (
          <div className="mb-6 p-4 rounded-xl bg-red-50/70 border border-red-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 shadow-2xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-red-700">Sesión Oficial Cargada</span>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span className="text-slate-500 font-medium">Programación de Administración</span>
                </div>
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  {loadedAssignment.activityName}
                </p>
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  <span className="flex items-center font-bold text-red-700">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    Fecha Asignada: {loadedDateInfo.formattedLong}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center font-mono tabular-nums font-bold text-slate-800">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    {loadedAssignment.time} hrs ({getAssignmentDurationMinutes(loadedAssignment, activityCatalog)} min)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{loadedAssignment.companyName} ({loadedAssignment.sedeName})</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={clearCheckInFormFields}
              className="self-end sm:self-center px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-white rounded-lg border border-slate-200 transition whitespace-nowrap shrink-0"
              title="Quitar sesión cargada y dejar campos en blanco"
            >
              Vaciar campos
            </button>
          </div>
        )}

        {activeFormLockCheck && (
          <div
            className={`mb-6 p-4 rounded-xl text-white border text-xs sm:text-sm flex items-start space-x-3 shadow-sm ${
              activeFormLockCheck.lockInfo.isNonCompliant
                ? 'bg-rose-900 border-rose-700'
                : 'bg-slate-900 border-slate-700'
            }`}
          >
            <Lock
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                activeFormLockCheck.lockInfo.isNonCompliant ? 'text-rose-300' : 'text-emerald-400'
              }`}
            />
            <div>
              <p className="font-bold text-white">
                {activeFormLockCheck.lockInfo.isNonCompliant
                  ? activeFormLockCheck.lockInfo.nonComplianceReason === 'sin_cierre_30m'
                    ? 'Sesión No Cerrada y Bloqueada (+30 min máx. · Alarma Desactivada)'
                    : 'Sesión Cerrada y Bloqueada (No se cargó pasados 20 min del inicio)'
                  : activeFormLockCheck.lockInfo.isCompletedAndClosed
                    ? 'Sesión Completada y Cerrada (Bloqueada)'
                    : 'Sesión Actualmente en Curso (Bloqueada)'}
              </p>
              <p className="mt-0.5 text-slate-200">
                La clase <strong>{activeFormLockCheck.assignment.activityName}</strong> del{' '}
                <strong className="font-mono tabular-nums">{sessionDate}</strong> a las{' '}
                <strong className="font-mono tabular-nums">{activeFormLockCheck.assignment.time} hrs</strong>{' '}
                {activeFormLockCheck.lockInfo.isNonCompliant
                  ? activeFormLockCheck.lockInfo.nonComplianceReason === 'sin_cierre_30m'
                    ? 'no fue cerrada en un lapso máximo de 30 minutos; quedó bloqueada como no cerrada y su alarma fue desactivada.'
                    : 'superó los 20 minutos posteriores al inicio sin cargarse y fue dada por cerrada.'
                  : activeFormLockCheck.lockInfo.isCompletedAndClosed
                    ? 'ya fue completada y cerrada, por lo que no puede repetirse en esta fecha.'
                    : 'ya tiene una sesión en curso. Registra primero la salida de sede.'}
              </p>
            </div>
          </div>
        )}

        {validationError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Aviso de Validación</p>
              <p className="mt-0.5">{validationError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleCheckInSubmit} className="space-y-6">
          {/* Section 1: Company & Sede Selection — Blank until session is loaded */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center mr-2 text-[11px] font-bold">
                1
              </span>
              Empresa y Sede a Visitar
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center">
                  <Building2 className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Empresa Cliente *
                </label>
                <input
                  type="text"
                  readOnly
                  disabled={!loadedAssignment}
                  value={selectedCompany?.name || ''}
                  placeholder=""
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:outline-none disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Sede / Sucursal Oficial *
                </label>
                <input
                  type="text"
                  readOnly
                  disabled={!loadedAssignment}
                  value={selectedSede?.name || ''}
                  placeholder=""
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:outline-none disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                />
              </div>
            </div>

            {selectedSede && (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
                <div>
                  <span className="font-bold text-slate-900 block">Dirección: {selectedSede.address}</span>
                  <span className="text-slate-500 font-medium">
                    Contacto Sede: {selectedSede.contactPerson} ({selectedSede.contactRole})
                  </span>
                </div>
                <div className="sm:text-right">
                  <span className="text-slate-500 text-[11px] font-mono tabular-nums">
                    Radio permitido: {selectedSede.geofenceRadiusMeters}m
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Activity and Schedule — Blank until session is loaded */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-700 flex items-center">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center mr-2 text-[11px] font-bold">
                2
              </span>
              Horario Programado y Tipo de Actividad
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Fecha de la Sesión Asignada *
                </label>
                <input
                  type="text"
                  readOnly
                  disabled={!loadedAssignment}
                  value={sessionDate}
                  placeholder=""
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 font-mono tabular-nums font-bold focus:outline-none disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                />
                {sessionDate && (
                  <span className="text-[11px] text-slate-500 mt-1 block font-medium capitalize truncate">
                    {formatDateFriendlySpanish(sessionDate)}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Hora Programada de la Sesión *
                </label>
                <input
                  type="text"
                  readOnly
                  disabled={!loadedAssignment}
                  value={scheduledTime ? `${scheduledTime} hrs` : ''}
                  placeholder=""
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 font-mono tabular-nums font-bold focus:outline-none disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center">
                  <Activity className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Modalidad de Bienestar *
                </label>
                <input
                  type="text"
                  readOnly
                  disabled={!loadedAssignment}
                  value={
                    activityType === 'pausa_activa'
                      ? 'Pausa Activa'
                      : activityType === 'clase_fitness'
                        ? 'Clase Fitness'
                        : ''
                  }
                  placeholder=""
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 font-medium focus:outline-none disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center">
                  <Users className="w-3.5 h-3.5 mr-1 text-red-600" />
                  Participantes / Asistentes *
                </label>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    disabled={!loadedAssignment}
                    onClick={() => {
                      const cur = attendeesInput === '' ? 0 : parseInt(attendeesInput, 10) || 0;
                      setAttendeesInput(String(Math.max(0, cur - 1)));
                    }}
                    className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Restar participante"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    disabled={!loadedAssignment}
                    placeholder=""
                    value={attendeesInput}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^0-9]/g, '');
                      if (digits === '') {
                        setAttendeesInput('');
                      } else {
                        setAttendeesInput(String(Math.min(999, parseInt(digits, 10))));
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-2 text-center text-sm font-bold text-slate-900 font-mono tabular-nums focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                  />
                  <button
                    type="button"
                    disabled={!loadedAssignment}
                    onClick={() => {
                      const cur = attendeesInput === '' ? 0 : parseInt(attendeesInput, 10) || 0;
                      setAttendeesInput(String(Math.min(999, cur + 1)));
                    }}
                    className="w-9 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shrink-0 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Sumar participante"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {loadedAssignment?.expectedAttendees ? (
                  <span className="text-[11px] text-slate-500 mt-1 block font-medium tabular-nums">
                    Esperados aprox.: ~{loadedAssignment.expectedAttendees}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Sub-actividad Específica *
                </label>
                <input
                  type="text"
                  readOnly
                  disabled={!loadedAssignment}
                  value={activityName}
                  placeholder=""
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 font-medium focus:outline-none disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Salón / Piso / Área de la Empresa *
                </label>
                <input
                  type="text"
                  disabled={!loadedAssignment}
                  value={locationArea}
                  onChange={(e) => setLocationArea(e.target.value)}
                  placeholder=""
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
                />
              </div>
            </div>

            {/* Session-End Checkout Alarm Settings */}
            <div className="mt-2 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start space-x-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      alarmEnabled
                        ? 'bg-red-50 border-red-200 text-red-600'
                        : 'bg-slate-200/70 border-slate-300 text-slate-500'
                    }`}
                  >
                    {alarmEnabled ? (
                      <BellRing className="w-4 h-4" />
                    ) : (
                      <BellOff className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Alarma de Fin de Sesión (Se desactiva y bloquea a los 30 min máx. sin cierre)
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          alarmEnabled ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        · {alarmEnabled ? 'Activa' : 'Desactivada'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Emite alerta sonora al cumplirse la duración. Si pasan 30 minutos máximo sin cerrar la sesión, se da por no cerrada, se bloquea y la alarma se apaga automáticamente.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={async () => {
                      unlockMobileAlarmAudio();
                      const ok = await playAlarmPattern({ fromUserGesture: true });
                      setSoundTestFeedback(ok ? 'ok' : 'blocked');
                      setTimeout(() => setSoundTestFeedback('idle'), 4500);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 text-xs font-bold text-slate-800 hover:text-red-700 transition flex items-center space-x-1.5 whitespace-nowrap shrink-0"
                    title="Reproducir tono de prueba para verificar el volumen multimedia en tu celular"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-red-600" />
                    <span>
                      {soundTestFeedback === 'ok'
                        ? '✓ Sonando en celular'
                        : soundTestFeedback === 'blocked'
                        ? 'Sube volumen multimedia'
                        : 'Probar Sonido'}
                    </span>
                  </button>

                  {notifPermission === 'default' && (
                    <button
                      type="button"
                      onClick={() => {
                        unlockMobileAlarmAudio();
                        handleEnableBrowserNotif();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-[11px] font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
                    >
                      Permitir notificaciones
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      unlockMobileAlarmAudio();
                      setAlarmEnabled((prev) => !prev);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                      alarmEnabled
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {alarmEnabled ? (
                      <>
                        <Bell className="w-3.5 h-3.5" />
                        <span>Alarma Activada</span>
                      </>
                    ) : (
                      <>
                        <BellOff className="w-3.5 h-3.5" />
                        <span>Activar Alarma</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {alarmEnabled && (
                <div className="pt-2.5 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 mr-1">
                      Duración para el aviso:
                    </span>
                    {[15, 20, 30, 45, 50, 60].map((mins) => {
                      const isSelected = Boolean(loadedAssignment) && parseInt(plannedDurationInput, 10) === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          disabled={!loadedAssignment}
                          onClick={() => setPlannedDurationInput(String(mins))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition tabular-nums disabled:opacity-40 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'bg-red-600 text-white border-red-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-red-300'
                          }`}
                        >
                          {mins} min
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center space-x-2">
                    <label
                      htmlFor="planned-duration-input"
                      className="text-[11px] font-semibold text-slate-600 whitespace-nowrap"
                    >
                      Duración (min):
                    </label>
                    <input
                      id="planned-duration-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={!loadedAssignment}
                      placeholder=""
                      value={plannedDurationInput}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        if (digits === '') {
                          setPlannedDurationInput('');
                        } else {
                          setPlannedDurationInput(String(Math.min(240, parseInt(digits, 10))));
                        }
                      }}
                      onBlur={() => {
                        if (!loadedAssignment) return;
                        if (!plannedDurationInput.trim() || parseInt(plannedDurationInput, 10) < 1) {
                          setPlannedDurationInput(
                            String(
                              activityType
                                ? getDefaultDurationMinutes(activityType, activityName, activityCatalog)
                                : 20
                            )
                          );
                        }
                      }}
                      className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-center text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-red-500 disabled:bg-slate-50/80 disabled:text-slate-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: High Precision Geolocation Verification */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center mr-2 text-[11px] font-bold">
                3
              </span>
              Verificación de Geolocalización GPS
            </h4>
            <GpsVisualizer
              selectedSede={selectedSede}
              onGpsUpdate={(gps) => setCurrentGps(gps)}
              currentGps={currentGps}
            />
          </div>

          {/* Section 4: Mandatory Photo Evidence in the Salon */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center mr-2 text-[11px] font-bold">
                4
              </span>
              Foto Obligatoria de Presencia en el Salón
            </h4>
            <CameraCapture
              trainerName={currentTrainer.name}
              companyName={selectedCompany?.name || ''}
              sedeName={selectedSede?.name || ''}
              activityName={activityName}
              gpsData={currentGps}
              photoUrl={photoUrl}
              onPhotoCaptured={(url) => setPhotoUrl(url)}
              onPhotoCleared={() => setPhotoUrl(null)}
              recordType="ENTRADA"
            />
          </div>

          {/* Observations optional */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observaciones Iniciales (Opcional)
            </label>
            <input
              type="text"
              disabled={!loadedAssignment}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder=""
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:bg-slate-50/80 disabled:text-slate-500 shadow-xs"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-500 font-medium">
              {loadedAssignment
                ? '* Hora de entrada registrada exactamente al presionar enviar.'
                : '* Carga una sesión asignada del día de hoy para habilitar el registro.'}
            </div>

            <button
              type="submit"
              disabled={!loadedAssignment || isSubmitting || Boolean(activeFormLockCheck)}
              className={`px-6 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition whitespace-nowrap shrink-0 ${
                activeFormLockCheck
                  ? activeFormLockCheck.lockInfo.isNonCompliant
                    ? 'bg-rose-200 text-rose-900 border border-rose-300 cursor-not-allowed'
                    : 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed'
                  : !loadedAssignment
                    ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:to-rose-800 text-white shadow-xl shadow-red-500/25 disabled:opacity-50'
              }`}
            >
              {activeFormLockCheck ? (
                <>
                  <Lock className="w-5 h-5" />
                  <span>
                    {activeFormLockCheck.lockInfo.isNonCompliant
                      ? 'Sesión Cerrada / Bloqueada'
                      : 'Sesión Bloqueada'}
                  </span>
                </>
              ) : !loadedAssignment ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Carga una Sesión para Registrar</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{isSubmitting ? 'Validando y Guardando...' : 'Registrar Entrada Oficial'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Automatic Session-End Checkout Alarm Modal */}
      {activeSession &&
        activeSessionAlarm &&
        !checkoutModalOpen &&
        (activeSessionAlarm.shouldRing || isTestAlarmModalOpen) && (
          <SessionEndAlarmModal
            record={activeSession}
            alarmStatus={activeSessionAlarm}
            isTestMode={isTestAlarmModalOpen && !activeSessionAlarm.shouldRing}
            onRegisterCheckOutNow={() => {
              setIsTestAlarmModalOpen(false);
              setCheckoutModalOpen(true);
            }}
            onSnoozeMinutes={(mins) => handleSnoozeActiveAlarm(mins)}
            onDismissTemporarily={() => {
              if (isTestAlarmModalOpen && !activeSessionAlarm.shouldRing) {
                setIsTestAlarmModalOpen(false);
              } else {
                handleSnoozeActiveAlarm(3);
              }
            }}
          />
        )}

      {/* Checkout Modal if opened */}
      {checkoutModalOpen && activeSession && (
        <TrainerCheckOutModal
          record={activeSession}
          onClose={() => setCheckoutModalOpen(false)}
          onConfirmCheckOut={handleCheckoutConfirm}
        />
      )}
    </div>
  );
};
