import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Calendar, 
  Camera,
  Database,
  Download, 
  Printer, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Building2, 
  Users, 
  MapPin, 
  ShieldCheck, 
  Plus, 
  Eye, 
  Trash2, 
  Edit3, 
  CalendarDays,
  FileText,
  BellRing,
  Ban,
  Lock,
  LayoutGrid,
  List,
  Navigation,
  Play,
  RefreshCw,
  Volume2,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  ACTIVITY_TYPE_LABELS,
  ActivityCatalogItem,
  AdminSessionStartAlert,
  AttendanceRecord,
  ClassAssignment,
  Company,
  normalizeActivityType,
  Sede,
  Trainer,
  TrainerTransitTracking,
} from '../types';
import { formatDistance } from '../utils/geo';
import { getSessionAlarmStatus, formatSecondsClock } from '../utils/sessionAlarm';
import {
  formatLocalYYYYMMDD,
  doesAssignmentApplyToDate,
  getAssignmentOccurrenceStatus,
} from '../utils/assignmentLock';
import {
  EvidencePhotoSlot,
  exportEvidenceRecordsToExcel,
  exportEvidenceRecordsToPdf,
  exportExecutiveReportToExcel,
} from '../utils/evidenceExport';
import { RecordDetailModal } from './RecordDetailModal';
import { AdminTrainerModal } from './AdminTrainerModal';
import { AdminCompanyModal } from './AdminCompanyModal';
import { AdminSedeModal } from './AdminSedeModal';
import { AdminAssignmentModal, AssignmentPreset } from './AdminAssignmentModal';
import { AdminScheduleView } from './AdminScheduleView';
import { AdminAssignmentTypesView } from './AdminAssignmentTypesView';
import { PdfReportModal } from './PdfReportModal';
import { PdfAssignmentsModal } from './PdfAssignmentsModal';
import { PdfEvidenceLogModal } from './PdfEvidenceLogModal';
import { EvidencePhotoLightbox } from './EvidencePhotoLightbox';
import { PersonnelRegistryView } from './PersonnelRegistryView';
import { FirestoreErrorBoundary } from './FirestoreErrorBoundary';
import { AdminLiveTrackingView } from './AdminLiveTrackingView';
import { collectAllSelectableSpecialties } from '../utils/specialtyDisciplines';
import { formatDistanceMetric, formatTravelDuration } from '../utils/transitCalculations';

interface AdminDashboardProps {
  records: AttendanceRecord[];
  companies: Company[];
  trainers: Trainer[];
  assignments: ClassAssignment[];
  activityCatalog: ActivityCatalogItem[];
  transitTrackings?: TrainerTransitTracking[];
  onDeleteTransitTracking?: (id: string) => void;
  onUpdateRecord: (updated: AttendanceRecord) => void;
  onDeleteRecord: (id: string) => void;
  onAddCompany: (comp: Company) => void;
  onUpdateCompany: (comp: Company) => void;
  onDeleteCompany: (id: string) => void;
  onAddSede: (sede: Sede) => void;
  onUpdateSede: (sede: Sede) => void;
  onDeleteSede: (sedeId: string, companyId: string) => void;
  onAddTrainer: (trainer: Trainer) => void;
  onUpdateTrainer: (trainer: Trainer) => void;
  onDeleteTrainer: (id: string) => void;
  onAddAssignment: (asg: ClassAssignment) => void;
  onAddAssignmentsBatch?: (asgs: ClassAssignment[]) => void;
  onUpdateAssignment: (asg: ClassAssignment) => void;
  onDeleteAssignment: (id: string) => void;
  onAddCatalogItem: (item: ActivityCatalogItem) => void;
  onUpdateCatalogItem: (item: ActivityCatalogItem, previousName?: string) => void;
  onDeleteCatalogItem: (id: string) => void;
  onResetData: () => void;
  isDirectoryAuthenticated?: boolean;
  adminStartAlerts?: AdminSessionStartAlert[];
  onDismissAdminAlert?: (alertId: string) => void;
  onClearAllAdminAlerts?: () => void;
  onReplayAlertChime?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  records,
  companies,
  trainers,
  assignments,
  activityCatalog,
  transitTrackings = [],
  onDeleteTransitTracking,
  onUpdateRecord,
  onDeleteRecord,
  onAddCompany,
  onUpdateCompany,
  onDeleteCompany,
  onAddSede,
  onUpdateSede,
  onDeleteSede,
  onAddTrainer,
  onUpdateTrainer,
  onDeleteTrainer,
  onAddAssignment,
  onAddAssignmentsBatch,
  onUpdateAssignment,
  onDeleteAssignment,
  onAddCatalogItem,
  onUpdateCatalogItem,
  onDeleteCatalogItem,
  onResetData,
  isDirectoryAuthenticated = false,
  adminStartAlerts = [],
  onDismissAdminAlert,
  onClearAllAdminAlerts,
  onReplayAlertChime,
}) => {
  const [activeTab, setActiveTab] = useState<'reports' | 'schedule' | 'live_tracking' | 'activity_types' | 'log' | 'sedes' | 'trainers' | 'personnel'>('reports');
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<AttendanceRecord | null>(null);

  // Modals state
  const [isTrainerModalOpen, setIsTrainerModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [isSedeModalOpen, setIsSedeModalOpen] = useState(false);
  const [editingSede, setEditingSede] = useState<Sede | null>(null);
  const [targetCompanyIdForSede, setTargetCompanyIdForSede] = useState<string | undefined>(undefined);

  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ClassAssignment | null>(null);
  const [assignmentInitialPreset, setAssignmentInitialPreset] = useState<AssignmentPreset | null>(null);
  const [lastSavedScheduleSignal, setLastSavedScheduleSignal] = useState<{
    stamp: number;
    isEdit: boolean;
    assignments: ClassAssignment[];
  } | null>(null);

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isPdfAssignmentsModalOpen, setIsPdfAssignmentsModalOpen] = useState(false);
  const [pdfAssignmentsTrainerTarget, setPdfAssignmentsTrainerTarget] = useState<string>('all');

  // Report Period Filter
  const [reportType, setReportType] = useState<'daily' | 'monthly' | 'all'>('monthly');
  const todayStr = formatLocalYYYYMMDD(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const userTouchedMonthRef = React.useRef<boolean>(false);

  // If current calendar month has 0 records but historical records exist, default to the most recent month with data
  React.useEffect(() => {
    if (userTouchedMonthRef.current || records.length === 0) return;
    const hasCurrentMonth = records.some((r) => r.date && r.date.startsWith(currentMonthStr));
    if (!hasCurrentMonth) {
      const sortedDates = records
        .map((r) => r.date)
        .filter((d): d is string => Boolean(d && d.length >= 7))
        .sort((a, b) => b.localeCompare(a));
      if (sortedDates.length > 0) {
        setSelectedMonth(sortedDates[0].substring(0, 7));
      }
    }
  }, [records, currentMonthStr]);

  // Inline confirmation states (avoiding window.confirm)
  const [confirmDeleteRecordId, setConfirmDeleteRecordId] = useState<string | null>(null);
  const [confirmDeleteCompanyId, setConfirmDeleteCompanyId] = useState<string | null>(null);
  const [confirmDeleteSedeKey, setConfirmDeleteSedeKey] = useState<string | null>(null);
  const [confirmDeleteTrainerId, setConfirmDeleteTrainerId] = useState<string | null>(null);
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);

  // Table & Evidence Gallery Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTrainerId, setFilterTrainerId] = useState<string>('all');
  const [filterCompanyId, setFilterCompanyId] = useState<string>('all');
  const [filterActivityType, setFilterActivityType] = useState<string>('all');
  const [filterPunctuality, setFilterPunctuality] = useState<string>('all');
  const [logMonthFilter, setLogMonthFilter] = useState<string>('');
  const [logDateFilter, setLogDateFilter] = useState<string>('');
  const [logViewMode, setLogViewMode] = useState<'table' | 'gallery'>('table');
  const [isEvidencePdfModalOpen, setIsEvidencePdfModalOpen] = useState<boolean>(false);
  const [isExportingLogPdf, setIsExportingLogPdf] = useState<boolean>(false);
  const [lightboxState, setLightboxState] = useState<{
    record: AttendanceRecord;
    slot: EvidencePhotoSlot;
  } | null>(null);

  const allDatabaseSpecialties = useMemo(
    () => collectAllSelectableSpecialties(trainers, activityCatalog),
    [trainers, activityCatalog]
  );

  // Filter records based on report period
  const periodRecords = useMemo(() => {
    return records.filter((r) => {
      if (reportType === 'daily') {
        return r.date === selectedDate;
      }
      if (reportType === 'monthly') {
        return r.date.startsWith(selectedMonth);
      }
      return true;
    });
  }, [records, reportType, selectedDate, selectedMonth]);

  // Live check for active sessions that exceeded planned duration without checkout
  const [adminNowMs, setAdminNowMs] = useState<number>(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setAdminNowMs(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const activeInProgressSessions = useMemo(() => {
    return records
      .filter((r) => r.status === 'en_curso')
      .map((record) => ({
        record,
        alarm: getSessionAlarmStatus(record, activityCatalog, adminNowMs),
      }))
      .filter((item) => !item.alarm.hasExceededUnclosedGrace);
  }, [records, activityCatalog, adminNowMs]);

  const overdueSessions = useMemo(() => {
    return activeInProgressSessions.filter((item) => item.alarm.isOverdue);
  }, [activeInProgressSessions]);

  const activeTransitNow = useMemo(() => {
    return transitTrackings.filter(
      (t) => t.status === 'en_camino' || t.status === 'en_geocerca'
    );
  }, [transitTrackings]);

  // Summary of blocked & non-compliant assignments and sessions
  const nonCompliantSummary = useMemo(() => {
    const unclosedRecordsCount = records.filter((r) => r.status === 'incumplido').length;
    const lockedNonCompliantAssignments = assignments.filter((asg) => {
      if (asg.active === false) return false;
      const targetDate = asg.frequency === 'fecha_unica' && asg.date ? asg.date : todayStr;
      if (asg.frequency !== 'fecha_unica' && !doesAssignmentApplyToDate(asg, targetDate)) {
        return Boolean(asg.nonCompliant || (asg.missedDates && asg.missedDates.length > 0));
      }
      const st = getAssignmentOccurrenceStatus(
        asg,
        targetDate,
        records,
        activityCatalog,
        adminNowMs
      );
      return (
        st.isNonCompliant ||
        Boolean(asg.nonCompliant || (asg.missedDates && asg.missedDates.length > 0))
      );
    });

    const outOfScheduleUnreportedCount = lockedNonCompliantAssignments.filter((asg) => {
      const targetDate = asg.frequency === 'fecha_unica' && asg.date ? asg.date : todayStr;
      const st = getAssignmentOccurrenceStatus(
        asg,
        targetDate,
        records,
        activityCatalog,
        adminNowMs
      );
      return st.nonComplianceReason === 'fuera_de_horario' || asg.nonCompliantReason === 'fuera_de_horario';
    }).length;

    return {
      unclosedRecordsCount,
      lockedAssignmentsCount: lockedNonCompliantAssignments.length,
      outOfScheduleUnreportedCount,
      hasAny: unclosedRecordsCount > 0 || lockedNonCompliantAssignments.length > 0,
    };
  }, [records, assignments, activityCatalog, adminNowMs, todayStr]);

  // Overall Statistics for the period
  const stats = useMemo(() => {
    const total = periodRecords.length;
    const completed = periodRecords.filter((r) => r.status === 'completado').length;
    const nonCompliant = periodRecords.filter((r) => r.status === 'incumplido').length;
    const onTime = periodRecords.filter((r) => r.punctualityStatus === 'a_tiempo').length;
    const late = periodRecords.filter((r) => r.punctualityStatus === 'con_retraso').length;
    const early = periodRecords.filter((r) => r.punctualityStatus === 'adelantado').length;

    const punctualityRate = total > 0 ? Math.round(((onTime + early) / total) * 100) : 100;

    const totalAttendees = periodRecords.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);
    const totalMinutes = periodRecords.reduce((acc, r) => acc + (r.durationMinutes || 45), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    const pausasCount = periodRecords.filter(
      (r) => normalizeActivityType(r.activityType) === 'pausa_activa'
    ).length;
    const fitnessCount = periodRecords.filter(
      (r) => normalizeActivityType(r.activityType) === 'clase_fitness'
    ).length;
    const gimnasioCount = periodRecords.filter(
      (r) => normalizeActivityType(r.activityType) === 'gimnasio_corporativo'
    ).length;
    const masajesCount = periodRecords.filter(
      (r) => normalizeActivityType(r.activityType) === 'masajes'
    ).length;

    return {
      total,
      completed,
      nonCompliant,
      onTime,
      late,
      early,
      punctualityRate,
      totalAttendees,
      totalHours,
      pausasCount,
      fitnessCount,
      gimnasioCount,
      masajesCount,
    };
  }, [periodRecords]);

  // Consolidated trainer punctuality ranking
  const trainerSummaries = useMemo(() => {
    return trainers.map((tr) => {
      const trRecords = periodRecords.filter((r) => r.trainerId === tr.id);
      const total = trRecords.length;
      const onTime = trRecords.filter((r) => r.punctualityStatus === 'a_tiempo').length;
      const early = trRecords.filter((r) => r.punctualityStatus === 'adelantado').length;
      const late = trRecords.filter((r) => r.punctualityStatus === 'con_retraso').length;
      const nonCompliant = trRecords.filter((r) => r.status === 'incumplido').length;
      const punctualityRate = total > 0 ? Math.round(((onTime + early) / total) * 100) : 100;
      const attendees = trRecords.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);
      const hours = (trRecords.reduce((acc, r) => acc + (r.durationMinutes || 45), 0) / 60).toFixed(1);

      return {
        trainer: tr,
        total,
        onTime,
        early,
        late,
        nonCompliant,
        punctualityRate,
        attendees,
        hours,
      };
    });
  }, [trainers, periodRecords]);

  // Consolidated company summary
  const companySummaries = useMemo(() => {
    return companies.map((comp) => {
      const compRecords = periodRecords.filter((r) => r.companyId === comp.id);
      const totalSessions = compRecords.length;
      const pausas = compRecords.filter(
        (r) => normalizeActivityType(r.activityType) === 'pausa_activa'
      ).length;
      const fitness = compRecords.filter(
        (r) => normalizeActivityType(r.activityType) === 'clase_fitness'
      ).length;
      const gimnasio = compRecords.filter(
        (r) => normalizeActivityType(r.activityType) === 'gimnasio_corporativo'
      ).length;
      const masajes = compRecords.filter(
        (r) => normalizeActivityType(r.activityType) === 'masajes'
      ).length;
      const attendees = compRecords.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

      return {
        company: comp,
        totalSessions,
        pausas,
        fitness,
        gimnasio,
        masajes,
        attendees,
      };
    });
  }, [companies, periodRecords]);

  // Filtered log table & photo gallery records
  const filteredLogRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterTrainerId !== 'all' && r.trainerId !== filterTrainerId) return false;
      if (filterCompanyId !== 'all' && r.companyId !== filterCompanyId) return false;
      if (
        filterActivityType !== 'all' &&
        normalizeActivityType(r.activityType) !== filterActivityType
      ) {
        return false;
      }
      if (logDateFilter && r.date !== logDateFilter) return false;
      if (!logDateFilter && logMonthFilter && !r.date.startsWith(logMonthFilter)) return false;

      if (filterPunctuality !== 'all') {
        if (filterPunctuality === 'incumplido') {
          if (r.status !== 'incumplido') return false;
        } else if (filterPunctuality === 'en_curso') {
          if (r.status !== 'en_curso') return false;
        } else if (filterPunctuality === 'completado') {
          if (r.status !== 'completado') return false;
        } else if (r.punctualityStatus !== filterPunctuality) {
          return false;
        }
      }

      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const match =
          r.trainerName.toLowerCase().includes(query) ||
          r.companyName.toLowerCase().includes(query) ||
          r.sedeName.toLowerCase().includes(query) ||
          r.activityName.toLowerCase().includes(query) ||
          r.locationArea.toLowerCase().includes(query) ||
          (r.virtualPlatform && r.virtualPlatform.toLowerCase().includes(query)) ||
          (r.isVirtual && 'virtual en linea online'.includes(query)) ||
          r.id.toLowerCase().includes(query);
        if (!match) return false;
      }

      return true;
    });
  }, [
    records,
    filterTrainerId,
    filterCompanyId,
    filterActivityType,
    filterPunctuality,
    logDateFilter,
    logMonthFilter,
    searchTerm,
  ]);

  const logFilterSummaryLabel = useMemo(() => {
    const parts: string[] = [];
    if (logDateFilter) parts.push(`Fecha ${logDateFilter}`);
    else if (logMonthFilter) parts.push(`Mes ${logMonthFilter}`);
    else parts.push('Histórico completo');

    if (filterCompanyId !== 'all') {
      const c = companies.find((comp) => comp.id === filterCompanyId);
      if (c) parts.push(c.name);
    }
    if (filterTrainerId !== 'all') {
      const t = trainers.find((tr) => tr.id === filterTrainerId);
      if (t) parts.push(t.name);
    }
    parts.push(`${filteredLogRecords.length} registro(s)`);
    return parts.join(' · ');
  }, [
    logDateFilter,
    logMonthFilter,
    filterCompanyId,
    filterTrainerId,
    companies,
    trainers,
    filteredLogRecords.length,
  ]);

  // Export Reports Period to Real Excel (.xlsx) with 100% parity with the Executive PDF Report
  const exportToExcelReport = () => {
    const label =
      reportType === 'daily'
        ? `Reporte Diario: ${selectedDate}`
        : reportType === 'monthly'
        ? `Reporte Mensual: ${selectedMonth}`
        : 'Histórico Completo Consolidado';
    const suffix =
      reportType === 'daily'
        ? selectedDate
        : reportType === 'monthly'
        ? selectedMonth
        : 'Consolidado';
    exportExecutiveReportToExcel(periodRecords, companies, trainers, {
      filenamePrefix: `Reporte_BSCW_${reportType}_${suffix}`,
      periodLabel: label,
    });
  };

  // Export Bitácora & Evidencias to Real Excel (.xlsx)
  const handleExportLogExcel = () => {
    exportEvidenceRecordsToExcel(filteredLogRecords, {
      title: 'Bitácora Oficial de Evidencias y Asistencia',
      filenamePrefix: 'Bitacora_Evidencias_BSCW',
      periodLabel: logFilterSummaryLabel,
      companies,
      trainers,
    });
  };

  // Export Bitácora & Evidencias directly to PDF (.pdf) with embedded photos
  const handleExportLogPdfDirect = async () => {
    setIsExportingLogPdf(true);
    try {
      await exportEvidenceRecordsToPdf(filteredLogRecords, {
        title: 'Bitácora Oficial de Evidencias y Asistencia',
        subtitle: logFilterSummaryLabel,
        filenamePrefix: 'Bitacora_Evidencias_BSCW',
        includePhotos: true,
      });
    } finally {
      setIsExportingLogPdf(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-6">
      {/* Top Banner & Tab Navigation in Light Theme */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-center md:justify-between gap-3 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span className="p-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200/80 shadow-sm shrink-0">
              <BarChart3 className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Panel Administrativo BSCW Check</h2>
              <p className="text-xs text-slate-500 font-medium">
                Control de gestión, asignación de clases, reportes y configuración de empresas y sedes
              </p>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              activeTab === 'reports'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            📊 Reportes de Puntualidad
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              activeTab === 'schedule'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            🗓️ Asignación de Clases
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity_types')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              activeTab === 'activity_types'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            ⚡ Tipos de Asignación
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('log')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              activeTab === 'log'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            📋 Bitácora & Evidencias
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sedes')}
            className={`px-3.5 py-1.5 rounded-lg transition ${
              activeTab === 'sedes'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            🏢 Empresas & Sedes
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trainers')}
            className={`px-3.5 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
              activeTab === 'trainers'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            🏃 Entrenadores
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('live_tracking')}
            className={`px-3.5 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'live_tracking'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>
              Seguimiento en Vivo
              {transitTrackings.some((t) => t.status === 'en_camino' || t.status === 'en_geocerca')
                ? ` (${transitTrackings.filter((t) => t.status === 'en_camino' || t.status === 'en_geocerca').length})`
                : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('personnel')}
            title={
              isDirectoryAuthenticated
                ? 'Directorio (Sesión autenticada)'
                : 'Directorio (Requiere autenticación)'
            }
            className={`px-3.5 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 ${
              activeTab === 'personnel'
                ? 'bg-red-600 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>🗂️ Directorio (Firestore)</span>
            {!isDirectoryAuthenticated && <Lock className="w-3 h-3 opacity-75" />}
          </button>
        </div>
      </div>

      {/* Real-Time Admin Notification Banner: Trainer Started Assignment */}
      {adminStartAlerts.length > 0 && (
        <div className="bg-emerald-950 text-white border border-emerald-700 rounded-2xl p-4 sm:p-5 shadow-md space-y-3.5 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-emerald-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5 stroke-[2.4]" />
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
                  Aviso en Tiempo Real · Inicio de Asignación ({adminStartAlerts.length})
                </p>
                <p className="text-xs text-emerald-100">
                  Un entrenador acaba de registrar su entrada e iniciar su sesión asignada en sede.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onReplayAlertChime && (
                <button
                  type="button"
                  onClick={onReplayAlertChime}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-900/90 hover:bg-emerald-800 border border-emerald-700 text-emerald-100 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
                  title="Probar sonido de alerta administrativa"
                >
                  <Volume2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>Probar Aviso Sonoro</span>
                </button>
              )}
              {adminStartAlerts.length > 1 && onClearAllAdminAlerts && (
                <button
                  type="button"
                  onClick={onClearAllAdminAlerts}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer"
                >
                  Descartar Todos
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {adminStartAlerts.map((alert) => {
              const matchedRecord = records.find((r) => r.id === alert.recordId);
              const isLate = alert.punctualityStatus === 'con_retraso';
              const isEarly = alert.punctualityStatus === 'adelantado';

              return (
                <div
                  key={alert.id}
                  className="bg-emerald-900/60 border border-emerald-700/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {alert.photoUrl ? (
                      <img
                        src={alert.photoUrl}
                        alt={alert.trainerName}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-400 shrink-0 bg-slate-900"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-emerald-800 border border-emerald-600 flex items-center justify-center shrink-0 text-emerald-200">
                        <Play className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-0.5 text-xs">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-extrabold text-white text-sm truncate">
                          {alert.trainerName}
                        </span>
                        <span
                          className={`font-mono tabular-nums text-[11px] font-bold ${
                            isLate
                              ? 'text-amber-300'
                              : isEarly
                                ? 'text-sky-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          · Entrada {alert.checkInTime} (Prog. {alert.scheduledTime})
                        </span>
                      </div>
                      <p className="text-emerald-100 font-semibold truncate">
                        {alert.activityName} ({ACTIVITY_TYPE_LABELS[normalizeActivityType(alert.activityType)]})
                      </p>
                      <p className="text-[11px] text-emerald-200/90 truncate">
                        {alert.companyName} — {alert.sedeName} ({alert.locationArea}) · GPS{' '}
                        <span className="font-mono tabular-nums">
                          {formatDistance(alert.distanceToSedeMeters)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    {matchedRecord && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRecordForDetail(matchedRecord);
                          onDismissAdminAlert?.(alert.id);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold whitespace-nowrap shrink-0 transition cursor-pointer"
                      >
                        Ver Evidencia
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismissAdminAlert?.(alert.id)}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-950 text-emerald-200 hover:text-white border border-emerald-700 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer"
                      title="Marcar aviso como enterado"
                    >
                      <span>Enterado</span>
                      <X className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real-Time Strip: Trainers Who Notified "Voy en trayecto" */}
      {activeTransitNow.length > 0 && activeTab !== 'live_tracking' && (
        <div className="bg-slate-900 text-white border border-slate-700 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 text-xs">
              <p className="text-[11px] font-bold text-emerald-300">
                Aviso «Voy en trayecto» · Seguimiento en Vivo Activo ({activeTransitNow.length})
              </p>
              <p className="font-semibold text-white">
                {activeTransitNow
                  .map(
                    (t) =>
                      `${t.trainerName} rumbo a ${t.companyName} (${t.sedeName}) · ${formatDistanceMetric(
                        t.routeDistanceMeters
                      )} · ${formatTravelDuration(t.estimatedDurationMinutes)} (Llegada est. ${
                        t.estimatedArrivalHHMM
                      } hrs)`
                  )
                  .join('  •  ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('live_tracking')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>Ver Seguimiento en Vivo</span>
            </button>
          </div>
        </div>
      )}

      {/* Live Active Sessions Monitor Strip (Trainers Currently Conducting Assignments) */}
      {activeInProgressSessions.length > 0 && (
        <div className="bg-white border border-emerald-300 rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Play className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 text-xs">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
                Asignaciones en Curso Ahora ({activeInProgressSessions.length})
              </p>
              <p className="font-semibold text-slate-900">
                {activeInProgressSessions
                  .map(
                    ({ record, alarm }) =>
                      `${record.trainerName} · ${record.activityName} en ${record.companyName} (${record.sedeName}) — Inició ${record.checkInTime} (Fin est. ${alarm.expectedEndTimeFormatted})`
                  )
                  .join('  •  ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setFilterPunctuality('en_curso');
                setActiveTab('log');
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              Monitorear en Bitácora
            </button>
          </div>
        </div>
      )}

      {/* Admin Overdue Checkout Alert Banner */}
      {overdueSessions.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center md:justify-between gap-3 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <BellRing className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-red-700">
                Alerta de Salida Pendiente ({overdueSessions.length})
              </p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">
                {overdueSessions
                  .map(
                    ({ record, alarm }) =>
                      `${record.trainerName} en ${record.companyName} (${record.sedeName}) · +${formatSecondsClock(
                        alarm.overdueSeconds
                      )} tras hora de término · Se dará por terminada como No Cerrada en ${formatSecondsClock(
                        alarm.remainingBeforeNonComplianceSeconds
                      )} (${alarm.autoLockDeadlineFormatted} hrs)`
                  )
                  .join(' • ')}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Cualquier salida pendiente se dará por terminada automáticamente a los 60 minutos después de la hora de término y se calificará como No Cerrada.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('log')}
            className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shrink-0 transition"
          >
            Ver en Bitácora
          </button>
        </div>
      )}

      {/* Admin Blocked & Non-Compliant Assignments Summary Banner */}
      {nonCompliantSummary.hasAny && (
        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center md:justify-between gap-3 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-800">
                Control de Asignaciones Bloqueadas y Sesiones No Cerradas
              </p>
              <p className="text-xs font-bold text-slate-900 mt-0.5">
                {nonCompliantSummary.lockedAssignmentsCount} asignación(es) bloqueada(s)
                {' · '}
                {nonCompliantSummary.outOfScheduleUnreportedCount} fuera de horario sin reporte
                {' · '}
                {nonCompliantSummary.unclosedRecordsCount} sesión(es) no cerrada(s) (terminadas +60 min)
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Estas asignaciones están bloqueadas para el entrenador. Desde Asignación de Clases puedes auditar o rehabilitar una fecha si procede justificación.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition"
            >
              Revisar Asignaciones
            </button>
            {nonCompliantSummary.unclosedRecordsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilterPunctuality('incumplido');
                  setActiveTab('log');
                }}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold transition"
              >
                Ver No Cerradas (+60m)
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: REPORTES DIARIOS Y MENSUALES */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Filter Bar for Daily / Monthly Mode */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <span className="text-xs font-bold text-slate-700 flex items-center">
                <Calendar className="w-4 h-4 mr-1.5 text-red-600" />
                Periodo del Reporte:
              </span>

              {/* Mode Switcher */}
              <div className="bg-slate-100 p-1 rounded-lg border border-slate-200 flex text-xs">
                <button
                  type="button"
                  onClick={() => setReportType('daily')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    reportType === 'daily'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Diario
                </button>
                <button
                  type="button"
                  onClick={() => setReportType('monthly')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    reportType === 'monthly'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setReportType('all')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    reportType === 'all'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Histórico Completo
                </button>
              </div>

              {/* Date pickers */}
              {reportType === 'daily' && (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-white border border-slate-300 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-500 font-mono shadow-sm"
                />
              )}

              {reportType === 'monthly' && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    userTouchedMonthRef.current = true;
                    setSelectedMonth(e.target.value);
                  }}
                  className="bg-white border border-slate-300 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-500 font-mono shadow-sm"
                />
              )}
            </div>

            {/* Action buttons with PDF and Excel */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setIsPdfModalOpen(true)}
                className="flex items-center text-xs font-bold px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Generar Reporte en PDF
              </button>

              <button
                type="button"
                onClick={exportToExcelReport}
                className="flex items-center text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 shadow-sm transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-700" />
                Descargar Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-500">Visitas en el Periodo</span>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-black font-mono text-slate-900">{stats.total}</span>
                <span className="text-xs font-semibold text-right">
                  <span className="text-emerald-700">{stats.completed} cerradas</span>
                  {stats.nonCompliant > 0 && (
                    <span className="text-rose-700"> · {stats.nonCompliant} no cerradas</span>
                  )}
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-500">Tasa de Puntualidad</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-red-600">
                  {stats.punctualityRate}%
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {stats.onTime} a tiempo • {stats.late} retrasos
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-500">Horas Impartidas</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-slate-900">{stats.totalHours} hrs</span>
                <span className="text-xs text-slate-500 font-medium">efectivas</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-500">Colaboradores Beneficiados</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-slate-900">{stats.totalAttendees}</span>
                <Users className="w-4 h-4 text-red-600" />
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
              <span className="text-xs font-semibold text-slate-500">Modalidades Impartidas</span>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-bold font-mono tabular-nums">
                <span className="text-amber-700">{stats.pausasCount} Pausas</span>
                <span className="text-red-600">{stats.fitnessCount} Fitness</span>
                <span className="text-indigo-700">{stats.gimnasioCount} Gimnasio</span>
                <span className="text-teal-700">{stats.masajesCount} Masajes</span>
              </div>
            </div>
          </div>

          {/* Section: Resumen de Puntualidad y Cumplimiento por Entrenador */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center">
                <Clock className="w-4 h-4 mr-2 text-red-600" />
                Reporte de Puntualidad y Rendimiento por Entrenador
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                {reportType === 'daily'
                  ? `Día: ${selectedDate}`
                  : reportType === 'monthly'
                  ? `Mes: ${selectedMonth}`
                  : 'Total Acumulado'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Entrenador</th>
                    <th className="py-3 px-3 text-center">Sesiones</th>
                    <th className="py-3 px-3 text-center">% Puntualidad</th>
                    <th className="py-3 px-3 text-center">A Tiempo</th>
                    <th className="py-3 px-3 text-center">Con Retraso</th>
                    <th className="py-3 px-3 text-center">No Cerradas</th>
                    <th className="py-3 px-3 text-center">Horas Brindadas</th>
                    <th className="py-3 px-3 text-center">Colaboradores</th>
                    <th className="py-3 px-4 text-right">Calificación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trainerSummaries.map(({ trainer, total, onTime, early, late, nonCompliant, punctualityRate, attendees, hours }) => (
                    <tr key={trainer.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 font-semibold text-slate-900 flex items-center space-x-3">
                        <img
                          src={trainer.avatar}
                          alt={trainer.name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-300 shadow-xs"
                        />
                        <div>
                          <span className="block font-bold text-slate-900">{trainer.name}</span>
                          <span className="text-[10px] text-slate-500">{trainer.email}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-900">
                        {total}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`font-mono font-bold text-[11px] ${
                            punctualityRate >= 90
                              ? 'text-emerald-700'
                              : punctualityRate >= 75
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {punctualityRate}%
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-emerald-700 font-bold">
                        {onTime + early}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-red-600 font-bold">
                        {late}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-bold">
                        {nonCompliant > 0 ? (
                          <span className="text-rose-700">{nonCompliant}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-slate-800 font-semibold">
                        {hours} hrs
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-slate-900 font-bold">
                        {attendees}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`text-[11px] font-bold ${
                            nonCompliant > 0
                              ? 'text-rose-700'
                              : punctualityRate >= 95
                              ? 'text-emerald-700'
                              : punctualityRate >= 80
                              ? 'text-slate-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {nonCompliant > 0
                            ? '⚠ Con no cerradas'
                            : punctualityRate >= 95
                            ? '★ Excelente'
                            : punctualityRate >= 80
                            ? '✓ Destacado'
                            : '⚠ Revisar'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Resumen de Visitas por Empresa Cliente */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center">
                <Building2 className="w-4 h-4 mr-2 text-red-600" />
                Resumen de Cobertura por Empresa Cliente
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Empresa Cliente</th>
                    <th className="py-3 px-3">Industria</th>
                    <th className="py-3 px-3 text-center">Sedes</th>
                    <th className="py-3 px-3 text-center">Total Sesiones</th>
                    <th className="py-3 px-3 text-center">Pausas Activas</th>
                    <th className="py-3 px-3 text-center">Clases Fitness</th>
                    <th className="py-3 px-3 text-center">Gimnasio Corp.</th>
                    <th className="py-3 px-3 text-center">Masajes</th>
                    <th className="py-3 px-4 text-right">Colaboradores Beneficiados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companySummaries.map(
                    ({ company, totalSessions, pausas, fitness, gimnasio, masajes, attendees }) => (
                      <tr key={company.id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-900">{company.name}</td>
                        <td className="py-3.5 px-3 text-slate-500">{company.industry}</td>
                        <td className="py-3.5 px-3 text-center font-mono tabular-nums font-semibold text-slate-700">
                          {company.sedes.length} sedes
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono tabular-nums font-black text-red-600">
                          {totalSessions}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono tabular-nums font-medium text-slate-800">
                          {pausas}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono tabular-nums font-medium text-slate-800">
                          {fitness}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono tabular-nums font-medium text-slate-800">
                          {gimnasio}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono tabular-nums font-medium text-slate-800">
                          {masajes}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {attendees} personas
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ASIGNACIÓN DE CLASES (CALENDARIO DÍA, SEMANA Y MES) */}
      {activeTab === 'schedule' && (
        <AdminScheduleView
          assignments={assignments}
          records={records}
          companies={companies}
          trainers={trainers}
          activityCatalog={activityCatalog}
          lastSavedSignal={lastSavedScheduleSignal}
          onAddAssignment={(preset) => {
            setEditingAssignment(null);
            setAssignmentInitialPreset(preset || null);
            setIsAssignmentModalOpen(true);
          }}
          onAddAssignmentsBatch={onAddAssignmentsBatch}
          onEditAssignment={(asg) => {
            setEditingAssignment(asg);
            setAssignmentInitialPreset(null);
            setIsAssignmentModalOpen(true);
          }}
          onUpdateAssignment={onUpdateAssignment}
          onDeleteAssignment={onDeleteAssignment}
          onEditTrainerSpecialties={(tr) => {
            setIsAssignmentModalOpen(false);
            setEditingTrainer(tr);
            setIsTrainerModalOpen(true);
          }}
          onOpenPdfReport={(trainerId) => {
            setPdfAssignmentsTrainerTarget(trainerId || 'all');
            setIsPdfAssignmentsModalOpen(true);
          }}
        />
      )}

      {/* TAB 3: BITÁCORA Y EVIDENCIAS DE ASISTENCIA */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          {/* Top Bar: Database Sync + View Mode + Print / PDF / Excel Exports */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Database className="w-4 h-4 text-red-600 shrink-0" />
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Bitácora Oficial de Evidencias Fotográficas y Asistencia
                  </h3>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500">
                    · Cloud Firestore (`/records`) · {records.length} registros
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Respaldo en tiempo real de fotografías con sello GPS (entrada/salida), validación biométrica facial y actas auditables.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* View Mode Toggle: Tabla vs Galería de Fotos */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setLogViewMode('table')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                      logViewMode === 'table'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5 text-red-600" />
                    <span>Tabla</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogViewMode('gallery')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                      logViewMode === 'gallery'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-red-600" />
                    <span>Galería de Fotos</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleExportLogExcel}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                  title="Descargar registros filtrados en formato Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleExportLogPdfDirect()}
                  disabled={isExportingLogPdf}
                  className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                  title="Descargar Bitácora en PDF (.pdf) incluyendo fotografías de evidencia"
                >
                  {isExportingLogPdf ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isExportingLogPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEvidencePdfModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                  title="Abrir vista previa oficial para imprimir la bitácora con fotografías"
                >
                  <Printer className="w-3.5 h-3.5 text-red-600" />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col lg:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por ID, entrenador, empresa, sede, salón o actividad..."
                    className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="month"
                    value={logMonthFilter}
                    onChange={(e) => {
                      setLogMonthFilter(e.target.value);
                      if (e.target.value) setLogDateFilter('');
                    }}
                    title="Filtrar por mes"
                    className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-mono tabular-nums focus:outline-none focus:border-red-500"
                  />
                  <input
                    type="date"
                    value={logDateFilter}
                    onChange={(e) => setLogDateFilter(e.target.value)}
                    title="Filtrar por fecha exacta"
                    className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-mono tabular-nums focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select
                  value={filterTrainerId}
                  onChange={(e) => setFilterTrainerId(e.target.value)}
                  className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-red-500 cursor-pointer font-medium"
                >
                  <option value="all">Todos los Entrenadores</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterCompanyId}
                  onChange={(e) => setFilterCompanyId(e.target.value)}
                  className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-red-500 cursor-pointer font-medium"
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
                  className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-red-500 cursor-pointer font-medium"
                >
                  <option value="all">Todas las Modalidades</option>
                  <option value="pausa_activa">Pausa Activa</option>
                  <option value="clase_fitness">Clase Fitness</option>
                  <option value="gimnasio_corporativo">Gimnasio Corporativo</option>
                  <option value="masajes">Masajes</option>
                </select>

                <select
                  value={filterPunctuality}
                  onChange={(e) => setFilterPunctuality(e.target.value)}
                  className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-red-500 cursor-pointer font-medium"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="completado">Completadas y cerradas</option>
                  <option value="a_tiempo">Puntuales (A tiempo)</option>
                  <option value="con_retraso">Con retraso</option>
                  <option value="adelantado">Adelantadas</option>
                  <option value="en_curso">En curso (sin salida)</option>
                  <option value="incumplido">No Cerrada (Terminada +60m)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
              <span>
                Mostrando{' '}
                <strong className="text-slate-900 font-mono tabular-nums">
                  {filteredLogRecords.length}
                </strong>{' '}
                de <span className="font-mono tabular-nums">{records.length}</span> registros en base de datos • Haz clic en cualquier miniatura para ampliar la fotografía de evidencia
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilterTrainerId('all');
                  setFilterCompanyId('all');
                  setFilterActivityType('all');
                  setFilterPunctuality('all');
                  setLogMonthFilter('');
                  setLogDateFilter('');
                }}
                className="text-red-600 font-semibold hover:underline cursor-pointer whitespace-nowrap"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>

          {filteredLogRecords.length === 0 ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2">
              <Camera className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                No se encontraron registros de evidencia con los filtros seleccionados
              </p>
              <p className="text-xs text-slate-500">
                Ajusta los criterios de búsqueda o limpia los filtros para visualizar la bitácora completa.
              </p>
            </div>
          ) : logViewMode === 'table' ? (
            /* Master Table of Evidence Records */
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3">Fecha & Horarios</th>
                      <th className="py-3 px-3">Entrenador</th>
                      <th className="py-3 px-3">Empresa y Sede</th>
                      <th className="py-3 px-3">Actividad</th>
                      <th className="py-3 px-2 text-center">Puntualidad</th>
                      <th className="py-3 px-2 text-center">GPS</th>
                      <th className="py-3 px-2 text-center">Fotos de Evidencia</th>
                      <th className="py-3 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogRecords.map((rec) => {
                      const isLate = rec.punctualityStatus === 'con_retraso';
                      const isEarly = rec.punctualityStatus === 'adelantado';
                      const isNonCompliantRecord = rec.status === 'incumplido';

                      return (
                        <tr
                          key={rec.id}
                          className={`transition ${
                            isNonCompliantRecord
                              ? 'bg-rose-50/40 hover:bg-rose-50/80'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Timestamps */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono tabular-nums font-bold text-slate-900 block">
                              {rec.date}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Prog:{' '}
                              <span className="font-mono tabular-nums font-medium">
                                {rec.scheduledTime}
                              </span>
                            </span>
                            <div className="text-[10px] font-mono tabular-nums text-emerald-700 font-bold">
                              Ent: {rec.checkInTime}
                              {isNonCompliantRecord ? (
                                <span className="ml-1.5 text-rose-700 font-sans font-extrabold inline-flex items-center gap-1">
                                  <Lock className="w-3 h-3 inline" />
                                  No Cerrada (Terminada +60m)
                                </span>
                              ) : rec.checkOutTime ? (
                                <span className="text-slate-700 ml-1">
                                  | Sal: {rec.checkOutTime}
                                </span>
                              ) : (
                                (() => {
                                  const st = getSessionAlarmStatus(
                                    rec,
                                    activityCatalog,
                                    adminNowMs
                                  );
                                  return st.isOverdue ? (
                                    <span className="ml-1.5 text-amber-800 font-sans font-extrabold">
                                      ⚠ Salida pendiente (+{formatSecondsClock(st.overdueSeconds)} · termina en{' '}
                                      {formatSecondsClock(st.remainingBeforeNonComplianceSeconds)})
                                    </span>
                                  ) : (
                                    <span className="ml-1 text-amber-700 font-sans font-bold">
                                      • En curso
                                    </span>
                                  );
                                })()
                              )}
                            </div>
                          </td>

                          {/* Trainer */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900 block">
                              {rec.trainerName}
                            </span>
                            <span className="text-[10px] text-slate-500">{rec.locationArea}</span>
                          </td>

                          {/* Company & Sede */}
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-800 block truncate max-w-[180px]">
                              {rec.companyName}
                            </span>
                            <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">
                              {rec.sedeName}
                            </span>
                          </td>

                          {/* Activity */}
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-900 block truncate max-w-[175px]">
                              {rec.activityName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono tabular-nums block">
                              {ACTIVITY_TYPE_LABELS[normalizeActivityType(rec.activityType)]} ·{' '}
                              {rec.attendeesCount} part.
                            </span>
                            {rec.isVirtual && (
                              <span className="text-[10px] font-semibold text-indigo-700 block truncate max-w-[175px]">
                                Clase Virtual · {rec.virtualPlatform || 'En línea'}
                              </span>
                            )}
                          </td>

                          {/* Punctuality */}
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            <span
                              className={`text-[11px] font-bold ${
                                isLate
                                  ? 'text-rose-700'
                                  : isEarly
                                  ? 'text-blue-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {isLate
                                ? `Retraso (${Math.abs(rec.punctualityDiffMinutes)}m)`
                                : isEarly
                                ? 'Anticipado'
                                : 'A tiempo'}
                            </span>
                          </td>

                          {/* GPS */}
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            {rec.isVirtual ? (
                              <span
                                className="font-mono tabular-nums text-[11px] font-bold text-indigo-700"
                                title={`Sesión virtual en ${rec.virtualPlatform || 'plataforma en línea'}`}
                              >
                                Virtual
                              </span>
                            ) : (
                              <span
                                className={`font-mono tabular-nums text-[11px] font-bold ${
                                  rec.checkInGps.isWithinGeofence
                                    ? 'text-emerald-700'
                                    : 'text-rose-700'
                                }`}
                                title={`Distancia a sede: ${formatDistance(
                                  rec.checkInGps.distanceToSedeMeters
                                )}`}
                              >
                                {formatDistance(rec.checkInGps.distanceToSedeMeters)}
                              </span>
                            )}
                          </td>

                          {/* Evidence thumbnails (click opens Lightbox on exact photo) */}
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1.5">
                              {rec.facialVerification && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxState({ record: rec, slot: 'facial' })
                                  }
                                  className="relative group cursor-pointer"
                                  title={`Ampliar Biometría Facial (${rec.facialVerification.confidenceScore}%)`}
                                >
                                  <img
                                    src={rec.facialVerification.facePhotoUrl}
                                    alt="Rostro"
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-8 rounded-md object-cover border-2 border-emerald-500 group-hover:scale-110 transition"
                                  />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setLightboxState({ record: rec, slot: 'entry' })}
                                className="relative group cursor-pointer"
                                title="Ampliar Foto de Entrada con Sello"
                              >
                                <img
                                  src={rec.photoUrl}
                                  alt="Foto Entrada"
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded-md object-cover border border-slate-300 group-hover:scale-110 transition"
                                />
                              </button>
                              {rec.exitPhotoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxState({ record: rec, slot: 'exit' })}
                                  className="relative group cursor-pointer"
                                  title="Ampliar Foto de Salida con Sello"
                                >
                                  <img
                                    src={rec.exitPhotoUrl}
                                    alt="Foto Salida"
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-8 rounded-md object-cover border-2 border-red-500 group-hover:scale-110 transition"
                                  />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Action buttons */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                type="button"
                                onClick={() => setLightboxState({ record: rec, slot: 'entry' })}
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-red-600 text-white transition cursor-pointer"
                                title="Visualizar Fotografías de Evidencia"
                              >
                                <ZoomIn className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setSelectedRecordForDetail(rec)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200 transition cursor-pointer"
                                title="Ver / Imprimir Acta Completa de Asistencia"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {confirmDeleteRecordId === rec.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteRecord(rec.id);
                                      setConfirmDeleteRecordId(null);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold transition cursor-pointer"
                                  >
                                    Eliminar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRecordId(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRecordId(rec.id)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200 transition cursor-pointer"
                                  title="Eliminar Registro de Firestore"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Photo Evidence Gallery Mode */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredLogRecords.map((rec) => {
                const isLate = rec.punctualityStatus === 'con_retraso';
                const isNonCompliantRecord = rec.status === 'incumplido';

                return (
                  <div
                    key={rec.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-mono tabular-nums font-bold text-slate-900">
                            {rec.date}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-bold text-slate-900 truncate">
                            {rec.companyName}
                          </span>
                          <span className="text-slate-400">/</span>
                          <span className="text-slate-600 font-medium truncate">
                            {rec.sedeName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Entrenador: <strong className="text-slate-800">{rec.trainerName}</strong>{' '}
                          · {rec.activityName} ({rec.locationArea})
                          {rec.isVirtual ? ` · Clase Virtual (${rec.virtualPlatform || 'En línea'})` : ''}
                        </p>
                      </div>

                      <div className="text-right shrink-0 text-[11px]">
                        <span
                          className={`font-bold block ${
                            isNonCompliantRecord
                              ? 'text-rose-700'
                              : rec.status === 'completado'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {isNonCompliantRecord
                            ? 'No Cerrada (+60m)'
                            : rec.status === 'completado'
                            ? 'Completada'
                            : 'En Curso'}
                        </span>
                        <span
                          className={`font-mono tabular-nums text-[10px] ${
                            isLate ? 'text-rose-600 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          Ent {rec.checkInTime}
                          {rec.checkOutTime ? ` · Sal ${rec.checkOutTime}` : ''}
                        </span>
                      </div>
                    </div>

                    {/* 3 Evidence Photo Slots */}
                    <div className="grid grid-cols-3 gap-2.5">
                      {/* Slot 1: Entry */}
                      <button
                        type="button"
                        onClick={() => setLightboxState({ record: rec, slot: 'entry' })}
                        className="group text-left space-y-1 cursor-pointer"
                      >
                        <span className="text-[10px] font-semibold text-slate-600 block truncate">
                          1. Entrada Sede
                        </span>
                        <div className="relative h-28 rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                          <img
                            src={rec.photoUrl}
                            alt="Entrada"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-150"
                          />
                          <span className="absolute bottom-1.5 right-1.5 p-1 rounded bg-slate-950/75 text-white opacity-90 group-hover:bg-red-600 transition">
                            <ZoomIn className="w-3 h-3" />
                          </span>
                        </div>
                      </button>

                      {/* Slot 2: Exit */}
                      {rec.exitPhotoUrl ? (
                        <button
                          type="button"
                          onClick={() => setLightboxState({ record: rec, slot: 'exit' })}
                          className="group text-left space-y-1 cursor-pointer"
                        >
                          <span className="text-[10px] font-semibold text-slate-600 block truncate">
                            2. Salida Sede
                          </span>
                          <div className="relative h-28 rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                            <img
                              src={rec.exitPhotoUrl}
                              alt="Salida"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-150"
                            />
                            <span className="absolute bottom-1.5 right-1.5 p-1 rounded bg-slate-950/75 text-white opacity-90 group-hover:bg-red-600 transition">
                              <ZoomIn className="w-3 h-3" />
                            </span>
                          </div>
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-slate-400 block truncate">
                            2. Salida Sede
                          </span>
                          <div className="h-28 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center p-2 text-center text-[10px] text-slate-400">
                            {rec.status === 'en_curso' ? 'En curso' : 'Sin foto salida'}
                          </div>
                        </div>
                      )}

                      {/* Slot 3: Facial Biometric */}
                      {rec.facialVerification?.facePhotoUrl ? (
                        <button
                          type="button"
                          onClick={() => setLightboxState({ record: rec, slot: 'facial' })}
                          className="group text-left space-y-1 cursor-pointer"
                        >
                          <span className="text-[10px] font-semibold text-emerald-700 block truncate font-mono tabular-nums">
                            3. Rostro ({rec.facialVerification.confidenceScore}%)
                          </span>
                          <div className="relative h-28 rounded-xl overflow-hidden bg-slate-900 border border-emerald-400">
                            <img
                              src={rec.facialVerification.facePhotoUrl}
                              alt="Biometría Facial"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-150"
                            />
                            <span className="absolute bottom-1.5 right-1.5 p-1 rounded bg-slate-950/75 text-white opacity-90 group-hover:bg-red-600 transition">
                              <ZoomIn className="w-3 h-3" />
                            </span>
                          </div>
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-slate-400 block truncate">
                            3. Biometría
                          </span>
                          <div className="h-28 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center p-2 text-center text-[10px] text-slate-400">
                            Sin captura
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                      <span className="font-mono tabular-nums">
                        GPS {formatDistance(rec.checkInGps.distanceToSedeMeters)} ·{' '}
                        {rec.attendeesCount} asistentes
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLightboxState({ record: rec, slot: 'entry' })}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-red-600 text-white font-bold transition cursor-pointer whitespace-nowrap"
                        >
                          Ver Fotos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedRecordForDetail(rec)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold transition cursor-pointer whitespace-nowrap"
                        >
                          Acta / Auditar
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

      {/* TAB 4: GESTIÓN DE EMPRESAS Y SEDES (CON CRUD COMPLETO) */}
      {activeTab === 'sedes' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base flex items-center">
              <Building2 className="w-5 h-5 mr-2 text-red-600" />
              Directorio de Empresas Cliente y Sedes Habilitadas
            </h3>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setEditingCompany(null);
                  setIsCompanyModalOpen(true);
                }}
                className="text-xs font-bold px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm transition flex items-center"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nueva Empresa
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingSede(null);
                  setTargetCompanyIdForSede(companies[0]?.id);
                  setIsSedeModalOpen(true);
                }}
                className="text-xs font-bold px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 shadow-sm transition flex items-center"
              >
                <Plus className="w-3.5 h-3.5 mr-1 text-red-600" />
                Nueva Sede
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companies.map((comp) => (
              <div
                key={comp.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-3">
                    <span className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center font-bold text-sm text-red-600 shadow-xs">
                      {comp.logoText}
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{comp.name}</h4>
                      <p className="text-xs text-slate-500 font-medium">{comp.industry} • RFC: {comp.taxId}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCompany(comp);
                        setIsCompanyModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200"
                      title="Editar Empresa"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {confirmDeleteCompanyId === comp.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCompany(comp.id);
                            setConfirmDeleteCompanyId(null);
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold transition"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCompanyId(null)}
                          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCompanyId(comp.id)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                        title="Eliminar Empresa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Sedes Autorizadas ({comp.sedes.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSede(null);
                        setTargetCompanyIdForSede(comp.id);
                        setIsSedeModalOpen(true);
                      }}
                      className="text-[11px] text-red-600 font-semibold hover:underline flex items-center"
                    >
                      <Plus className="w-3 h-3 mr-0.5" /> Agregar Sede a {comp.name.split(' ')[0]}
                    </button>
                  </div>

                  {comp.sedes.map((sede) => (
                    <div
                      key={sede.id}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 hover:border-slate-300 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">📍 {sede.name}</span>
                        <div className="flex items-center space-x-1">
                          <span className="font-mono text-[10px] font-bold text-red-600 mr-1">
                            Radio: {sede.geofenceRadiusMeters}m
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSede(sede);
                              setTargetCompanyIdForSede(comp.id);
                              setIsSedeModalOpen(true);
                            }}
                            className="p-1 rounded bg-white hover:bg-slate-200 text-slate-600 border border-slate-200"
                            title="Editar Sede"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          {confirmDeleteSedeKey === `${comp.id}:${sede.id}` ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteSede(sede.id, comp.id);
                                  setConfirmDeleteSedeKey(null);
                                }}
                                className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSedeKey(null)}
                                className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSedeKey(`${comp.id}:${sede.id}`)}
                              className="p-1 rounded bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                              title="Eliminar Sede"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-600 text-[11px]">{sede.address}</p>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[10px] text-slate-500 font-medium">
                        <span>Contacto: {sede.contactPerson} ({sede.contactRole})</span>
                        <span className="font-mono">{sede.lat.toFixed(4)}, {sede.lng.toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: GESTIÓN DE ENTRENADORES (CON CRUD COMPLETO) */}
      {activeTab === 'trainers' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base flex items-center">
              <Users className="w-5 h-5 mr-2 text-red-600" />
              Plantilla de Entrenadores y Coaches Corporativos
            </h3>

            <button
              type="button"
              onClick={() => {
                setEditingTrainer(null);
                setIsTrainerModalOpen(true);
              }}
              className="text-xs font-bold px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm transition flex items-center"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Nuevo Entrenador
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {trainers.map((tr) => {
              const trVisits = records.filter((r) => r.trainerId === tr.id).length;
              return (
                <div
                  key={tr.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <img
                          src={tr.avatar}
                          alt={tr.name}
                          className="w-12 h-12 rounded-2xl object-cover border-2 border-red-500 shadow-sm"
                        />
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{tr.name}</h4>
                          <span className={`text-[10px] font-bold ${tr.active !== false ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {tr.active !== false ? 'Activo BSCW' : 'Inactivo'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTrainer(tr);
                            setIsTrainerModalOpen(true);
                          }}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                          title="Editar Entrenador"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteTrainerId === tr.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteTrainer(tr.id);
                                setConfirmDeleteTrainerId(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTrainerId(null)}
                              className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTrainerId(tr.id)}
                            className="p-1 rounded bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200"
                            title="Eliminar Entrenador"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1 mb-3 font-medium">
                      <p className="truncate">✉ {tr.email}</p>
                      <p>📞 {tr.phone}</p>
                    </div>

                    <div className="text-[11px] text-slate-600 mb-4 font-medium">
                      {tr.specialties.join(' · ')}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Total Visitas:</span>
                    <span className="font-mono font-bold text-slate-900">{trVisits} sesiones</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPdfAssignmentsTrainerTarget(tr.id);
                      setIsPdfAssignmentsModalOpen(true);
                    }}
                    className="mt-2.5 w-full py-1.5 px-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-[11px] flex items-center justify-center transition shadow-2xs hover:border-red-300"
                    title={`Descargar rol mensual en PDF para ${tr.name}`}
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                    Descargar Rol en PDF
                  </button>
                </div>
              );
            })}
          </div>

          {/* Reset Demo Data button */}
          <div className="p-4 bg-white border border-slate-200/90 rounded-2xl flex items-center justify-between text-xs text-slate-500 shadow-sm">
            <div>
              <span className="font-bold text-slate-900 block">Datos y Configuración de Demostración</span>
              <span>Puedes restablecer los datos de ejemplo iniciales en cualquier momento.</span>
            </div>
            {confirmResetDemo ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetData();
                    setConfirmResetDemo(false);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition"
                >
                  Confirmar Restablecimiento
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetDemo(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold transition"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetDemo(true)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold transition"
              >
                Restablecer Demo
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB: TIPOS DE ASIGNACIÓN (MODALIDADES, ESPECIALIDADES Y DISCIPLINAS) */}
      {activeTab === 'activity_types' && (
        <AdminAssignmentTypesView
          activityCatalog={activityCatalog}
          assignments={assignments}
          trainers={trainers}
          onAddCatalogItem={onAddCatalogItem}
          onUpdateCatalogItem={onUpdateCatalogItem}
          onDeleteCatalogItem={onDeleteCatalogItem}
          onUpdateAssignment={onUpdateAssignment}
          onEditFullAssignment={(asg) => {
            setEditingAssignment(asg);
            setIsAssignmentModalOpen(true);
          }}
        />
      )}

      {/* TAB: SEGUIMIENTO EN TIEMPO REAL DE TRASLADO A SEDES */}
      {activeTab === 'live_tracking' && (
        <AdminLiveTrackingView
          transitTrackings={transitTrackings}
          trainers={trainers}
          companies={companies}
          onDeleteTransitTracking={onDeleteTransitTracking}
        />
      )}

      {/* TAB: REGISTRO DE PERSONAL EN FIRESTORE (REQUIERE AUTENTICACIÓN) */}
      {activeTab === 'personnel' && (
        <FirestoreErrorBoundary>
          <PersonnelRegistryView
            embeddedInAdmin
            onExitEmbeddedDirectory={() => setActiveTab('reports')}
          />
        </FirestoreErrorBoundary>
      )}

      {/* Record Verification Detail Modal */}
      {selectedRecordForDetail && (
        <RecordDetailModal
          record={selectedRecordForDetail}
          onClose={() => setSelectedRecordForDetail(null)}
          onUpdateRecord={(updated) => {
            onUpdateRecord(updated);
            setSelectedRecordForDetail(null);
          }}
        />
      )}

      {/* CRUD Modals */}
      <AdminTrainerModal
        trainer={editingTrainer}
        existingSpecialties={allDatabaseSpecialties}
        isOpen={isTrainerModalOpen}
        onClose={() => {
          setIsTrainerModalOpen(false);
          setEditingTrainer(null);
        }}
        onSave={(savedTr) => {
          if (editingTrainer) {
            onUpdateTrainer(savedTr);
          } else {
            onAddTrainer(savedTr);
          }
        }}
      />

      <AdminCompanyModal
        company={editingCompany}
        isOpen={isCompanyModalOpen}
        onClose={() => {
          setIsCompanyModalOpen(false);
          setEditingCompany(null);
        }}
        onSave={(savedComp) => {
          if (editingCompany) {
            onUpdateCompany(savedComp);
          } else {
            onAddCompany(savedComp);
          }
        }}
      />

      <AdminSedeModal
        sede={editingSede}
        companyId={targetCompanyIdForSede}
        companies={companies}
        isOpen={isSedeModalOpen}
        onClose={() => {
          setIsSedeModalOpen(false);
          setEditingSede(null);
        }}
        onSave={(savedSede) => {
          if (editingSede) {
            onUpdateSede(savedSede);
          } else {
            onAddSede(savedSede);
          }
        }}
      />

      <AdminAssignmentModal
        assignment={editingAssignment}
        trainers={trainers}
        companies={companies}
        activityCatalog={activityCatalog}
        existingAssignments={assignments}
        isOpen={isAssignmentModalOpen}
        initialPreset={assignmentInitialPreset}
        onAddCatalogItem={onAddCatalogItem}
        onManageActivityTypes={() => setActiveTab('activity_types')}
        onEditTrainerSpecialties={(tr) => {
          setIsAssignmentModalOpen(false);
          setEditingTrainer(tr);
          setIsTrainerModalOpen(true);
        }}
        onClose={() => {
          setIsAssignmentModalOpen(false);
          setEditingAssignment(null);
          setAssignmentInitialPreset(null);
        }}
        onSave={(savedAsg) => {
          const wasEdit = Boolean(editingAssignment);
          if (wasEdit) {
            onUpdateAssignment(savedAsg);
          } else {
            onAddAssignment(savedAsg);
          }
          setLastSavedScheduleSignal({
            stamp: Date.now(),
            isEdit: wasEdit,
            assignments: [savedAsg],
          });
        }}
        onSaveBatch={(batchAsgs) => {
          if (onAddAssignmentsBatch) {
            onAddAssignmentsBatch(batchAsgs);
          } else {
            batchAsgs.forEach((item) => onAddAssignment(item));
          }
          if (batchAsgs.length > 0) {
            setLastSavedScheduleSignal({
              stamp: Date.now(),
              isEdit: false,
              assignments: batchAsgs,
            });
          }
        }}
      />

      <PdfReportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        records={periodRecords}
        companies={companies}
        trainers={trainers}
        reportType={reportType}
        selectedDate={selectedDate}
        selectedMonth={selectedMonth}
      />

      <PdfAssignmentsModal
        isOpen={isPdfAssignmentsModalOpen}
        onClose={() => setIsPdfAssignmentsModalOpen(false)}
        assignments={assignments}
        companies={companies}
        trainers={trainers}
        activityCatalog={activityCatalog}
        initialTrainerId={pdfAssignmentsTrainerTarget}
        initialMonth={selectedMonth}
      />

      <PdfEvidenceLogModal
        isOpen={isEvidencePdfModalOpen}
        onClose={() => setIsEvidencePdfModalOpen(false)}
        records={filteredLogRecords}
        filterSummaryLabel={logFilterSummaryLabel}
        companies={companies}
        trainers={trainers}
        onInspectPhoto={(rec, slot) => setLightboxState({ record: rec, slot })}
      />

      <EvidencePhotoLightbox
        record={lightboxState?.record || null}
        initialSlot={lightboxState?.slot || 'entry'}
        onClose={() => setLightboxState(null)}
        onOpenFullCertificate={(rec) => setSelectedRecordForDetail(rec)}
      />
    </div>
  );
};
