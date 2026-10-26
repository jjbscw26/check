import React, { useState, useMemo } from 'react';
import {
  ACTIVITY_TYPE_DEFAULT_MINUTES,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_SHORT_LABELS,
  ActivityCatalogItem,
  ActivityType,
  ALL_ACTIVITY_TYPES,
  AttendanceRecord,
  ClassAssignment,
  Company,
  normalizeActivityType,
  Trainer,
} from '../types';
import {
  Calendar,
  CalendarDays,
  CalendarCheck,
  Clock,
  Plus,
  Edit3,
  Trash2,
  Building2,
  MapPin,
  Users,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  Repeat,
  Printer,
  Timer,
  Lock,
  Unlock,
  CheckCircle2,
  Check,
  Ban,
  AlertTriangle,
  X,
} from 'lucide-react';
import { AssignmentPreset } from './AdminAssignmentModal';
import {
  getAssignmentDurationMinutes,
  calculateEndTimeHHMM,
  formatDurationHoursMinutes,
} from '../utils/sessionAlarm';
import { getAssignmentOccurrenceStatus, toggleAssignmentDateLock } from '../utils/assignmentLock';
import {
  buildMonthlyBatchAssignments,
  getMonthDatesByPattern,
  hasMatchingAssignmentOnDate,
  MonthSelectionPattern,
  toggleWeekdayDatesInMonth,
} from '../utils/monthlyAssignmentHelper';
import {
  cleanDisciplineLabel,
  getAssignmentDisciplineGroups,
  inferActivityTypeFromDiscipline,
  normalizeDisciplineKey,
} from '../utils/specialtyDisciplines';

interface AdminScheduleViewProps {
  assignments: ClassAssignment[];
  records?: AttendanceRecord[];
  companies: Company[];
  trainers: Trainer[];
  activityCatalog?: ActivityCatalogItem[];
  onAddAssignment: (preset?: AssignmentPreset) => void;
  onAddAssignmentsBatch?: (assignments: ClassAssignment[]) => void;
  onEditAssignment: (assignment: ClassAssignment) => void;
  onUpdateAssignment?: (assignment: ClassAssignment) => void;
  onDeleteAssignment: (assignmentId: string) => void;
  onOpenPdfReport?: (trainerId?: string) => void;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAY_NAMES = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
];

const DAY_SHORT_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Format date as YYYY-MM-DD
function formatYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_CELL_MODALITY_CLASS: Record<ActivityType, string> = {
  pausa_activa: 'bg-emerald-50/90 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100',
  clase_fitness: 'bg-blue-50/90 text-blue-800 border-blue-200/80 hover:bg-blue-100',
  gimnasio_corporativo: 'bg-indigo-50/90 text-indigo-800 border-indigo-200/80 hover:bg-indigo-100',
  masajes: 'bg-teal-50/90 text-teal-800 border-teal-200/80 hover:bg-teal-100',
};

const MODALITY_TEXT_CLASS: Record<ActivityType, string> = {
  pausa_activa: 'text-emerald-700',
  clase_fitness: 'text-blue-700',
  gimnasio_corporativo: 'text-indigo-700',
  masajes: 'text-teal-700',
};

// Convert JS getDay() (0=Sun, 1=Mon, ..., 6=Sat) to Monday-indexed (1=Mon, ..., 7=Sun)
function getMondayIndexedDayOfWeek(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

// Get Monday of the week containing d
function getStartOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = getMondayIndexedDayOfWeek(date);
  date.setDate(date.getDate() - (day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

export const AdminScheduleView: React.FC<AdminScheduleViewProps> = ({
  assignments,
  records = [],
  companies,
  trainers,
  activityCatalog = [],
  onAddAssignment,
  onAddAssignmentsBatch,
  onEditAssignment,
  onUpdateAssignment,
  onDeleteAssignment,
  onOpenPdfReport,
}) => {
  // Calendar view mode: 'month' | 'week' | 'day'
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');

  // Currently active/navigated reference date
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Selected date for day view or detail inspector in month view
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Filters
  const [filterTrainerId, setFilterTrainerId] = useState<string>('all');
  const [filterCompanyId, setFilterCompanyId] = useState<string>('all');
  const [filterActivityType, setFilterActivityType] = useState<string>('all');
  const [filterLockStatus, setFilterLockStatus] = useState<
    'all' | 'pendientes' | 'cerradas' | 'incumplidas'
  >('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [scheduleNowMs, setScheduleNowMs] = useState<number>(() => Date.now());

  // ========================================================
  // MODO MARCAR DÍAS DEL MES (Asignación Mensual Masiva)
  // ========================================================
  const [isBulkMonthMode, setIsBulkMonthMode] = useState<boolean>(false);
  const [bulkTrainerId, setBulkTrainerId] = useState<string>(() => trainers[0]?.id || '');
  const [bulkCompanyId, setBulkCompanyId] = useState<string>(() => companies[0]?.id || '');
  const [bulkSedeId, setBulkSedeId] = useState<string>(() => companies[0]?.sedes[0]?.id || '');
  const [bulkActivityType, setBulkActivityType] = useState<ActivityType>('clase_fitness');
  const [bulkActivityName, setBulkActivityName] = useState<string>('Entrenamiento Funcional');
  const [bulkIsCustomActivity, setBulkIsCustomActivity] = useState<boolean>(false);
  const [bulkCustomActivity, setBulkCustomActivity] = useState<string>('');
  const [bulkLocationArea, setBulkLocationArea] = useState<string>('Área Principal');
  const [bulkTime, setBulkTime] = useState<string>('09:00');
  const [bulkDurationHours, setBulkDurationHours] = useState<number>(1);
  const [bulkDurationMinutesPart, setBulkDurationMinutesPart] = useState<number>(0);
  const [bulkExpectedAttendees, setBulkExpectedAttendees] = useState<number>(15);
  const [bulkMarkedDates, setBulkMarkedDates] = useState<string[]>([]);
  const [bulkFilterToSelectedTrainer, setBulkFilterToSelectedTrainer] = useState<boolean>(true);
  const [bulkFeedback, setBulkFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    trainerId?: string;
  } | null>(null);

  React.useEffect(() => {
    const timer = setInterval(() => setScheduleNowMs(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Keep default trainer/company valid when lists load from Firestore
  React.useEffect(() => {
    if ((!bulkTrainerId || !trainers.some((t) => t.id === bulkTrainerId)) && trainers.length > 0) {
      setBulkTrainerId(trainers[0].id);
    }
  }, [trainers, bulkTrainerId]);

  React.useEffect(() => {
    if ((!bulkCompanyId || !companies.some((c) => c.id === bulkCompanyId)) && companies.length > 0) {
      const firstComp = companies[0];
      setBulkCompanyId(firstComp.id);
      setBulkSedeId(firstComp.sedes[0]?.id || '');
    } else {
      const comp = companies.find((c) => c.id === bulkCompanyId);
      if (comp && comp.sedes.length > 0 && !comp.sedes.some((s) => s.id === bulkSedeId)) {
        setBulkSedeId(comp.sedes[0].id);
      }
    }
  }, [companies, bulkCompanyId, bulkSedeId]);

  const todayStr = useMemo(() => formatYYYYMMDD(new Date(scheduleNowMs)), [scheduleNowMs]);

  const currentYearMonth = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [currentDate]);

  const selectedBulkTrainer = useMemo(
    () => trainers.find((t) => t.id === bulkTrainerId) || null,
    [trainers, bulkTrainerId]
  );

  const selectedBulkCompany = useMemo(
    () => companies.find((c) => c.id === bulkCompanyId) || null,
    [companies, bulkCompanyId]
  );

  const bulkDisciplineGroups = useMemo(
    () =>
      getAssignmentDisciplineGroups({
        activityType: bulkActivityType,
        selectedTrainer: selectedBulkTrainer,
        trainers,
        activityCatalog,
      }),
    [bulkActivityType, selectedBulkTrainer, trainers, activityCatalog]
  );

  const resolvedBulkActivityName = useMemo(() => {
    const raw = bulkIsCustomActivity ? bulkCustomActivity : bulkActivityName;
    return cleanDisciplineLabel(raw);
  }, [bulkIsCustomActivity, bulkCustomActivity, bulkActivityName]);

  const bulkTotalDurationMinutes = useMemo(() => {
    const rawTotal = bulkDurationHours * 60 + bulkDurationMinutesPart;
    return Math.min(480, Math.max(5, rawTotal));
  }, [bulkDurationHours, bulkDurationMinutesPart]);

  const bulkMarkedSet = useMemo(() => new Set(bulkMarkedDates), [bulkMarkedDates]);

  const currentMonthMarkedCount = useMemo(
    () => bulkMarkedDates.filter((d) => d.startsWith(`${currentYearMonth}-`)).length,
    [bulkMarkedDates, currentYearMonth]
  );

  const applyBulkDurationTotal = (mins: number) => {
    const clamped = Math.min(480, Math.max(5, Math.round(mins)));
    const h = Math.floor(clamped / 60);
    const m = h === 8 ? 0 : clamped % 60;
    setBulkDurationHours(h);
    setBulkDurationMinutesPart(m);
  };

  const handleBulkModalityChange = (nextType: ActivityType) => {
    setBulkActivityType(nextType);
    const matchingCat = activityCatalog.find(
      (c) => normalizeActivityType(c.activityType) === nextType && c.active !== false
    );
    if (!bulkIsCustomActivity) {
      if (matchingCat) {
        setBulkActivityName(cleanDisciplineLabel(matchingCat.name));
        applyBulkDurationTotal(matchingCat.durationMinutes || ACTIVITY_TYPE_DEFAULT_MINUTES[nextType]);
      } else {
        setBulkActivityName(ACTIVITY_TYPE_LABELS[nextType]);
        applyBulkDurationTotal(ACTIVITY_TYPE_DEFAULT_MINUTES[nextType]);
      }
    } else {
      applyBulkDurationTotal(ACTIVITY_TYPE_DEFAULT_MINUTES[nextType]);
    }
  };

  const handleBulkDisciplineSelect = (val: string) => {
    if (val === '__custom__') {
      setBulkIsCustomActivity(true);
      return;
    }
    setBulkIsCustomActivity(false);
    setBulkActivityName(val);

    const catMatch = activityCatalog.find(
      (c) => c.active !== false && normalizeDisciplineKey(c.name) === normalizeDisciplineKey(val)
    );
    if (catMatch) {
      const catType = normalizeActivityType(catMatch.activityType);
      setBulkActivityType(catType);
      if (catMatch.durationMinutes >= 5) {
        applyBulkDurationTotal(catMatch.durationMinutes);
      }
    } else {
      const inferred = inferActivityTypeFromDiscipline(val, bulkActivityType);
      if (inferred !== bulkActivityType) {
        setBulkActivityType(inferred);
        applyBulkDurationTotal(ACTIVITY_TYPE_DEFAULT_MINUTES[inferred]);
      }
    }
  };

  const handleToggleBulkMode = () => {
    setBulkFeedback(null);
    if (!isBulkMonthMode) {
      setViewMode('month');
      if (filterTrainerId !== 'all') {
        setBulkTrainerId(filterTrainerId);
      } else if (trainers[0]?.id && bulkFilterToSelectedTrainer) {
        setFilterTrainerId(bulkTrainerId || trainers[0].id);
      }
      if (filterCompanyId !== 'all') {
        setBulkCompanyId(filterCompanyId);
      }
      setIsBulkMonthMode(true);
    } else {
      setIsBulkMonthMode(false);
    }
  };

  const handleToggleDateInBulk = (dateStr: string) => {
    setBulkFeedback(null);
    setBulkMarkedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
    );
  };

  const handleApplyMonthPattern = (pattern: MonthSelectionPattern) => {
    setBulkFeedback(null);
    const patternDates = getMonthDatesByPattern(currentYearMonth, pattern, todayStr);
    setBulkMarkedDates((prev) => {
      const otherMonths = prev.filter((d) => !d.startsWith(`${currentYearMonth}-`));
      return Array.from(new Set([...otherMonths, ...patternDates])).sort();
    });
  };

  const handleClearCurrentMonthDates = () => {
    setBulkFeedback(null);
    setBulkMarkedDates((prev) => prev.filter((d) => !d.startsWith(`${currentYearMonth}-`)));
  };

  const handleToggleWeekdayHeader = (mondayDow: number) => {
    if (!isBulkMonthMode) return;
    setBulkFeedback(null);
    setBulkMarkedDates((prev) => toggleWeekdayDatesInMonth(currentYearMonth, prev, mondayDow));
  };

  const handleSaveBulkMonthToTrainer = () => {
    if (!selectedBulkTrainer) {
      setBulkFeedback({
        type: 'error',
        message: 'Selecciona primero el entrenador al que se cargarán los días marcados.',
      });
      return;
    }
    if (!selectedBulkCompany) {
      setBulkFeedback({
        type: 'error',
        message: 'Selecciona la empresa y sede para las sesiones del mes.',
      });
      return;
    }
    if (!resolvedBulkActivityName || resolvedBulkActivityName.length < 2) {
      setBulkFeedback({
        type: 'error',
        message: 'Indica el nombre de la actividad o disciplina que se marcará en el mes.',
      });
      return;
    }
    if (bulkMarkedDates.length === 0) {
      setBulkFeedback({
        type: 'error',
        message: 'Marca al menos un día en el calendario mensual haciendo clic sobre las casillas o usando los botones rápidos.',
      });
      return;
    }

    const { created, skippedDuplicates } = buildMonthlyBatchAssignments({
      dates: bulkMarkedDates,
      existingAssignments: assignments,
      trainer: selectedBulkTrainer,
      company: selectedBulkCompany,
      sedeId: bulkSedeId,
      time: bulkTime,
      durationMinutes: bulkTotalDurationMinutes,
      activityType: bulkActivityType,
      activityName: resolvedBulkActivityName,
      locationArea: bulkLocationArea,
      expectedAttendees: bulkExpectedAttendees,
      active: true,
    });

    if (created.length === 0) {
      setBulkFeedback({
        type: 'error',
        message: `Todos los días marcados (${skippedDuplicates}) ya tienen asignada exactamente la actividad "${resolvedBulkActivityName}" a las ${bulkTime} hrs para ${selectedBulkTrainer.name}.`,
      });
      return;
    }

    if (onAddAssignmentsBatch) {
      onAddAssignmentsBatch(created);
    } else {
      onAddAssignment({
        multiMonthMode: true,
        targetMonth: currentYearMonth,
        initialDates: bulkMarkedDates,
        trainerId: selectedBulkTrainer.id,
        companyId: selectedBulkCompany.id,
        sedeId: bulkSedeId,
        activityType: bulkActivityType,
        activityName: resolvedBulkActivityName,
        time: bulkTime,
        durationMinutes: bulkTotalDurationMinutes,
      });
      return;
    }

    setBulkMarkedDates([]);
    setFilterTrainerId(selectedBulkTrainer.id);
    setBulkFeedback({
      type: 'success',
      trainerId: selectedBulkTrainer.id,
      message:
        skippedDuplicates > 0
          ? `Se cargaron ${created.length} ${created.length === 1 ? 'día' : 'días'} de "${resolvedBulkActivityName}" (${bulkTime} hrs · ${formatDurationHoursMinutes(bulkTotalDurationMinutes)}) en el calendario de ${selectedBulkTrainer.name}. Se omitieron ${skippedDuplicates} por estar ya asignados.`
          : `Se cargaron ${created.length} ${created.length === 1 ? 'día' : 'días'} de "${resolvedBulkActivityName}" (${bulkTime} hrs · ${formatDurationHoursMinutes(bulkTotalDurationMinutes)}) directamente en el calendario de ${selectedBulkTrainer.name}.`,
    });
  };

  // Filter assignments based on trainer, company, activity type, and search query
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (filterTrainerId !== 'all' && a.trainerId !== filterTrainerId) return false;
      if (filterCompanyId !== 'all' && a.companyId !== filterCompanyId) return false;
      if (filterActivityType !== 'all' && a.activityType !== filterActivityType) return false;

      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const match =
          a.trainerName.toLowerCase().includes(query) ||
          a.companyName.toLowerCase().includes(query) ||
          a.sedeName.toLowerCase().includes(query) ||
          a.activityName.toLowerCase().includes(query) ||
          a.locationArea.toLowerCase().includes(query);
        if (!match) return false;
      }
      return true;
    });
  }, [assignments, filterTrainerId, filterCompanyId, filterActivityType, searchTerm]);

  // Helper: Get classes scheduled for a specific date
  const getClassesForDate = (targetDate: Date): ClassAssignment[] => {
    const dateStr = formatYYYYMMDD(targetDate);
    const dayOfWeek = getMondayIndexedDayOfWeek(targetDate);
    const dayOfMonth = targetDate.getDate();

    return filteredAssignments
      .filter((a) => {
        if (a.active === false) return false;
        let matchesDate = false;
        if (a.frequency === 'fecha_unica') {
          matchesDate = a.date === dateStr;
        } else if (a.frequency === 'semanal') {
          matchesDate = a.dayOfWeek === dayOfWeek;
        } else if (a.frequency === 'mensual') {
          matchesDate = a.dayOfMonth === dayOfMonth;
        }
        if (!matchesDate) return false;

        if (filterLockStatus !== 'all') {
          const st = getAssignmentOccurrenceStatus(a, dateStr, records, activityCatalog, scheduleNowMs);
          if (filterLockStatus === 'cerradas' && !st.isCompletedAndClosed) return false;
          if (filterLockStatus === 'incumplidas' && !st.isNonCompliant) return false;
          if (
            filterLockStatus === 'pendientes' &&
            (st.isCompletedAndClosed || st.isNonCompliant)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  // Navigation handlers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() - 7);
    } else {
      next.setDate(next.getDate() - 1);
      setSelectedDate(next);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 1);
      setSelectedDate(next);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  };

  const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const parts = e.target.value.split('-');
    const picked = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    setCurrentDate(picked);
    setSelectedDate(picked);
  };

  // Header Title based on View Mode
  const calendarHeaderTitle = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = MONTH_NAMES[currentDate.getMonth()];

    if (viewMode === 'month') {
      return `${month} ${year}`;
    }

    if (viewMode === 'week') {
      const startOfWeek = getStartOfWeek(currentDate);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      const startMonth = MONTH_NAMES[startOfWeek.getMonth()];
      const endMonth = MONTH_NAMES[endOfWeek.getMonth()];

      if (startMonth === endMonth) {
        return `Semana del ${startOfWeek.getDate()} al ${endOfWeek.getDate()} de ${startMonth} ${year}`;
      }
      return `Semana del ${startOfWeek.getDate()} de ${startMonth} al ${endOfWeek.getDate()} de ${endMonth} ${year}`;
    }

    // Day view
    const dayOfWeekName = DAY_NAMES[getMondayIndexedDayOfWeek(currentDate) - 1];
    return `${dayOfWeekName}, ${currentDate.getDate()} de ${month} de ${year}`;
  }, [viewMode, currentDate]);

  // Days of week for Week View
  const weekDays = useMemo(() => {
    const startOfWeek = getStartOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(dayDate.getDate() + i);
      const dateStr = formatYYYYMMDD(dayDate);
      const dayClasses = getClassesForDate(dayDate);
      const isToday = dateStr === todayStr;
      const isSelected = formatYYYYMMDD(selectedDate) === dateStr;

      return {
        date: dayDate,
        dateStr,
        dayIndex: i + 1, // 1=Lun ... 7=Dom
        dayName: DAY_NAMES[i],
        shortName: DAY_SHORT_NAMES[i],
        dayNumber: dayDate.getDate(),
        classes: dayClasses,
        isToday,
        isSelected,
      };
    });
  }, [currentDate, selectedDate, todayStr, filteredAssignments, filterLockStatus, records, activityCatalog, scheduleNowMs]);

  // Days matrix for Month View (35 or 42 cells)
  const monthCalendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDayOfWeek = getMondayIndexedDayOfWeek(firstDayOfMonth); // 1 to 7
    const daysInMonth = lastDayOfMonth.getDate();

    const cells: Array<{
      date: Date;
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      dayOfWeek: number;
      classes: ClassAssignment[];
    }> = [];

    // Leading days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i > 0; i--) {
      const dayNum = prevMonthLastDay - i + 1;
      const cellDate = new Date(year, month - 1, dayNum);
      const dateStr = formatYYYYMMDD(cellDate);
      cells.push({
        date: cellDate,
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: formatYYYYMMDD(selectedDate) === dateStr,
        dayOfWeek: getMondayIndexedDayOfWeek(cellDate),
        classes: getClassesForDate(cellDate),
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d);
      const dateStr = formatYYYYMMDD(cellDate);
      cells.push({
        date: cellDate,
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: formatYYYYMMDD(selectedDate) === dateStr,
        dayOfWeek: getMondayIndexedDayOfWeek(cellDate),
        classes: getClassesForDate(cellDate),
      });
    }

    // Trailing days from next month to complete the row
    const totalSlots = cells.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - cells.length;
    for (let d = 1; d <= remainingSlots; d++) {
      const cellDate = new Date(year, month + 1, d);
      const dateStr = formatYYYYMMDD(cellDate);
      cells.push({
        date: cellDate,
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: formatYYYYMMDD(selectedDate) === dateStr,
        dayOfWeek: getMondayIndexedDayOfWeek(cellDate),
        classes: getClassesForDate(cellDate),
      });
    }

    return cells;
  }, [currentDate, selectedDate, todayStr, filteredAssignments, filterLockStatus, records, activityCatalog, scheduleNowMs]);

  // Selected Day Details for Month Inspector or Day View
  const selectedDayClasses = useMemo(() => {
    return getClassesForDate(selectedDate);
  }, [selectedDate, filteredAssignments, filterLockStatus, records, activityCatalog, scheduleNowMs]);

  const selectedDayFormatted = useMemo(() => {
    const dayOfWeekName = DAY_NAMES[getMondayIndexedDayOfWeek(selectedDate) - 1];
    const month = MONTH_NAMES[selectedDate.getMonth()];
    return `${dayOfWeekName}, ${selectedDate.getDate()} de ${month} de ${selectedDate.getFullYear()}`;
  }, [selectedDate]);

  return (
    <div className="space-y-5">
      {/* Top Banner and View Selector */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row items-center lg:justify-between gap-4 text-center lg:text-left">
        <div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span className="p-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200/80 shadow-xs">
              <CalendarDays className="w-5 h-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h3 className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight">
                  Calendario de Programación y Asignación
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Planificador
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Asigna clases y pausas activas a entrenadores por Día, Semana y Mes con control de sede y horario
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2.5">
          {/* Mode Switcher: Mes / Semana / Día */}
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                viewMode === 'month'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Mes</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                viewMode === 'week'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Semana</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('day');
                setCurrentDate(selectedDate);
              }}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                viewMode === 'day'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Día</span>
            </button>
          </div>

          {/* PDF Download Button */}
          <button
            type="button"
            onClick={() => onOpenPdfReport?.(filterTrainerId)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition flex items-center cursor-pointer whitespace-nowrap shrink-0"
            title="Descargar Rol de Asignaciones Mensuales en PDF"
          >
            <Printer className="w-4 h-4 mr-1.5 text-red-400 shrink-0" />
            <span>Descargar Horarios PDF</span>
          </button>

          {/* Toggle Direct Monthly Multi-Day Marking Mode */}
          <button
            type="button"
            onClick={handleToggleBulkMode}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm transition flex items-center cursor-pointer whitespace-nowrap shrink-0 border ${
              isBulkMonthMode
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
            }`}
            title="Marcar múltiples días del mes con una actividad y cargarlos al calendario de un entrenador"
          >
            <CalendarCheck className="w-4 h-4 mr-1.5 shrink-0" />
            <span>{isBulkMonthMode ? 'Cerrar Marcado Mensual' : 'Marcar Días del Mes'}</span>
          </button>

          {/* Quick Add Button */}
          <button
            type="button"
            onClick={() => {
              const dow = getMondayIndexedDayOfWeek(selectedDate);
              onAddAssignment({
                frequency: viewMode === 'week' ? 'semanal' : viewMode === 'month' ? 'fecha_unica' : 'fecha_unica',
                dayOfWeek: dow,
                dayOfMonth: selectedDate.getDate(),
                date: formatYYYYMMDD(selectedDate),
              });
            }}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm shadow-red-500/20 transition flex items-center cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5 shrink-0" />
            <span>Asignar Nueva Clase</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner after Batch Load */}
      {bulkFeedback && (
        <div
          className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            bulkFeedback.type === 'success'
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
              : 'bg-rose-50/90 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {bulkFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            )}
            <p className="font-semibold leading-relaxed">{bulkFeedback.message}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {bulkFeedback.type === 'success' && bulkFeedback.trainerId && onOpenPdfReport && (
              <button
                type="button"
                onClick={() => onOpenPdfReport(bulkFeedback.trainerId)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold transition flex items-center whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5 text-emerald-700" />
                <span>PDF del Entrenador</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkFeedback(null)}
              className="p-1.5 rounded-lg hover:bg-black/5 text-slate-600 transition"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          PANEL INTERACTIVO: MARCAR CON LA ACTIVIDAD LOS DÍAS DEL MES
         ======================================================== */}
      {isBulkMonthMode && (
        <div className="bg-white border-2 border-emerald-600/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  Marcar Actividad en los Días del Mes · {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h4>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  · {bulkMarkedDates.length} {bulkMarkedDates.length === 1 ? 'día marcado' : 'días marcados'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                1. Elige entrenador, actividad, sede y horario · 2. Haz clic en los días del calendario mensual (o usa selección rápida) · 3. Carga todo el mes al calendario del entrenador.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bulkFilterToSelectedTrainer}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setBulkFilterToSelectedTrainer(checked);
                    if (checked && bulkTrainerId) {
                      setFilterTrainerId(bulkTrainerId);
                    } else if (!checked) {
                      setFilterTrainerId('all');
                    }
                  }}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Ver solo calendario del entrenador elegido</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  onAddAssignment({
                    multiMonthMode: true,
                    targetMonth: currentYearMonth,
                    initialDates: bulkMarkedDates,
                    trainerId: bulkTrainerId,
                    companyId: bulkCompanyId,
                    sedeId: bulkSedeId,
                    activityType: bulkActivityType,
                    activityName: resolvedBulkActivityName || undefined,
                    time: bulkTime,
                    durationMinutes: bulkTotalDurationMinutes,
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold transition whitespace-nowrap shrink-0"
              >
                Abrir en Ventana Completa
              </button>
            </div>
          </div>

          {/* Row 1: Entrenador + Empresa + Sede + Salón */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Entrenador a Cargar Calendario *
              </label>
              <select
                value={bulkTrainerId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setBulkTrainerId(nextId);
                  if (bulkFilterToSelectedTrainer && nextId) {
                    setFilterTrainerId(nextId);
                  }
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
              >
                {trainers.length === 0 && <option value="">Sin entrenadores registrados</option>}
                {trainers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name} ({tr.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Empresa Cliente *</label>
              <select
                value={bulkCompanyId}
                onChange={(e) => {
                  const nextCompId = e.target.value;
                  setBulkCompanyId(nextCompId);
                  const comp = companies.find((c) => c.id === nextCompId);
                  setBulkSedeId(comp?.sedes[0]?.id || '');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Sede Corporativa *</label>
              <select
                value={bulkSedeId}
                onChange={(e) => setBulkSedeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
              >
                {(selectedBulkCompany?.sedes || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Salón / Área / Piso</label>
              <input
                type="text"
                value={bulkLocationArea}
                onChange={(e) => setBulkLocationArea(e.target.value)}
                placeholder="Ej. Gimnasio Piso 2, Sala A..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Row 2: Modalidad + Actividad/Disciplina + Hora Inicio + Duración (Horas y Minutos hasta 8h) + Aforo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 text-xs items-end">
            <div className="lg:col-span-3">
              <label className="block font-bold text-slate-700 mb-1">Tipo de Asignación *</label>
              <select
                value={bulkActivityType}
                onChange={(e) => handleBulkModalityChange(e.target.value as ActivityType)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
              >
                {ALL_ACTIVITY_TYPES.map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {ACTIVITY_TYPE_LABELS[typeKey]}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-4">
              <label className="block font-bold text-slate-700 mb-1">
                Actividad / Disciplina a Marcar *
              </label>
              {!bulkIsCustomActivity ? (
                <select
                  value={bulkActivityName}
                  onChange={(e) => handleBulkDisciplineSelect(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                >
                  <optgroup label={`Catálogo · ${ACTIVITY_TYPE_LABELS[bulkActivityType]}`}>
                    {bulkDisciplineGroups.modalityCatalogOptions.map((opt) => (
                      <option key={`mod_${opt}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </optgroup>
                  {bulkDisciplineGroups.selectedTrainerSpecialties.length > 0 && (
                    <optgroup
                      label={`Especialidades de ${selectedBulkTrainer?.name || 'Entrenador'}`}
                    >
                      {bulkDisciplineGroups.selectedTrainerSpecialties.map((opt) => (
                        <option key={`tr_${opt}`} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {bulkDisciplineGroups.otherCatalogByType.map((grp) => (
                    <optgroup key={`other_${grp.type}`} label={`Catálogo · ${grp.label}`}>
                      {grp.items.map((opt) => (
                        <option key={`cat_${grp.type}_${opt}`} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {bulkDisciplineGroups.otherTrainerSpecialties.length > 0 && (
                    <optgroup label="Otras Especialidades Registradas en BD">
                      {bulkDisciplineGroups.otherTrainerSpecialties.map((opt) => (
                        <option key={`db_${opt}`} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="__custom__">+ Escribir otra actividad...</option>
                </select>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={bulkCustomActivity}
                    onChange={(e) => setBulkCustomActivity(e.target.value)}
                    placeholder="Nombre de la actividad o disciplina..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={() => setBulkIsCustomActivity(false)}
                    className="px-2.5 py-2 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold whitespace-nowrap shrink-0"
                  >
                    Catálogo
                  </button>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Hora de Inicio *</label>
              <input
                type="time"
                value={bulkTime}
                onChange={(e) => setBulkTime(e.target.value || '09:00')}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                Duración ({formatDurationHoursMinutes(bulkTotalDurationMinutes, true)})
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={bulkDurationHours}
                  onChange={(e) => {
                    const nextH = Number(e.target.value);
                    setBulkDurationHours(nextH);
                    if (nextH === 8) setBulkDurationMinutesPart(0);
                    else if (nextH === 0 && bulkDurationMinutesPart < 5) {
                      setBulkDurationMinutesPart(15);
                    }
                  }}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-2 py-2 text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  title="Horas de duración (0 a 8 horas)"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                    <option key={h} value={h}>
                      {h} h
                    </option>
                  ))}
                </select>
                <select
                  value={bulkDurationHours === 8 ? 0 : bulkDurationMinutesPart}
                  disabled={bulkDurationHours === 8}
                  onChange={(e) => setBulkDurationMinutesPart(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-2 py-2 text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-emerald-600 disabled:opacity-50"
                  title="Minutos adicionales"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
                    .filter((m) => !(bulkDurationHours === 0 && m === 0))
                    .map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')} min
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="lg:col-span-1">
              <label className="block font-bold text-slate-700 mb-1">Aforo</label>
              <input
                type="number"
                min={1}
                max={500}
                value={bulkExpectedAttendees}
                onChange={(e) => setBulkExpectedAttendees(Math.max(1, Number(e.target.value) || 1))}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Row 3: Quick Month Pattern Buttons + Primary Save Action */}
          <div className="pt-3 border-t border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-700 mr-1">
                Selección rápida ({MONTH_NAMES[currentDate.getMonth()]}):
              </span>
              <button
                type="button"
                onClick={() => handleApplyMonthPattern('weekdays')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-200 font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
              >
                Lun a Vie
              </button>
              <button
                type="button"
                onClick={() => handleApplyMonthPattern('mwf')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-200 font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
              >
                Lun · Mié · Vie
              </button>
              <button
                type="button"
                onClick={() => handleApplyMonthPattern('tth')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-200 font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
              >
                Mar · Jue
              </button>
              <button
                type="button"
                onClick={() => handleApplyMonthPattern('saturdays')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-200 font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
              >
                Sábados
              </button>
              <button
                type="button"
                onClick={() => handleApplyMonthPattern('from_today')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-200 font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
              >
                Desde hoy (L–V)
              </button>
              <button
                type="button"
                onClick={() => handleApplyMonthPattern('all')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-200 font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
              >
                Todo el mes
              </button>
              {currentMonthMarkedCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearCurrentMonthDates}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 font-semibold text-rose-700 transition whitespace-nowrap shrink-0"
                >
                  Limpiar mes ({currentMonthMarkedCount})
                </button>
              )}
              {bulkMarkedDates.length > currentMonthMarkedCount && (
                <button
                  type="button"
                  onClick={() => setBulkMarkedDates([])}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700 transition whitespace-nowrap shrink-0"
                >
                  Limpiar todo ({bulkMarkedDates.length})
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSaveBulkMonthToTrainer}
                disabled={bulkMarkedDates.length === 0}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition flex items-center whitespace-nowrap shrink-0 tabular-nums ${
                  bulkMarkedDates.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                <CalendarCheck className="w-4 h-4 mr-1.5 shrink-0" />
                <span>
                  {bulkMarkedDates.length > 0
                    ? `Cargar ${bulkMarkedDates.length} ${bulkMarkedDates.length === 1 ? 'Día' : 'Días'} al Calendario de ${selectedBulkTrainer?.name.split(' ')[0] || 'Entrenador'}`
                    : 'Haz clic en los días del mes para marcarlos'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Navigation Bar & Controls */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <button
            type="button"
            onClick={handlePrev}
            className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 transition"
            title="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 transition"
            title="Siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 transition"
          >
            Hoy
          </button>

          <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>

          <h4 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight capitalize text-center sm:text-left">
            {calendarHeaderTitle}
          </h4>
        </div>

        <div className="flex items-center justify-center space-x-2">
          <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">Ir a fecha:</span>
          <input
            type="date"
            value={formatYYYYMMDD(currentDate)}
            onChange={handleDatePick}
            className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-bold text-slate-700 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1 text-red-600" />
            Filtros:
          </span>

          <div className="flex items-center space-x-1">
            <select
              value={filterTrainerId}
              onChange={(e) => setFilterTrainerId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-red-500"
            >
              <option value="all">Todos los Entrenadores</option>
              {trainers.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onOpenPdfReport?.(filterTrainerId)}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition"
              title="Descargar Rol de Horarios en PDF"
            >
              <Printer className="w-3.5 h-3.5 text-red-600" />
            </button>
          </div>

          <select
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-red-500"
          >
            <option value="all">Todas las Empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filterActivityType}
            onChange={(e) => setFilterActivityType(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-red-500"
          >
            <option value="all">Todas las Modalidades</option>
            <option value="pausa_activa">Pausa Activa</option>
            <option value="clase_fitness">Clase Fitness</option>
            <option value="gimnasio_corporativo">Gimnasio Corporativo</option>
            <option value="masajes">Masajes</option>
          </select>

          <select
            value={filterLockStatus}
            onChange={(e) =>
              setFilterLockStatus(
                e.target.value as 'all' | 'pendientes' | 'cerradas' | 'incumplidas'
              )
            }
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-red-500"
          >
            <option value="all">Todos los Estados</option>
            <option value="pendientes">Disponibles / En Horario</option>
            <option value="cerradas">Completadas y Cerradas (Bloqueadas)</option>
            <option value="incumplidas">Bloqueadas / No Cerradas (Fuera de Horario o +60m)</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar clase, sala o sede..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 w-44 sm:w-52"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-2.5 gap-y-1 text-slate-500 font-medium">
          <span className="text-emerald-700 font-semibold">Pausa Activa</span>
          <span aria-hidden="true">·</span>
          <span className="text-blue-700 font-semibold">Fitness</span>
          <span aria-hidden="true">·</span>
          <span className="text-indigo-700 font-semibold">Gimnasio Corp.</span>
          <span aria-hidden="true">·</span>
          <span className="text-teal-700 font-semibold">Masajes</span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center text-slate-700 font-semibold">
            <Lock className="w-3 h-3 mr-1 text-slate-700" />
            Cerrada
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center text-rose-700 font-semibold">
            <Ban className="w-3 h-3 mr-1 text-rose-600" />
            No Cerrada / Bloqueada
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-700">
            Total Asignaciones:{' '}
            <strong className="text-slate-900 font-mono tabular-nums">
              {filteredAssignments.length}
            </strong>
          </span>
        </div>
      </div>

      {/* ========================================================
          VISTA 1: CALENDARIO MENSUAL (MONTH VIEW)
         ======================================================== */}
      {viewMode === 'month' && (
        <div className="space-y-4">
          <div
            className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${
              isBulkMonthMode ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-slate-200/90'
            }`}
          >
            {/* Instruction Strip when Bulk Marking is Active */}
            {isBulkMonthMode && (
              <div className="bg-emerald-50/80 border-b border-emerald-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                <span className="font-semibold">
                  Modo Marcado Mensual activo: haz clic en cualquier día de{' '}
                  <strong>{MONTH_NAMES[currentDate.getMonth()]}</strong> (o en el encabezado{' '}
                  <strong>Lunes–Domingo</strong> para marcar toda la columna) con{' '}
                  <strong>{resolvedBulkActivityName || 'la actividad elegida'}</strong> (
                  <span className="font-mono tabular-nums">
                    {bulkTime}–{calculateEndTimeHHMM(bulkTime, bulkTotalDurationMinutes) || ''} ·{' '}
                    {formatDurationHoursMinutes(bulkTotalDurationMinutes, true)}
                  </span>
                  ).
                </span>
                <span className="font-mono tabular-nums font-bold text-emerald-800 whitespace-nowrap">
                  {currentMonthMarkedCount} en este mes · {bulkMarkedDates.length} total
                </span>
              </div>
            )}

            {/* Weekday Labels Header */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs text-center">
              {DAY_NAMES.map((d, idx) => {
                const mondayDow = idx + 1;
                const currentMonthDowDates = monthCalendarGrid
                  .filter((c) => c.isCurrentMonth && c.dayOfWeek === mondayDow)
                  .map((c) => c.dateStr);
                const allColumnMarked =
                  isBulkMonthMode &&
                  currentMonthDowDates.length > 0 &&
                  currentMonthDowDates.every((dt) => bulkMarkedSet.has(dt));

                if (isBulkMonthMode) {
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleToggleWeekdayHeader(mondayDow)}
                      className={`px-1 py-2.5 truncate transition flex items-center justify-center gap-1 cursor-pointer ${
                        allColumnMarked
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'hover:bg-emerald-50 hover:text-emerald-800 text-slate-700'
                      }`}
                      title={`Marcar o desmarcar todos los ${d} de ${MONTH_NAMES[currentDate.getMonth()]}`}
                    >
                      {allColumnMarked && <Check className="w-3 h-3 shrink-0" />}
                      <span className="hidden sm:inline">{d}</span>
                      <span className="sm:hidden">{DAY_SHORT_NAMES[idx]}</span>
                    </button>
                  );
                }

                return (
                  <div key={d} className="px-1 py-2.5 truncate">
                    <span className="hidden sm:inline">{d}</span>
                    <span className="sm:hidden">{DAY_SHORT_NAMES[idx]}</span>
                  </div>
                );
              })}
            </div>

            {/* Calendar Days Matrix */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-100">
              {monthCalendarGrid.map((cell, idx) => {
                const isSelectedCell = formatYYYYMMDD(selectedDate) === cell.dateStr;
                const hasClasses = cell.classes.length > 0;
                const isMarkedForBulk = isBulkMonthMode && bulkMarkedSet.has(cell.dateStr);
                const alreadyAssignedSameSlot =
                  isBulkMonthMode &&
                  Boolean(bulkTrainerId) &&
                  Boolean(bulkCompanyId) &&
                  Boolean(resolvedBulkActivityName) &&
                  hasMatchingAssignmentOnDate(assignments, {
                    trainerId: bulkTrainerId,
                    companyId: bulkCompanyId,
                    sedeId: bulkSedeId,
                    dateStr: cell.dateStr,
                    time: bulkTime,
                    activityName: resolvedBulkActivityName,
                  });

                return (
                  <div
                    key={`${cell.dateStr}_${idx}`}
                    onClick={() => {
                      setSelectedDate(cell.date);
                      if (isBulkMonthMode) {
                        if (!cell.isCurrentMonth) {
                          setCurrentDate(cell.date);
                        }
                        handleToggleDateInBulk(cell.dateStr);
                      }
                    }}
                    className={`min-h-[110px] sm:min-h-[128px] p-1.5 sm:p-2 transition flex flex-col justify-between group relative cursor-pointer select-none ${
                      isMarkedForBulk
                        ? 'bg-emerald-50/90 ring-2 ring-emerald-600 ring-inset z-10'
                        : cell.isCurrentMonth
                        ? 'bg-white'
                        : 'bg-slate-50/70 text-slate-400'
                    } ${
                      !isMarkedForBulk && isSelectedCell
                        ? 'ring-2 ring-red-600 ring-inset z-10 bg-red-50/20'
                        : !isMarkedForBulk
                        ? isBulkMonthMode
                          ? 'hover:bg-emerald-50/40'
                          : 'hover:bg-slate-50'
                        : ''
                    }`}
                  >
                    {/* Cell Day Header */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-extrabold w-6 h-6 flex items-center justify-center rounded-full tabular-nums shrink-0 ${
                          isMarkedForBulk
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : cell.isToday
                            ? 'bg-red-600 text-white shadow-xs'
                            : isSelectedCell
                            ? 'bg-red-100 text-red-700'
                            : cell.isCurrentMonth
                            ? 'text-slate-800'
                            : 'text-slate-400'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {isBulkMonthMode ? (
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 ${
                            isMarkedForBulk
                              ? 'bg-emerald-600 border-emerald-700 text-white'
                              : 'border-slate-300 bg-white text-transparent group-hover:border-emerald-500'
                          }`}
                          title={
                            isMarkedForBulk
                              ? `Quitar marca del ${cell.dateStr}`
                              : `Marcar actividad en ${cell.dateStr}`
                          }
                        >
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        /* Quick Add Button on Cell Hover */
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(cell.date);
                            onAddAssignment({
                              frequency: 'fecha_unica',
                              date: cell.dateStr,
                              dayOfWeek: cell.dayOfWeek,
                              dayOfMonth: cell.dayNumber,
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-red-50 hover:bg-red-600 text-red-600 hover:text-white transition shadow-xs"
                          title={`Asignar clase el ${cell.dateStr}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Classes + Marked Preview inside cell */}
                    <div className="space-y-1 my-1 flex-1 overflow-hidden">
                      {isMarkedForBulk && (
                        <div
                          className={`p-1 rounded-lg text-[10px] font-bold border truncate flex items-center justify-between gap-1 ${
                            alreadyAssignedSameSlot
                              ? 'bg-amber-100 text-amber-950 border-amber-300'
                              : 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                          }`}
                          title={
                            alreadyAssignedSameSlot
                              ? `Ya existe esta misma actividad a las ${bulkTime} hrs para ${selectedBulkTrainer?.name || ''}`
                              : `Por cargar: ${bulkTime} (${formatDurationHoursMinutes(bulkTotalDurationMinutes, true)}) · ${resolvedBulkActivityName || 'Actividad'} · ${selectedBulkTrainer?.name || ''}`
                          }
                        >
                          <span className="font-mono tabular-nums shrink-0">{bulkTime}</span>
                          <span className="truncate">
                            {alreadyAssignedSameSlot
                              ? 'Ya asignada'
                              : resolvedBulkActivityName || 'Nueva'}
                          </span>
                        </div>
                      )}

                      {cell.classes.slice(0, isMarkedForBulk ? 1 : 2).map((asg) => {
                        const normType = normalizeActivityType(asg.activityType);
                        const trainerInitial = asg.trainerName.split(' ')[0] || asg.trainerName;
                        const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
                        const cellLock = getAssignmentOccurrenceStatus(
                          asg,
                          cell.dateStr,
                          records,
                          activityCatalog,
                          scheduleNowMs
                        );

                        return (
                          <div
                            key={asg.id}
                            onClick={(e) => {
                              if (isBulkMonthMode) return;
                              e.stopPropagation();
                              setSelectedDate(cell.date);
                              onEditAssignment(asg);
                            }}
                            className={`p-1 rounded-lg text-[10px] font-semibold border truncate transition flex items-center justify-between ${
                              cellLock.isNonCompliant
                                ? 'bg-rose-100/90 text-rose-900 border-rose-300 hover:bg-rose-200/80'
                                : cellLock.isCompletedAndClosed
                                  ? 'bg-slate-200/90 text-slate-700 border-slate-300 hover:bg-slate-200'
                                  : cellLock.state === 'en_curso'
                                    ? 'bg-amber-100/90 text-amber-900 border-amber-300 hover:bg-amber-100'
                                    : MONTH_CELL_MODALITY_CLASS[normType]
                            }`}
                            title={`${asg.time} (${formatDurationHoursMinutes(durMins)}) - ${asg.trainerName} en ${asg.companyName} (${ACTIVITY_TYPE_LABELS[normType]} · ${asg.activityName}) — ${cellLock.statusLabel}`}
                          >
                            <span
                              className={`font-mono font-bold shrink-0 flex items-center gap-0.5 ${
                                cellLock.isCompletedAndClosed || cellLock.isNonCompliant
                                  ? 'line-through opacity-80'
                                  : ''
                              }`}
                            >
                              {cellLock.isNonCompliant ? (
                                <Ban className="w-2.5 h-2.5 shrink-0 text-rose-700" />
                              ) : (
                                cellLock.isLocked && <Lock className="w-2.5 h-2.5 shrink-0" />
                              )}
                              {asg.time}
                            </span>
                            <span className="truncate mx-1 font-medium">{trainerInitial}</span>
                            <span className="font-mono tabular-nums text-[9px] opacity-80 shrink-0">
                              {formatDurationHoursMinutes(durMins, true)}
                            </span>
                          </div>
                        );
                      })}

                      {cell.classes.length > (isMarkedForBulk ? 1 : 2) && (
                        <div className="text-[10px] font-bold text-red-600 text-center bg-red-50 rounded py-0.5 border border-red-100 tabular-nums">
                          +{cell.classes.length - (isMarkedForBulk ? 1 : 2)} más
                        </div>
                      )}
                    </div>

                    {/* Total badge at bottom */}
                    {(hasClasses || isMarkedForBulk) && (
                      <div className="flex items-center justify-between text-[9px] font-bold">
                        {isMarkedForBulk ? (
                          <span className="text-emerald-800 truncate">
                            {selectedBulkTrainer?.name.split(' ')[0] || 'Marcado'}
                          </span>
                        ) : (
                          <span />
                        )}
                        {hasClasses && (
                          <span className="text-slate-500 tabular-nums">
                            {cell.classes.length} {cell.classes.length === 1 ? 'clase' : 'clases'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month Inspector Panel: Details for selected day */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <Calendar className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Agenda del Día: <span className="text-red-600 capitalize">{selectedDayFormatted}</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    {selectedDayClasses.length === 0
                      ? 'No hay clases programadas para esta fecha.'
                      : `${selectedDayClasses.length} ${
                          selectedDayClasses.length === 1 ? 'sesión programada' : 'sesiones programadas'
                        }`}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentDate(selectedDate);
                    setViewMode('day');
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center"
                >
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  Ver en Vista Día
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const dow = getMondayIndexedDayOfWeek(selectedDate);
                    onAddAssignment({
                      frequency: 'fecha_unica',
                      date: formatYYYYMMDD(selectedDate),
                      dayOfWeek: dow,
                      dayOfMonth: selectedDate.getDate(),
                    });
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-xs flex items-center"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Asignar Clase en este Día
                </button>
              </div>
            </div>

            {selectedDayClasses.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                No hay actividades programadas para este día. Haz clic en "Asignar Clase en este Día" para agregar una.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedDayClasses.map((asg) => {
                  const tr = trainers.find((t) => t.id === asg.trainerId);
                  const normType = normalizeActivityType(asg.activityType);
                  const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
                  const endHHMM = calculateEndTimeHHMM(asg.time, durMins);
                  const selectedDateStr = formatYYYYMMDD(selectedDate);
                  const lockInfo = getAssignmentOccurrenceStatus(
                    asg,
                    selectedDateStr,
                    records,
                    activityCatalog,
                    scheduleNowMs
                  );

                  return (
                    <div
                      key={asg.id}
                      className={`p-3.5 rounded-xl border text-xs space-y-2 transition shadow-xs ${
                        lockInfo.isNonCompliant
                          ? 'bg-rose-50/80 border-rose-300'
                          : lockInfo.isCompletedAndClosed
                            ? 'bg-slate-100/90 border-slate-300'
                            : lockInfo.state === 'en_curso'
                              ? 'bg-amber-50/60 border-amber-300'
                              : 'bg-slate-50 border-slate-200 hover:border-red-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`font-mono font-bold text-xs flex items-center ${
                              lockInfo.isCompletedAndClosed || lockInfo.isNonCompliant
                                ? 'text-slate-600 line-through'
                                : 'text-red-600'
                            }`}
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            {asg.time}{endHHMM ? `–${endHHMM}` : ' hrs'}
                          </span>
                          <span className="font-mono tabular-nums font-bold text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 flex items-center whitespace-nowrap">
                            <Timer className="w-2.5 h-2.5 mr-0.5 text-red-500 shrink-0" />
                            {formatDurationHoursMinutes(durMins)}
                          </span>
                        </div>
                        {lockInfo.isNonCompliant ? (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-rose-700 text-white inline-flex items-center shrink-0">
                            <Ban className="w-2.5 h-2.5 mr-1 text-rose-200" />
                            {lockInfo.shortLabel}
                          </span>
                        ) : lockInfo.isCompletedAndClosed ? (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-slate-800 text-white inline-flex items-center shrink-0">
                            <Lock className="w-2.5 h-2.5 mr-1 text-emerald-400" />
                            Cerrada y Bloqueada
                          </span>
                        ) : lockInfo.state === 'en_curso' ? (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-amber-600 text-white inline-flex items-center shrink-0">
                            En Curso
                          </span>
                        ) : (
                          <span
                            className={`text-[10px] font-bold shrink-0 ${MODALITY_TEXT_CLASS[normType]}`}
                          >
                            {ACTIVITY_TYPE_LABELS[normType]}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {tr && (
                          <img
                            src={tr.avatar}
                            alt={tr.name}
                            className="w-7 h-7 rounded-full object-cover border border-slate-300 shrink-0"
                          />
                        )}
                        <div>
                          <span className="text-[10px] text-slate-400 font-medium block">Entrenador</span>
                          <span className="font-bold text-slate-900 truncate block">
                            {asg.trainerName}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 text-slate-700 bg-white p-2 rounded-lg border border-slate-200/80">
                        <p className="font-semibold text-slate-900 truncate">
                          🏢 {asg.companyName}
                        </p>
                        <p className="text-slate-600 truncate text-[11px]">
                          📍 {asg.sedeName} • {asg.locationArea}
                        </p>
                        <p className="text-slate-800 font-medium truncate text-[11px] pt-1 border-t border-slate-100">
                          ⚡ {asg.activityName}
                        </p>
                      </div>

                      {lockInfo.isLocked && lockInfo.detailText && (
                        <div
                          className={`p-2 rounded-lg border text-[10px] font-mono flex items-center gap-1.5 ${
                            lockInfo.isNonCompliant
                              ? 'bg-rose-100/80 border-rose-300 text-rose-950'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          }`}
                        >
                          {lockInfo.isNonCompliant ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          )}
                          <span className="truncate">{lockInfo.detailText}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500 font-medium">
                          {asg.frequency === 'semanal'
                            ? '🔁 Recurrente semanal'
                            : asg.frequency === 'mensual'
                            ? `🗓️ Día ${asg.dayOfMonth} del mes`
                            : '📅 Fecha puntual'}
                        </span>

                        <div className="flex items-center space-x-1">
                          {onUpdateAssignment && !lockInfo.record && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateAssignment(
                                  toggleAssignmentDateLock(asg, selectedDateStr, !lockInfo.isLocked)
                                )
                              }
                              className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center space-x-1 transition ${
                                lockInfo.isLocked
                                  ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300'
                              }`}
                              title={
                                lockInfo.isLocked
                                  ? 'Rehabilitar / Desbloquear asignación en esta fecha'
                                  : 'Marcar como completada y cerrada (bloquear repetición)'
                              }
                            >
                              {lockInfo.isLocked ? (
                                <>
                                  <Unlock className="w-3 h-3 text-emerald-400" />
                                  <span>Reabrir</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3 text-emerald-700" />
                                  <span>Cerrar</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEditAssignment(asg)}
                            className="p-1 rounded bg-white hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200"
                            title="Editar Asignación"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAssignment(asg.id)}
                            className="p-1 rounded bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200"
                            title="Eliminar Asignación"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          VISTA 2: CALENDARIO SEMANAL (WEEK VIEW)
         ======================================================== */}
      {viewMode === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            return (
              <div
                key={day.dateStr}
                className={`bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col transition ${
                  day.isToday
                    ? 'border-red-400 ring-1 ring-red-400'
                    : 'border-slate-200/90'
                }`}
              >
                {/* Day Header with quick add button */}
                <div
                  className={`p-3 border-b flex items-center justify-between ${
                    day.isToday ? 'bg-red-50/80 border-red-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-extrabold text-slate-900 text-xs">
                        {day.dayName}
                      </span>
                      {day.isToday && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-600 text-white">
                          Hoy
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-slate-500">
                      {day.dayNumber} {MONTH_NAMES[day.date.getMonth()].slice(0, 3)}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-800">
                      {day.classes.length}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        onAddAssignment({
                          frequency: 'semanal',
                          dayOfWeek: day.dayIndex,
                          date: day.dateStr,
                          dayOfMonth: day.dayNumber,
                        })
                      }
                      className="p-1 rounded-md bg-white hover:bg-red-600 text-slate-600 hover:text-white border border-slate-300 transition shadow-xs"
                      title={`Asignar clase los ${day.dayName}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Day Classes Column */}
                <div className="p-2.5 space-y-2.5 flex-1 min-h-[280px]">
                  {day.classes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-4 text-center text-slate-400 text-xs space-y-2">
                      <p>Sin clases</p>
                      <button
                        type="button"
                        onClick={() =>
                          onAddAssignment({
                            frequency: 'semanal',
                            dayOfWeek: day.dayIndex,
                            date: day.dateStr,
                            dayOfMonth: day.dayNumber,
                          })
                        }
                        className="text-[11px] text-red-600 font-bold hover:underline"
                      >
                        + Añadir aquí
                      </button>
                    </div>
                  ) : (
                    day.classes.map((asg) => {
                      const tr = trainers.find((t) => t.id === asg.trainerId);
                      const normType = normalizeActivityType(asg.activityType);
                      const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
                      const dayLock = getAssignmentOccurrenceStatus(
                        asg,
                        day.dateStr,
                        records,
                        activityCatalog,
                        scheduleNowMs
                      );

                      return (
                        <div
                          key={asg.id}
                          className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition shadow-xs group ${
                            dayLock.isNonCompliant
                              ? 'bg-rose-50/80 border-rose-300'
                              : dayLock.isCompletedAndClosed
                                ? 'bg-slate-100 border-slate-300'
                                : dayLock.state === 'en_curso'
                                  ? 'bg-amber-50/70 border-amber-300'
                                  : 'bg-slate-50 border-slate-200 hover:border-red-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`font-mono font-bold text-[11px] flex items-center ${
                                dayLock.isCompletedAndClosed || dayLock.isNonCompliant
                                  ? 'text-slate-600 line-through'
                                  : 'text-red-600'
                              }`}
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              {asg.time}
                              <span className="ml-1 text-[10px] text-slate-500 font-semibold tabular-nums no-underline">
                                ({formatDurationHoursMinutes(durMins, true)})
                              </span>
                            </span>
                            {dayLock.isNonCompliant ? (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-700 text-white inline-flex items-center">
                                <Ban className="w-2.5 h-2.5 mr-0.5 text-rose-200" />
                                {dayLock.nonComplianceReason === 'sin_cierre_30m'
                                  ? 'No Cerrada'
                                  : 'Bloqueada'}
                              </span>
                            ) : dayLock.isCompletedAndClosed ? (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-slate-800 text-white inline-flex items-center">
                                <Lock className="w-2.5 h-2.5 mr-0.5 text-emerald-400" />
                                Cerrada
                              </span>
                            ) : dayLock.state === 'en_curso' ? (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-600 text-white">
                                En curso
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-bold ${MODALITY_TEXT_CLASS[normType]}`}
                              >
                                {ACTIVITY_TYPE_SHORT_LABELS[normType]}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1.5">
                            {tr && (
                              <img
                                src={tr.avatar}
                                alt={tr.name}
                                className="w-5 h-5 rounded-full object-cover border border-slate-300 shrink-0"
                              />
                            )}
                            <span className="font-bold text-slate-900 truncate text-[11px]">
                              {asg.trainerName}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-700 truncate font-semibold">
                            🏢 {asg.companyName}
                          </div>

                          <div className="text-[10px] text-slate-500 truncate">
                            📍 {asg.sedeName} • {asg.locationArea}
                          </div>

                          <div className="text-[10px] font-medium text-slate-800 truncate border-t border-slate-200/60 pt-1">
                            {asg.activityName}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[9px] text-slate-400">
                            <span>
                              {asg.frequency === 'semanal'
                                ? '🔁 Semanal'
                                : asg.frequency === 'mensual'
                                ? '🗓️ Mensual'
                                : '📅 Única'}
                            </span>

                            <div className="flex items-center space-x-1">
                              {onUpdateAssignment && !dayLock.record && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateAssignment(
                                      toggleAssignmentDateLock(asg, day.dateStr, !dayLock.isLocked)
                                    )
                                  }
                                  className={`p-1 rounded border transition ${
                                    dayLock.isLocked
                                      ? 'bg-slate-800 text-emerald-400 border-slate-800'
                                      : 'bg-white text-slate-600 hover:text-emerald-700 border-slate-200'
                                  }`}
                                  title={
                                    dayLock.isLocked
                                      ? 'Rehabilitar / Desbloquear fecha'
                                      : 'Marcar como completada y cerrada (bloquear)'
                                  }
                                >
                                  {dayLock.isLocked ? (
                                    <Unlock className="w-3 h-3" />
                                  ) : (
                                    <Lock className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onEditAssignment(asg)}
                                className="p-1 rounded bg-white hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200"
                                title="Editar Asignación"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteAssignment(asg.id)}
                                className="p-1 rounded bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200"
                                title="Eliminar Asignación"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================
          VISTA 3: CALENDARIO DIARIO (DAY VIEW / TIMELINE)
         ======================================================== */}
      {viewMode === 'day' && (
        <div className="space-y-4">
          {/* Day Metrics Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-red-400 text-xs font-bold uppercase tracking-wider block">
                Planificación del Día
              </span>
              <h3 className="text-lg sm:text-xl font-black capitalize mt-0.5">
                {selectedDayFormatted}
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Visualización detallada de todas las sesiones ordenadas cronológicamente
              </p>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-center px-4 py-2 bg-white/10 rounded-xl border border-white/10">
                <span className="block font-black text-xl text-red-400">
                  {selectedDayClasses.length}
                </span>
                <span className="text-[10px] text-slate-300 font-medium">Clases Hoy</span>
              </div>

              <div className="text-center px-4 py-2 bg-white/10 rounded-xl border border-white/10">
                <span className="block font-black text-xl text-emerald-400">
                  {selectedDayClasses.reduce((acc, c) => acc + (c.expectedAttendees || 20), 0)}
                </span>
                <span className="text-[10px] text-slate-300 font-medium">Colaboradores</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const dow = getMondayIndexedDayOfWeek(selectedDate);
                  onAddAssignment({
                    frequency: 'fecha_unica',
                    date: formatYYYYMMDD(selectedDate),
                    dayOfWeek: dow,
                    dayOfMonth: selectedDate.getDate(),
                  });
                }}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition flex items-center shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Asignar Clase Hoy
              </button>
            </div>
          </div>

          {/* Timeline of classes */}
          {selectedDayClasses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-800 text-base">
                No hay clases programadas para este día
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No se encontraron actividades ni pausas activas para la fecha seleccionada. Puedes programar una nueva clase haciendo clic abajo.
              </p>
              <button
                type="button"
                onClick={() => {
                  const dow = getMondayIndexedDayOfWeek(selectedDate);
                  onAddAssignment({
                    frequency: 'fecha_unica',
                    date: formatYYYYMMDD(selectedDate),
                    dayOfWeek: dow,
                    dayOfMonth: selectedDate.getDate(),
                  });
                }}
                className="inline-flex items-center px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Programar Clase para este Día
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayClasses.map((asg) => {
                const tr = trainers.find((t) => t.id === asg.trainerId);
                const normType = normalizeActivityType(asg.activityType);
                const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
                const endHHMM = calculateEndTimeHHMM(asg.time, durMins);
                const dayViewDateStr = formatYYYYMMDD(selectedDate);
                const dayLock = getAssignmentOccurrenceStatus(
                  asg,
                  dayViewDateStr,
                  records,
                  activityCatalog,
                  scheduleNowMs
                );

                return (
                  <div
                    key={asg.id}
                    className={`border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
                      dayLock.isNonCompliant
                        ? 'bg-rose-50/70 border-rose-300'
                        : dayLock.isCompletedAndClosed
                          ? 'bg-slate-100/90 border-slate-300'
                          : dayLock.state === 'en_curso'
                            ? 'bg-amber-50/50 border-amber-300'
                            : 'bg-white border-slate-200/90 hover:border-red-300'
                    }`}
                  >
                    <div className="flex items-start space-x-4">
                      {/* Hour badge */}
                      <div
                        className={`flex flex-col items-center justify-center px-3 py-2.5 rounded-xl text-white shrink-0 min-w-[82px] shadow-xs ${
                          dayLock.isNonCompliant
                            ? 'bg-rose-800'
                            : dayLock.isCompletedAndClosed
                              ? 'bg-slate-700'
                              : 'bg-slate-900'
                        }`}
                      >
                        {dayLock.isNonCompliant ? (
                          <Ban className="w-4 h-4 text-rose-200 mb-1" />
                        ) : dayLock.isCompletedAndClosed ? (
                          <Lock className="w-4 h-4 text-emerald-400 mb-1" />
                        ) : (
                          <Clock className="w-4 h-4 text-red-400 mb-1" />
                        )}
                        <span
                          className={`font-mono font-bold text-xs ${
                            dayLock.isCompletedAndClosed || dayLock.isNonCompliant
                              ? 'line-through text-slate-300'
                              : ''
                          }`}
                        >
                          {asg.time}
                        </span>
                        <span className="text-[10px] font-mono tabular-nums font-bold text-amber-300 mt-0.5 whitespace-nowrap">
                          {formatDurationHoursMinutes(durMins, true)}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {dayLock.isNonCompliant && (
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-md bg-rose-700 text-white inline-flex items-center">
                              <Ban className="w-3 h-3 mr-1 text-rose-200" />
                              {dayLock.statusLabel}
                            </span>
                          )}
                          {dayLock.isCompletedAndClosed && (
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-md bg-slate-900 text-white inline-flex items-center">
                              <Lock className="w-3 h-3 mr-1 text-emerald-400" />
                              Completada y Cerrada • Bloqueada
                            </span>
                          )}
                          {dayLock.state === 'en_curso' && (
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-md bg-amber-600 text-white inline-flex items-center">
                              <Lock className="w-3 h-3 mr-1" />
                              En Curso • Bloqueada
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-extrabold ${MODALITY_TEXT_CLASS[normType]}`}
                          >
                            {ACTIVITY_TYPE_LABELS[normType]}
                          </span>

                          <span className="text-[11px] font-mono tabular-nums font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center whitespace-nowrap">
                            <Timer className="w-3 h-3 mr-1 text-red-600 shrink-0" />
                            Duración: {formatDurationHoursMinutes(durMins)} {endHHMM ? `(${asg.time}–${endHHMM})` : ''}
                          </span>

                          <span className="text-[11px] font-semibold text-slate-500 flex items-center">
                            <Repeat className="w-3 h-3 mr-1 text-slate-400" />
                            {asg.frequency === 'semanal'
                              ? 'Recurrente Semanal'
                              : asg.frequency === 'mensual'
                              ? `Mensual (Día ${asg.dayOfMonth})`
                              : 'Fecha Única'}
                          </span>

                          <span className="text-[11px] font-medium text-slate-500 flex items-center">
                            <Users className="w-3 h-3 mr-1 text-slate-400" />
                            {asg.expectedAttendees || 20} colaboradores esperados
                          </span>
                        </div>

                        <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
                          {asg.activityName}
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span className="flex items-center font-bold text-slate-900">
                            <Building2 className="w-3.5 h-3.5 mr-1 text-red-600" />
                            {asg.companyName}
                          </span>
                          <span className="flex items-center">
                            <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            {asg.sedeName} — {asg.locationArea}
                          </span>
                        </div>

                        {dayLock.isLocked && dayLock.detailText && (
                          <p
                            className={`text-[11px] font-mono px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1.5 ${
                              dayLock.isNonCompliant
                                ? 'text-rose-950 bg-rose-100/80 border-rose-300'
                                : 'text-emerald-900 bg-emerald-50 border-emerald-200'
                            }`}
                          >
                            {dayLock.isNonCompliant ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            )}
                            <span>{dayLock.detailText}</span>
                          </p>
                        )}

                        {asg.notes && (
                          <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                            Notas: "{asg.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Trainer & Actions */}
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 gap-2 shrink-0">
                      <div className="flex items-center space-x-2">
                        {tr && (
                          <img
                            src={tr.avatar}
                            alt={tr.name}
                            className="w-8 h-8 rounded-full object-cover border-2 border-red-500 shadow-xs"
                          />
                        )}
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-slate-400 font-medium block">
                            Entrenador Asignado
                          </span>
                          <span className="font-bold text-slate-900 text-xs block">
                            {asg.trainerName}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {onUpdateAssignment && !dayLock.record && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAssignment(
                                toggleAssignmentDateLock(asg, dayViewDateStr, !dayLock.isLocked)
                              )
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center transition ${
                              dayLock.isLocked
                                ? 'bg-slate-900 hover:bg-slate-800 text-white'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {dayLock.isLocked ? (
                              <>
                                <Unlock className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Reabrir
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 mr-1 text-emerald-700" /> Cerrar y Bloquear
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditAssignment(asg)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center transition"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAssignment(asg.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
