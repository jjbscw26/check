import React, { useState } from 'react';
import {
  ShieldCheck,
  MapPin,
  Clock,
  Building2,
  Printer,
  CheckCircle2,
  AlertTriangle,
  BadgeAlert,
  Download,
  FileSpreadsheet,
  ZoomIn,
  RefreshCw,
} from 'lucide-react';
import { ACTIVITY_TYPE_LABELS, AttendanceRecord, normalizeActivityType } from '../types';
import { formatDistance } from '../utils/geo';
import {
  EvidencePhotoSlot,
  exportEvidenceRecordsToExcel,
  exportEvidenceRecordsToPdf,
} from '../utils/evidenceExport';
import { EvidencePhotoLightbox } from './EvidencePhotoLightbox';
import { VirtualClassQuickShare } from './VirtualClassShareCard';
import { Video } from 'lucide-react';

interface RecordDetailModalProps {
  record: AttendanceRecord;
  onClose: () => void;
  onUpdateRecord: (updated: AttendanceRecord) => void;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  record,
  onClose,
  onUpdateRecord,
}) => {
  const [adminNotes, setAdminNotes] = useState(record.adminNotes || '');
  const [isVerified, setIsVerified] = useState(record.adminVerified);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [lightboxSlot, setLightboxSlot] = useState<EvidencePhotoSlot | null>(null);

  const handleSaveAudit = () => {
    onUpdateRecord({
      ...record,
      adminVerified: isVerified,
      adminNotes,
    });
    onClose();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await exportEvidenceRecordsToPdf([record], {
        title: `Acta Oficial de Asistencia — ${record.companyName}`,
        subtitle: `${record.sedeName} · Entrenador: ${record.trainerName} · Fecha: ${record.date}`,
        filenamePrefix: `Acta_Asistencia_${record.id}`,
        includePhotos: true,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadExcel = () => {
    exportEvidenceRecordsToExcel([record], {
      title: `Acta Oficial de Asistencia — ${record.companyName}`,
      filenamePrefix: `Acta_Asistencia_${record.id}`,
      periodLabel: `${record.sedeName} · Entrenador: ${record.trainerName} · Fecha: ${record.date} · ID: ${record.id}`,
    });
  };

  const isLate = record.punctualityStatus === 'con_retraso';
  const isEarly = record.punctualityStatus === 'adelantado';

  return (
    <>
      <div
        data-printable-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-900/60 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static"
      >
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto print:max-h-none print:border-none print:shadow-none print:bg-white print:text-black">
          {/* Certificate Header */}
          <div className="bg-slate-50 p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left print:bg-white print:text-black print:border-b-2 print:border-slate-300 shrink-0">
            <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-200 shadow-sm print:bg-red-50 print:text-red-700 shrink-0">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
                  <h3 className="font-bold text-base sm:text-lg text-slate-900 print:text-black">
                    Acta de Asistencia y Evidencia
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-500 print:text-slate-700">
                    · {record.id}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 print:text-slate-600 font-medium">
                  Certificación oficial sincronizada en Firestore • BSCW Check
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 sm:gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setLightboxSlot('entry')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                title="Visualizar fotografías de evidencia en pantalla completa"
              >
                <ZoomIn className="w-3.5 h-3.5 text-red-400" />
                <span>Ver Fotos</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcel}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-300 hover:border-emerald-300 text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                title="Descargar registro en Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={isGeneratingPdf}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                title="Descargar Acta en PDF (.pdf) con fotografías"
              >
                {isGeneratingPdf ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{isGeneratingPdf ? 'PDF...' : 'PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                title="Imprimir Acta Oficial"
              >
                <Printer className="w-3.5 h-3.5 text-red-600" />
                <span>Imprimir</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm cursor-pointer"
                title="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content Body */}
          <div
            data-printable-scroll="true"
            className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-slate-800 print:text-black flex-1 overflow-y-auto"
          >
            {/* Status & Punctuality Summary */}
            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center sm:text-left print:bg-slate-50 print:border-slate-200">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-xs text-slate-500 font-medium">Resultado de Puntualidad:</span>
                <span
                  className={`text-xs font-bold inline-flex items-center ${
                    isLate
                      ? 'text-rose-800'
                      : isEarly
                      ? 'text-blue-800'
                      : 'text-emerald-800'
                  }`}
                >
                  {isLate ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" /> Con Retraso (
                      <span className="font-mono tabular-nums">
                        {Math.abs(record.punctualityDiffMinutes)}
                      </span>{' '}
                      min tarde)
                    </>
                  ) : isEarly ? (
                    <>
                      <Clock className="w-3.5 h-3.5 mr-1 text-blue-600" /> Llegada Anticipada (
                      <span className="font-mono tabular-nums">{record.punctualityDiffMinutes}</span>{' '}
                      min antes)
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Puntual (A tiempo)
                    </>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                <span className="text-xs text-slate-500 font-medium">Estado de Sesión:</span>
                <span
                  className={`text-xs font-bold ${
                    record.status === 'completado'
                      ? 'text-emerald-700'
                      : record.status === 'incumplido'
                      ? 'text-rose-800'
                      : 'text-amber-700'
                  }`}
                >
                  {record.status === 'completado'
                    ? 'Completado y Cerrado'
                    : record.status === 'incumplido'
                    ? 'Terminada (+60 min) • No Cerrada'
                    : 'En Curso'}
                </span>
              </div>
            </div>

            {record.status === 'incumplido' && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2.5">
                <BadgeAlert className="w-5 h-5 text-rose-600 shrink-0 sm:mt-0.5" />
                <div>
                  <p className="font-extrabold text-rose-900">
                    Sesión Dada por Terminada (+60 min) y Calificada como No Cerrada
                  </p>
                  <p className="mt-0.5 text-rose-800">
                    La salida quedó pendiente y transcurrieron 60 minutos después de la hora de término programada de la sesión
                    {record.markedNonCompliantAt
                      ? ` (terminada automáticamente a las ${record.markedNonCompliantAt} hrs)`
                      : ''}
                    .
                  </p>
                </div>
              </div>
            )}

            {/* Core Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left Column: Venue & Activity */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs print:bg-white print:border-slate-200">
                <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex items-center">
                  <Building2 className="w-4 h-4 mr-1.5 text-red-600" />
                  Empresa y Sede
                </h4>
                <p>
                  <span className="text-slate-500 font-medium">Cliente:</span>{' '}
                  <span className="font-bold text-slate-900 print:text-black">
                    {record.companyName}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Sede:</span>{' '}
                  <span className="font-semibold text-slate-800 print:text-black">
                    {record.sedeName}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Dirección:</span>{' '}
                  <span className="text-slate-700 print:text-slate-700">{record.sedeAddress}</span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Salón/Área:</span>{' '}
                  <span className="text-red-700 font-bold">{record.locationArea}</span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Modalidad:</span>{' '}
                  <span className="font-bold text-slate-900 print:text-black">
                    {ACTIVITY_TYPE_LABELS[normalizeActivityType(record.activityType)]}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Actividad:</span>{' '}
                  <span className="font-bold text-slate-900 print:text-blue-700">
                    {record.activityName}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Participantes:</span>{' '}
                  <span className="font-mono tabular-nums font-bold text-slate-900 print:text-black">
                    {record.attendeesCount} colaboradores
                  </span>
                </p>
                {record.isVirtual && (
                  <p>
                    <span className="text-slate-500 font-medium">Impartición:</span>{' '}
                    <span className="font-bold text-indigo-700">
                      Clase Virtual · {record.virtualPlatform || 'En línea'}
                    </span>
                  </p>
                )}
              </div>

              {/* Right Column: Trainer & Timestamps */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs print:bg-white print:border-slate-200">
                <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex items-center">
                  <Clock className="w-4 h-4 mr-1.5 text-red-600" />
                  Entrenador y Horarios
                </h4>
                <p>
                  <span className="text-slate-500 font-medium">Entrenador:</span>{' '}
                  <span className="font-bold text-slate-900 print:text-black">
                    {record.trainerName}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Fecha:</span>{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-800 print:text-black">
                    {record.date}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Horario Programado:</span>{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-800 print:text-black">
                    {record.scheduledTime} hrs
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Hora Entrada Real:</span>{' '}
                  <span className="font-mono tabular-nums font-bold text-emerald-700">
                    {record.checkInTime}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Hora Salida Real:</span>{' '}
                  <span className="font-mono tabular-nums font-bold text-red-600">
                    {record.checkOutTime
                      ? record.checkOutTime
                      : record.status === 'incumplido'
                      ? 'Terminada +60m (No cerrada)'
                      : 'En curso'}
                  </span>
                </p>
                {record.durationMinutes && (
                  <p>
                    <span className="text-slate-500 font-medium">Duración Efectiva:</span>{' '}
                    <span className="font-mono tabular-nums font-bold text-slate-900 print:text-black">
                      {record.durationMinutes} minutos
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Virtual Class Platform Details & Share Card */}
            {record.isVirtual && record.virtualMeetingUrl && (
              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-200 text-xs space-y-2.5 print:bg-white print:border-slate-200">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Datos de Plataforma Virtual y Link de Acceso</span>
                </h4>
                <VirtualClassQuickShare
                  payload={{
                    activityName: record.activityName,
                    activityTypeLabel:
                      ACTIVITY_TYPE_LABELS[normalizeActivityType(record.activityType)],
                    companyName: record.companyName,
                    sedeName: record.sedeName,
                    trainerName: record.trainerName,
                    scheduleLabel: `Fecha ${record.date}`,
                    time: record.scheduledTime,
                    durationMinutes: record.durationMinutes || 45,
                    virtualPlatform: record.virtualPlatform || 'Sala Virtual',
                    virtualMeetingUrl: record.virtualMeetingUrl,
                    virtualMeetingId: record.virtualMeetingId,
                    virtualPasscode: record.virtualPasscode,
                  }}
                />
              </div>
            )}

            {/* GPS Verification Section */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center">
                <MapPin className="w-4 h-4 mr-1.5 text-red-600" />
                Auditoría de Geolocalización GPS
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-sans">
                    Coordenadas Registradas
                  </span>
                  <span className="text-slate-800 font-bold">
                    {record.checkInGps.lat.toFixed(6)}, {record.checkInGps.lng.toFixed(6)}
                  </span>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-sans">
                    {record.isVirtual ? 'Modalidad de Impartición' : 'Distancia al Punto Sede'}
                  </span>
                  <span className={record.isVirtual ? 'text-indigo-700 font-black' : 'text-red-600 font-black'}>
                    {record.isVirtual
                      ? `Virtual (${record.virtualPlatform || 'En línea'})`
                      : formatDistance(record.checkInGps.distanceToSedeMeters)}
                  </span>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className="text-slate-500 block text-[10px] font-sans">
                    Validación Geocerca
                  </span>
                  <span
                    className={
                      record.isVirtual
                        ? 'text-indigo-700 font-bold'
                        : record.checkInGps.isWithinGeofence
                        ? 'text-emerald-700 font-bold'
                        : 'text-rose-700 font-bold'
                    }
                  >
                    {record.isVirtual
                      ? '✓ SESIÓN VIRTUAL EN LÍNEA'
                      : record.checkInGps.isWithinGeofence
                      ? '✓ DENTRO DE GEOCERCA'
                      : '⚠ FUERA DE RANGO'}
                  </span>
                </div>
              </div>
            </div>

            {/* Biometric Facial Recognition Card */}
            {record.facialVerification && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="font-bold text-slate-900 flex items-center">
                    <ShieldCheck className="w-4 h-4 mr-1.5 text-red-600" />
                    Validación Biométrica Facial de Entrada
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-700 font-mono tabular-nums">
                    ✓ Coincidencia: {record.facialVerification.confidenceScore}%
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setLightboxSlot('facial')}
                    className="relative shrink-0 group cursor-pointer"
                    title="Clic para ampliar fotografía biométrica"
                  >
                    <img
                      src={record.facialVerification.facePhotoUrl}
                      alt="Rostro validado"
                      referrerPolicy="no-referrer"
                      className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm group-hover:opacity-90 transition"
                    />
                    <span className="print:hidden absolute bottom-1.5 right-1.5 p-1 rounded-lg bg-slate-900/80 text-white opacity-90 group-hover:bg-red-600 transition">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-[11px]">
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">
                        Entrenador Autenticado
                      </span>
                      <span className="font-bold text-slate-900">
                        {record.facialVerification.trainerName}
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">Prueba de Vivacidad</span>
                      <span className="font-bold text-emerald-700">
                        Aprobada (Anti-suplantación)
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">
                        Hora de Captura Facial
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-800">
                        {record.facialVerification.capturedAt}
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">
                        Identificador Biométrico
                      </span>
                      <span className="font-mono tabular-nums text-slate-700 font-semibold truncate block">
                        {record.facialVerification.biometricId}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Evidence: Photos of Entrance and Exit in Venue */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-1.5 text-red-600" />
                  Evidencia Fotográfica Oficial con Sello (Entrada y Salida)
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxSlot('entry')}
                  className="print:hidden text-[11px] font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>Ampliar Fotos</span>
                </button>
              </div>

              <div
                className={`grid grid-cols-1 ${record.exitPhotoUrl ? 'sm:grid-cols-2' : ''} gap-3`}
              >
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-emerald-700 block">
                    1. Foto de Entrada en Sede
                  </span>
                  <div
                    onClick={() => setLightboxSlot('entry')}
                    className="relative group rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-64 border border-slate-200 cursor-pointer"
                    title="Clic para ampliar foto de entrada"
                  >
                    <img
                      src={record.photoUrl}
                      alt="Foto de entrada en sede"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto object-contain max-h-64 group-hover:opacity-95 transition"
                    />
                    <span className="print:hidden absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-900/80 text-white text-[10px] font-semibold inline-flex items-center gap-1 group-hover:bg-red-600 transition">
                      <ZoomIn className="w-3 h-3" />
                      Ampliar
                    </span>
                  </div>
                </div>

                {record.exitPhotoUrl ? (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-red-700 block">
                      2. Foto de Salida en Sede
                    </span>
                    <div
                      onClick={() => setLightboxSlot('exit')}
                      className="relative group rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-64 border border-slate-200 cursor-pointer"
                      title="Clic para ampliar foto de salida"
                    >
                      <img
                        src={record.exitPhotoUrl}
                        alt="Foto de salida en sede"
                        referrerPolicy="no-referrer"
                        className="w-full h-auto object-contain max-h-64 group-hover:opacity-95 transition"
                      />
                      <span className="print:hidden absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-900/80 text-white text-[10px] font-semibold inline-flex items-center gap-1 group-hover:bg-red-600 transition">
                        <ZoomIn className="w-3 h-3" />
                        Ampliar
                      </span>
                    </div>
                  </div>
                ) : record.status === 'incumplido' ? (
                  <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50/70 p-4 flex flex-col items-center justify-center text-center text-xs text-rose-900">
                    <BadgeAlert className="w-5 h-5 text-rose-600 mb-1" />
                    <span className="font-bold">Sin foto de salida — Sesión No Cerrada</span>
                    <span className="text-[11px] text-rose-700 mt-0.5">
                      Se dio por terminada automáticamente 60 minutos después de la hora de término.
                    </span>
                  </div>
                ) : (
                  record.status === 'en_curso' && (
                    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4 flex flex-col items-center justify-center text-center text-xs text-amber-800">
                      <Clock className="w-5 h-5 text-amber-600 mb-1" />
                      <span className="font-bold">Foto de salida pendiente</span>
                      <span className="text-[11px] text-amber-700 mt-0.5">
                        Se capturará obligatoriamente al finalizar la sesión.
                      </span>
                    </div>
                  )
                )}
              </div>

              <p className="text-[11px] text-slate-500 text-center font-medium">
                Sello quemado digitalmente con fecha, hora, coordenadas GPS y nombre del entrenador.
              </p>
            </div>

            {/* Observations */}
            {record.observations && (
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <span className="text-slate-600 font-bold block mb-1">
                  Observaciones de la Sesión:
                </span>
                <p className="text-slate-800 italic">{record.observations}</p>
              </div>
            )}

            {/* Admin Validation Section (Hidden in print) */}
            <div className="bg-red-50/50 p-4 rounded-2xl border border-red-200/80 space-y-3 print:hidden">
              <h4 className="text-xs font-bold text-red-900 flex items-center">
                <ShieldCheck className="w-4 h-4 mr-1 text-red-600" />
                Gestión de Auditoría Administrativa
              </h4>

              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVerified}
                    onChange={(e) => setIsVerified(e.target.checked)}
                    className="rounded border-slate-300 text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="font-semibold">Marcar como Registro Auditado y Conforme</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">
                  Notas Internas de Auditoría / RRHH
                </label>
                <input
                  type="text"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Ej: Aprobado para facturación quincenal..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 print:hidden">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 transition flex items-center justify-center cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handleSaveAudit}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center justify-center cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Guardar Auditoría en Base de Datos
            </button>
          </div>
        </div>
      </div>

      <EvidencePhotoLightbox
        record={lightboxSlot ? record : null}
        initialSlot={lightboxSlot || 'entry'}
        onClose={() => setLightboxSlot(null)}
      />
    </>
  );
};
