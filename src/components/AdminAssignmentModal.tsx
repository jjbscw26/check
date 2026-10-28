import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ACTIVITY_TYPE_LABELS,
  ActivityCatalogItem,
  ActivityType,
  ALL_ACTIVITY_TYPES,
  ClassAssignment,
  Company,
  normalizeActivityType,
  Trainer,
} from '../types';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Activity,
  Building2,
  User,
  MapPin,
  Settings2,
  Timer,
  Minus,
  Plus,
  Lock,
  Unlock,
  Ban,
  Video,
  Globe,
  KeyRound,
  Hash,
  UserCog,
} from 'lucide-react';
import {
  getDefaultDurationMinutes,
  getAssignmentDurationMinutes,
  calculateEndTimeHHMM,
  MIN_ASSIGNMENT_DURATION_MINUTES,
  MAX_ASSIGNMENT_DURATION_MINUTES,
  splitMinutesToHoursAndMinutes,
  combineHoursAndMinutes,
  formatDurationHoursMinutes,
} from '../utils/sessionAlarm';
import { doesAssignmentApplyToDate, formatLocalYYYYMMDD } from '../utils/assignmentLock';
import {
  WEEKDAY_MONDAY_SHORT_ES,
  buildMonthGridCells,
  buildMonthlyBatchAssignments,
  getMonthDatesByPattern,
  getUpcomingDefaultTimeHHMM,
  hasMatchingAssignmentOnDate,
  shiftYearMonth,
  shouldAutoAuthorizeTodayNewAssignment,
  toggleWeekdayDatesInMonth,
} from '../utils/monthlyAssignmentHelper';
import {
  buildCatalogItemFromSpecialty,
  getAllowedActivityTypesForTrainer,
  getAllowedSpecialtiesForTrainer,
  isActivityAllowedForTrainer,
  isDisciplineRepresentedInCatalog,
  normalizeDisciplineKey,
  resolveDisciplineSelection,
} from '../utils/specialtyDisciplines';
import {
  buildSharePayloadFromAssignmentLike,
  isValidVirtualMeetingUrl,
  normalizeVirtualMeetingUrl,
  VIRTUAL_PLATFORM_PRESETS,
} from '../utils/virtualClassShare';
import { VirtualClassQuickShare } from './VirtualClassShareCard';

export interface AssignmentPreset {
  frequency?: 'semanal' | 'mensual' | 'fecha_unica';
  multiMonthMode?: boolean;
  targetMonth?: string; // YYYY-MM
  initialDates?: string[];
  dayOfWeek?: number;
  dayOfMonth?: number;
  date?: string;
  trainerId?: string;
  companyId?: string;
  sedeId?: string;
  activityType?: ActivityType;
  activityName?: string;
  time?: string;
  durationMinutes?: number;
  isVirtual?: boolean;
  virtualPlatform?: string;
  virtualMeetingUrl?: string;
  virtualMeetingId?: string;
  virtualPasscode?: string;
}

interface AdminAssignmentModalProps {
  assignment: ClassAssignment | null; // null if creating a new one
  trainers: Trainer[];
  companies: Company[];
  existingAssignments?: ClassAssignment[];
  activityCatalog?: ActivityCatalogItem[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (assignment: ClassAssignment) => void;
  onSaveBatch?: (assignments: ClassAssignment[]) => void;
  onAddCatalogItem?: (item: ActivityCatalogItem) => void;
  onManageActivityTypes?: () => void;
  onEditTrainerSpecialties?: (trainer: Trainer) => void;
  initialPreset?: AssignmentPreset | null;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

const SHORT_DURATION_PRESETS = [15, 20, 30, 45, 50, 60, 90];
const LONG_GYM_DURATION_PRESETS = [120, 180, 240, 300, 360, 420, 480];

const KNOWN_PLATFORM_NAMES = new Set<string>([
  'Google Meet',
  'Zoom',
  'Microsoft Teams',
  'Webex',
]);


export const AdminAssignmentModal: React.FC<AdminAssignmentModalProps> = ({
  assignment,
  trainers,
  companies,
  existingAssignments = [],
  activityCatalog = [],
  isOpen,
  onClose,
  onSave,
  onSaveBatch,
  onAddCatalogItem,
  onManageActivityTypes,
  onEditTrainerSpecialties,
  initialPreset,
}) => {
  const todayLocalStr = formatLocalYYYYMMDD(new Date());

  const [trainerId, setTrainerId] = useState(trainers[0]?.id || '');
  const [companyId, setCompanyId] = useState(companies[0]?.id || '');
  const [sedeId, setSedeId] = useState(companies[0]?.sedes?.[0]?.id || '');

  const [scheduleMode, setScheduleMode] = useState<
    'semanal' | 'mensual' | 'fecha_unica' | 'dias_mes'
  >('semanal');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(15);
  const [specificDate, setSpecificDate] = useState<string>(() => formatLocalYYYYMMDD(new Date()));
  const [targetMonth, setTargetMonth] = useState<string>(() =>
    formatLocalYYYYMMDD(new Date()).slice(0, 7)
  );
  const [selectedMonthDates, setSelectedMonthDates] = useState<string[]>([]);
  const [multiDayError, setMultiDayError] = useState<string | null>(null);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const [time, setTime] = useState<string>(() => getUpcomingDefaultTimeHHMM());
  const [durationInput, setDurationInput] = useState<string>('20');

  const [activityType, setActivityType] = useState<ActivityType>('pausa_activa');
  const [activityName, setActivityName] = useState<string>('Pausas Activas');
  const [locationArea, setLocationArea] = useState<string>('Piso 4 - Sala SUM');
  const [expectedAttendeesInput, setExpectedAttendeesInput] = useState<string>('20');
  const [notes, setNotes] = useState<string>('');
  const [active, setActive] = useState<boolean>(true);
  const [closed, setClosed] = useState<boolean>(false);
  const [nonCompliant, setNonCompliant] = useState<boolean>(false);

  // Virtual Class State
  const [isVirtual, setIsVirtual] = useState<boolean>(false);
  const [platformSelect, setPlatformSelect] = useState<string>('Google Meet');
  const [customPlatformName, setCustomPlatformName] = useState<string>('');
  const [virtualMeetingUrl, setVirtualMeetingUrl] = useState<string>('');
  const [virtualMeetingId, setVirtualMeetingId] = useState<string>('');
  const [virtualPasscode, setVirtualPasscode] = useState<string>('');

  const initializedSessionKeyRef = useRef<string | null>(null);
  const validationBannerRef = useRef<HTMLDivElement | null>(null);

  const selectableTrainers = useMemo(() => {
    const activeOnes = trainers.filter(
      (t) => t.active !== false || (assignment && t.id === assignment.trainerId)
    );
    return activeOnes.length > 0 ? activeOnes : trainers;
  }, [trainers, assignment]);

  // Selected trainer & company
  const selectedTrainer =
    selectableTrainers.find((t) => t.id === trainerId) ||
    trainers.find((t) => t.id === trainerId) ||
    selectableTrainers[0];
  const selectedCompany = companies.find((c) => c.id === companyId) || companies[0];

  const allowedTrainerSpecialties = useMemo(
    () => getAllowedSpecialtiesForTrainer(selectedTrainer, activityCatalog),
    [selectedTrainer, activityCatalog]
  );

  const allowedTrainerActivityTypes = useMemo(
    () => getAllowedActivityTypesForTrainer(selectedTrainer, activityCatalog),
    [selectedTrainer, activityCatalog]
  );

  const resolvedVirtualPlatform =
    platformSelect === 'Otra Plataforma'
      ? customPlatformName.trim() || 'Plataforma Virtual'
      : platformSelect;

  useEffect(() => {
    if (!isOpen) {
      initializedSessionKeyRef.current = null;
      return;
    }

    const sessionKey = assignment ? `edit:${assignment.id}` : 'create';
    if (initializedSessionKeyRef.current === sessionKey) {
      // Do not overwrite user's in-progress form edits when background Firestore snapshots arrive
      return;
    }
    initializedSessionKeyRef.current = sessionKey;

    const syncPlatformState = (rawPlatform?: string) => {
      const trimmed = (rawPlatform || '').trim();
      if (!trimmed) {
        setPlatformSelect('Google Meet');
        setCustomPlatformName('');
      } else if (KNOWN_PLATFORM_NAMES.has(trimmed)) {
        setPlatformSelect(trimmed);
        setCustomPlatformName('');
      } else {
        setPlatformSelect('Otra Plataforma');
        setCustomPlatformName(trimmed);
      }
    };

    if (assignment) {
      const targetTrainer =
        trainers.find((t) => t.id === assignment.trainerId) || selectableTrainers[0];
      const trainerSpecs = getAllowedSpecialtiesForTrainer(targetTrainer, activityCatalog);

      setTrainerId(targetTrainer?.id || assignment.trainerId);
      setCompanyId(assignment.companyId);
      setSedeId(assignment.sedeId);
      setScheduleMode(assignment.frequency || 'semanal');
      setDayOfWeek(assignment.dayOfWeek || 1);
      setDayOfMonth(assignment.dayOfMonth || 15);
      const asgDate = assignment.date || formatLocalYYYYMMDD(new Date());
      setSpecificDate(asgDate);
      setTargetMonth(asgDate.slice(0, 7));
      setSelectedMonthDates([]);
      setTime((assignment.time || '09:00').slice(0, 5));

      if (
        targetTrainer &&
        isActivityAllowedForTrainer(targetTrainer, assignment.activityName)
      ) {
        const normType = normalizeActivityType(assignment.activityType);
        setActivityType(normType);
        setActivityName(assignment.activityName);
        setDurationInput(
          String(getAssignmentDurationMinutes(assignment, activityCatalog))
        );
      } else if (trainerSpecs.length > 0) {
        setActivityType(trainerSpecs[0].activityType);
        setActivityName(trainerSpecs[0].name);
        setDurationInput(
          String(
            assignment.durationMinutes ||
              trainerSpecs[0].durationMinutes
          )
        );
      } else {
        const normType = normalizeActivityType(assignment.activityType);
        setActivityType(normType);
        setActivityName(assignment.activityName || '');
        setDurationInput(
          String(getAssignmentDurationMinutes(assignment, activityCatalog))
        );
      }

      setLocationArea(assignment.locationArea || 'Piso 4 - Sala SUM');
      setExpectedAttendeesInput(String(assignment.expectedAttendees ?? 20));
      setNotes(assignment.notes || '');
      setIsVirtual(Boolean(assignment.isVirtual));
      syncPlatformState(assignment.virtualPlatform);
      setVirtualMeetingUrl(assignment.virtualMeetingUrl || '');
      setVirtualMeetingId(assignment.virtualMeetingId || '');
      setVirtualPasscode(assignment.virtualPasscode || '');
      setActive(assignment.active !== false);
      setClosed(Boolean(assignment.closed));
      setNonCompliant(Boolean(assignment.nonCompliant));
    } else {
      const preferredWithSpecialties = selectableTrainers.find(
        (t) => getAllowedSpecialtiesForTrainer(t, activityCatalog).length > 0
      );
      const targetTrainer =
        (initialPreset?.trainerId &&
          selectableTrainers.find((t) => t.id === initialPreset.trainerId)) ||
        preferredWithSpecialties ||
        selectableTrainers[0];
      const trainerSpecs = getAllowedSpecialtiesForTrainer(targetTrainer, activityCatalog);

      let initialActName = initialPreset?.activityName || '';
      let initialActType: ActivityType = initialPreset?.activityType
        ? normalizeActivityType(initialPreset.activityType)
        : trainerSpecs[0]?.activityType || 'pausa_activa';
      let initialDur =
        initialPreset?.durationMinutes ||
        trainerSpecs[0]?.durationMinutes ||
        20;

      if (
        initialActName &&
        targetTrainer &&
        isActivityAllowedForTrainer(targetTrainer, initialActName)
      ) {
        const resolved = resolveDisciplineSelection(
          initialActName,
          initialActType,
          activityCatalog
        );
        initialActName = resolved.activityName;
        initialActType = resolved.activityType;
        initialDur = initialPreset?.durationMinutes || resolved.durationMinutes;
      } else if (trainerSpecs.length > 0) {
        const preferredByType = trainerSpecs.find(
          (s) => s.activityType === initialActType
        );
        const chosen = preferredByType || trainerSpecs[0];
        initialActName = chosen.name;
        initialActType = chosen.activityType;
        initialDur = initialPreset?.durationMinutes || chosen.durationMinutes;
      }

      const presetDate = initialPreset?.date || formatLocalYYYYMMDD(new Date());
      const presetMonth = initialPreset?.targetMonth || presetDate.slice(0, 7);

      setTrainerId(targetTrainer?.id || '');
      const presetComp =
        (initialPreset?.companyId && companies.find((c) => c.id === initialPreset.companyId)) ||
        companies[0];
      const presetCompSedes = Array.isArray(presetComp?.sedes) ? presetComp.sedes : [];
      const resolvedPresetSedeId =
        (initialPreset?.sedeId &&
          presetCompSedes.some((s) => s.id === initialPreset.sedeId) &&
          initialPreset.sedeId) ||
        presetCompSedes[0]?.id ||
        '';
      setCompanyId(presetComp?.id || '');
      setSedeId(resolvedPresetSedeId);
      setScheduleMode(
        initialPreset?.multiMonthMode
          ? 'dias_mes'
          : initialPreset?.frequency || 'semanal'
      );
      setDayOfWeek(initialPreset?.dayOfWeek ?? 1);
      setDayOfMonth(initialPreset?.dayOfMonth ?? 15);
      setSpecificDate(presetDate);
      setTargetMonth(presetMonth);
      setSelectedMonthDates(
        initialPreset?.initialDates && initialPreset.initialDates.length > 0
          ? initialPreset.initialDates
          : initialPreset?.multiMonthMode && initialPreset?.date
          ? [initialPreset.date]
          : []
      );
      setTime((initialPreset?.time || getUpcomingDefaultTimeHHMM()).slice(0, 5));
      setActivityType(initialActType);
      setActivityName(initialActName);
      setDurationInput(String(initialDur));

      const presetVirtual = Boolean(initialPreset?.isVirtual);
      setIsVirtual(presetVirtual);
      syncPlatformState(initialPreset?.virtualPlatform);
      setVirtualMeetingUrl(initialPreset?.virtualMeetingUrl || '');
      setVirtualMeetingId(initialPreset?.virtualMeetingId || '');
      setVirtualPasscode(initialPreset?.virtualPasscode || '');

      setLocationArea(
        presetVirtual
          ? `Sala Virtual (${initialPreset?.virtualPlatform || 'Google Meet'})`
          : 'Piso 4 - Sala SUM'
      );
      setExpectedAttendeesInput('15');
      setNotes('');
      setActive(true);
      setClosed(false);
      setNonCompliant(false);
    }
    setMultiDayError(null);
    setFormValidationError(null);
  }, [assignment, trainers, selectableTrainers, companies, isOpen, initialPreset, activityCatalog]);

  // Safe late-hydration fallback if modal was opened before trainers/companies arrived from Firestore
  useEffect(() => {
    if (!isOpen) return;
    if (!trainerId && selectableTrainers.length > 0) {
      const preferred =
        selectableTrainers.find(
          (t) => getAllowedSpecialtiesForTrainer(t, activityCatalog).length > 0
        ) || selectableTrainers[0];
      setTrainerId(preferred.id);
      const specs = getAllowedSpecialtiesForTrainer(preferred, activityCatalog);
      if (!activityName && specs.length > 0) {
        setActivityName(specs[0].name);
        setActivityType(specs[0].activityType);
        setDurationInput(String(specs[0].durationMinutes));
      }
    }
    if (!companyId && companies.length > 0) {
      setCompanyId(companies[0].id);
      setSedeId(companies[0].sedes?.[0]?.id || '');
    }
  }, [isOpen, trainerId, companyId, selectableTrainers, companies, activityCatalog, activityName]);

  const normalizedTime = (time || '09:00').slice(0, 5);
  const resolvedDurationMinutes = Math.max(
    MIN_ASSIGNMENT_DURATION_MINUTES,
    Math.min(
      MAX_ASSIGNMENT_DURATION_MINUTES,
      parseInt(durationInput, 10) ||
        getDefaultDurationMinutes(activityType, activityName, activityCatalog)
    )
  );

  const liveVirtualSharePayload = useMemo(() => {
    if (!isOpen || !isVirtual) return null;
    const companySedes = Array.isArray(selectedCompany?.sedes) ? selectedCompany.sedes : [];
    const sede = companySedes.find((s) => s.id === sedeId) || companySedes[0];
    const previewFrequency: 'semanal' | 'mensual' | 'fecha_unica' =
      scheduleMode === 'dias_mes' ? 'fecha_unica' : scheduleMode;
    const previewDate =
      scheduleMode === 'dias_mes'
        ? selectedMonthDates[0] || `${targetMonth}-01`
        : specificDate;

    return buildSharePayloadFromAssignmentLike({
      activityName: activityName || 'Clase Virtual Corporativa',
      activityType,
      companyName: selectedCompany?.name || 'Empresa Cliente',
      sedeName: sede?.name,
      trainerName: selectedTrainer?.name || 'Entrenador BSCW',
      frequency: previewFrequency,
      dayOfWeek: previewFrequency === 'semanal' ? dayOfWeek : undefined,
      dayOfMonth: previewFrequency === 'mensual' ? dayOfMonth : undefined,
      date: previewFrequency === 'fecha_unica' ? previewDate : undefined,
      time: normalizedTime,
      durationMinutes: resolvedDurationMinutes,
      virtualPlatform: resolvedVirtualPlatform,
      virtualMeetingUrl,
      virtualMeetingId,
      virtualPasscode,
      notes,
    });
  }, [
    isOpen,
    isVirtual,
    selectedCompany,
    sedeId,
    scheduleMode,
    selectedMonthDates,
    targetMonth,
    specificDate,
    activityName,
    activityType,
    selectedTrainer,
    dayOfWeek,
    dayOfMonth,
    normalizedTime,
    resolvedDurationMinutes,
    resolvedVirtualPlatform,
    virtualMeetingUrl,
    virtualMeetingId,
    virtualPasscode,
    notes,
  ]);

  if (!isOpen) return null;

  const handleTrainerChange = (nextTrainerId: string) => {
    setTrainerId(nextTrainerId);
    setFormValidationError(null);
    const nextTrainer = trainers.find((t) => t.id === nextTrainerId);
    if (!nextTrainer) return;

    if (!isActivityAllowedForTrainer(nextTrainer, activityName)) {
      const nextSpecs = getAllowedSpecialtiesForTrainer(nextTrainer, activityCatalog);
      if (nextSpecs.length > 0) {
        const sameModalitySpec = nextSpecs.find((s) => s.activityType === activityType);
        const chosen = sameModalitySpec || nextSpecs[0];
        setActivityName(chosen.name);
        setActivityType(chosen.activityType);
        setDurationInput(String(chosen.durationMinutes));
      } else {
        setActivityName('');
      }
    }
  };

  const handleCompanyChange = (cId: string) => {
    setCompanyId(cId);
    const comp = companies.find((c) => c.id === cId);
    setSedeId(comp?.sedes?.[0]?.id || '');
  };

  const handleToggleVirtualModality = (nextVirtual: boolean) => {
    setIsVirtual(nextVirtual);
    setFormValidationError(null);
    if (nextVirtual) {
      if (!locationArea.trim() || locationArea === 'Piso 4 - Sala SUM') {
        setLocationArea(`Sala Virtual (${resolvedVirtualPlatform})`);
      }
    } else if (locationArea.startsWith('Sala Virtual')) {
      setLocationArea('Piso 4 - Sala SUM');
    }
  };

  const { hours: durationHours, minutes: durationRemainderMinutes } =
    splitMinutesToHoursAndMinutes(resolvedDurationMinutes);
  const estimatedEndTime = calculateEndTimeHHMM(normalizedTime, resolvedDurationMinutes);

  const monthGrid = buildMonthGridCells(targetMonth);
  const selectedMonthDatesSet = new Set(selectedMonthDates);

  const toggleDateInMonthSelection = (dateStr: string) => {
    setMultiDayError(null);
    setSelectedMonthDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return Array.from(next).sort();
    });
  };

  const applyDisciplineChoice = (chosenName: string) => {
    setFormValidationError(null);
    const resolved = resolveDisciplineSelection(chosenName, activityType, activityCatalog);
    setActivityName(resolved.activityName);
    setActivityType(resolved.activityType);
    setDurationInput(
      String(getDefaultDurationMinutes(resolved.activityType, resolved.activityName, activityCatalog))
    );
  };

  const reportValidationError = (msg: string) => {
    setFormValidationError(msg);
    requestAnimationFrame(() => {
      validationBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError(null);

    const trainer =
      selectableTrainers.find((t) => t.id === trainerId) ||
      trainers.find((t) => t.id === trainerId) ||
      selectableTrainers[0];
    const company = companies.find((c) => c.id === companyId) || companies[0];

    if (!trainer) {
      reportValidationError(
        'No hay ningún entrenador disponible. Registra o activa primero un entrenador en la pestaña Entrenadores.'
      );
      return;
    }
    if (!company) {
      reportValidationError(
        'No hay ninguna empresa cliente registrada. Registra primero una empresa y sede en la pestaña Empresas y Sedes.'
      );
      return;
    }

    // Enforce strict specialty restriction
    if (!activityName.trim() || !isActivityAllowedForTrainer(trainer, activityName)) {
      reportValidationError(
        `Solo puedes asignar actividades registradas en las especialidades de ${trainer.name}. Selecciona una de sus especialidades o actualiza su perfil.`
      );
      return;
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalizedTime)) {
      reportValidationError(
        'Ingresa una hora de inicio válida en formato HH:MM (por ejemplo 09:00).'
      );
      return;
    }

    if (scheduleMode === 'fecha_unica' && !/^\d{4}-\d{2}-\d{2}$/.test(specificDate)) {
      reportValidationError('Selecciona una fecha específica válida para programar la clase.');
      return;
    }

    // Validate Virtual Class fields when enabled
    let normalizedMeetingUrl = '';
    const finalPlatformName =
      platformSelect === 'Otra Plataforma'
        ? customPlatformName.trim()
        : platformSelect.trim();

    if (isVirtual) {
      if (finalPlatformName.length < 2 || finalPlatformName.length > 80) {
        reportValidationError(
          'Indica el nombre de la plataforma donde se impartirá la clase virtual (ej. Google Meet, Zoom, Teams).'
        );
        return;
      }
      normalizedMeetingUrl = normalizeVirtualMeetingUrl(virtualMeetingUrl);
      if (!isValidVirtualMeetingUrl(normalizedMeetingUrl)) {
        reportValidationError(
          'Ingresa un link válido de la sala virtual (ej. https://meet.google.com/abc-defg-hij o https://zoom.us/j/...).'
        );
        return;
      }
    }

    // Batch mode: Marcar Días del Mes -> creates one ClassAssignment per marked day in the trainer's calendar
    if (!assignment && scheduleMode === 'dias_mes') {
      if (selectedMonthDates.length === 0) {
        const msg =
          'Marca al menos un día en el calendario mensual haciendo clic sobre las fechas o los botones rápidos antes de cargar.';
        setMultiDayError(msg);
        reportValidationError(msg);
        return;
      }

      const { created, skippedDuplicates } = buildMonthlyBatchAssignments({
        dates: selectedMonthDates,
        existingAssignments,
        trainer,
        company,
        sedeId,
        time: normalizedTime,
        durationMinutes: resolvedDurationMinutes,
        activityType,
        activityName,
        locationArea,
        expectedAttendees: Math.max(0, parseInt(expectedAttendeesInput, 10) || 0),
        notes,
        isVirtual,
        virtualPlatform: isVirtual ? finalPlatformName : undefined,
        virtualMeetingUrl: isVirtual ? normalizedMeetingUrl : undefined,
        virtualMeetingId: isVirtual ? virtualMeetingId.trim() : undefined,
        virtualPasscode: isVirtual ? virtualPasscode.trim() : undefined,
        active,
      });

      if (created.length === 0) {
        reportValidationError(
          `Los ${skippedDuplicates} días seleccionados ya tienen asignada exactamente la actividad "${activityName}" a las ${normalizedTime} hrs para ${trainer.name}.`
        );
        return;
      }

      if (onAddCatalogItem && !isDisciplineRepresentedInCatalog(activityName, activityCatalog)) {
        const autoCatalogItem = buildCatalogItemFromSpecialty(activityName, {
          activityType,
          durationMinutes: resolvedDurationMinutes,
        });
        if (autoCatalogItem) {
          onAddCatalogItem(autoCatalogItem);
        }
      }

      if (onSaveBatch) {
        onSaveBatch(created);
      } else {
        created.forEach((item) => onSave(item));
      }
      onClose();
      return;
    }

    if (onAddCatalogItem && !isDisciplineRepresentedInCatalog(activityName, activityCatalog)) {
      const autoCatalogItem = buildCatalogItemFromSpecialty(activityName, {
        activityType,
        durationMinutes: resolvedDurationMinutes,
      });
      if (autoCatalogItem) {
        onAddCatalogItem(autoCatalogItem);
      }
    }

    const frequency: 'semanal' | 'mensual' | 'fecha_unica' =
      scheduleMode === 'dias_mes' ? 'fecha_unica' : scheduleMode;

    const companySedes = Array.isArray(company.sedes) ? company.sedes : [];
    const sede = companySedes.find((s) => s.id === sedeId) || companySedes[0];
    const fallbackCompanySlug = company.id.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 80);

    const existingCompletedDates = new Set(assignment?.completedDates || []);
    const existingMissedDates = new Set(assignment?.missedDates || []);
    const existingReopenedDates = new Set(assignment?.reopenedDates || []);

    if (frequency === 'fecha_unica' && specificDate) {
      if (closed) {
        existingCompletedDates.add(specificDate);
        existingMissedDates.delete(specificDate);
      } else {
        existingCompletedDates.delete(specificDate);
      }

      if (nonCompliant) {
        existingMissedDates.add(specificDate);
        existingCompletedDates.delete(specificDate);
        existingReopenedDates.delete(specificDate);
      } else if (assignment?.nonCompliant) {
        existingMissedDates.delete(specificDate);
        existingReopenedDates.add(specificDate);
      }
    }

    // When creating a brand-new active assignment that applies to today (or a specific date) whose +10m start window already passed,
    // automatically authorize it for that date so it does not immediately auto-lock as "Fuera de Horario" right after creation.
    if (!assignment && !closed && !nonCompliant) {
      const draftCheck: ClassAssignment = {
        id: 'draft_check',
        trainerId: trainer.id,
        trainerName: trainer.name,
        companyId: company.id,
        companyName: company.name,
        sedeId: sede?.id || `sede_principal_${fallbackCompanySlug}`,
        sedeName: sede?.name || 'Sede Principal',
        sedeAddress: sede?.address || 'Dirección Sede Corporativa',
        frequency,
        dayOfWeek: frequency === 'semanal' ? Number(dayOfWeek) : undefined,
        dayOfMonth: frequency === 'mensual' ? Number(dayOfMonth) : undefined,
        date: frequency === 'fecha_unica' ? specificDate : undefined,
        time: normalizedTime,
        durationMinutes: resolvedDurationMinutes,
        activityType,
        activityName,
        locationArea: locationArea.trim() || 'Área Principal',
        expectedAttendees: 0,
        active,
      };
      if (
        doesAssignmentApplyToDate(draftCheck, todayLocalStr) &&
        shouldAutoAuthorizeTodayNewAssignment(todayLocalStr, normalizedTime)
      ) {
        existingReopenedDates.add(todayLocalStr);
      }
    }

    const nowTime = new Date().toLocaleTimeString('es-MX', { hour12: false });

    const saved: ClassAssignment = {
      id: assignment ? assignment.id : `asg_${Date.now()}`,
      trainerId: trainer.id,
      trainerName: trainer.name,
      companyId: company.id,
      companyName: company.name,
      sedeId: sede?.id || `sede_principal_${fallbackCompanySlug}`,
      sedeName: sede?.name || 'Sede Principal',
      sedeAddress: sede?.address || 'Dirección Sede Corporativa',
      frequency,
      dayOfWeek: frequency === 'semanal' ? Number(dayOfWeek) : undefined,
      dayOfMonth: frequency === 'mensual' ? Number(dayOfMonth) : undefined,
      date: frequency === 'fecha_unica' ? specificDate : undefined,
      time: normalizedTime,
      durationMinutes: resolvedDurationMinutes,
      activityType,
      activityName,
      locationArea:
        locationArea.trim() ||
        (isVirtual ? `Sala Virtual (${finalPlatformName || 'En línea'})` : 'Área Principal'),
      expectedAttendees: Math.max(0, parseInt(expectedAttendeesInput, 10) || 0),
      notes: notes.trim(),
      ...(isVirtual
        ? {
            isVirtual: true,
            virtualPlatform: finalPlatformName,
            virtualMeetingUrl: normalizedMeetingUrl,
            ...(virtualMeetingId.trim()
              ? { virtualMeetingId: virtualMeetingId.trim().slice(0, 100) }
              : {}),
            ...(virtualPasscode.trim()
              ? { virtualPasscode: virtualPasscode.trim().slice(0, 120) }
              : {}),
          }
        : {}),
      active,
      closed: nonCompliant ? false : closed,
      closedAt:
        !nonCompliant && closed
          ? assignment?.closedAt || nowTime
          : undefined,
      completedDates: Array.from(existingCompletedDates),
      nonCompliant,
      nonCompliantReason: nonCompliant
        ? assignment?.nonCompliantReason || 'manual_admin'
        : undefined,
      nonCompliantAt: nonCompliant ? assignment?.nonCompliantAt || nowTime : undefined,
      missedDates: Array.from(existingMissedDates),
      reopenedDates: Array.from(existingReopenedDates),
    };

    onSave(saved);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner shrink-0">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                {assignment ? 'Editar Asignación de Clase' : 'Programar y Asignar Clase'}
              </h3>
              <p className="text-xs text-red-100">
                Sesiones presenciales o virtuales limitadas a las especialidades de cada entrenador
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="p-5 sm:p-6 space-y-4 text-slate-800 text-xs flex-1 overflow-y-auto"
        >
          {/* Trainer selection */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="font-bold text-slate-700 flex items-center">
                <User className="w-3.5 h-3.5 mr-1 text-red-600" />
                Entrenador Asignado *
              </label>
              {onEditTrainerSpecialties && selectedTrainer && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditTrainerSpecialties(selectedTrainer);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserCog className="w-3 h-3" />
                  <span>Editar especialidades del entrenador</span>
                </button>
              )}
            </div>
            <select
              value={trainerId}
              onChange={(e) => handleTrainerChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500"
            >
              {selectableTrainers.length === 0 ? (
                <option value="">Sin entrenadores activos registrados</option>
              ) : (
                selectableTrainers.map((tr) => {
                  const trSpecs = Array.isArray(tr.specialties) ? tr.specialties : [];
                  return (
                    <option key={tr.id} value={tr.id}>
                      {tr.name}
                      {trSpecs.length > 0
                        ? ` (${trSpecs.join(', ')})`
                        : ' (Sin especialidades registradas)'}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          {/* Company & Sede */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center">
                <Building2 className="w-3.5 h-3.5 mr-1 text-red-600" />
                Empresa Cliente *
              </label>
              <select
                value={companyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              >
                {companies.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1 text-red-600" />
                Sede Oficial *
              </label>
              <select
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              >
                {selectedCompany &&
                Array.isArray(selectedCompany.sedes) &&
                selectedCompany.sedes.length > 0 ? (
                  selectedCompany.sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option value="">Sede Principal (se registrará automáticamente)</option>
                )}
              </select>
            </div>
          </div>

          {/* Delivery Modality: Presencial vs Clase Virtual + Platform Details & Share Link */}
          <div
            className={`p-3.5 rounded-2xl border space-y-3 transition-colors ${
              isVirtual
                ? 'bg-sky-50/50 border-sky-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Video className={`w-3.5 h-3.5 ${isVirtual ? 'text-sky-600' : 'text-slate-500'}`} />
                <span>Modalidad de Impartición (Presencial o Clase Virtual)</span>
              </span>
              <span className="text-[11px] text-slate-500">
                {isVirtual ? 'Sesión en línea con link compartible' : 'Sesión física en sede'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleToggleVirtualModality(false)}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                  !isVirtual
                    ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>Presencial en Sede</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleVirtualModality(true)}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                  isVirtual
                    ? 'bg-sky-600 border-sky-600 text-white font-bold shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-sky-50 hover:text-sky-700'
                }`}
              >
                <Video className="w-3.5 h-3.5 shrink-0" />
                <span>Clase Virtual / En Línea</span>
              </button>
            </div>

            {isVirtual && (
              <div className="pt-2 border-t border-sky-200/70 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-sky-600 shrink-0" />
                      <span>Plataforma donde se dará *</span>
                    </label>
                    <select
                      value={platformSelect}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPlatformSelect(val);
                        const nextName =
                          val === 'Otra Plataforma'
                            ? customPlatformName.trim() || 'Plataforma Virtual'
                            : val;
                        if (locationArea.startsWith('Sala Virtual')) {
                          setLocationArea(`Sala Virtual (${nextName})`);
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
                    >
                      {VIRTUAL_PLATFORM_PRESETS.map((plat) => (
                        <option key={plat} value={plat}>
                          {plat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {platformSelect === 'Otra Plataforma' ? (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Nombre de la Plataforma *
                      </label>
                      <input
                        type="text"
                        maxLength={80}
                        value={customPlatformName}
                        onChange={(e) => {
                          setCustomPlatformName(e.target.value);
                          if (locationArea.startsWith('Sala Virtual')) {
                            setLocationArea(
                              `Sala Virtual (${e.target.value.trim() || 'Plataforma Virtual'})`
                            );
                          }
                        }}
                        placeholder="Ej: Jitsi Meet, Discord, Chime..."
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Hash className="w-3 h-3 text-sky-600 shrink-0" />
                        <span>ID de Reunión / Sala (opcional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={virtualMeetingId}
                        onChange={(e) => setVirtualMeetingId(e.target.value)}
                        placeholder="Ej: 842 9104 2211 o abc-defg-hij"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  )}
                </div>

                {platformSelect === 'Otra Plataforma' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Hash className="w-3 h-3 text-sky-600 shrink-0" />
                        <span>ID de Reunión / Sala (opcional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={virtualMeetingId}
                        onChange={(e) => setVirtualMeetingId(e.target.value)}
                        placeholder="Ej: 842 9104 2211"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-sky-600 shrink-0" />
                        <span>Código de Acceso / Passcode (opcional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={virtualPasscode}
                        onChange={(e) => setVirtualPasscode(e.target.value)}
                        placeholder="Ej: BSCW2026"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className={platformSelect === 'Otra Plataforma' ? 'sm:col-span-12' : 'sm:col-span-8'}>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Link / Enlace de la Sala Virtual *
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      value={virtualMeetingUrl}
                      onChange={(e) => {
                        setVirtualMeetingUrl(e.target.value);
                        setFormValidationError(null);
                      }}
                      onBlur={() => {
                        if (virtualMeetingUrl.trim()) {
                          setVirtualMeetingUrl(normalizeVirtualMeetingUrl(virtualMeetingUrl));
                        }
                      }}
                      placeholder="https://meet.google.com/abc-defg-hij o https://zoom.us/j/..."
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {platformSelect !== 'Otra Plataforma' && (
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-sky-600 shrink-0" />
                        <span>Código Acceso</span>
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={virtualPasscode}
                        onChange={(e) => setVirtualPasscode(e.target.value)}
                        placeholder="Opcional"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  )}
                </div>

                {liveVirtualSharePayload ? (
                  <VirtualClassQuickShare payload={liveVirtualSharePayload} />
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Ingresa el enlace de la sala (ej. <span className="font-mono">https://meet.google.com/...</span>) para generar automáticamente el link para compartir los datos de acceso.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Frequency (Semanal / Mensual / Fecha Única / Marcar Días del Mes) + Duration */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-900 block">
              Frecuencia, Días del Mes, Horario y Duración
            </span>

            <div className={`grid gap-2 ${assignment ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
              <button
                type="button"
                onClick={() => {
                  setScheduleMode('semanal');
                  setMultiDayError(null);
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition whitespace-nowrap cursor-pointer ${
                  scheduleMode === 'semanal'
                    ? 'bg-red-600 border-red-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Recurrente Semanal
              </button>

              <button
                type="button"
                onClick={() => {
                  setScheduleMode('mensual');
                  setMultiDayError(null);
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition whitespace-nowrap cursor-pointer ${
                  scheduleMode === 'mensual'
                    ? 'bg-red-600 border-red-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Recurrente Mensual
              </button>

              <button
                type="button"
                onClick={() => {
                  setScheduleMode('fecha_unica');
                  setMultiDayError(null);
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition whitespace-nowrap cursor-pointer ${
                  scheduleMode === 'fecha_unica'
                    ? 'bg-red-600 border-red-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Fecha Única
              </button>

              {!assignment && (
                <button
                  type="button"
                  onClick={() => {
                    setScheduleMode('dias_mes');
                    setMultiDayError(null);
                  }}
                  className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
                    scheduleMode === 'dias_mes'
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5 shrink-0 text-red-500" />
                  <span>Marcar Días del Mes</span>
                </button>
              )}
            </div>

            {scheduleMode === 'dias_mes' && !assignment ? (
              <div className="space-y-3 pt-1">
                {/* Month Picker + Start Time Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Mes a Programar *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetMonth((prev) => shiftYearMonth(prev, -1));
                          setSelectedMonthDates([]);
                        }}
                        className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                        title="Mes anterior"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <input
                        type="month"
                        value={targetMonth}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          setTargetMonth(e.target.value);
                          setSelectedMonthDates([]);
                        }}
                        className="flex-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 font-mono tabular-nums font-bold focus:outline-none focus:border-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setTargetMonth((prev) => shiftYearMonth(prev, 1));
                          setSelectedMonthDates([]);
                        }}
                        className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                        title="Mes siguiente"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1 text-red-600" />
                      Hora de Inicio Programada *
                    </label>
                    <input
                      type="time"
                      required
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono tabular-nums font-bold focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* Quick Month Day Pattern Selectors */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-800">
                      Marca los días de {monthGrid.monthName} {monthGrid.year} para{' '}
                      {selectedTrainer?.name || 'el entrenador'}:
                    </span>
                    <span className="text-[11px] font-mono tabular-nums font-bold text-red-600">
                      {selectedMonthDates.length}{' '}
                      {selectedMonthDates.length === 1 ? 'día marcado' : 'días marcados'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMultiDayError(null);
                        setFormValidationError(null);
                        setSelectedMonthDates(
                          getMonthDatesByPattern(targetMonth, 'from_today', todayLocalStr)
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-[11px] font-bold text-red-700 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Desde hoy (Lun–Vie)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMultiDayError(null);
                        setFormValidationError(null);
                        setSelectedMonthDates(
                          getMonthDatesByPattern(targetMonth, 'weekdays', todayLocalStr)
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-[11px] font-semibold text-slate-700 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Lun a Vie (Todo el mes)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMultiDayError(null);
                        setSelectedMonthDates(
                          getMonthDatesByPattern(targetMonth, 'mwf', todayLocalStr)
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-[11px] font-semibold text-slate-700 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Lun · Mié · Vie
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMultiDayError(null);
                        setSelectedMonthDates(
                          getMonthDatesByPattern(targetMonth, 'tth', todayLocalStr)
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-[11px] font-semibold text-slate-700 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Mar · Jue
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMultiDayError(null);
                        setSelectedMonthDates(
                          getMonthDatesByPattern(targetMonth, 'saturdays', todayLocalStr)
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-[11px] font-semibold text-slate-700 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Sábados
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMultiDayError(null);
                        setSelectedMonthDates(
                          getMonthDatesByPattern(targetMonth, 'all', todayLocalStr)
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-[11px] font-semibold text-slate-700 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Todo el mes
                    </button>
                    {selectedMonthDates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedMonthDates([])}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 transition whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {/* Interactive 7-Column Month Grid */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                      {WEEKDAY_MONDAY_SHORT_ES.map((shortLabel, idx) => {
                        const dow = idx + 1;
                        return (
                          <button
                            key={shortLabel}
                            type="button"
                            onClick={() => {
                              setMultiDayError(null);
                              setSelectedMonthDates((prev) =>
                                toggleWeekdayDatesInMonth(targetMonth, prev, dow)
                              );
                            }}
                            className="py-1.5 text-[10px] font-extrabold text-slate-600 hover:bg-red-50 hover:text-red-700 transition text-center cursor-pointer"
                            title={`Marcar o desmarcar todos los ${shortLabel} del mes`}
                          >
                            {shortLabel}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-100">
                      {monthGrid.cells.map((cell, cIdx) => {
                        const isMarked =
                          cell.isCurrentMonth && selectedMonthDatesSet.has(cell.dateStr);
                        const isTodayCell = cell.dateStr === todayLocalStr;
                        const trainerExistingCount =
                          cell.isCurrentMonth && selectedTrainer
                            ? existingAssignments.filter(
                                (a) =>
                                  a.active !== false &&
                                  a.trainerId === selectedTrainer.id &&
                                  doesAssignmentApplyToDate(a, cell.dateStr)
                              ).length
                            : 0;
                        const alreadySameSlot =
                          cell.isCurrentMonth &&
                          selectedTrainer &&
                          selectedCompany &&
                          hasMatchingAssignmentOnDate(existingAssignments, {
                            trainerId: selectedTrainer.id,
                            companyId: selectedCompany.id,
                            sedeId,
                            dateStr: cell.dateStr,
                            time: normalizedTime,
                            activityName,
                          });

                        if (!cell.isCurrentMonth) {
                          return (
                            <div
                              key={`${cell.dateStr}_${cIdx}`}
                              className="min-h-[44px] p-1 bg-slate-50/70 text-slate-300 text-[10px] font-mono tabular-nums"
                            >
                              {cell.dayNumber}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={`${cell.dateStr}_${cIdx}`}
                            type="button"
                            onClick={() => toggleDateInMonthSelection(cell.dateStr)}
                            className={`min-h-[48px] p-1 flex flex-col items-center justify-between text-center transition cursor-pointer ${
                              isMarked
                                ? 'bg-red-600 text-white font-bold ring-1 ring-inset ring-red-700'
                                : alreadySameSlot
                                ? 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                : 'bg-white text-slate-800 hover:bg-red-50/60'
                            }`}
                            title={
                              alreadySameSlot
                                ? `${cell.dateStr}: Ya cuenta con esta misma actividad y horario asignado`
                                : `${cell.dateStr}: Clic para ${
                                    isMarked ? 'desmarcar' : 'marcar con ' + activityName
                                  }`
                            }
                          >
                            <div className="w-full flex items-center justify-between px-0.5">
                              <span
                                className={`text-[11px] font-mono tabular-nums font-bold ${
                                  isMarked
                                    ? 'text-white'
                                    : isTodayCell
                                    ? 'text-red-600 underline'
                                    : 'text-slate-800'
                                }`}
                              >
                                {cell.dayNumber}
                              </span>
                              {isMarked && <Check className="w-3 h-3 text-white shrink-0" />}
                            </div>

                            <span
                              className={`text-[9px] leading-tight truncate w-full px-0.5 ${
                                isMarked
                                  ? 'text-red-100 font-semibold'
                                  : alreadySameSlot
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-slate-400'
                              }`}
                            >
                              {isMarked
                                ? (ACTIVITY_TYPE_LABELS[activityType] || 'Sesión').split(' ')[0]
                                : alreadySameSlot
                                ? 'Ya asig.'
                                : trainerExistingCount > 0
                                ? `${trainerExistingCount} asig.`
                                : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500">
                    Haz clic sobre los días del calendario (o sobre el encabezado Lu–Do) para marcar todas las fechas del mes con <strong>{activityName}</strong> y cargarlas en el calendario de <strong>{selectedTrainer?.name || 'el entrenador'}</strong>.
                  </p>

                  {multiDayError && (
                    <p className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                      {multiDayError}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {scheduleMode === 'semanal' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Día de la Semana *
                    </label>
                    <select
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(parseInt(e.target.value) || 1)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-500"
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d.value} value={d.value}>
                          Cada {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {scheduleMode === 'mensual' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Día del Mes (1 al 31) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono tabular-nums focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}

                {scheduleMode === 'fecha_unica' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Fecha Específica *
                    </label>
                    <input
                      type="date"
                      value={specificDate}
                      onChange={(e) => setSpecificDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono tabular-nums focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1 text-red-600" />
                    Hora de Inicio Programada *
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      setFormValidationError(null);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono tabular-nums font-bold focus:outline-none focus:border-red-500"
                  />
                  {!assignment &&
                    scheduleMode === 'fecha_unica' &&
                    specificDate === todayLocalStr &&
                    shouldAutoAuthorizeTodayNewAssignment(todayLocalStr, normalizedTime) && (
                      <p className="text-[10px] text-amber-800 mt-1">
                        La hora seleccionada ya inició o transcurrió hoy: al confirmar quedará habilitada hoy para el entrenador.
                      </p>
                    )}
                </div>
              </div>
            )}

            {/* Duration of Assignment Field in Hours & Minutes (up to 8 hours / 480 min) */}
            <div className="pt-2.5 border-t border-slate-200/90 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-800 flex items-center">
                  <Timer className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0" />
                  Tiempo y Duración de la Asignación (Horas y Minutos · hasta 8 h) *
                </span>
                {estimatedEndTime && (
                  <span className="text-[11px] font-mono tabular-nums font-bold text-red-700">
                    {normalizedTime} – {estimatedEndTime} hrs ·{' '}
                    {formatDurationHoursMinutes(resolvedDurationMinutes)}
                  </span>
                )}
              </div>

              {/* Hours + Minutes Selectors & Steppers */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end bg-white p-3 rounded-xl border border-slate-200">
                <div className="sm:col-span-4">
                  <label
                    htmlFor="assignment-duration-hours"
                    className="block text-[10px] font-semibold text-slate-600 mb-1"
                  >
                    Horas (0 a 8 h)
                  </label>
                  <select
                    id="assignment-duration-hours"
                    value={durationHours}
                    onChange={(e) => {
                      const nextHours = parseInt(e.target.value, 10) || 0;
                      const nextMins = nextHours >= 8 ? 0 : durationRemainderMinutes;
                      const combined = combineHoursAndMinutes(
                        nextHours,
                        nextHours === 0 && nextMins < 5 ? 15 : nextMins
                      );
                      setDurationInput(String(combined));
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-red-500"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                      <option key={h} value={h}>
                        {h} {h === 1 ? 'hora' : 'horas'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label
                    htmlFor="assignment-duration-minutes"
                    className="block text-[10px] font-semibold text-slate-600 mb-1"
                  >
                    Minutos (0 a 59 min)
                  </label>
                  <div className="relative">
                    <input
                      id="assignment-duration-minutes"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={durationHours >= 8}
                      value={durationHours >= 8 ? '0' : String(durationRemainderMinutes)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        const parsedM = digits === '' ? 0 : Math.min(59, parseInt(digits, 10));
                        const combined = combineHoursAndMinutes(durationHours, parsedM);
                        setDurationInput(String(combined));
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-2.5 pr-9 py-1.5 text-center text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-red-500 disabled:opacity-50"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 pointer-events-none">
                      min
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-4 flex items-center justify-between sm:justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const step = resolvedDurationMinutes >= 120 ? 30 : 5;
                      setDurationInput(
                        String(
                          Math.max(MIN_ASSIGNMENT_DURATION_MINUTES, resolvedDurationMinutes - step)
                        )
                      );
                    }}
                    className="h-8 px-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-mono tabular-nums font-bold flex items-center justify-center gap-0.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                    title="Reducir duración"
                  >
                    <Minus className="w-3 h-3 shrink-0" />
                    <span>{resolvedDurationMinutes >= 120 ? '30m' : '5m'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const step = resolvedDurationMinutes >= 120 ? 30 : 15;
                      setDurationInput(
                        String(
                          Math.min(MAX_ASSIGNMENT_DURATION_MINUTES, resolvedDurationMinutes + step)
                        )
                      );
                    }}
                    className="h-8 px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-mono tabular-nums font-bold flex items-center justify-center gap-0.5 shadow-2xs transition whitespace-nowrap shrink-0 cursor-pointer"
                    title="Aumentar duración"
                  >
                    <Plus className="w-3 h-3 shrink-0" />
                    <span>{resolvedDurationMinutes >= 120 ? '30m' : '15m'}</span>
                  </button>
                </div>
              </div>

              {/* Quick Presets: Short Sessions + Long Corporate Gym Sessions (4h - 8h) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-slate-500 mr-1">
                    Sesiones breves / clases:
                  </span>
                  {SHORT_DURATION_PRESETS.map((mins) => {
                    const isSelected = resolvedDurationMinutes === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationInput(String(mins))}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums font-bold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-red-300 hover:bg-red-50/40'
                        }`}
                      >
                        {formatDurationHoursMinutes(mins, true)}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-indigo-700 mr-1">
                    Gimnasio / Jornadas largas (2h a 8h):
                  </span>
                  {LONG_GYM_DURATION_PRESETS.map((mins) => {
                    const isSelected = resolvedDurationMinutes === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationInput(String(mins))}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono tabular-nums font-bold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-300 hover:bg-indigo-50/40'
                        }`}
                      >
                        {formatDurationHoursMinutes(mins, true)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Strictly Restricted Trainer Specialties & Modality */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900 flex items-center">
                <Activity className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0" />
                Especialidades Autorizadas del Entrenador
              </span>
              <div className="flex items-center gap-2.5">
                {onEditTrainerSpecialties && selectedTrainer && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditTrainerSpecialties(selectedTrainer);
                    }}
                    className="text-[11px] font-bold text-slate-700 hover:text-red-600 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UserCog className="w-3 h-3 text-red-600" />
                    <span>Gestionar especialidades</span>
                  </button>
                )}
                {onManageActivityTypes && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onManageActivityTypes();
                    }}
                    className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline flex items-center space-x-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Settings2 className="w-3 h-3" />
                    <span>Catálogo</span>
                  </button>
                )}
              </div>
            </div>

            {allowedTrainerSpecialties.length === 0 ? (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 space-y-2">
                <p className="font-semibold text-xs">
                  {selectedTrainer?.name || 'Este entrenador'} aún no tiene especialidades registradas en su perfil.
                </p>
                {onEditTrainerSpecialties && selectedTrainer && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditTrainerSpecialties(selectedTrainer);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Registrar especialidades ahora
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Modalidades habilitadas según sus especialidades
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_ACTIVITY_TYPES.map((type) => {
                      const isAllowedType = allowedTrainerActivityTypes.includes(type);
                      const isSelected = activityType === type && isAllowedType;
                      return (
                        <button
                          key={type}
                          type="button"
                          disabled={!isAllowedType}
                          title={
                            isAllowedType
                              ? `Filtrar especialidades de ${ACTIVITY_TYPE_LABELS[type]}`
                              : `${selectedTrainer?.name || 'El entrenador'} no cuenta con especialidades en ${ACTIVITY_TYPE_LABELS[type]}`
                          }
                          onClick={() => {
                            if (!isAllowedType) return;
                            const matchingSpec = allowedTrainerSpecialties.find(
                              (s) => s.activityType === type
                            );
                            if (matchingSpec) {
                              setActivityType(type);
                              setActivityName(matchingSpec.name);
                              setDurationInput(String(matchingSpec.durationMinutes));
                              setFormValidationError(null);
                            }
                          }}
                          className={`py-2 px-2.5 text-xs font-semibold rounded-xl border text-center transition whitespace-nowrap ${
                            !isAllowedType
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                              : isSelected
                              ? 'bg-red-50 border-red-500 text-red-700 font-bold shadow-2xs cursor-pointer'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer'
                          }`}
                        >
                          {ACTIVITY_TYPE_LABELS[type]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick selector buttons strictly for this trainer's registered specialties */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-slate-600">
                    Especialidades en el registro de {selectedTrainer?.name || 'entrenador'} ({allowedTrainerSpecialties.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {allowedTrainerSpecialties.map((spec) => {
                      const isCurrent =
                        normalizeDisciplineKey(activityName) ===
                        normalizeDisciplineKey(spec.name);
                      return (
                        <button
                          key={spec.name}
                          type="button"
                          onClick={() => applyDisciplineChoice(spec.name)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                            isCurrent
                              ? 'bg-red-600 border-red-600 text-white font-bold'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-red-300 hover:text-red-700'
                          }`}
                        >
                          {spec.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Actividad / Especialidad Asignada (exclusivo del perfil del entrenador) *
                  </label>
                  <select
                    value={activityName}
                    onChange={(e) => applyDisciplineChoice(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500"
                  >
                    {allowedTrainerSpecialties.map((spec) => (
                      <option key={spec.name} value={spec.name}>
                        {spec.name} · {spec.modalityLabel}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Las asignaciones están limitadas únicamente a las especialidades dadas de alta en el registro de {selectedTrainer?.name || 'este entrenador'}.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Area & Expected attendees */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isVirtual ? 'Sala / Canal o Referencia Virtual *' : 'Salón / Piso / Área Designada *'}
              </label>
              <input
                type="text"
                value={locationArea}
                onChange={(e) => setLocationArea(e.target.value)}
                placeholder={
                  isVirtual
                    ? `Sala Virtual (${resolvedVirtualPlatform})`
                    : 'Piso 4 - Sala SUM / Gimnasio'
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Colaboradores Esperados
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={expectedAttendeesInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '');
                  setExpectedAttendeesInput(
                    digits === '' ? '' : String(Math.min(999, parseInt(digits, 10)))
                  );
                }}
                onBlur={() => {
                  if (expectedAttendeesInput.trim() === '') setExpectedAttendeesInput('0');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono tabular-nums font-bold focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Instrucciones / Notas Especiales para el Entrenador
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isVirtual
                  ? 'Ej: Conectarse 10 min antes para prueba de cámara y audio...'
                  : 'Ej: Acceso por puerta lateral de contratistas, llevar bandas elásticas...'
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Lock / Completed & Closed or Non-Compliant status */}
          <div className="space-y-2.5">
            <div
              className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
                closed
                  ? 'bg-emerald-50/90 border-emerald-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="pr-3">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  {closed ? (
                    <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>
                    {closed
                      ? 'Asignación Completada y Cerrada (Bloqueada)'
                      : 'Cierre y Bloqueo de Asignación Cumplida'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5">
                  {closed
                    ? 'Bloqueada: el entrenador ya no puede volver a iniciar ni repetir esta asignación.'
                    : 'Se marca automáticamente al registrar la salida, o puedes cerrarla aquí.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClosed((prev) => {
                    const next = !prev;
                    if (next) setNonCompliant(false);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 flex items-center space-x-1.5 transition whitespace-nowrap cursor-pointer ${
                  closed
                    ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {closed ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Desbloquear</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-red-600" />
                    <span>Cerrar y Bloquear</span>
                  </>
                )}
              </button>
            </div>

            <div
              className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
                nonCompliant
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="pr-3">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Ban className={`w-3.5 h-3.5 ${nonCompliant ? 'text-rose-700' : 'text-slate-500'}`} />
                  <span>
                    {nonCompliant
                      ? 'Asignación Marcada como Incumplida (Bloqueada)'
                      : 'Estado de Incumplimiento (Fuera de Horario / +30m sin cierre)'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5">
                  {nonCompliant
                    ? 'Bloqueada por no haberse reportado en horario o no cerrarse pasados 30 min. Puedes rehabilitarla.'
                    : 'El sistema bloquea automáticamente asignaciones fuera de horario o sin cierre tras 30 min.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNonCompliant((prev) => {
                    const next = !prev;
                    if (next) setClosed(false);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 flex items-center space-x-1.5 transition whitespace-nowrap cursor-pointer ${
                  nonCompliant
                    ? 'bg-rose-700 text-white border-rose-700 hover:bg-rose-800'
                    : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                }`}
              >
                {nonCompliant ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-rose-200" />
                    <span>Rehabilitar</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5 text-rose-600" />
                    <span>Marcar Incumplida</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="font-bold text-slate-800 block">Visibilidad en Planificador</span>
              <span className="text-[11px] text-slate-500">
                {active
                  ? 'Activa y visible en el planificador del entrenador'
                  : 'Oculta / En pausa'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          <div ref={validationBannerRef}>
            {formValidationError && (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 font-semibold text-xs">
                {formValidationError}
              </div>
            )}
            {!formValidationError && allowedTrainerSpecialties.length === 0 && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  Registra al menos una especialidad en el perfil de{' '}
                  {selectedTrainer?.name || 'este entrenador'} para poder confirmar la asignación.
                </span>
                {onEditTrainerSpecialties && selectedTrainer && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditTrainerSpecialties(selectedTrainer);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Registrar especialidades
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-500/20 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {assignment
                ? 'Guardar Cambios'
                : scheduleMode === 'dias_mes'
                ? `Cargar ${selectedMonthDates.length} ${
                    selectedMonthDates.length === 1 ? 'Día' : 'Días'
                  } en Calendario`
                : 'Confirmar Asignación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
