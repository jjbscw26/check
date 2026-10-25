import React, { useState } from 'react';
import {
  Camera,
  CheckCheck,
  Download,
  FileSpreadsheet,
  MapPin,
  Printer,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AttendanceRecord } from '../types';
import { formatDistance } from '../utils/geo';
import {
  EvidencePhotoSlot,
  exportEvidenceRecordsToExcel,
  exportEvidenceRecordsToPdf,
} from '../utils/evidenceExport';

interface PdfEvidenceLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: AttendanceRecord[];
  filterSummaryLabel: string;
  onInspectPhoto?: (record: AttendanceRecord, slot: EvidencePhotoSlot) => void;
}

export const PdfEvidenceLogModal: React.FC<PdfEvidenceLogModalProps> = ({
  isOpen,
  onClose,
  records,
  filterSummaryLabel,
  onInspectPhoto,
}) => {
  const [includePhotos, setIncludePhotos] = useState<boolean>(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  if (!isOpen) return null;

  const total = records.length;
  const completed = records.filter((r) => r.status === 'completado').length;
  const nonCompliant = records.filter((r) => r.status === 'incumplido').length;
  const onTimeOrEarly = records.filter(
    (r) => r.punctualityStatus === 'a_tiempo' || r.punctualityStatus === 'adelantado'
  ).length;
  const punctualityRate = total > 0 ? Math.round((onTimeOrEarly / total) * 100) : 100;
  const totalAttendees = records.reduce((acc, r) => acc + (r.attendeesCount || 0), 0);
  const auditedCount = records.filter((r) => r.adminVerified).length;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await exportEvidenceRecordsToPdf(records, {
        title: 'Bitácora Oficial de Evidencias y Asistencia',
        subtitle: filterSummaryLabel,
        filenamePrefix: 'Bitacora_Evidencias_BSCW',
        includePhotos,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadExcel = () => {
    exportEvidenceRecordsToExcel(records, {
      filenamePrefix: 'Bitacora_Evidencias_BSCW',
      periodLabel: filterSummaryLabel,
    });
  };

  return (
    <div
      data-printable-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static"
    >
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto print:max-h-none print:border-none print:shadow-none print:m-0 print:max-w-full">
        {/* Top Action Toolbar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold shrink-0">
              <CheckCheck className="w-5 h-5 text-white" />
            </span>
            <div>
              <h3 className="font-bold text-xs sm:text-sm">
                Vista de Impresión y Exportación — Bitácora de Evidencias
              </h3>
              <p className="text-[11px] text-slate-400">
                <span className="font-mono tabular-nums text-white font-semibold">{total}</span>{' '}
                registros sincronizados con Firestore (`/records`)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap shrink-0">
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={(e) => setIncludePhotos(e.target.checked)}
                className="rounded border-slate-600 text-red-600 focus:ring-red-500 w-3.5 h-3.5 cursor-pointer"
              />
              <Camera className="w-3.5 h-3.5 text-red-400" />
              <span>Incluir fotos en PDF/Impresión</span>
            </label>

            <button
              type="button"
              onClick={handleDownloadExcel}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Descargar Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={isGeneratingPdf}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGeneratingPdf ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar PDF (.pdf)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-red-600" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              title="Cerrar vista previa"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div
          data-printable-scroll="true"
          className="p-5 sm:p-8 space-y-6 text-slate-900 bg-white flex-1 overflow-y-auto"
        >
          {/* Corporate Document Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-red-600 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-600 flex items-center justify-center text-white font-black shrink-0">
                <CheckCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  BSCW <span className="text-red-600">Check</span> — Bitácora de Evidencias
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Expediente Oficial de Asistencia, Geocerca GPS, Biometría Facial y Sello Fotográfico
                </p>
              </div>
            </div>

            <div className="sm:text-right text-xs space-y-0.5">
              <div className="font-bold text-slate-900">{filterSummaryLabel}</div>
              <div className="font-mono tabular-nums text-[11px] text-slate-500">
                Emitido: {new Date().toLocaleDateString('es-MX')}{' '}
                {new Date().toLocaleTimeString('es-MX', { hour12: false })}
              </div>
            </div>
          </div>

          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-medium block">Registros</span>
              <span className="text-lg font-black font-mono tabular-nums text-slate-900">
                {total}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-medium block">Cerradas / Inc.</span>
              <span className="text-lg font-black font-mono tabular-nums text-emerald-700">
                {completed}
                {nonCompliant > 0 && (
                  <span className="text-rose-700 text-sm"> / {nonCompliant}</span>
                )}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-medium block">Puntualidad</span>
              <span className="text-lg font-black font-mono tabular-nums text-red-600">
                {punctualityRate}%
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-medium block">Participantes</span>
              <span className="text-lg font-black font-mono tabular-nums text-slate-900">
                {totalAttendees}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-medium block">Auditados Admin</span>
              <span className="text-lg font-black font-mono tabular-nums text-slate-900">
                {auditedCount}/{total}
              </span>
            </div>
          </div>

          {/* Evidence Records List */}
          {records.length === 0 ? (
            <div className="p-10 rounded-2xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
              No hay registros en la bitácora que coincidan con los filtros actuales.
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((rec, idx) => {
                const isLate = rec.punctualityStatus === 'con_retraso';
                const isEarly = rec.punctualityStatus === 'adelantado';

                return (
                  <div
                    key={rec.id}
                    className="print-avoid-break border border-slate-200 rounded-2xl p-4 bg-white space-y-3"
                  >
                    {/* Record Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono tabular-nums font-bold text-slate-900">
                          {String(idx + 1).padStart(2, '0')}. {rec.date}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="font-bold text-slate-900">{rec.companyName}</span>
                        <span className="text-slate-400">/</span>
                        <span className="font-semibold text-slate-700">{rec.sedeName}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono text-[11px] text-slate-500">{rec.id}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        <span
                          className={
                            isLate
                              ? 'text-rose-700'
                              : isEarly
                              ? 'text-blue-700'
                              : 'text-emerald-700'
                          }
                        >
                          {isLate
                            ? `Con retraso (${Math.abs(rec.punctualityDiffMinutes)} min)`
                            : isEarly
                            ? `Anticipado (+${Math.abs(rec.punctualityDiffMinutes)} min)`
                            : 'Puntual'}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span
                          className={
                            rec.status === 'completado'
                              ? 'text-emerald-700 font-bold'
                              : rec.status === 'incumplido'
                              ? 'text-rose-700 font-bold'
                              : 'text-amber-700 font-bold'
                          }
                        >
                          {rec.status === 'completado'
                            ? 'Completada y Cerrada'
                            : rec.status === 'incumplido'
                            ? 'Incumplida (+30m sin cierre)'
                            : 'En Curso'}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">
                          Entrenador y Salón
                        </span>
                        <span className="font-bold text-slate-900">{rec.trainerName}</span>
                        <span className="text-slate-600 block text-[11px]">
                          {rec.locationArea} · {rec.activityName} (
                          <span className="font-mono tabular-nums">{rec.attendeesCount}</span>{' '}
                          asistentes)
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">
                          Horarios Registrados
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          Prog {rec.scheduledTime} · Ent {rec.checkInTime}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-600 block">
                          Sal:{' '}
                          {rec.checkOutTime ||
                            (rec.status === 'incumplido' ? 'Sin cierre' : 'En curso')}
                          {rec.durationMinutes ? ` (${rec.durationMinutes} min)` : ''}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">
                          Geocerca GPS y Auditoría
                        </span>
                        <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-800 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-red-600 shrink-0" />
                          {rec.checkInGps.lat.toFixed(5)}, {rec.checkInGps.lng.toFixed(5)} (
                          {formatDistance(rec.checkInGps.distanceToSedeMeters)})
                        </span>
                        <span className="text-[11px] text-slate-600 block">
                          {rec.checkInGps.isWithinGeofence ? 'En geocerca' : 'Fuera de rango'} ·{' '}
                          {rec.adminVerified ? 'Auditado conforme' : 'Revisión pendiente'}
                        </span>
                      </div>
                    </div>

                    {(rec.observations || rec.adminNotes) && (
                      <div className="text-[11px] text-slate-600 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                        {rec.observations && (
                          <p>
                            <strong className="text-slate-700">Observaciones:</strong>{' '}
                            {rec.observations}
                          </p>
                        )}
                        {rec.adminNotes && (
                          <p>
                            <strong className="text-slate-700">Nota Auditoría:</strong>{' '}
                            {rec.adminNotes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Evidence Photographs */}
                    {includePhotos && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        {/* Photo 1: Entrance */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-slate-700 block">
                            1. Foto de Entrada en Sede
                          </span>
                          <div
                            onClick={() => onInspectPhoto?.(rec, 'entry')}
                            className={`h-36 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center ${
                              onInspectPhoto ? 'cursor-pointer hover:border-red-500 transition' : ''
                            }`}
                          >
                            <img
                              src={rec.photoUrl}
                              alt="Foto de entrada"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        </div>

                        {/* Photo 2: Exit */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-slate-700 block">
                            2. Foto de Salida en Sede
                          </span>
                          {rec.exitPhotoUrl ? (
                            <div
                              onClick={() => onInspectPhoto?.(rec, 'exit')}
                              className={`h-36 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center ${
                                onInspectPhoto
                                  ? 'cursor-pointer hover:border-red-500 transition'
                                  : ''
                              }`}
                            >
                              <img
                                src={rec.exitPhotoUrl}
                                alt="Foto de salida"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="h-36 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[11px] text-slate-400 px-3 text-center">
                              {rec.status === 'en_curso'
                                ? 'Pendiente al finalizar sesión'
                                : 'Sin foto de salida'}
                            </div>
                          )}
                        </div>

                        {/* Photo 3: Facial Verification */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-slate-700 block">
                            3. Validación Biométrica Facial
                          </span>
                          {rec.facialVerification?.facePhotoUrl ? (
                            <div
                              onClick={() => onInspectPhoto?.(rec, 'facial')}
                              className={`h-36 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center relative ${
                                onInspectPhoto
                                  ? 'cursor-pointer hover:border-red-500 transition'
                                  : ''
                              }`}
                            >
                              <img
                                src={rec.facialVerification.facePhotoUrl}
                                alt="Validación facial"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain"
                              />
                              <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-slate-950/85 text-emerald-300 font-mono tabular-nums text-[10px] font-bold inline-flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                {rec.facialVerification.confidenceScore}%
                              </span>
                            </div>
                          ) : (
                            <div className="h-36 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[11px] text-slate-400 px-3 text-center">
                              Sin captura facial adjunta
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
