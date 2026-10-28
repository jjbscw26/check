import * as XLSX from 'xlsx';
import {
  ACTIVITY_TYPE_LABELS,
  ActivityCatalogItem,
  AttendanceRecord,
  ClassAssignment,
  Company,
  normalizeActivityType,
  Trainer,
} from '../types';
import { formatDistance } from './geo';
import {
  calculateEndTimeHHMM,
  formatDurationHoursMinutes,
  getAssignmentDurationMinutes,
} from './sessionAlarm';

const MONTH_NAMES_ES = [
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

const DAY_NAMES_ES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

type CellVal = string | number | boolean | null | undefined;

export function sanitizeExcelFileSegment(raw: string, fallback = 'Reporte_BSCW'): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || fallback
  );
}

function sanitizeSheetName(raw: string): string {
  return (
    raw
      .replace(/[:\\/?*[\]]+/g, ' ')
      .trim()
      .slice(0, 31) || 'Hoja'
  );
}

function triggerExcelBlobDownload(wb: XLSX.WorkBook, filename: string): void {
  const wbBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 15000);
}

function formatGeneratedAtEs(): string {
  const now = new Date();
  return `${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', {
    hour12: false,
  })}`;
}

export function formatRecordStatusForReport(record: AttendanceRecord): string {
  if (record.status === 'completado') return 'Completada y Cerrada';
  if (record.status === 'incumplido') {
    if (record.nonComplianceReason === 'fuera_de_horario') {
      return 'Incumplida (Fuera de horario)';
    }
    if (record.nonComplianceReason === 'manual_admin') {
      return 'Incumplida (Marcada por Admin)';
    }
    return 'No Cerrada (Terminada +60m)';
  }
  return 'En Curso (Sin salida)';
}

export function formatNonComplianceReasonLabel(record: AttendanceRecord): string {
  if (record.status !== 'incumplido' && !record.nonComplianceReason) return 'N/A';
  if (record.nonComplianceReason === 'fuera_de_horario') {
    return 'Fuera de horario permitido';
  }
  if (record.nonComplianceReason === 'manual_admin') {
    return 'Marcada manualmente por Administración';
  }
  return 'Sin cierre de salida tras +60 min del término';
}

export function formatRecordPunctualityForReport(record: AttendanceRecord): string {
  if (record.punctualityStatus === 'con_retraso') {
    return `Con retraso (${Math.abs(record.punctualityDiffMinutes)} min)`;
  }
  if (record.punctualityStatus === 'adelantado') {
    return `Anticipado (+${Math.abs(record.punctualityDiffMinutes)} min)`;
  }
  return 'Puntual (A tiempo)';
}

export function evaluateTrainerRatingLabel(
  punctualityRate: number,
  nonCompliantCount: number
): string {
  if (nonCompliantCount > 0) return 'Con no cerradas';
  if (punctualityRate >= 95) return 'Excelente';
  if (punctualityRate >= 80) return 'Destacado';
  return 'Revisión';
}

function autoFitAoaColumns(
  aoa: CellVal[][],
  skipRowIndices: Set<number> = new Set(),
  minWch = 11,
  maxWch = 46
): XLSX.ColInfo[] {
  let maxCols = 0;
  for (const row of aoa) {
    if (row && row.length > maxCols) maxCols = row.length;
  }

  const widths: XLSX.ColInfo[] = [];
  for (let c = 0; c < maxCols; c++) {
    let longest = minWch;
    for (let r = 0; r < aoa.length; r++) {
      if (skipRowIndices.has(r)) continue;
      const cell = aoa[r]?.[c];
      if (cell === null || cell === undefined) continue;
      const str = String(cell);
      const lines = str.split('\n');
      for (const line of lines) {
        if (line.length + 3 > longest) {
          longest = line.length + 3;
        }
      }
    }
    widths.push({ wch: Math.min(maxWch, Math.max(minWch, longest)) });
  }
  return widths;
}

function buildSheetFromObjects(
  rows: Record<string, CellVal>[],
  emptyMessage: string,
  enableAutoFilter = true
): XLSX.WorkSheet {
  if (rows.length === 0) {
    const wsEmpty = XLSX.utils.aoa_to_sheet([[emptyMessage]]);
    wsEmpty['!cols'] = [{ wch: Math.max(36, emptyMessage.length + 4) }];
    return wsEmpty;
  }
  const headers = Object.keys(rows[0]);
  const aoa: CellVal[][] = [
    headers,
    ...rows.map((row) => headers.map((h) => row[h] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = autoFitAoaColumns(aoa);
  if (enableAutoFilter && rows.length > 0 && headers.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: headers.length - 1 },
      }),
    };
  }
  return ws;
}

export interface TrainerReportRowSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialties: string;
  activeLabel: string;
  totalSessions: number;
  completedSessions: number;
  inProgressSessions: number;
  nonCompliantSessions: number;
  onTimeExact: number;
  earlyCount: number;
  punctualTotal: number;
  lateCount: number;
  punctualityRate: number;
  hoursImparted: number;
  attendeesTotal: number;
  virtualSessions: number;
  inGeofenceCount: number;
  auditedCount: number;
  rating: string;
}

export interface CompanyReportRowSummary {
  id: string;
  name: string;
  taxId: string;
  industry: string;
  sedesCount: number;
  totalSessions: number;
  completedSessions: number;
  nonCompliantSessions: number;
  pausasCount: number;
  fitnessCount: number;
  gimnasioCount: number;
  masajesCount: number;
  virtualCount: number;
  punctualityRate: number;
  hoursImparted: number;
  attendeesTotal: number;
}

export interface SedeReportRowSummary {
  companyName: string;
  sedeId: string;
  sedeName: string;
  city: string;
  address: string;
  geofenceRadiusMeters: number | string;
  contactPerson: string;
  contactPhone: string;
  totalSessions: number;
  completedSessions: number;
  nonCompliantSessions: number;
  punctualTotal: number;
  lateCount: number;
  punctualityRate: number;
  pausasCount: number;
  fitnessCount: number;
  gimnasioCount: number;
  masajesCount: number;
  virtualCount: number;
  hoursImparted: number;
  attendeesTotal: number;
}

export function computeTrainerSummariesForReport(
  records: AttendanceRecord[],
  trainers: Trainer[] = []
): TrainerReportRowSummary[] {
  const trainerMap = new Map<string, Trainer>();
  trainers.forEach((t) => trainerMap.set(t.id, t));

  // Ensure any trainer referenced only in historical records is also included
  records.forEach((r) => {
    if (!trainerMap.has(r.trainerId)) {
      trainerMap.set(r.trainerId, {
        id: r.trainerId,
        name: r.trainerName || 'Entrenador Histórico',
        email: '—',
        phone: '—',
        avatar: '',
        specialties: [],
        active: true,
      });
    }
  });

  return Array.from(trainerMap.values()).map((tr) => {
    const trRecs = records.filter((r) => r.trainerId === tr.id);
    const totalSessions = trRecs.length;
    const completedSessions = trRecs.filter((r) => r.status === 'completado').length;
    const inProgressSessions = trRecs.filter((r) => r.status === 'en_curso').length;
    const nonCompliantSessions = trRecs.filter((r) => r.status === 'incumplido').length;
    const onTimeExact = trRecs.filter((r) => r.punctualityStatus === 'a_tiempo').length;
    const earlyCount = trRecs.filter((r) => r.punctualityStatus === 'adelantado').length;
    const punctualTotal = onTimeExact + earlyCount;
    const lateCount = trRecs.filter((r) => r.punctualityStatus === 'con_retraso').length;
    const punctualityRate =
      totalSessions > 0 ? Math.round((punctualTotal / totalSessions) * 100) : 100;
    const hoursImparted = Number(
      (trRecs.reduce((acc, r) => acc + (r.durationMinutes || 45), 0) / 60).toFixed(1)
    );
    const attendeesTotal = trRecs.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);
    const virtualSessions = trRecs.filter((r) => Boolean(r.isVirtual)).length;
    const inGeofenceCount = trRecs.filter(
      (r) => Boolean(r.isVirtual) || Boolean(r.checkInGps?.isWithinGeofence)
    ).length;
    const auditedCount = trRecs.filter((r) => Boolean(r.adminVerified)).length;

    return {
      id: tr.id,
      name: tr.name,
      email: tr.email || '—',
      phone: tr.phone || '—',
      specialties: (tr.specialties || []).join(', ') || 'General',
      activeLabel: tr.active !== false ? 'Activo' : 'Inactivo',
      totalSessions,
      completedSessions,
      inProgressSessions,
      nonCompliantSessions,
      onTimeExact,
      earlyCount,
      punctualTotal,
      lateCount,
      punctualityRate,
      hoursImparted,
      attendeesTotal,
      virtualSessions,
      inGeofenceCount,
      auditedCount,
      rating: evaluateTrainerRatingLabel(punctualityRate, nonCompliantSessions),
    };
  });
}

export function computeCompanySummariesForReport(
  records: AttendanceRecord[],
  companies: Company[] = []
): CompanyReportRowSummary[] {
  const companyMap = new Map<string, Company>();
  companies.forEach((c) => companyMap.set(c.id, c));

  records.forEach((r) => {
    if (!companyMap.has(r.companyId)) {
      companyMap.set(r.companyId, {
        id: r.companyId,
        name: r.companyName || 'Empresa Cliente',
        taxId: '—',
        industry: 'Corporativo',
        logoText: 'EC',
        sedes: [],
      });
    }
  });

  return Array.from(companyMap.values()).map((comp) => {
    const cRecs = records.filter((r) => r.companyId === comp.id);
    const totalSessions = cRecs.length;
    const completedSessions = cRecs.filter((r) => r.status === 'completado').length;
    const nonCompliantSessions = cRecs.filter((r) => r.status === 'incumplido').length;
    const pausasCount = cRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'pausa_activa'
    ).length;
    const fitnessCount = cRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'clase_fitness'
    ).length;
    const gimnasioCount = cRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'gimnasio_corporativo'
    ).length;
    const masajesCount = cRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'masajes'
    ).length;
    const virtualCount = cRecs.filter((r) => Boolean(r.isVirtual)).length;
    const punctualCount = cRecs.filter(
      (r) => r.punctualityStatus === 'a_tiempo' || r.punctualityStatus === 'adelantado'
    ).length;
    const punctualityRate =
      totalSessions > 0 ? Math.round((punctualCount / totalSessions) * 100) : 100;
    const hoursImparted = Number(
      (cRecs.reduce((acc, r) => acc + (r.durationMinutes || 45), 0) / 60).toFixed(1)
    );
    const attendeesTotal = cRecs.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

    const uniqueRecordSedes = new Set(cRecs.map((r) => r.sedeId).filter(Boolean));
    const sedesCount = Math.max(comp.sedes?.length || 0, uniqueRecordSedes.size);

    return {
      id: comp.id,
      name: comp.name,
      taxId: comp.taxId || '—',
      industry: comp.industry || 'Corporativo',
      sedesCount,
      totalSessions,
      completedSessions,
      nonCompliantSessions,
      pausasCount,
      fitnessCount,
      gimnasioCount,
      masajesCount,
      virtualCount,
      punctualityRate,
      hoursImparted,
      attendeesTotal,
    };
  });
}

export function computeSedeSummariesForReport(
  records: AttendanceRecord[],
  companies: Company[] = []
): SedeReportRowSummary[] {
  const sedeEntries = new Map<
    string,
    {
      companyName: string;
      sedeId: string;
      sedeName: string;
      city: string;
      address: string;
      geofenceRadiusMeters: number | string;
      contactPerson: string;
      contactPhone: string;
    }
  >();

  companies.forEach((comp) => {
    (comp.sedes || []).forEach((s) => {
      sedeEntries.set(s.id, {
        companyName: comp.name,
        sedeId: s.id,
        sedeName: s.name,
        city: s.city || '—',
        address: s.address || '—',
        geofenceRadiusMeters: s.geofenceRadiusMeters ?? 150,
        contactPerson: s.contactPerson || '—',
        contactPhone: s.contactPhone || '—',
      });
    });
  });

  records.forEach((r) => {
    const key = r.sedeId || `${r.companyId}_${r.sedeName}`;
    if (!sedeEntries.has(key)) {
      sedeEntries.set(key, {
        companyName: r.companyName,
        sedeId: r.sedeId || key,
        sedeName: r.sedeName,
        city: '—',
        address: r.sedeAddress || '—',
        geofenceRadiusMeters: '—',
        contactPerson: '—',
        contactPhone: '—',
      });
    }
  });

  return Array.from(sedeEntries.values()).map((sede) => {
    const sRecs = records.filter(
      (r) =>
        (r.sedeId && r.sedeId === sede.sedeId) ||
        (!r.sedeId && r.companyName === sede.companyName && r.sedeName === sede.sedeName)
    );
    const totalSessions = sRecs.length;
    const completedSessions = sRecs.filter((r) => r.status === 'completado').length;
    const nonCompliantSessions = sRecs.filter((r) => r.status === 'incumplido').length;
    const punctualTotal = sRecs.filter(
      (r) => r.punctualityStatus === 'a_tiempo' || r.punctualityStatus === 'adelantado'
    ).length;
    const lateCount = sRecs.filter((r) => r.punctualityStatus === 'con_retraso').length;
    const punctualityRate =
      totalSessions > 0 ? Math.round((punctualTotal / totalSessions) * 100) : 100;
    const pausasCount = sRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'pausa_activa'
    ).length;
    const fitnessCount = sRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'clase_fitness'
    ).length;
    const gimnasioCount = sRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'gimnasio_corporativo'
    ).length;
    const masajesCount = sRecs.filter(
      (r) => normalizeActivityType(r.activityType) === 'masajes'
    ).length;
    const virtualCount = sRecs.filter((r) => Boolean(r.isVirtual)).length;
    const hoursImparted = Number(
      (sRecs.reduce((acc, r) => acc + (r.durationMinutes || 45), 0) / 60).toFixed(1)
    );
    const attendeesTotal = sRecs.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

    return {
      ...sede,
      totalSessions,
      completedSessions,
      nonCompliantSessions,
      punctualTotal,
      lateCount,
      punctualityRate,
      pausasCount,
      fitnessCount,
      gimnasioCount,
      masajesCount,
      virtualCount,
      hoursImparted,
      attendeesTotal,
    };
  });
}

function buildDetailedAttendanceRows(records: AttendanceRecord[]): Record<string, CellVal>[] {
  return records.map((r, index) => {
    const checkInDistLabel = r.isVirtual
      ? `Sesión Virtual (${r.virtualPlatform || 'En línea'})`
      : formatDistance(r.checkInGps.distanceToSedeMeters);

    const checkInGeofenceLabel = r.isVirtual
      ? 'SESIÓN VIRTUAL EN LÍNEA'
      : r.checkInGps.isWithinGeofence
      ? 'DENTRO DE GEOCERCA'
      : 'FUERA DE RANGO';

    const checkOutGeofenceLabel = r.checkOutGps
      ? r.isVirtual
        ? 'SESIÓN VIRTUAL EN LÍNEA'
        : r.checkOutGps.isWithinGeofence
        ? 'DENTRO DE GEOCERCA'
        : 'FUERA DE RANGO'
      : 'N/A';

    const exitPhotoLabel = r.exitPhotoUrl
      ? 'SÍ (Con sello GPS)'
      : r.status === 'incumplido'
      ? 'SIN FOTO (Sesión No Cerrada +60m)'
      : r.status === 'en_curso'
      ? 'Pendiente (Sesión en curso)'
      : 'NO';

    return {
      '#': index + 1,
      'ID Registro': r.id,
      'ID Asignación': r.assignmentId || 'Manual / Libre',
      Fecha: r.date,
      'Hora Programada': r.scheduledTime,
      'Hora Entrada Real': r.checkInTime,
      'Hora Salida Real':
        r.checkOutTime ||
        (r.status === 'incumplido' ? 'Terminada +60m (No cerrada)' : 'En curso'),
      'Duración Efectiva': r.durationMinutes
        ? formatDurationHoursMinutes(r.durationMinutes)
        : formatDurationHoursMinutes(45),
      'Duración Efectiva (min)': r.durationMinutes ?? 45,
      'Duración Planeada': r.plannedDurationMinutes
        ? formatDurationHoursMinutes(r.plannedDurationMinutes)
        : '',
      'Duración Planeada (min)': r.plannedDurationMinutes ?? '',
      'Estado de Sesión': formatRecordStatusForReport(r),
      'Motivo Incumplimiento': formatNonComplianceReasonLabel(r),
      'Hora Cierre Automático (+60m)': r.markedNonCompliantAt || '',
      Puntualidad: formatRecordPunctualityForReport(r),
      'Desviación Puntualidad (min)': r.punctualityDiffMinutes,
      Entrenador: r.trainerName,
      'ID Entrenador': r.trainerId,
      'Empresa Cliente': r.companyName,
      'ID Empresa': r.companyId,
      'Sede Oficial': r.sedeName,
      'ID Sede': r.sedeId,
      'Dirección Sede': r.sedeAddress,
      'Salón / Área': r.locationArea,
      'Modalidad Actividad': ACTIVITY_TYPE_LABELS[normalizeActivityType(r.activityType)],
      'Actividad Impartida': r.activityName,
      'Colaboradores Participantes': r.attendeesCount,
      'Tipo Impartición': r.isVirtual ? 'Clase Virtual / En Línea' : 'Presencial en Sede',
      'Plataforma Virtual': r.isVirtual ? r.virtualPlatform || 'En línea' : 'N/A (Presencial)',
      'Link Reunión Virtual': r.isVirtual ? r.virtualMeetingUrl || '' : '',
      'ID Reunión Virtual': r.isVirtual ? r.virtualMeetingId || '' : '',
      'Código Acceso Virtual': r.isVirtual ? r.virtualPasscode || '' : '',
      'GPS Entrada Latitud': Number(r.checkInGps.lat.toFixed(6)),
      'GPS Entrada Longitud': Number(r.checkInGps.lng.toFixed(6)),
      'Precisión GPS Entrada (m)': Math.round(r.checkInGps.accuracy || 0),
      'Distancia a Sede Entrada (m)': r.isVirtual
        ? 0
        : Math.round(r.checkInGps.distanceToSedeMeters),
      'Distancia Sede Entrada': checkInDistLabel,
      'Validación Geocerca Entrada': checkInGeofenceLabel,
      'Hora Captura GPS Entrada': r.checkInGps.capturedAt || r.checkInTime,
      'GPS Salida Latitud': r.checkOutGps ? Number(r.checkOutGps.lat.toFixed(6)) : '',
      'GPS Salida Longitud': r.checkOutGps ? Number(r.checkOutGps.lng.toFixed(6)) : '',
      'Distancia a Sede Salida (m)': r.checkOutGps
        ? Math.round(r.checkOutGps.distanceToSedeMeters)
        : '',
      'Validación Geocerca Salida': checkOutGeofenceLabel,
      'Hora Captura GPS Salida': r.checkOutGps?.capturedAt || r.checkOutTime || '',
      'Foto Entrada en Sede': r.photoUrl ? 'SÍ (Con sello GPS)' : 'NO',
      'Foto Salida en Sede': exitPhotoLabel,
      'Biometría Facial': r.facialVerification?.verified ? 'VERIFICADA' : 'Verificado',
      'Confianza Biométrica (%)': r.facialVerification?.confidenceScore ?? '',
      'Prueba de Vivacidad': r.facialVerification
        ? r.facialVerification.livenessPassed
          ? 'Aprobada (Anti-suplantación)'
          : 'Revisar'
        : 'N/A',
      'Hora Captura Biométrica': r.facialVerification?.capturedAt || '',
      'ID Biométrico': r.facialVerification?.biometricId || '',
      'Entrenador Autenticado Biometría': r.facialVerification?.trainerName || r.trainerName,
      'Foto Biométrica Facial': r.facialVerification?.facePhotoUrl ? 'SÍ (Adjunta)' : 'NO',
      'Auditado Administración': r.adminVerified ? 'SÍ (Conforme)' : 'Pendiente de revisión',
      'Notas Auditoría / RRHH': r.adminNotes || '',
      'Observaciones de la Sesión': r.observations || '',
    };
  });
}

function buildOverallStatsAndKpiRows(
  records: AttendanceRecord[],
  reportTitle: string,
  periodLabel: string,
  generatedAt: string
) {
  const total = records.length;
  const completed = records.filter((r) => r.status === 'completado').length;
  const inProgress = records.filter((r) => r.status === 'en_curso').length;
  const nonCompliant = records.filter((r) => r.status === 'incumplido').length;
  const onTime = records.filter((r) => r.punctualityStatus === 'a_tiempo').length;
  const early = records.filter((r) => r.punctualityStatus === 'adelantado').length;
  const punctualTotal = onTime + early;
  const late = records.filter((r) => r.punctualityStatus === 'con_retraso').length;
  const punctualityRate = total > 0 ? Math.round((punctualTotal / total) * 100) : 100;

  const totalMinutes = records.reduce((acc, r) => acc + (r.durationMinutes || 45), 0);
  const totalHours = Number((totalMinutes / 60).toFixed(1));
  const totalAttendees = records.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

  const pausasCount = records.filter(
    (r) => normalizeActivityType(r.activityType) === 'pausa_activa'
  ).length;
  const fitnessCount = records.filter(
    (r) => normalizeActivityType(r.activityType) === 'clase_fitness'
  ).length;
  const gimnasioCount = records.filter(
    (r) => normalizeActivityType(r.activityType) === 'gimnasio_corporativo'
  ).length;
  const masajesCount = records.filter(
    (r) => normalizeActivityType(r.activityType) === 'masajes'
  ).length;
  const virtualCount = records.filter((r) => Boolean(r.isVirtual)).length;
  const presencialCount = total - virtualCount;

  const inGeofence = records.filter(
    (r) => Boolean(r.isVirtual) || Boolean(r.checkInGps?.isWithinGeofence)
  ).length;
  const withEntryPhoto = records.filter((r) => Boolean(r.photoUrl)).length;
  const withExitPhoto = records.filter((r) => Boolean(r.exitPhotoUrl)).length;
  const withFacial = records.filter((r) => Boolean(r.facialVerification?.facePhotoUrl)).length;
  const audited = records.filter((r) => Boolean(r.adminVerified)).length;

  const kpiRows: Record<string, CellVal>[] = [
    { Categoría: 'Documento', Indicador: 'Sistema Oficial', Valor: 'BSCW Check', Detalle: reportTitle },
    { Categoría: 'Documento', Indicador: 'Periodo / Filtro del Reporte', Valor: periodLabel, Detalle: 'Sincronizado con Cloud Firestore (/records)' },
    { Categoría: 'Documento', Indicador: 'Fecha y Hora de Generación', Valor: generatedAt, Detalle: 'Certificación oficial de asistencia y evidencia' },
    {
      Categoría: 'KPI Ejecutivo (PDF)',
      Indicador: 'Total Visitas en el Periodo',
      Valor: total,
      Detalle: `${completed} cerradas · ${inProgress} en curso · ${nonCompliant} no cerradas (+60m)`,
    },
    {
      Categoría: 'KPI Ejecutivo (PDF)',
      Indicador: 'Tasa de Puntualidad (%)',
      Valor: `${punctualityRate}%`,
      Detalle: `${punctualTotal} puntuales (${onTime} a tiempo, ${early} anticipadas) · ${late} con retraso`,
    },
    {
      Categoría: 'KPI Ejecutivo (PDF)',
      Indicador: 'Horas Impartidas Efectivas',
      Valor: `${totalHours} hrs`,
      Detalle: `${totalMinutes} minutos acumulados de servicio`,
    },
    {
      Categoría: 'KPI Ejecutivo (PDF)',
      Indicador: 'Colaboradores Beneficiados',
      Valor: totalAttendees,
      Detalle: 'Total de participantes atendidos en sesiones',
    },
    {
      Categoría: 'Estado de Sesiones',
      Indicador: 'Sesiones Completadas y Cerradas',
      Valor: completed,
      Detalle: 'Con registro de entrada y cierre fotográfico de salida',
    },
    {
      Categoría: 'Estado de Sesiones',
      Indicador: 'Sesiones en Curso (Sin Salida)',
      Valor: inProgress,
      Detalle: 'Actualmente activas dentro del tiempo reglamentario',
    },
    {
      Categoría: 'Estado de Sesiones',
      Indicador: 'Sesiones No Cerradas / Incumplidas',
      Valor: nonCompliant,
      Detalle: 'Dadas por terminadas automáticamente (+60 min tras hora fin) o marcadas',
    },
    {
      Categoría: 'Modalidades',
      Indicador: 'Pausas Activas',
      Valor: pausasCount,
      Detalle: 'Sesiones de Pausa Activa',
    },
    {
      Categoría: 'Modalidades',
      Indicador: 'Clases Fitness',
      Valor: fitnessCount,
      Detalle: 'Sesiones de Clase Fitness',
    },
    {
      Categoría: 'Modalidades',
      Indicador: 'Gimnasio Corporativo',
      Valor: gimnasioCount,
      Detalle: 'Sesiones de Gimnasio Corporativo',
    },
    {
      Categoría: 'Modalidades',
      Indicador: 'Masajes Corporativos',
      Valor: masajesCount,
      Detalle: 'Sesiones de Masajes',
    },
    {
      Categoría: 'Modalidades',
      Indicador: 'Impartición Presencial vs. Virtual',
      Valor: `${presencialCount} presenciales / ${virtualCount} virtuales`,
      Detalle: 'Desglose por canal de impartición',
    },
    {
      Categoría: 'Auditoría y Evidencias',
      Indicador: 'Check-ins Validados en Geocerca / Virtual',
      Valor: inGeofence,
      Detalle: `De ${total} registros totales`,
    },
    {
      Categoría: 'Auditoría y Evidencias',
      Indicador: 'Con Fotografía de Entrada (Sello GPS)',
      Valor: withEntryPhoto,
      Detalle: `De ${total} registros totales`,
    },
    {
      Categoría: 'Auditoría y Evidencias',
      Indicador: 'Con Fotografía de Salida (Sello GPS)',
      Valor: withExitPhoto,
      Detalle: `De ${total} registros totales`,
    },
    {
      Categoría: 'Auditoría y Evidencias',
      Indicador: 'Con Validación Biométrica Facial',
      Valor: withFacial,
      Detalle: `De ${total} registros totales`,
    },
    {
      Categoría: 'Auditoría y Evidencias',
      Indicador: 'Registros Auditados por Administración',
      Valor: `${audited} / ${total}`,
      Detalle: 'Validación administrativa / RRHH en plataforma',
    },
  ];

  return {
    stats: {
      total,
      completed,
      inProgress,
      nonCompliant,
      onTime,
      early,
      punctualTotal,
      late,
      punctualityRate,
      totalMinutes,
      totalHours,
      totalAttendees,
      pausasCount,
      fitnessCount,
      gimnasioCount,
      masajesCount,
      virtualCount,
      presencialCount,
      inGeofence,
      withEntryPhoto,
      withExitPhoto,
      withFacial,
      audited,
    },
    kpiRows,
  };
}

/**
 * Builds the unified "Reporte_Ejecutivo" / "Reporte_Bitacora" consolidated worksheet
 * that mirrors the exact top-to-bottom structure of the PDF report on a single printable sheet:
 *   - Corporate Title Banner + Period + Timestamp
 *   - Executive Summary KPI Cards Table
 *   - Section 1: Desempeño y Puntualidad por Entrenador (+ Totals row)
 *   - Section 2: Cobertura en Empresas Cliente (+ Totals row)
 *   - Section 2B: Cobertura Detallada por Sede Corporativa (+ Totals row)
 *   - Section 3: Bitácora Detallada de Visitas, Geocerca y Biometría (all records & columns)
 *   - Official Sign-off & Authorization Block
 */
function buildUnifiedExecutiveWorksheet(params: {
  documentTitle: string;
  documentSubtitle: string;
  periodLabel: string;
  generatedAt: string;
  records: AttendanceRecord[];
  trainerRows: TrainerReportRowSummary[];
  companyRows: CompanyReportRowSummary[];
  sedeRows: SedeReportRowSummary[];
  stats: ReturnType<typeof buildOverallStatsAndKpiRows>['stats'];
}): XLSX.WorkSheet {
  const {
    documentTitle,
    documentSubtitle,
    periodLabel,
    generatedAt,
    records,
    trainerRows,
    companyRows,
    sedeRows,
    stats,
  } = params;

  const aoa: CellVal[][] = [];
  const merges: XLSX.Range[] = [];
  const bannerRows = new Set<number>();
  const MERGE_COLS = 15; // Columns A..P (0..15) for wide headers

  const pushMergedBanner = (text: string) => {
    const r = aoa.length;
    aoa.push([text]);
    merges.push({ s: { r, c: 0 }, e: { r, c: MERGE_COLS } });
    bannerRows.add(r);
  };

  // 1. CORPORATE HEADER BANNER (Matches PDF Header)
  pushMergedBanner(`BSCW CHECK — ${documentTitle.toUpperCase()}`);
  pushMergedBanner(documentSubtitle);
  pushMergedBanner(`Periodo: ${periodLabel}   |   Generado: ${generatedAt}`);
  aoa.push([]);

  // 2. EXECUTIVE KPI SUMMARY BLOCK (Matches the 4+1 KPI Cards in PDF & Dashboard)
  pushMergedBanner('RESUMEN EJECUTIVO DE INDICADORES CLAVE (KPIs)');
  aoa.push([
    'Total Visitas',
    'Cerradas',
    'En Curso',
    'No Cerradas (+60m)',
    'Tasa de Puntualidad',
    'Llegadas Puntuales',
    'Con Retraso',
    'Horas Impartidas',
    'Colaboradores Beneficiados',
    'Pausas Activas',
    'Clases Fitness',
    'Gimnasio Corp.',
    'Masajes',
    'Virtuales',
    'En Geocerca GPS',
    'Auditados Admin',
  ]);
  aoa.push([
    stats.total,
    stats.completed,
    stats.inProgress,
    stats.nonCompliant,
    `${stats.punctualityRate}%`,
    stats.punctualTotal,
    stats.late,
    `${stats.totalHours} hrs`,
    stats.totalAttendees,
    stats.pausasCount,
    stats.fitnessCount,
    stats.gimnasioCount,
    stats.masajesCount,
    stats.virtualCount,
    `${stats.inGeofence}/${stats.total}`,
    `${stats.audited}/${stats.total}`,
  ]);
  aoa.push([]);

  // 3. TABLE 1: 1. DESEMPEÑO Y PUNTUALIDAD POR ENTRENADOR
  pushMergedBanner('1. DESEMPEÑO Y PUNTUALIDAD POR ENTRENADOR');
  aoa.push([
    '#',
    'Entrenador',
    'Correo Electrónico',
    'Teléfono',
    'Especialidades Registradas',
    'Estado',
    'Sesiones',
    'A Tiempo (Exactas)',
    'Anticipadas',
    'Total Puntuales',
    'Con Retraso',
    'No Cerradas (+60m)',
    '% Puntualidad',
    'Horas Impartidas',
    'Colaboradores',
    'Calificación',
  ]);

  if (trainerRows.length === 0) {
    pushMergedBanner('Sin entrenadores registrados en este periodo.');
  } else {
    trainerRows.forEach((tr, idx) => {
      aoa.push([
        idx + 1,
        tr.name,
        tr.email,
        tr.phone,
        tr.specialties,
        tr.activeLabel,
        tr.totalSessions,
        tr.onTimeExact,
        tr.earlyCount,
        tr.punctualTotal,
        tr.lateCount,
        tr.nonCompliantSessions,
        `${tr.punctualityRate}%`,
        `${tr.hoursImparted} hrs`,
        tr.attendeesTotal,
        tr.rating,
      ]);
    });

    // Totals / Averages Row for Table 1
    aoa.push([
      '',
      'TOTAL / PROMEDIO GENERAL',
      '',
      '',
      `${trainerRows.length} entrenador(es)`,
      '',
      stats.total,
      stats.onTime,
      stats.early,
      stats.punctualTotal,
      stats.late,
      stats.nonCompliant,
      `${stats.punctualityRate}%`,
      `${stats.totalHours} hrs`,
      stats.totalAttendees,
      evaluateTrainerRatingLabel(stats.punctualityRate, stats.nonCompliant),
    ]);
  }
  aoa.push([]);

  // 4. TABLE 2: 2. COBERTURA EN EMPRESAS CLIENTE
  pushMergedBanner('2. COBERTURA EN EMPRESAS CLIENTE');
  aoa.push([
    '#',
    'Empresa Cliente',
    'RFC / Identificación Fiscal',
    'Giro / Industria',
    'Sedes Registradas',
    'Total Sesiones',
    'Completadas',
    'No Cerradas',
    'Pausas Activas',
    'Clases Fitness',
    'Gimnasio Corp.',
    'Masajes',
    'Clases Virtuales',
    '% Puntualidad',
    'Horas Impartidas',
    'Colaboradores Beneficiados',
  ]);

  if (companyRows.length === 0) {
    pushMergedBanner('Sin empresas cliente registradas en este periodo.');
  } else {
    const totalCompanySedes = companyRows.reduce((acc, c) => acc + c.sedesCount, 0);
    companyRows.forEach((c, idx) => {
      aoa.push([
        idx + 1,
        c.name,
        c.taxId,
        c.industry,
        c.sedesCount,
        c.totalSessions,
        c.completedSessions,
        c.nonCompliantSessions,
        c.pausasCount,
        c.fitnessCount,
        c.gimnasioCount,
        c.masajesCount,
        c.virtualCount,
        `${c.punctualityRate}%`,
        `${c.hoursImparted} hrs`,
        c.attendeesTotal,
      ]);
    });

    // Totals Row for Table 2
    aoa.push([
      '',
      'TOTAL GENERAL EMPRESAS',
      '',
      `${companyRows.length} empresa(s)`,
      totalCompanySedes,
      stats.total,
      stats.completed,
      stats.nonCompliant,
      stats.pausasCount,
      stats.fitnessCount,
      stats.gimnasioCount,
      stats.masajesCount,
      stats.virtualCount,
      `${stats.punctualityRate}%`,
      `${stats.totalHours} hrs`,
      stats.totalAttendees,
    ]);
  }
  aoa.push([]);

  // 5. TABLE 2B: DESGLOSE DE COBERTURA POR SEDE CORPORATIVA
  if (sedeRows.length > 0) {
    pushMergedBanner('2B. DESGLOSE DE COBERTURA POR SEDE CORPORATIVA');
    aoa.push([
      '#',
      'Empresa Cliente',
      'Sede Oficial',
      'Ciudad',
      'Dirección Oficial',
      'Geocerca (m)',
      'Total Sesiones',
      'Completadas',
      'No Cerradas',
      'Pausas Activas',
      'Clases Fitness',
      'Gimnasio Corp.',
      'Masajes',
      '% Puntualidad',
      'Horas Impartidas',
      'Colaboradores',
    ]);

    sedeRows.forEach((s, idx) => {
      aoa.push([
        idx + 1,
        s.companyName,
        s.sedeName,
        s.city,
        s.address,
        s.geofenceRadiusMeters,
        s.totalSessions,
        s.completedSessions,
        s.nonCompliantSessions,
        s.pausasCount,
        s.fitnessCount,
        s.gimnasioCount,
        s.masajesCount,
        `${s.punctualityRate}%`,
        `${s.hoursImparted} hrs`,
        s.attendeesTotal,
      ]);
    });
    aoa.push([]);
  }

  // 6. TABLE 3: 3. BITÁCORA DETALLADA DE VISITAS, GEOCERCA Y BIOMETRÍA
  pushMergedBanner('3. BITÁCORA DETALLADA DE VISITAS, GEOCERCA Y VALIDACIÓN BIOMÉTRICA');
  const detailedObjects = buildDetailedAttendanceRows(records);
  if (detailedObjects.length === 0) {
    pushMergedBanner(`Sin registros de visitas o evidencias para el periodo seleccionado (${periodLabel}).`);
  } else {
    const detHeaders = Object.keys(detailedObjects[0]);
    aoa.push(detHeaders);
    detailedObjects.forEach((obj) => {
      aoa.push(detHeaders.map((h) => obj[h] ?? ''));
    });
  }
  aoa.push([]);

  // 7. OFFICIAL AUTHORIZATION & SIGNATURES BLOCK (Matches PDF Footer Sign-off)
  pushMergedBanner('VALIDACIÓN, CERTIFICACIÓN Y FIRMAS DE AUTORIZACIÓN OFICIAL');
  aoa.push([
    'Firma de Autorización 1:',
    'Lic. Laura Peñaloza — Dirección de Bienestar Corporativo',
    '',
    '',
    'Estatus:',
    'Validado y Autorizado · BSCW Check',
    '',
    '',
    'Firma de Certificación 2:',
    'Sistemas y Auditoría Operativa BSCW',
    '',
    '',
    'Sello Técnico:',
    'Certificación Geocerca GPS, Sello Fotográfico y Biometría Facial',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = autoFitAoaColumns(aoa, bannerRows, 11, 44);
  return ws;
}

/**
 * Exports the complete Executive Report to Excel (.xlsx) with 100% table and field parity
 * with `PdfReportModal` and `exportExecutiveReportToPdf`:
 *  - Hoja 1 (`Reporte_Ejecutivo`): Documento integral idéntico al PDF (Encabezado, KPIs,
 *    Tabla 1 Entrenadores, Tabla 2 Empresas, Tabla 2B Sedes, Tabla 3 Bitácora Detallada y Firmas).
 *  - Hoja 2 (`1_Desempeno_Entrenadores`): Tabla filtrable de rendimiento y puntualidad por entrenador + Totales.
 *  - Hoja 3 (`2_Cobertura_Empresas`): Tabla filtrable de cobertura y modalidades por empresa cliente + Totales.
 *  - Hoja 4 (`3_Cobertura_Sedes`): Tabla filtrable de visitas y asistencia por cada sede corporativa.
 *  - Hoja 5 (`4_Bitacora_Visitas`): Bitácora completa de todos los registros con GPS, geocerca, biometría, sesiones virtuales y auditoría.
 *  - Hoja 6 (`5_Resumen_KPIs`): Todos los indicadores ejecutivos y de auditoría del periodo.
 */
export function exportExecutiveReportToExcel(
  records: AttendanceRecord[],
  companies: Company[],
  trainers: Trainer[],
  options?: {
    periodLabel?: string;
    filenamePrefix?: string;
  }
): void {
  const periodLabel = options?.periodLabel || 'Reporte Consolidado BSCW Check';
  const prefix = sanitizeExcelFileSegment(
    options?.filenamePrefix || 'Reporte_Ejecutivo_BSCW',
    'Reporte_Ejecutivo_BSCW'
  );
  const todayStamp = new Date().toISOString().slice(0, 10);
  const generatedAt = formatGeneratedAtEs();

  const trainerRows = computeTrainerSummariesForReport(records, trainers);
  const companyRows = computeCompanySummariesForReport(records, companies);
  const sedeRows = computeSedeSummariesForReport(records, companies);
  const { stats, kpiRows } = buildOverallStatsAndKpiRows(
    records,
    'Reporte Ejecutivo de Asistencia y Puntualidad',
    periodLabel,
    generatedAt
  );

  const wb = XLSX.utils.book_new();

  // Sheet 1: Complete unified PDF-mirroring Executive Report
  const wsUnified = buildUnifiedExecutiveWorksheet({
    documentTitle: 'Reporte Ejecutivo de Asistencia y Puntualidad',
    documentSubtitle:
      'Auditoría Corporativa de Asistencia, Puntualidad, Geocerca GPS y Biometría Facial en Sedes',
    periodLabel,
    generatedAt,
    records,
    trainerRows,
    companyRows,
    sedeRows,
    stats,
  });
  XLSX.utils.book_append_sheet(wb, wsUnified, sanitizeSheetName('Reporte_Ejecutivo'));

  // Sheet 2: Table 1 - Desempeño y Puntualidad por Entrenador
  const trainerSheetRows: Record<string, CellVal>[] = trainerRows.map((tr, idx) => ({
    '#': idx + 1,
    Entrenador: tr.name,
    'ID Entrenador': tr.id,
    'Correo Electrónico': tr.email,
    Teléfono: tr.phone,
    Especialidades: tr.specialties,
    Estado: tr.activeLabel,
    Sesiones: tr.totalSessions,
    'Completadas y Cerradas': tr.completedSessions,
    'En Curso': tr.inProgressSessions,
    'No Cerradas (+60m)': tr.nonCompliantSessions,
    'A Tiempo (Exactas)': tr.onTimeExact,
    Anticipadas: tr.earlyCount,
    'Total Puntuales (A Tiempo + Ant.)': tr.punctualTotal,
    'Con Retraso': tr.lateCount,
    '% Puntualidad': `${tr.punctualityRate}%`,
    'Puntualidad (Valor %)': tr.punctualityRate,
    'Horas Impartidas': tr.hoursImparted,
    'Colaboradores Beneficiados': tr.attendeesTotal,
    'Sesiones Virtuales': tr.virtualSessions,
    'En Geocerca / Virtual': tr.inGeofenceCount,
    'Auditados Admin': tr.auditedCount,
    Calificación: tr.rating,
  }));

  if (trainerSheetRows.length > 0) {
    trainerSheetRows.push({
      '#': 'TOTAL',
      Entrenador: 'TOTAL / PROMEDIO GENERAL',
      'ID Entrenador': '',
      'Correo Electrónico': '',
      Teléfono: '',
      Especialidades: `${trainerRows.length} entrenador(es)`,
      Estado: '',
      Sesiones: stats.total,
      'Completadas y Cerradas': stats.completed,
      'En Curso': stats.inProgress,
      'No Cerradas (+60m)': stats.nonCompliant,
      'A Tiempo (Exactas)': stats.onTime,
      Anticipadas: stats.early,
      'Total Puntuales (A Tiempo + Ant.)': stats.punctualTotal,
      'Con Retraso': stats.late,
      '% Puntualidad': `${stats.punctualityRate}%`,
      'Puntualidad (Valor %)': stats.punctualityRate,
      'Horas Impartidas': stats.totalHours,
      'Colaboradores Beneficiados': stats.totalAttendees,
      'Sesiones Virtuales': stats.virtualCount,
      'En Geocerca / Virtual': stats.inGeofence,
      'Auditados Admin': stats.audited,
      Calificación: evaluateTrainerRatingLabel(stats.punctualityRate, stats.nonCompliant),
    });
  }
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(
      trainerSheetRows,
      'Sin entrenadores registrados para este periodo.'
    ),
    sanitizeSheetName('1_Desempeno_Entrenadores')
  );

  // Sheet 3: Table 2 - Cobertura en Empresas Cliente
  const companySheetRows: Record<string, CellVal>[] = companyRows.map((c, idx) => ({
    '#': idx + 1,
    'Empresa Cliente': c.name,
    'ID Empresa': c.id,
    'RFC / Tax ID': c.taxId,
    'Giro / Industria': c.industry,
    'Sedes Registradas': c.sedesCount,
    'Total Sesiones': c.totalSessions,
    'Completadas y Cerradas': c.completedSessions,
    'No Cerradas (+60m)': c.nonCompliantSessions,
    'Pausas Activas': c.pausasCount,
    'Clases Fitness': c.fitnessCount,
    'Gimnasio Corporativo': c.gimnasioCount,
    Masajes: c.masajesCount,
    'Sesiones Virtuales': c.virtualCount,
    '% Puntualidad': `${c.punctualityRate}%`,
    'Horas Impartidas': c.hoursImparted,
    'Colaboradores Beneficiados': c.attendeesTotal,
  }));

  if (companySheetRows.length > 0) {
    const totalCompanySedes = companyRows.reduce((acc, c) => acc + c.sedesCount, 0);
    companySheetRows.push({
      '#': 'TOTAL',
      'Empresa Cliente': 'TOTAL GENERAL EMPRESAS',
      'ID Empresa': '',
      'RFC / Tax ID': '',
      'Giro / Industria': `${companyRows.length} empresa(s)`,
      'Sedes Registradas': totalCompanySedes,
      'Total Sesiones': stats.total,
      'Completadas y Cerradas': stats.completed,
      'No Cerradas (+60m)': stats.nonCompliant,
      'Pausas Activas': stats.pausasCount,
      'Clases Fitness': stats.fitnessCount,
      'Gimnasio Corporativo': stats.gimnasioCount,
      Masajes: stats.masajesCount,
      'Sesiones Virtuales': stats.virtualCount,
      '% Puntualidad': `${stats.punctualityRate}%`,
      'Horas Impartidas': stats.totalHours,
      'Colaboradores Beneficiados': stats.totalAttendees,
    });
  }
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(
      companySheetRows,
      'Sin empresas cliente registradas para este periodo.'
    ),
    sanitizeSheetName('2_Cobertura_Empresas')
  );

  // Sheet 4: Cobertura por Sede Corporativa
  const sedeSheetRows: Record<string, CellVal>[] = sedeRows.map((s, idx) => ({
    '#': idx + 1,
    'Empresa Cliente': s.companyName,
    'Sede Oficial': s.sedeName,
    'ID Sede': s.sedeId,
    Ciudad: s.city,
    'Dirección Oficial': s.address,
    'Radio Geocerca (m)': s.geofenceRadiusMeters,
    'Contacto en Sede': s.contactPerson,
    'Teléfono Contacto': s.contactPhone,
    'Total Sesiones': s.totalSessions,
    Completadas: s.completedSessions,
    'No Cerradas (+60m)': s.nonCompliantSessions,
    'Llegadas Puntuales': s.punctualTotal,
    'Con Retraso': s.lateCount,
    '% Puntualidad': `${s.punctualityRate}%`,
    'Pausas Activas': s.pausasCount,
    'Clases Fitness': s.fitnessCount,
    'Gimnasio Corporativo': s.gimnasioCount,
    Masajes: s.masajesCount,
    'Sesiones Virtuales': s.virtualCount,
    'Horas Impartidas': s.hoursImparted,
    'Colaboradores Beneficiados': s.attendeesTotal,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(sedeSheetRows, 'Sin sedes corporativas registradas.'),
    sanitizeSheetName('3_Cobertura_Sedes')
  );

  // Sheet 5: Table 3 - Bitácora Detallada de Visitas, Geocerca y Biometría
  const detailedRows = buildDetailedAttendanceRows(records);
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(
      detailedRows,
      `Sin registros de visitas para el periodo seleccionado (${periodLabel}).`
    ),
    sanitizeSheetName('4_Bitacora_Visitas')
  );

  // Sheet 6: Resumen Ejecutivo de KPIs y Firmas
  const kpiWithSignOff: Record<string, CellVal>[] = [
    ...kpiRows,
    {
      Categoría: 'Autorización Oficial',
      Indicador: 'Dirección de Bienestar Corporativo',
      Valor: 'Lic. Laura Peñaloza',
      Detalle: 'Validado y Autorizado · BSCW Check',
    },
    {
      Categoría: 'Autorización Oficial',
      Indicador: 'Sistemas y Auditoría Operativa BSCW',
      Valor: 'Certificación Criptográfica y Biométrica',
      Detalle: 'Certificación Geocerca GPS y Biometría Facial',
    },
  ];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(kpiWithSignOff, 'Sin indicadores disponibles.', false),
    sanitizeSheetName('5_Resumen_KPIs')
  );

  triggerExcelBlobDownload(wb, `${prefix}_${todayStamp}.xlsx`);
}

/**
 * Generates and downloads a multi-sheet Excel (.xlsx) workbook for the Bitácora de Evidencias
 * or an individual Acta de Asistencia, containing 100% of the tables, KPIs, and fields
 * generated in `exportEvidenceRecordsToPdf`, `PdfEvidenceLogModal`, and `RecordDetailModal`.
 */
export function buildEvidenceRecordsExcelWorkbook(
  records: AttendanceRecord[],
  options?: {
    filenamePrefix?: string;
    periodLabel?: string;
    title?: string;
    companies?: Company[];
    trainers?: Trainer[];
  }
): void {
  const prefix = sanitizeExcelFileSegment(
    options?.filenamePrefix || 'Bitacora_Evidencias_BSCW',
    'Bitacora_Evidencias_BSCW'
  );
  const todayStamp = new Date().toISOString().slice(0, 10);
  const generatedAt = formatGeneratedAtEs();
  const periodLabel = options?.periodLabel || 'Registros filtrados en Bitácora Oficial';
  const documentTitle =
    options?.title || 'Bitácora Oficial de Evidencias Fotográficas y Asistencia';

  const trainerRows = computeTrainerSummariesForReport(records, options?.trainers || []);
  const companyRows = computeCompanySummariesForReport(records, options?.companies || []);
  const sedeRows = computeSedeSummariesForReport(records, options?.companies || []);
  const { stats, kpiRows } = buildOverallStatsAndKpiRows(
    records,
    documentTitle,
    periodLabel,
    generatedAt
  );

  const wb = XLSX.utils.book_new();

  // Sheet 1: Complete consolidated report matching the PDF document
  const wsUnified = buildUnifiedExecutiveWorksheet({
    documentTitle,
    documentSubtitle:
      'Expediente Oficial de Asistencia, Geocerca GPS, Biometría Facial y Sello Fotográfico',
    periodLabel,
    generatedAt,
    records,
    trainerRows,
    companyRows,
    sedeRows,
    stats,
  });
  XLSX.utils.book_append_sheet(wb, wsUnified, sanitizeSheetName('Reporte_Bitacora'));

  // Sheet 2: Full granular Bitácora de Evidencias (all fields)
  const detailRows = buildDetailedAttendanceRows(records);
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(
      detailRows,
      'Sin registros para los criterios seleccionados en la Bitácora.'
    ),
    sanitizeSheetName('Bitacora_Evidencias')
  );

  // Sheet 3: Trainer Summary for the exported records
  const trainerSummaryObjects: Record<string, CellVal>[] = trainerRows.map((tr, idx) => ({
    '#': idx + 1,
    Entrenador: tr.name,
    'ID Entrenador': tr.id,
    Sesiones: tr.totalSessions,
    Completadas: tr.completedSessions,
    'En Curso': tr.inProgressSessions,
    'No Cerradas (+60m)': tr.nonCompliantSessions,
    'Llegadas Puntuales': tr.punctualTotal,
    'Con Retraso': tr.lateCount,
    '% Puntualidad': `${tr.punctualityRate}%`,
    'Horas Impartidas': tr.hoursImparted,
    'Colaboradores Participantes': tr.attendeesTotal,
    'Sesiones Virtuales': tr.virtualSessions,
    'Auditados Admin': tr.auditedCount,
    Calificación: tr.rating,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(trainerSummaryObjects, 'Sin entrenadores en la selección actual.'),
    sanitizeSheetName('Resumen_Entrenadores')
  );

  // Sheet 4: Company Coverage for the exported records
  const companySummaryObjects: Record<string, CellVal>[] = companyRows.map((c, idx) => ({
    '#': idx + 1,
    'Empresa Cliente': c.name,
    'Giro / Industria': c.industry,
    Sedes: c.sedesCount,
    'Total Sesiones': c.totalSessions,
    Completadas: c.completedSessions,
    'No Cerradas (+60m)': c.nonCompliantSessions,
    'Pausas Activas': c.pausasCount,
    'Clases Fitness': c.fitnessCount,
    'Gimnasio Corporativo': c.gimnasioCount,
    Masajes: c.masajesCount,
    'Sesiones Virtuales': c.virtualCount,
    '% Puntualidad': `${c.punctualityRate}%`,
    'Horas Impartidas': c.hoursImparted,
    'Colaboradores Participantes': c.attendeesTotal,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(companySummaryObjects, 'Sin empresas en la selección actual.'),
    sanitizeSheetName('Resumen_Empresas')
  );

  // Sheet 5: Audit KPIs Summary
  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(kpiRows, 'Sin indicadores disponibles.', false),
    sanitizeSheetName('Resumen_Auditoria')
  );

  triggerExcelBlobDownload(wb, `${prefix}_${todayStamp}.xlsx`);
}

/**
 * Generates and downloads a complete multi-sheet Excel (.xlsx) workbook for the Monthly Class
 * Assignments Role (`Programa Oficial de Asignación y Rol Mensual de Clases`), matching 100%
 * of the tables, trainer profile cards, schedules, normative notes, and signature blocks in
 * `PdfAssignmentsModal` and `exportAssignmentsRoleToPdf`, plus a chronological day-by-day calendar!
 */
export function exportAssignmentsRoleToExcel(
  assignments: ClassAssignment[],
  _companies: Company[],
  trainers: Trainer[],
  activityCatalog: ActivityCatalogItem[] = [],
  options?: {
    selectedMonth?: string; // YYYY-MM
    selectedTrainerId?: string;
    filenamePrefix?: string;
  }
): void {
  const selectedMonth = options?.selectedMonth || new Date().toISOString().slice(0, 7);
  const selectedTrainerId = options?.selectedTrainerId || 'all';
  const [yearStr, monthNumStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const monthIndex = Math.max(0, Math.min(11, (parseInt(monthNumStr, 10) || 1) - 1));
  const monthName = MONTH_NAMES_ES[monthIndex];
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const generatedAt = formatGeneratedAtEs();
  const folioDoc = `BSCW-ROL-${selectedMonth.replace('-', '')}`;

  const targetTrainers =
    selectedTrainerId === 'all'
      ? trainers
      : trainers.filter((t) => t.id === selectedTrainerId);

  const prefix = sanitizeExcelFileSegment(
    options?.filenamePrefix || `Rol_Asignaciones_BSCW_${selectedMonth}`,
    'Rol_Asignaciones_BSCW'
  );

  const countMonthlyOccurrences = (asg: ClassAssignment): number => {
    if (asg.frequency === 'semanal') {
      let count = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, monthIndex, day);
        const dow = d.getDay() === 0 ? 7 : d.getDay();
        if (dow === asg.dayOfWeek) count++;
      }
      return count;
    }
    if (asg.frequency === 'mensual') {
      return asg.dayOfMonth && asg.dayOfMonth <= daysInMonth ? 1 : 0;
    }
    if (asg.frequency === 'fecha_unica') {
      return asg.date && asg.date.startsWith(selectedMonth) ? 1 : 0;
    }
    return 0;
  };

  const formatFrequencyDetail = (asg: ClassAssignment): { main: string; sub: string } => {
    if (asg.frequency === 'semanal') {
      return {
        main: `Cada ${DAY_NAMES_ES[(asg.dayOfWeek || 1) - 1]}`,
        sub: 'Recurrente semanal',
      };
    }
    if (asg.frequency === 'mensual') {
      return {
        main: `Día ${asg.dayOfMonth} de cada mes`,
        sub: 'Recurrente mensual',
      };
    }
    return {
      main: `Fecha única: ${asg.date || 'Programada'}`,
      sub: 'Sesión puntual',
    };
  };

  const formatAssignmentLockState = (asg: ClassAssignment): string => {
    if (asg.nonCompliant || (asg.missedDates && asg.missedDates.length > 0)) {
      return 'Incumplida / Bloqueada';
    }
    if (asg.closed || (asg.completedDates && asg.completedDates.length > 0)) {
      return 'Completada y Cerrada';
    }
    return 'Activa / Programada';
  };

  const aoa: CellVal[][] = [];
  const merges: XLSX.Range[] = [];
  const bannerRows = new Set<number>();
  const MERGE_COLS = 13;

  const pushBanner = (text: string) => {
    const r = aoa.length;
    aoa.push([text]);
    merges.push({ s: { r, c: 0 }, e: { r, c: MERGE_COLS } });
    bannerRows.add(r);
  };

  // Document Cover Header
  pushBanner('BSCW CHECK — PROGRAMA OFICIAL DE ASIGNACIÓN Y ROL MENSUAL DE CLASES');
  pushBanner(
    'Pausas Activas, Clases Fitness, Gimnasio Corporativo, Masajes y Clases Virtuales en Sedes Empresariales'
  );
  pushBanner(
    `Periodo Oficial: ${monthName.toUpperCase()} ${year}   |   Folio Doc: ${folioDoc}   |   Generado: ${generatedAt}`
  );
  aoa.push([]);

  const trainerSummarySheetRows: Record<string, CellVal>[] = [];
  const flatAssignmentRows: Record<string, CellVal>[] = [];
  const calendarDayRows: Record<string, CellVal>[] = [];

  if (targetTrainers.length === 0) {
    pushBanner('No hay entrenadores registrados para mostrar en este rol mensual.');
  } else {
    targetTrainers.forEach((trainer, tIdx) => {
      const trainerAssignments = assignments
        .filter((a) => a.trainerId === trainer.id && a.active !== false)
        .sort((a, b) => a.time.localeCompare(b.time));

      let totalMonthlySessions = 0;
      let totalMonthlyMinutes = 0;
      let totalAttendeesExpected = 0;
      const uniqueCompanies = new Set<string>();
      const uniqueSedes = new Set<string>();

      trainerAssignments.forEach((asg) => {
        uniqueCompanies.add(asg.companyId);
        uniqueSedes.add(asg.sedeId);
        const occ = countMonthlyOccurrences(asg);
        const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
        totalMonthlySessions += occ;
        totalMonthlyMinutes += occ * durMins;
        totalAttendeesExpected += (asg.expectedAttendees || 20) * occ;
      });

      const totalMonthlyHours = Number((totalMonthlyMinutes / 60).toFixed(1));

      trainerSummarySheetRows.push({
        '#': tIdx + 1,
        Entrenador: trainer.name,
        'ID Entrenador': trainer.id,
        Estado: trainer.active !== false ? 'Activo' : 'Inactivo',
        'Correo Electrónico': trainer.email,
        Teléfono: trainer.phone,
        Especialidades: (trainer.specialties || []).join(' · '),
        'Horarios Asignados': trainerAssignments.length,
        'Sesiones en el Mes': totalMonthlySessions,
        'Horas Programadas Mes': totalMonthlyHours,
        'Empresas Atendidas': uniqueCompanies.size,
        'Sedes Atendidas': uniqueSedes.size,
        'Colaboradores Estimados Mes': totalAttendeesExpected,
      });

      // Trainer Profile Header on Sheet 1
      pushBanner(
        `ENTRENADOR OFICIAL #${tIdx + 1}: ${trainer.name.toUpperCase()} (${
          trainer.active !== false ? 'ACTIVO' : 'INACTIVO'
        })`
      );
      aoa.push([
        'Contacto:',
        `${trainer.email} · Tel: ${trainer.phone}`,
        '',
        'Especialidades:',
        (trainer.specialties || []).join(' • '),
        '',
        'Horarios:',
        trainerAssignments.length,
        'Sesiones Mes:',
        totalMonthlySessions,
        'Empresas:',
        uniqueCompanies.size,
        'Colab. Est.:',
        totalAttendeesExpected,
      ]);

      if (trainerAssignments.length === 0) {
        pushBanner('Este entrenador no cuenta con clases asignadas activas en este periodo.');
      } else {
        aoa.push([
          'Día / Frecuencia',
          'Tipo Recurrencia',
          'Horario',
          'Duración',
          'Empresa Cliente',
          'Sede Oficial',
          'Dirección de Sede',
          'Salón / Piso / Área',
          'Modalidad',
          'Actividad Programada',
          'Impartición / Plataforma Virtual',
          'Estado / Notas',
          'Aforo por Sesión',
          'Sesiones en el Mes',
        ]);

        trainerAssignments.forEach((asg) => {
          const normType = normalizeActivityType(asg.activityType);
          const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
          const endHHMM = calculateEndTimeHHMM(asg.time, durMins);
          const freq = formatFrequencyDetail(asg);
          const occ = countMonthlyOccurrences(asg);
          const lockState = formatAssignmentLockState(asg);
          const virtualLabel = asg.isVirtual
            ? `Virtual · ${asg.virtualPlatform || 'En línea'}${
                asg.virtualMeetingUrl ? ` (${asg.virtualMeetingUrl})` : ''
              }`
            : 'Presencial en Sede';

          const statusAndNotes = [lockState, asg.notes ? `"${asg.notes}"` : '']
            .filter(Boolean)
            .join(' — ');

          aoa.push([
            freq.main,
            freq.sub,
            `${asg.time}${endHHMM ? `–${endHHMM}` : ' hrs'}`,
            formatDurationHoursMinutes(durMins),
            asg.companyName,
            asg.sedeName,
            asg.sedeAddress,
            asg.locationArea,
            ACTIVITY_TYPE_LABELS[normType],
            asg.activityName,
            virtualLabel,
            statusAndNotes,
            asg.expectedAttendees || 20,
            occ,
          ]);

          flatAssignmentRows.push({
            Periodo: `${monthName} ${year}`,
            Folio: folioDoc,
            Entrenador: trainer.name,
            'Correo Entrenador': trainer.email,
            'Teléfono Entrenador': trainer.phone,
            'ID Asignación': asg.id,
            'Día / Frecuencia': freq.main,
            'Tipo Recurrencia': freq.sub,
            'Hora Inicio': asg.time,
            'Hora Fin': endHHMM || '',
            'Duración': formatDurationHoursMinutes(durMins),
            'Duración (min)': durMins,
            'Empresa Cliente': asg.companyName,
            'Sede Oficial': asg.sedeName,
            'Dirección Sede': asg.sedeAddress,
            'Salón / Piso': asg.locationArea,
            Modalidad: ACTIVITY_TYPE_LABELS[normType],
            'Actividad Programada': asg.activityName,
            'Tipo Impartición': asg.isVirtual ? 'Clase Virtual / En Línea' : 'Presencial en Sede',
            'Plataforma Virtual': asg.isVirtual ? asg.virtualPlatform || 'En línea' : 'N/A',
            'Link Reunión Virtual': asg.isVirtual ? asg.virtualMeetingUrl || '' : '',
            'ID Reunión Virtual': asg.isVirtual ? asg.virtualMeetingId || '' : '',
            'Código Acceso Virtual': asg.isVirtual ? asg.virtualPasscode || '' : '',
            'Aforo Esperado': asg.expectedAttendees || 20,
            'Sesiones en el Mes': occ,
            'Colaboradores Estimados Mes': (asg.expectedAttendees || 20) * occ,
            'Estado Operativo': lockState,
            Notas: asg.notes || '',
          });
        });
      }

      // Normative & Trainer Signature Block (matches PDF)
      pushBanner(
        'Normativa BSCW Check: Registro de entrada habilitado 30 min antes y hasta 10 min después del inicio con biometría facial y geocerca GPS. Salida fotográfica obligatoria; +60 min tras el término sin cierre se marca automáticamente como No Cerrada.'
      );
      aoa.push([
        'Firma Entrenador(a) Asignado(a):',
        trainer.name,
        '',
        'Aceptación de Rol Mensual',
        '',
        '',
        'Autorización y Validación:',
        'Coordinación de Operaciones · BSCW Check',
      ]);
      aoa.push([]);
    });

    // Build chronological day-by-day calendar for the selected month across targetTrainers
    const targetIds = new Set(targetTrainers.map((t) => t.id));
    const activeTargetAsgs = assignments.filter(
      (a) => targetIds.has(a.trainerId) && a.active !== false
    );

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const d = new Date(year, monthIndex, day);
      const dow = d.getDay() === 0 ? 7 : d.getDay();
      const dayName = DAY_NAMES_ES[dow - 1];

      const dayMatches = activeTargetAsgs
        .filter((asg) => {
          if (asg.frequency === 'semanal') return asg.dayOfWeek === dow;
          if (asg.frequency === 'mensual') return asg.dayOfMonth === day;
          if (asg.frequency === 'fecha_unica') return asg.date === dateStr;
          return false;
        })
        .sort((a, b) => a.time.localeCompare(b.time));

      dayMatches.forEach((asg) => {
        const normType = normalizeActivityType(asg.activityType);
        const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
        const endHHMM = calculateEndTimeHHMM(asg.time, durMins);

        calendarDayRows.push({
          Fecha: dateStr,
          'Día de la Semana': dayName,
          Horario: `${asg.time}${endHHMM ? `–${endHHMM}` : ''}`,
          Duración: formatDurationHoursMinutes(durMins),
          Entrenador: asg.trainerName,
          'Empresa Cliente': asg.companyName,
          'Sede Oficial': asg.sedeName,
          'Dirección Sede': asg.sedeAddress,
          'Salón / Área': asg.locationArea,
          Modalidad: ACTIVITY_TYPE_LABELS[normType],
          'Actividad Programada': asg.activityName,
          'Tipo Impartición': asg.isVirtual ? 'Clase Virtual' : 'Presencial en Sede',
          'Plataforma Virtual': asg.isVirtual ? asg.virtualPlatform || 'En línea' : 'N/A',
          'Link Reunión Virtual': asg.isVirtual ? asg.virtualMeetingUrl || '' : '',
          'Aforo Esperado': asg.expectedAttendees || 20,
          Notas: asg.notes || '',
        });
      });
    }
  }

  const wb = XLSX.utils.book_new();

  const wsRole = XLSX.utils.aoa_to_sheet(aoa);
  wsRole['!merges'] = merges;
  wsRole['!cols'] = autoFitAoaColumns(aoa, bannerRows, 12, 46);
  XLSX.utils.book_append_sheet(wb, wsRole, sanitizeSheetName('Rol_Mensual_Clases'));

  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(
      trainerSummarySheetRows,
      'Sin entrenadores para mostrar en este rol mensual.'
    ),
    sanitizeSheetName('1_Resumen_Entrenadores')
  );

  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(
      flatAssignmentRows,
      'Sin asignaciones activas registradas para este periodo.'
    ),
    sanitizeSheetName('2_Horarios_Asignados')
  );

  XLSX.utils.book_append_sheet(
    wb,
    buildSheetFromObjects(
      calendarDayRows,
      `Sin sesiones programadas en el calendario de ${monthName} ${year}.`
    ),
    sanitizeSheetName('3_Calendario_Del_Mes')
  );

  triggerExcelBlobDownload(wb, `${prefix}.xlsx`);
}
