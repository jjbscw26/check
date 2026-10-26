import { jsPDF } from 'jspdf';
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

export type EvidencePhotoSlot = 'entry' | 'exit' | 'facial';

export interface EvidencePhotoItem {
  slot: EvidencePhotoSlot;
  title: string;
  shortLabel: string;
  url: string;
  capturedAtLabel: string;
  subtitle: string;
}

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

/**
 * Normalizes text for jsPDF's built-in Helvetica (WinAnsi / ISO-8859-1) font so
 * multi-byte symbols (em-dashes, bullets, arrows, checkmarks, emojis) never corrupt
 * or blank out PDF text streams while keeping full Spanish accents (áéíóúñÁÉÍÓÚÑü¿¡).
 */
export function sanitizePdfText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u2014\u2013\u2212]/g, '-')
    .replace(/[\u2022\u25CF\u25AA]/g, '·')
    .replace(/[\u2192\u2794\u27A1]/g, '->')
    .replace(/[\u2713\u2714\u2611]/g, '[OK]')
    .replace(/[\u26A0\u26D4]/g, '[!]')
    .replace(/\u2026/g, '...')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function getEvidencePhotosForRecord(record: AttendanceRecord): EvidencePhotoItem[] {
  const photos: EvidencePhotoItem[] = [];

  if (record.photoUrl && record.photoUrl.trim().length > 0) {
    photos.push({
      slot: 'entry',
      title: 'Foto de Entrada en Sede (Sello Oficial)',
      shortLabel: 'Entrada',
      url: record.photoUrl,
      capturedAtLabel: `${record.date} · ${record.checkInTime}`,
      subtitle: `${record.companyName} — ${record.sedeName} (${record.locationArea})`,
    });
  }

  if (record.exitPhotoUrl && record.exitPhotoUrl.trim().length > 0) {
    photos.push({
      slot: 'exit',
      title: 'Foto de Salida en Sede (Sello Oficial)',
      shortLabel: 'Salida',
      url: record.exitPhotoUrl,
      capturedAtLabel: `${record.date} · ${record.checkOutTime || 'Cierre'}`,
      subtitle: `${record.companyName} — ${record.sedeName} (${record.locationArea})`,
    });
  }

  if (
    record.facialVerification &&
    record.facialVerification.facePhotoUrl &&
    record.facialVerification.facePhotoUrl.trim().length > 0
  ) {
    photos.push({
      slot: 'facial',
      title: `Validación Biométrica Facial (${record.facialVerification.confidenceScore}%)`,
      shortLabel: 'Biometría',
      url: record.facialVerification.facePhotoUrl,
      capturedAtLabel: record.facialVerification.capturedAt || record.checkInTime,
      subtitle: `${record.facialVerification.trainerName || record.trainerName} · ID ${
        record.facialVerification.biometricId || 'BSCW-BIO'
      }`,
    });
  }

  return photos;
}

function sanitizeFileSegment(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'Bitacora_BSCW'
  );
}

function triggerBlobDownload(blob: Blob, filename: string): void {
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

function savePdfDocument(doc: jsPDF, filename: string): void {
  const pdfArrayBuffer = doc.output('arraybuffer');
  const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
  triggerBlobDownload(pdfBlob, filename);
}

function addCorporatePageFooters(doc: jsPDF, marginX: number, footerText: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  const safeFooter = sanitizePdfText(footerText);

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(safeFooter, marginX, pageHeight - 6);
    doc.text(sanitizePdfText(`Página ${p} de ${totalPages}`), pageWidth - marginX, pageHeight - 6, {
      align: 'right',
    });
  }
}

function formatStatusLabel(record: AttendanceRecord): string {
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

function formatPunctualityLabel(record: AttendanceRecord): string {
  if (record.punctualityStatus === 'con_retraso') {
    return `Con retraso (${Math.abs(record.punctualityDiffMinutes)} min)`;
  }
  if (record.punctualityStatus === 'adelantado') {
    return `Anticipado (+${Math.abs(record.punctualityDiffMinutes)} min)`;
  }
  return 'Puntual (A tiempo)';
}

/**
 * Converts any image source (SVG data URL, PNG/JPEG data URL, or CORS URL) into a clean
 * JPEG data URL so jsPDF can embed it reliably without format errors.
 */
async function rasterizeImageForPdf(
  src: string,
  maxWidth = 640,
  maxHeight = 440
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!src || typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.referrerPolicy = 'no-referrer';

    const timeoutId = window.setTimeout(() => {
      resolve(null);
    }, 3500);

    img.onload = () => {
      window.clearTimeout(timeoutId);
      try {
        const naturalW = img.naturalWidth || img.width || 480;
        const naturalH = img.naturalHeight || img.height || 360;
        const scale = Math.min(1, maxWidth / naturalW, maxHeight / naturalH);
        const w = Math.max(40, Math.round(naturalW * scale));
        const h = Math.max(40, Math.round(naturalH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const jpeg = canvas.toDataURL('image/jpeg', 0.84);
        resolve({ dataUrl: jpeg, width: w, height: h });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timeoutId);
      resolve(null);
    };

    img.src = src;
  });
}

/**
 * Downloads a single evidence image as a high-resolution PNG/JPG file.
 */
export async function downloadSingleEvidenceImage(
  src: string,
  filenameBase: string
): Promise<void> {
  const safeBase = sanitizeFileSegment(filenameBase);
  const rasterized = await rasterizeImageForPdf(src, 1600, 1200);
  if (rasterized) {
    const res = await fetch(rasterized.dataUrl);
    const blob = await res.blob();
    triggerBlobDownload(blob, `${safeBase}.jpg`);
    return;
  }

  if (src.startsWith('data:')) {
    const res = await fetch(src);
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('svg') ? 'svg' : 'jpg';
    triggerBlobDownload(blob, `${safeBase}.${ext}`);
  }
}

/**
 * Generates and downloads a real multi-sheet Excel (.xlsx) workbook with full audit
 * and evidence metadata for the provided AttendanceRecord list.
 */
export function exportEvidenceRecordsToExcel(
  records: AttendanceRecord[],
  options?: {
    filenamePrefix?: string;
    periodLabel?: string;
  }
): void {
  const prefix = sanitizeFileSegment(options?.filenamePrefix || 'Bitacora_Evidencias_BSCW');
  const todayStamp = new Date().toISOString().slice(0, 10);

  const detailRows = records.map((r, index) => ({
    '#': index + 1,
    'ID Registro': r.id,
    'ID Asignación': r.assignmentId || 'Manual / Libre',
    Fecha: r.date,
    'Hora Programada': r.scheduledTime,
    'Hora Entrada Real': r.checkInTime,
    'Hora Salida Real':
      r.checkOutTime ||
      (r.status === 'incumplido' ? 'TERMINADA (+60m - NO CERRADA)' : 'En curso'),
    'Duración Efectiva': r.durationMinutes ? formatDurationHoursMinutes(r.durationMinutes) : '',
    'Duración Planeada': r.plannedDurationMinutes
      ? formatDurationHoursMinutes(r.plannedDurationMinutes)
      : '',
    'Duración Efectiva (min)': r.durationMinutes ?? '',
    'Duración Planeada (min)': r.plannedDurationMinutes ?? '',
    'Estado de Sesión': formatStatusLabel(r),
    Puntualidad: formatPunctualityLabel(r),
    'Desviación (min)': r.punctualityDiffMinutes,
    Entrenador: r.trainerName,
    'ID Entrenador': r.trainerId,
    Empresa: r.companyName,
    Sede: r.sedeName,
    'Dirección Sede': r.sedeAddress,
    'Salón / Área': r.locationArea,
    'Tipo Actividad': ACTIVITY_TYPE_LABELS[normalizeActivityType(r.activityType)],
    Actividad: r.activityName,
    'Colaboradores Asistentes': r.attendeesCount,
    'GPS Entrada Latitud': Number(r.checkInGps.lat.toFixed(6)),
    'GPS Entrada Longitud': Number(r.checkInGps.lng.toFixed(6)),
    'Distancia a Sede (m)': Math.round(r.checkInGps.distanceToSedeMeters),
    'En Geocerca': r.checkInGps.isWithinGeofence ? 'SÍ' : 'NO',
    'GPS Salida': r.checkOutGps
      ? `${r.checkOutGps.lat.toFixed(6)}, ${r.checkOutGps.lng.toFixed(6)}`
      : 'N/A',
    'Foto Entrada en Sede': r.photoUrl ? 'SÍ (Con sello)' : 'NO',
    'Foto Salida en Sede': r.exitPhotoUrl ? 'SÍ (Con sello)' : 'NO',
    'Biometría Facial': r.facialVerification?.verified ? 'VERIFICADA' : 'N/A',
    'Confianza Facial (%)': r.facialVerification?.confidenceScore ?? '',
    'ID Biométrico': r.facialVerification?.biometricId || '',
    'Auditado Admin': r.adminVerified ? 'SÍ' : 'NO',
    'Notas Auditoría Admin': r.adminNotes || '',
    Observaciones: r.observations || '',
  }));

  const total = records.length;
  const completed = records.filter((r) => r.status === 'completado').length;
  const inProgress = records.filter((r) => r.status === 'en_curso').length;
  const nonCompliant = records.filter((r) => r.status === 'incumplido').length;
  const onTimeOrEarly = records.filter(
    (r) => r.punctualityStatus === 'a_tiempo' || r.punctualityStatus === 'adelantado'
  ).length;
  const late = records.filter((r) => r.punctualityStatus === 'con_retraso').length;
  const punctualityRate = total > 0 ? Math.round((onTimeOrEarly / total) * 100) : 100;
  const inGeofence = records.filter((r) => r.checkInGps.isWithinGeofence).length;
  const withEntryPhoto = records.filter((r) => Boolean(r.photoUrl)).length;
  const withExitPhoto = records.filter((r) => Boolean(r.exitPhotoUrl)).length;
  const withFacial = records.filter((r) => Boolean(r.facialVerification?.facePhotoUrl)).length;
  const audited = records.filter((r) => r.adminVerified).length;
  const totalAttendees = records.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);
  const totalHours = Number(
    (records.reduce((acc, r) => acc + (r.durationMinutes || 45), 0) / 60).toFixed(1)
  );

  const summaryRows = [
    { Indicador: 'Sistema', Valor: 'BSCW Check - Bitácora Oficial de Evidencias' },
    {
      Indicador: 'Filtro / Periodo Exportado',
      Valor: options?.periodLabel || 'Registros filtrados en Bitácora',
    },
    {
      Indicador: 'Fecha de Generación',
      Valor: `${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX', {
        hour12: false,
      })}`,
    },
    { Indicador: 'Total de Registros en Bitácora', Valor: total },
    { Indicador: 'Sesiones Completadas y Cerradas', Valor: completed },
    { Indicador: 'Sesiones en Curso', Valor: inProgress },
    { Indicador: 'Sesiones No Cerradas (Terminadas +60m)', Valor: nonCompliant },
    { Indicador: 'Llegadas Puntuales o Anticipadas', Valor: onTimeOrEarly },
    { Indicador: 'Llegadas con Retraso', Valor: late },
    { Indicador: 'Tasa de Puntualidad (%)', Valor: `${punctualityRate}%` },
    { Indicador: 'Check-ins dentro de Geocerca GPS', Valor: inGeofence },
    { Indicador: 'Con Foto de Entrada en Sede', Valor: withEntryPhoto },
    { Indicador: 'Con Foto de Salida en Sede', Valor: withExitPhoto },
    { Indicador: 'Con Validación Biométrica Facial', Valor: withFacial },
    { Indicador: 'Registros Auditados por Administración', Valor: audited },
    { Indicador: 'Total Colaboradores Participantes', Valor: totalAttendees },
    { Indicador: 'Horas Efectivas Impartidas', Valor: totalHours },
  ];

  const wb = XLSX.utils.book_new();

  const wsDetail =
    detailRows.length > 0
      ? XLSX.utils.json_to_sheet(detailRows)
      : XLSX.utils.aoa_to_sheet([['Sin registros para los criterios seleccionados']]);

  wsDetail['!cols'] = [
    { wch: 5 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
    { wch: 15 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 26 },
    { wch: 24 },
    { wch: 15 },
    { wch: 24 },
    { wch: 15 },
    { wch: 26 },
    { wch: 24 },
    { wch: 34 },
    { wch: 24 },
    { wch: 16 },
    { wch: 26 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 13 },
    { wch: 24 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 14 },
    { wch: 32 },
    { wch: 42 },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 44 }];

  XLSX.utils.book_append_sheet(wb, wsDetail, 'Bitacora_Evidencias');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Auditoria');

  const wbBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `${prefix}_${todayStamp}.xlsx`);
}

/**
 * Helper that renders individual AttendanceRecord cards (with optional embedded photos)
 * into an existing jsPDF document starting at cursorY, returning the updated cursorY.
 */
async function renderEvidenceCardsIntoPdf(
  doc: jsPDF,
  records: AttendanceRecord[],
  startCursorY: number,
  marginX: number,
  includePhotos: boolean
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = startCursorY;

  if (records.length === 0) {
    if (cursorY + 24 > pageHeight - 16) {
      doc.addPage();
      cursorY = 14;
    }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, cursorY, contentWidth, 18, 2, 2, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.text(
      sanitizePdfText(
        'Sin registros de visitas o evidencias para el periodo/filtro seleccionado.'
      ),
      pageWidth / 2,
      cursorY + 10.5,
      { align: 'center' }
    );
    return cursorY + 22;
  }

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];

    const entryImg =
      includePhotos && rec.photoUrl ? await rasterizeImageForPdf(rec.photoUrl, 520, 360) : null;
    const exitImg =
      includePhotos && rec.exitPhotoUrl
        ? await rasterizeImageForPdf(rec.exitPhotoUrl, 520, 360)
        : null;
    const faceImg =
      includePhotos && rec.facialVerification?.facePhotoUrl
        ? await rasterizeImageForPdf(rec.facialVerification.facePhotoUrl, 360, 360)
        : null;

    const hasAnyRasterPhoto = Boolean(entryImg || exitImg || faceImg);
    const obsText = sanitizePdfText(
      [
        rec.observations ? `Obs: ${rec.observations}` : '',
        rec.adminNotes ? `Auditoría: ${rec.adminNotes}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    );

    const wrappedObs = obsText
      ? (doc.splitTextToSize(obsText, contentWidth - 8) as string[]).slice(0, 3)
      : [];

    const photoSectionHeight = hasAnyRasterPhoto ? 44 : 0;
    const obsSectionHeight = wrappedObs.length > 0 ? 4 + wrappedObs.length * 3.6 : 0;
    const cardHeight = 33 + photoSectionHeight + obsSectionHeight;

    if (cursorY + cardHeight > pageHeight - 14) {
      doc.addPage();
      cursorY = 14;
    }

    // Card container
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, cursorY, contentWidth, cardHeight, 2, 2, 'FD');

    // Card top header strip
    if (rec.status === 'incumplido') {
      doc.setFillColor(254, 242, 242);
    } else if (rec.status === 'completado') {
      doc.setFillColor(248, 250, 252);
    } else {
      doc.setFillColor(255, 251, 235);
    }
    doc.roundedRect(marginX + 0.4, cursorY + 0.4, contentWidth - 0.8, 8.5, 1.8, 1.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(15, 23, 42);
    doc.text(
      sanitizePdfText(
        `${i + 1}. ${rec.date} · Prog ${rec.scheduledTime} | ${rec.companyName} - ${rec.sedeName}`
      ).slice(0, 88),
      marginX + 3.5,
      cursorY + 5.8
    );

    // Status label on top right
    if (rec.status === 'incumplido') {
      doc.setTextColor(190, 18, 60);
    } else if (rec.status === 'completado') {
      doc.setTextColor(21, 128, 61);
    } else {
      doc.setTextColor(180, 83, 9);
    }
    doc.setFontSize(7.5);
    doc.text(sanitizePdfText(formatStatusLabel(rec)), pageWidth - marginX - 3.5, cursorY + 5.8, {
      align: 'right',
    });

    // Metadata grid rows
    const metaY = cursorY + 13.5;
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);

    const col1X = marginX + 3.5;
    const col2X = marginX + contentWidth * 0.52;

    doc.setFont('helvetica', 'bold');
    doc.text('Entrenador:', col1X, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(
      sanitizePdfText(`${rec.trainerName} (${rec.locationArea})`).slice(0, 50),
      col1X + 18,
      metaY
    );

    doc.setFont('helvetica', 'bold');
    doc.text('Actividad:', col2X, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(
      sanitizePdfText(`${rec.activityName} · ${rec.attendeesCount} asistentes`).slice(0, 46),
      col2X + 16,
      metaY
    );

    const row2Y = metaY + 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Horarios:', col1X, row2Y);
    doc.setFont('helvetica', 'normal');
    doc.text(
      sanitizePdfText(
        `Entrada ${rec.checkInTime} · Salida ${
          rec.checkOutTime ||
          (rec.status === 'incumplido' ? 'Terminada +60m (No cerrada)' : 'En curso')
        }${rec.durationMinutes ? ` (${formatDurationHoursMinutes(rec.durationMinutes, true)})` : ''}`
      ).slice(0, 56),
      col1X + 15,
      row2Y
    );

    doc.setFont('helvetica', 'bold');
    doc.text('Puntualidad:', col2X, row2Y);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizePdfText(formatPunctualityLabel(rec)), col2X + 19, row2Y);

    const row3Y = row2Y + 5;
    doc.setFont('helvetica', 'bold');
    doc.text('GPS Entrada:', col1X, row3Y);
    doc.setFont('helvetica', 'normal');
    doc.text(
      sanitizePdfText(
        `${rec.checkInGps.lat.toFixed(5)}, ${rec.checkInGps.lng.toFixed(5)} (${formatDistance(
          rec.checkInGps.distanceToSedeMeters
        )} · ${rec.checkInGps.isWithinGeofence ? 'En geocerca' : 'Fuera de rango'})`
      ).slice(0, 52),
      col1X + 20,
      row3Y
    );

    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText('Auditoría:'), col2X, row3Y);
    doc.setFont('helvetica', 'normal');
    doc.text(
      sanitizePdfText(
        `${rec.adminVerified ? 'Verificado Admin' : 'Pendiente revisión'}${
          rec.facialVerification ? ` · Rostro ${rec.facialVerification.confidenceScore}%` : ''
        } · ID ${rec.id.slice(0, 14)}`
      ).slice(0, 48),
      col2X + 16,
      row3Y
    );

    let innerY = row3Y + 4;

    if (wrappedObs.length > 0) {
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.2);
      doc.text(wrappedObs, col1X, innerY + 3);
      innerY += obsSectionHeight;
    }

    if (hasAnyRasterPhoto) {
      const slotGap = 3;
      const boxW = (contentWidth - 7 - slotGap * 2) / 3;
      const boxH = 35;
      const boxTop = innerY + 5;

      const slots: {
        label: string;
        img: { dataUrl: string; width: number; height: number } | null;
        emptyMsg: string;
      }[] = [
        {
          label: '1. Foto Entrada en Sede',
          img: entryImg,
          emptyMsg: 'Sin foto de entrada',
        },
        {
          label: '2. Foto Salida en Sede',
          img: exitImg,
          emptyMsg:
            rec.status === 'en_curso' ? 'Sesión en curso (pendiente)' : 'Sin foto de salida',
        },
        {
          label: rec.facialVerification
            ? `3. Biometría Facial (${rec.facialVerification.confidenceScore}%)`
            : '3. Biometría Facial',
          img: faceImg,
          emptyMsg: 'Sin captura biométrica',
        },
      ];

      slots.forEach((slot, sIdx) => {
        const sx = col1X + sIdx * (boxW + slotGap);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(30, 41, 59);
        doc.text(sanitizePdfText(slot.label), sx, boxTop - 1.2);

        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(sx, boxTop, boxW, boxH, 1.2, 1.2, slot.img ? 'FD' : 'D');

        if (slot.img) {
          const ratio = Math.min((boxW - 1.6) / slot.img.width, (boxH - 1.6) / slot.img.height);
          const drawW = slot.img.width * ratio;
          const drawH = slot.img.height * ratio;
          const drawX = sx + (boxW - drawW) / 2;
          const drawY = boxTop + (boxH - drawH) / 2;
          try {
            doc.addImage(slot.img.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);
          } catch {
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7);
            doc.text('Evidencia adjunta', sx + boxW / 2, boxTop + boxH / 2, {
              align: 'center',
            });
          }
        } else {
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(sx, boxTop, boxW, boxH, 1.2, 1.2, 'FD');
          doc.setTextColor(148, 163, 184);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text(sanitizePdfText(slot.emptyMsg), sx + boxW / 2, boxTop + boxH / 2, {
            align: 'center',
          });
        }
      });
    }

    cursorY += cardHeight + 4;
  }

  return cursorY;
}

/**
 * Generates and downloads a real PDF (.pdf) file for the Bitácora de Evidencias,
 * including corporate header, KPI summary, audit fields, GPS coordinates, and
 * embedded evidence photographs (Entrada, Salida, Biometría Facial).
 */
export async function exportEvidenceRecordsToPdf(
  records: AttendanceRecord[],
  options?: {
    title?: string;
    subtitle?: string;
    filenamePrefix?: string;
    includePhotos?: boolean;
  }
): Promise<void> {
  const includePhotos = options?.includePhotos !== false;
  const title = sanitizePdfText(
    options?.title || 'Bitácora Oficial de Evidencias y Asistencia'
  );
  const subtitle = sanitizePdfText(
    options?.subtitle || `Total exportado: ${records.length} registro(s) auditables en Firestore`
  );
  const prefix = sanitizeFileSegment(options?.filenamePrefix || 'Bitacora_Evidencias_BSCW');
  const todayStamp = new Date().toISOString().slice(0, 10);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, cursorY, contentWidth, 22, 2.5, 2.5, 'F');
  doc.setFillColor(220, 38, 38);
  doc.roundedRect(marginX + 4, cursorY + 4, 14, 14, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('BSCW', marginX + 11, cursorY + 12.2, { align: 'center' });

  doc.setFontSize(12.5);
  doc.text(title.slice(0, 68), marginX + 22, cursorY + 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(8.2);
  doc.text(subtitle.slice(0, 95), marginX + 22, cursorY + 15);

  const genTimestamp = sanitizePdfText(
    `Generado: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString(
      'es-MX',
      { hour12: false }
    )}`
  );
  doc.setFontSize(7.5);
  doc.text(genTimestamp, pageWidth - marginX - 4, cursorY + 19, { align: 'right' });

  cursorY += 26;

  // KPI Summary Strip
  const total = records.length;
  const completed = records.filter((r) => r.status === 'completado').length;
  const nonCompliant = records.filter((r) => r.status === 'incumplido').length;
  const onTimeOrEarly = records.filter(
    (r) => r.punctualityStatus === 'a_tiempo' || r.punctualityStatus === 'adelantado'
  ).length;
  const punctualityRate = total > 0 ? Math.round((onTimeOrEarly / total) * 100) : 100;
  const totalAttendees = records.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);
  const withPhotosCount = records.filter(
    (r) => Boolean(r.photoUrl || r.exitPhotoUrl || r.facialVerification?.facePhotoUrl)
  ).length;

  const kpis = [
    { label: 'Registros', value: String(total) },
    {
      label: 'Completadas',
      value: `${completed}${nonCompliant > 0 ? ` (${nonCompliant} inc.)` : ''}`,
    },
    { label: 'Puntualidad', value: `${punctualityRate}%` },
    { label: 'Participantes', value: String(totalAttendees) },
    { label: 'Con Evidencia Foto', value: String(withPhotosCount) },
  ];

  const kpiGap = 2.5;
  const kpiW = (contentWidth - kpiGap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (kpiW + kpiGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cursorY, kpiW, 13, 1.5, 1.5, 'FD');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(sanitizePdfText(kpi.label.toUpperCase()), x + 2.5, cursorY + 4.8);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(sanitizePdfText(kpi.value), x + 2.5, cursorY + 10.5);
  });

  cursorY += 17;

  await renderEvidenceCardsIntoPdf(doc, records, cursorY, marginX, includePhotos);

  addCorporatePageFooters(
    doc,
    marginX,
    'BSCW Check · Certificación de Asistencia, Geocerca GPS y Evidencia Fotográfica Sincronizada en Firestore'
  );

  savePdfDocument(doc, `${prefix}_${todayStamp}.pdf`);
}

/**
 * Generates and downloads the complete Executive Report PDF (KPIs + Section 1 Trainer Performance
 * + Section 2 Client Company Coverage + Section 3 Detailed Visit & Evidence Log + Signatures).
 */
export async function exportExecutiveReportToPdf(
  records: AttendanceRecord[],
  companies: Company[],
  trainers: Trainer[],
  options?: {
    periodLabel?: string;
    filenamePrefix?: string;
    includePhotos?: boolean;
  }
): Promise<void> {
  const includePhotos = options?.includePhotos !== false;
  const periodLabel = sanitizePdfText(options?.periodLabel || 'Reporte Consolidado BSCW Check');
  const prefix = sanitizeFileSegment(options?.filenamePrefix || 'Reporte_Ejecutivo_BSCW');
  const todayStamp = new Date().toISOString().slice(0, 10);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, cursorY, contentWidth, 23, 2.5, 2.5, 'F');
  doc.setFillColor(220, 38, 38);
  doc.roundedRect(marginX + 4, cursorY + 4.5, 14, 14, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('BSCW', marginX + 11, cursorY + 13, { align: 'center' });

  doc.setFontSize(13);
  doc.text(
    sanitizePdfText('Reporte Ejecutivo de Asistencia y Puntualidad'),
    marginX + 22,
    cursorY + 9.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(8.5);
  doc.text(periodLabel.slice(0, 88), marginX + 22, cursorY + 15.2);

  const genTimestamp = sanitizePdfText(
    `Generado: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString(
      'es-MX',
      { hour12: false }
    )}`
  );
  doc.setFontSize(7.5);
  doc.text(genTimestamp, pageWidth - marginX - 4, cursorY + 19.5, { align: 'right' });

  cursorY += 27;

  // 4 Executive KPI Cards
  const total = records.length;
  const onTime = records.filter((r) => r.punctualityStatus === 'a_tiempo').length;
  const early = records.filter((r) => r.punctualityStatus === 'adelantado').length;
  const punctualityRate = total > 0 ? Math.round(((onTime + early) / total) * 100) : 100;
  const totalMinutes = records.reduce((acc, r) => acc + (r.durationMinutes || 45), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalAttendees = records.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

  const kpis = [
    { label: 'Total Visitas', value: String(total), accent: false },
    { label: 'Tasa de Puntualidad', value: `${punctualityRate}%`, accent: true },
    { label: 'Horas Impartidas', value: `${totalHours} hrs`, accent: false },
    { label: 'Colaboradores', value: String(totalAttendees), accent: false },
  ];

  const kpiGap = 3;
  const kpiW = (contentWidth - kpiGap * 3) / 4;
  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (kpiW + kpiGap);
    if (kpi.accent) {
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(254, 202, 202);
    } else {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
    }
    doc.roundedRect(x, cursorY, kpiW, 14, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(kpi.accent ? 185 : 100, kpi.accent ? 28 : 116, kpi.accent ? 28 : 139);
    doc.text(sanitizePdfText(kpi.label.toUpperCase()), x + kpiW / 2, cursorY + 5, {
      align: 'center',
    });

    doc.setFontSize(11);
    doc.setTextColor(kpi.accent ? 220 : 15, kpi.accent ? 38 : 23, kpi.accent ? 38 : 42);
    doc.text(sanitizePdfText(kpi.value), x + kpiW / 2, cursorY + 11.2, { align: 'center' });
  });

  cursorY += 19;

  // Section 1: Desempeño y Puntualidad por Entrenador
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText('1. DESEMPEÑO Y PUNTUALIDAD POR ENTRENADOR'),
    marginX,
    cursorY
  );
  doc.setDrawColor(220, 38, 38);
  doc.line(marginX, cursorY + 1.5, pageWidth - marginX, cursorY + 1.5);
  cursorY += 4;

  // Table 1 Header
  const t1Cols = [
    { label: 'Entrenador', x: marginX + 2.5, align: 'left' as const },
    { label: 'Sesiones', x: marginX + 78, align: 'center' as const },
    { label: 'A Tiempo', x: marginX + 98, align: 'center' as const },
    { label: 'Retrasos', x: marginX + 118, align: 'center' as const },
    { label: '% Puntual.', x: marginX + 139, align: 'center' as const },
    { label: 'Horas', x: marginX + 159, align: 'center' as const },
    { label: 'Calificación', x: pageWidth - marginX - 2.5, align: 'right' as const },
  ];

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, cursorY, contentWidth, 6.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85);
  t1Cols.forEach((c) => {
    doc.text(sanitizePdfText(c.label.toUpperCase()), c.x, cursorY + 4.5, { align: c.align });
  });
  cursorY += 6.8;

  if (trainers.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(marginX, cursorY, contentWidth, 7, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Sin entrenadores registrados.', marginX + 3, cursorY + 4.6);
    cursorY += 7;
  } else {
    trainers.forEach((tr, idx) => {
      if (cursorY + 7 > pageHeight - 16) {
        doc.addPage();
        cursorY = 14;
      }
      const trRecs = records.filter((r) => r.trainerId === tr.id);
      const trTotal = trRecs.length;
      const trOnTime = trRecs.filter(
        (r) => r.punctualityStatus === 'a_tiempo' || r.punctualityStatus === 'adelantado'
      ).length;
      const trLate = trRecs.filter((r) => r.punctualityStatus === 'con_retraso').length;
      const trRate = trTotal > 0 ? Math.round((trOnTime / trTotal) * 100) : 100;
      const trHours = (
        trRecs.reduce((acc, r) => acc + (r.durationMinutes || 45), 0) / 60
      ).toFixed(1);
      const rating = trRate >= 95 ? 'Excelente' : trRate >= 80 ? 'Destacado' : 'Revisión';

      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, cursorY, contentWidth, 6.6, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizePdfText(tr.name).slice(0, 42), t1Cols[0].x, cursorY + 4.4);

      doc.setFont('helvetica', 'normal');
      doc.text(String(trTotal), t1Cols[1].x, cursorY + 4.4, { align: 'center' });

      doc.setTextColor(21, 128, 61);
      doc.setFont('helvetica', 'bold');
      doc.text(String(trOnTime), t1Cols[2].x, cursorY + 4.4, { align: 'center' });

      doc.setTextColor(trLate > 0 ? 220 : 100, trLate > 0 ? 38 : 116, trLate > 0 ? 38 : 139);
      doc.text(String(trLate), t1Cols[3].x, cursorY + 4.4, { align: 'center' });

      doc.setTextColor(15, 23, 42);
      doc.text(`${trRate}%`, t1Cols[4].x, cursorY + 4.4, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.text(`${trHours} h`, t1Cols[5].x, cursorY + 4.4, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.text(sanitizePdfText(rating), t1Cols[6].x, cursorY + 4.4, { align: 'right' });

      cursorY += 6.6;
    });
  }

  cursorY += 7;

  // Section 2: Cobertura en Empresas Cliente
  if (cursorY + 26 > pageHeight - 16) {
    doc.addPage();
    cursorY = 14;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfText('2. COBERTURA EN EMPRESAS CLIENTE'), marginX, cursorY);
  doc.setDrawColor(220, 38, 38);
  doc.line(marginX, cursorY + 1.5, pageWidth - marginX, cursorY + 1.5);
  cursorY += 4;

  const t2Cols = [
    { label: 'Empresa', x: marginX + 2.5, align: 'left' as const },
    { label: 'Giro', x: marginX + 54, align: 'left' as const },
    { label: 'Sesiones', x: marginX + 96, align: 'center' as const },
    { label: 'Pausas', x: marginX + 114, align: 'center' as const },
    { label: 'Fitness', x: marginX + 131, align: 'center' as const },
    { label: 'Gimnasio', x: marginX + 149, align: 'center' as const },
    { label: 'Masajes', x: marginX + 166, align: 'center' as const },
    { label: 'Colab.', x: pageWidth - marginX - 2.5, align: 'right' as const },
  ];

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, cursorY, contentWidth, 6.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(51, 65, 85);
  t2Cols.forEach((c) => {
    doc.text(sanitizePdfText(c.label.toUpperCase()), c.x, cursorY + 4.5, { align: c.align });
  });
  cursorY += 6.8;

  if (companies.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(marginX, cursorY, contentWidth, 7, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Sin empresas registradas.', marginX + 3, cursorY + 4.6);
    cursorY += 7;
  } else {
    companies.forEach((comp, idx) => {
      if (cursorY + 7 > pageHeight - 16) {
        doc.addPage();
        cursorY = 14;
      }
      const cRecs = records.filter((r) => r.companyId === comp.id);
      const cTotal = cRecs.length;
      const cPausas = cRecs.filter(
        (r) => normalizeActivityType(r.activityType) === 'pausa_activa'
      ).length;
      const cFitness = cRecs.filter(
        (r) => normalizeActivityType(r.activityType) === 'clase_fitness'
      ).length;
      const cGimnasio = cRecs.filter(
        (r) => normalizeActivityType(r.activityType) === 'gimnasio_corporativo'
      ).length;
      const cMasajes = cRecs.filter(
        (r) => normalizeActivityType(r.activityType) === 'masajes'
      ).length;
      const cAttendees = cRecs.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);

      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, cursorY, contentWidth, 6.6, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizePdfText(comp.name).slice(0, 30), t2Cols[0].x, cursorY + 4.4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(sanitizePdfText(comp.industry || '').slice(0, 24), t2Cols[1].x, cursorY + 4.4);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(String(cTotal), t2Cols[2].x, cursorY + 4.4, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(String(cPausas), t2Cols[3].x, cursorY + 4.4, { align: 'center' });
      doc.text(String(cFitness), t2Cols[4].x, cursorY + 4.4, { align: 'center' });
      doc.text(String(cGimnasio), t2Cols[5].x, cursorY + 4.4, { align: 'center' });
      doc.text(String(cMasajes), t2Cols[6].x, cursorY + 4.4, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.text(String(cAttendees), t2Cols[7].x, cursorY + 4.4, { align: 'right' });

      cursorY += 6.6;
    });
  }

  cursorY += 7;

  // Section 3: Bitácora Detallada de Visitas y Evidencias
  if (cursorY + 24 > pageHeight - 16) {
    doc.addPage();
    cursorY = 14;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText('3. BITÁCORA DETALLADA DE VISITAS, GEOCERCA Y BIOMETRÍA'),
    marginX,
    cursorY
  );
  doc.setDrawColor(220, 38, 38);
  doc.line(marginX, cursorY + 1.5, pageWidth - marginX, cursorY + 1.5);
  cursorY += 4.5;

  cursorY = await renderEvidenceCardsIntoPdf(doc, records, cursorY, marginX, includePhotos);

  // Official Sign-off Block
  if (cursorY + 24 > pageHeight - 14) {
    doc.addPage();
    cursorY = 16;
  } else {
    cursorY += 4;
  }

  const sigWidth = (contentWidth - 16) / 2;
  doc.setDrawColor(148, 163, 184);
  doc.line(marginX + 4, cursorY + 10, marginX + 4 + sigWidth, cursorY + 10);
  doc.line(
    pageWidth - marginX - 4 - sigWidth,
    cursorY + 10,
    pageWidth - marginX - 4,
    cursorY + 10
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText('Dirección de Bienestar Corporativo'),
    marginX + 4 + sigWidth / 2,
    cursorY + 14.5,
    { align: 'center' }
  );
  doc.text(
    sanitizePdfText('Sistemas y Auditoría Operativa BSCW'),
    pageWidth - marginX - 4 - sigWidth / 2,
    cursorY + 14.5,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    sanitizePdfText('Validado y Autorizado · BSCW Check'),
    marginX + 4 + sigWidth / 2,
    cursorY + 18.2,
    { align: 'center' }
  );
  doc.text(
    sanitizePdfText('Certificación Geocerca GPS y Biometría Facial'),
    pageWidth - marginX - 4 - sigWidth / 2,
    cursorY + 18.2,
    { align: 'center' }
  );

  addCorporatePageFooters(
    doc,
    marginX,
    'BSCW Check · Reporte Oficial de Auditoría, Asistencia y Evidencia Fotográfica'
  );

  savePdfDocument(doc, `${prefix}_${todayStamp}.pdf`);
}

/**
 * Generates and downloads a direct PDF (.pdf) for the Monthly Class Assignments Role
 * (Programa Oficial de Asignación y Rol Mensual de Clases por Entrenador).
 */
export async function exportAssignmentsRoleToPdf(
  assignments: ClassAssignment[],
  _companies: Company[],
  trainers: Trainer[],
  activityCatalog: ActivityCatalogItem[] = [],
  options?: {
    selectedMonth?: string; // YYYY-MM
    selectedTrainerId?: string;
    filenamePrefix?: string;
  }
): Promise<void> {
  const selectedMonth = options?.selectedMonth || new Date().toISOString().slice(0, 7);
  const selectedTrainerId = options?.selectedTrainerId || 'all';
  const [yearStr, monthNumStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const monthIndex = Math.max(0, Math.min(11, (parseInt(monthNumStr, 10) || 1) - 1));
  const monthName = MONTH_NAMES_ES[monthIndex];
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const targetTrainers =
    selectedTrainerId === 'all'
      ? trainers
      : trainers.filter((t) => t.id === selectedTrainerId);

  const prefix = sanitizeFileSegment(
    options?.filenamePrefix || `Rol_Asignaciones_BSCW_${selectedMonth}`
  );

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, cursorY, contentWidth, 23, 2.5, 2.5, 'F');
  doc.setFillColor(220, 38, 38);
  doc.roundedRect(marginX + 4, cursorY + 4.5, 14, 14, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('BSCW', marginX + 11, cursorY + 13, { align: 'center' });

  doc.setFontSize(12.8);
  doc.text(
    sanitizePdfText('Programa Oficial de Asignación y Rol Mensual de Clases'),
    marginX + 22,
    cursorY + 9.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(8.2);
  doc.text(
    sanitizePdfText(
      `Periodo: ${monthName.toUpperCase()} ${year} · Folio: BSCW-ROL-${selectedMonth.replace(
        '-',
        ''
      )}`
    ),
    marginX + 22,
    cursorY + 15.2
  );

  const genTimestamp = sanitizePdfText(
    `Generado: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString(
      'es-MX',
      { hour12: false }
    )}`
  );
  doc.setFontSize(7.4);
  doc.text(genTimestamp, pageWidth - marginX - 4, cursorY + 19.5, { align: 'right' });

  cursorY += 28;

  if (targetTrainers.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, cursorY, contentWidth, 18, 2, 2, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      sanitizePdfText('No hay entrenadores registrados para mostrar en este rol mensual.'),
      pageWidth / 2,
      cursorY + 10.5,
      { align: 'center' }
    );
  }

  for (let tIdx = 0; tIdx < targetTrainers.length; tIdx++) {
    const trainer = targetTrainers[tIdx];
    const trainerAssignments = assignments.filter(
      (a) => a.trainerId === trainer.id && a.active !== false
    );

    let totalMonthlySessions = 0;
    let totalAttendeesExpected = 0;
    const uniqueCompanies = new Set<string>();

    trainerAssignments.forEach((asg) => {
      uniqueCompanies.add(asg.companyId);
      if (asg.frequency === 'semanal') {
        let count = 0;
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(year, monthIndex, day);
          const dow = d.getDay() === 0 ? 7 : d.getDay();
          if (dow === asg.dayOfWeek) count++;
        }
        totalMonthlySessions += count;
        totalAttendeesExpected += (asg.expectedAttendees || 20) * count;
      } else if (asg.frequency === 'mensual') {
        if (asg.dayOfMonth && asg.dayOfMonth <= daysInMonth) {
          totalMonthlySessions += 1;
          totalAttendeesExpected += asg.expectedAttendees || 20;
        }
      } else if (asg.frequency === 'fecha_unica') {
        if (asg.date && asg.date.startsWith(selectedMonth)) {
          totalMonthlySessions += 1;
          totalAttendeesExpected += asg.expectedAttendees || 20;
        }
      }
    });

    if (tIdx > 0 && cursorY + 65 > pageHeight - 16) {
      doc.addPage();
      cursorY = 14;
    } else if (tIdx > 0) {
      cursorY += 4;
    }

    // Trainer Summary Header Card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, cursorY, contentWidth, 18, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(trainer.name), marginX + 3.5, cursorY + 6.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(71, 85, 105);
    doc.text(
      sanitizePdfText(`${trainer.email} · Tel: ${trainer.phone}`).slice(0, 68),
      marginX + 3.5,
      cursorY + 11
    );
    doc.text(
      sanitizePdfText(`Especialidades: ${(trainer.specialties || []).join(', ')}`).slice(0, 82),
      marginX + 3.5,
      cursorY + 15.2
    );

    // Metrics on right of trainer header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(220, 38, 38);
    doc.text(
      sanitizePdfText(
        `Horarios: ${trainerAssignments.length} | Sesiones Mes: ${totalMonthlySessions} | Empresas: ${uniqueCompanies.size} | Colab. Est.: ${totalAttendeesExpected}`
      ),
      pageWidth - marginX - 3.5,
      cursorY + 7,
      { align: 'right' }
    );

    cursorY += 20.5;

    if (trainerAssignments.length === 0) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginX, cursorY, contentWidth, 9, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        sanitizePdfText('Este entrenador no cuenta con asignaciones activas en este periodo.'),
        marginX + 4,
        cursorY + 5.6
      );
      cursorY += 12;
    } else {
      // Assignments Table Header
      const cols = [
        { label: 'Día / Frecuencia', x: marginX + 2.5, align: 'left' as const },
        { label: 'Horario', x: marginX + 39, align: 'left' as const },
        { label: 'Empresa y Sede', x: marginX + 67, align: 'left' as const },
        { label: 'Salón / Área', x: marginX + 116, align: 'left' as const },
        { label: 'Modalidad / Actividad', x: marginX + 144, align: 'left' as const },
        { label: 'Aforo', x: pageWidth - marginX - 2.5, align: 'right' as const },
      ];

      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.rect(marginX, cursorY, contentWidth, 6.8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.setTextColor(51, 65, 85);
      cols.forEach((c) => {
        doc.text(sanitizePdfText(c.label.toUpperCase()), c.x, cursorY + 4.5, { align: c.align });
      });
      cursorY += 6.8;

      trainerAssignments.forEach((asg, aIdx) => {
        if (cursorY + 10.5 > pageHeight - 18) {
          doc.addPage();
          cursorY = 14;
        }

        const normType = normalizeActivityType(asg.activityType);
        const durMins = getAssignmentDurationMinutes(asg, activityCatalog);
        const endHHMM = calculateEndTimeHHMM(asg.time, durMins);

        let freqLabel = '';
        let freqSub = '';
        if (asg.frequency === 'semanal') {
          freqLabel = `Cada ${DAY_NAMES_ES[(asg.dayOfWeek || 1) - 1]}`;
          freqSub = 'Recurrente semanal';
        } else if (asg.frequency === 'mensual') {
          freqLabel = `Día ${asg.dayOfMonth} del mes`;
          freqSub = 'Recurrente mensual';
        } else {
          freqLabel = asg.date || 'Fecha única';
          freqSub = 'Sesión puntual';
        }

        doc.setFillColor(
          aIdx % 2 === 0 ? 255 : 248,
          aIdx % 2 === 0 ? 255 : 250,
          aIdx % 2 === 0 ? 255 : 252
        );
        doc.setDrawColor(226, 232, 240);
        doc.rect(marginX, cursorY, contentWidth, 10, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.1);
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePdfText(freqLabel).slice(0, 22), cols[0].x, cursorY + 4.2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
        doc.setTextColor(100, 116, 139);
        doc.text(sanitizePdfText(freqSub), cols[0].x, cursorY + 8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.1);
        doc.setTextColor(220, 38, 38);
        doc.text(
          sanitizePdfText(`${asg.time}${endHHMM ? `-${endHHMM}` : ''}`),
          cols[1].x,
          cursorY + 4.2
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
        doc.setTextColor(100, 116, 139);
        doc.text(sanitizePdfText(formatDurationHoursMinutes(durMins)), cols[1].x, cursorY + 8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.1);
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePdfText(asg.companyName).slice(0, 28), cols[2].x, cursorY + 4.2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
        doc.setTextColor(71, 85, 105);
        doc.text(sanitizePdfText(asg.sedeName).slice(0, 30), cols[2].x, cursorY + 8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(51, 65, 85);
        doc.text(sanitizePdfText(asg.locationArea).slice(0, 18), cols[3].x, cursorY + 5.8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        doc.setTextColor(30, 64, 175);
        doc.text(
          sanitizePdfText(ACTIVITY_TYPE_LABELS[normType]).slice(0, 22),
          cols[4].x,
          cursorY + 4.2
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePdfText(asg.activityName).slice(0, 22), cols[4].x, cursorY + 8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(15, 23, 42);
        doc.text(String(asg.expectedAttendees || 20), cols[5].x, cursorY + 5.8, {
          align: 'right',
        });

        cursorY += 10;
      });

      cursorY += 3;
    }

    // Normative notice & trainer signature box
    if (cursorY + 26 > pageHeight - 14) {
      doc.addPage();
      cursorY = 14;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, cursorY, contentWidth, 23, 1.8, 1.8, 'FD');

    const normativeText = sanitizePdfText(
      'Normativa BSCW Check: La carga de la asignación para registro de entrada se habilita 30 minutos antes y hasta 10 minutos después del horario programado, activando el identificador facial y geocerca GPS. La salida con fotografía es obligatoria al concluir; pasados 60 minutos del término sin cierre se marca automáticamente como No Cerrada.'
    );
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    const wrappedNorm = doc.splitTextToSize(normativeText, contentWidth - 7) as string[];
    doc.text(wrappedNorm.slice(0, 3), marginX + 3.5, cursorY + 4.2);

    const sigW = (contentWidth - 24) / 2;
    doc.setDrawColor(148, 163, 184);
    doc.line(marginX + 6, cursorY + 17.5, marginX + 6 + sigW, cursorY + 17.5);
    doc.line(
      pageWidth - marginX - 6 - sigW,
      cursorY + 17.5,
      pageWidth - marginX - 6,
      cursorY + 17.5
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      sanitizePdfText(`${trainer.name} · Firma Entrenador(a)`),
      marginX + 6 + sigW / 2,
      cursorY + 21,
      { align: 'center' }
    );
    doc.text(
      sanitizePdfText('Coordinación de Operaciones · BSCW Check'),
      pageWidth - marginX - 6 - sigW / 2,
      cursorY + 21,
      { align: 'center' }
    );

    cursorY += 26;
  }

  addCorporatePageFooters(
    doc,
    marginX,
    'BSCW Check · Programa Oficial de Asignación y Rol Mensual de Clases'
  );

  savePdfDocument(doc, `${prefix}.pdf`);
}
