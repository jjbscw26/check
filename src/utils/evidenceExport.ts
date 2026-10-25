import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { ACTIVITY_TYPE_LABELS, AttendanceRecord, normalizeActivityType } from '../types';
import { formatDistance } from './geo';

export type EvidencePhotoSlot = 'entry' | 'exit' | 'facial';

export interface EvidencePhotoItem {
  slot: EvidencePhotoSlot;
  title: string;
  shortLabel: string;
  url: string;
  capturedAtLabel: string;
  subtitle: string;
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
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
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
    }, 4500);

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
      (r.status === 'incumplido' ? 'TERMINADA (+60m • NO CERRADA)' : 'En curso'),
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
    { Indicador: 'Sistema', Valor: 'BSCW Check — Bitácora Oficial de Evidencias' },
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
  const title = options?.title || 'Bitácora Oficial de Evidencias y Asistencia';
  const subtitle =
    options?.subtitle || `Total exportado: ${records.length} registro(s) auditables en Firestore`;
  const prefix = sanitizeFileSegment(options?.filenamePrefix || 'Bitacora_Evidencias_BSCW');
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
  doc.roundedRect(marginX, cursorY, contentWidth, 22, 2.5, 2.5, 'F');
  doc.setFillColor(220, 38, 38);
  doc.roundedRect(marginX + 4, cursorY + 4, 14, 14, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('BSCW', marginX + 11, cursorY + 12.2, { align: 'center' });

  doc.setFontSize(13);
  doc.text(title, marginX + 22, cursorY + 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(8.5);
  doc.text(subtitle, marginX + 22, cursorY + 15);

  const genTimestamp = `Generado: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString(
    'es-MX',
    { hour12: false }
  )}`;
  doc.setFontSize(7.5);
  doc.text(genTimestamp, pageWidth - marginX - 4, cursorY + 18.5, { align: 'right' });

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
    { label: 'Completadas', value: `${completed}${nonCompliant > 0 ? ` (${nonCompliant} inc.)` : ''}` },
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
    doc.text(kpi.label.toUpperCase(), x + 2.5, cursorY + 4.8);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(kpi.value, x + 2.5, cursorY + 10.5);
  });

  cursorY += 17;

  if (records.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(
      'No existen registros de evidencia que coincidan con los filtros seleccionados.',
      pageWidth / 2,
      cursorY + 16,
      { align: 'center' }
    );
  }

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];

    // Pre-rasterize photos if enabled
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
    const obsText = [
      rec.observations ? `Obs: ${rec.observations}` : '',
      rec.adminNotes ? `Auditoría: ${rec.adminNotes}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

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
      `${i + 1}. ${rec.date} · Prog ${rec.scheduledTime} | ${rec.companyName} — ${rec.sedeName}`,
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
    doc.text(formatStatusLabel(rec), pageWidth - marginX - 3.5, cursorY + 5.8, {
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
    doc.text(`${rec.trainerName} (${rec.locationArea})`.slice(0, 52), col1X + 18, metaY);

    doc.setFont('helvetica', 'bold');
    doc.text('Actividad:', col2X, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${rec.activityName} · ${rec.attendeesCount} asistentes`.slice(0, 48),
      col2X + 16,
      metaY
    );

    const row2Y = metaY + 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Horarios:', col1X, row2Y);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Entrada ${rec.checkInTime} · Salida ${
        rec.checkOutTime || (rec.status === 'incumplido' ? 'Terminada +60m (No cerrada)' : 'En curso')
      }${rec.durationMinutes ? ` (${rec.durationMinutes}m)` : ''}`,
      col1X + 15,
      row2Y
    );

    doc.setFont('helvetica', 'bold');
    doc.text('Puntualidad:', col2X, row2Y);
    doc.setFont('helvetica', 'normal');
    doc.text(formatPunctualityLabel(rec), col2X + 19, row2Y);

    const row3Y = row2Y + 5;
    doc.setFont('helvetica', 'bold');
    doc.text('GPS Entrada:', col1X, row3Y);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${rec.checkInGps.lat.toFixed(5)}, ${rec.checkInGps.lng.toFixed(5)} (${formatDistance(
        rec.checkInGps.distanceToSedeMeters
      )} · ${rec.checkInGps.isWithinGeofence ? 'En geocerca' : 'Fuera de rango'})`,
      col1X + 20,
      row3Y
    );

    doc.setFont('helvetica', 'bold');
    doc.text('Auditoría:', col2X, row3Y);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${rec.adminVerified ? 'Verificado Admin' : 'Pendiente revisión'}${
        rec.facialVerification ? ` · Rostro ${rec.facialVerification.confidenceScore}%` : ''
      } · ID ${rec.id.slice(0, 14)}`,
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
        doc.text(slot.label, sx, boxTop - 1.2);

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
          doc.text(slot.emptyMsg, sx + boxW / 2, boxTop + boxH / 2, { align: 'center' });
        }
      });
    }

    cursorY += cardHeight + 4;
  }

  // Footer with page numbers on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'BSCW Check • Certificación de Asistencia, Geocerca GPS y Evidencia Fotográfica Sincronizada en Firestore',
      marginX,
      pageHeight - 6
    );
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginX, pageHeight - 6, {
      align: 'right',
    });
  }

  doc.save(`${prefix}_${todayStamp}.pdf`);
}
