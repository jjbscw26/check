import React, { useState } from 'react';
import { 
  ShieldCheck, 
  MapPin, 
  Clock, 
  UserCheck, 
  Building2, 
  Users, 
  Calendar, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  FileText,
  BadgeAlert
} from 'lucide-react';
import { AttendanceRecord } from '../types';
import { formatDistance } from '../utils/geo';

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

  const isLate = record.punctualityStatus === 'con_retraso';
  const isEarly = record.punctualityStatus === 'adelantado';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-900/60 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto print:max-h-none print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Certificate Header */}
        <div className="bg-slate-50 p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between print:bg-white print:text-black print:border-b-2 print:border-slate-300 shrink-0">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-200 shadow-sm print:bg-red-50 print:text-red-700 shrink-0">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-900 print:text-black">
                  Acta de Asistencia
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 print:bg-slate-100 print:text-slate-800">
                  {record.id}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 print:text-slate-600 font-medium truncate max-w-[200px] sm:max-w-none">
                Certificación oficial • BSCW Check
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 print:hidden">
            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-sm text-xs font-semibold flex items-center transition"
              title="Imprimir Acta Oficial"
            >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1.5 text-red-600" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 sm:p-2 rounded-lg text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-slate-800 print:text-black flex-1 overflow-y-auto">
          {/* Status & Punctuality Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 print:bg-slate-50 print:border-slate-200">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500 font-medium">Resultado de Puntualidad:</span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center ${
                  isLate
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : isEarly
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {isLate ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" /> Con Retraso ({Math.abs(record.punctualityDiffMinutes)} min tarde)
                  </>
                ) : isEarly ? (
                  <>
                    <Clock className="w-3.5 h-3.5 mr-1 text-blue-600" /> Llegada Anticipada ({record.punctualityDiffMinutes} min antes)
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Puntual (A tiempo)
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500 font-medium">Estado de Sesión:</span>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                  record.status === 'completado'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : record.status === 'incumplido'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {record.status === 'completado'
                  ? 'Completado y Cerrado'
                  : record.status === 'incumplido'
                    ? 'Incumplida • Sin Cierre (+30 min)'
                    : 'En Curso'}
              </span>
            </div>
          </div>

          {record.status === 'incumplido' && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-start space-x-2.5">
              <BadgeAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-rose-900">
                  Asignación Bloqueada y Marcada como Incumplida
                </p>
                <p className="mt-0.5 text-rose-800">
                  No se registró la salida ni la evidencia final dentro de los 30 minutos posteriores al término programado de la sesión
                  {record.markedNonCompliantAt ? ` (bloqueada a las ${record.markedNonCompliantAt} hrs)` : ''}.
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
                <span className="font-bold text-slate-900 print:text-black">{record.companyName}</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Sede:</span>{' '}
                <span className="font-semibold text-slate-800 print:text-black">{record.sedeName}</span>
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
                <span className="text-slate-500 font-medium">Actividad:</span>{' '}
                <span className="font-bold text-slate-900 print:text-blue-700">{record.activityName}</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Participantes:</span>{' '}
                <span className="font-mono font-bold text-slate-900 print:text-black">{record.attendeesCount} colaboradores</span>
              </p>
            </div>

            {/* Right Column: Trainer & Timestamps */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs print:bg-white print:border-slate-200">
              <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex items-center">
                <Clock className="w-4 h-4 mr-1.5 text-red-600" />
                Entrenador y Horarios
              </h4>
              <p>
                <span className="text-slate-500 font-medium">Entrenador:</span>{' '}
                <span className="font-bold text-slate-900 print:text-black">{record.trainerName}</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Fecha:</span>{' '}
                <span className="font-mono font-semibold text-slate-800 print:text-black">{record.date}</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Horario Programado:</span>{' '}
                <span className="font-mono font-semibold text-slate-800 print:text-black">{record.scheduledTime} hrs</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Hora Entrada Real:</span>{' '}
                <span className="font-mono font-bold text-emerald-700">{record.checkInTime}</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Hora Salida Real:</span>{' '}
                <span className="font-mono font-bold text-red-600">
                  {record.checkOutTime
                    ? record.checkOutTime
                    : record.status === 'incumplido'
                      ? 'Sin cierre (+30m • Incumplida)'
                      : 'En curso'}
                </span>
              </p>
              {record.durationMinutes && (
                <p>
                  <span className="text-slate-500 font-medium">Duración Efectiva:</span>{' '}
                  <span className="font-mono font-bold text-slate-900 print:text-black">{record.durationMinutes} minutos</span>
                </p>
              )}
            </div>
          </div>

          {/* GPS Verification Section */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center">
              <MapPin className="w-4 h-4 mr-1.5 text-red-600" />
              Auditoría de Geolocalización GPS
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="text-slate-500 block text-[10px]">Coordenadas Registradas</span>
                <span className="text-slate-800 font-bold">
                  {record.checkInGps.lat.toFixed(6)}, {record.checkInGps.lng.toFixed(6)}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="text-slate-500 block text-[10px]">Distancia al Punto Sede</span>
                <span className="text-red-600 font-black">
                  {formatDistance(record.checkInGps.distanceToSedeMeters)}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="text-slate-500 block text-[10px]">Validación Geocerca</span>
                <span className={record.checkInGps.isWithinGeofence ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                  {record.checkInGps.isWithinGeofence ? '✓ DENTRO DE GEOCERCA' : '⚠ FUERA DE RANGO'}
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
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ✓ Coincidencia: {record.facialVerification.confidenceScore}%
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative shrink-0">
                  <img
                    src={record.facialVerification.facePhotoUrl}
                    alt="Rostro validado"
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm"
                  />
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-red-600 text-white font-bold text-[9px]">
                    BSCW AI
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-[11px]">
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Entrenador Autenticado</span>
                    <span className="font-bold text-slate-900">{record.facialVerification.trainerName}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Prueba de Vivacidad</span>
                    <span className="font-bold text-emerald-700">Aprobada (Anti-suplantación)</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Hora de Captura Facial</span>
                    <span className="font-mono font-semibold text-slate-800">{record.facialVerification.capturedAt}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Identificador Biométrico</span>
                    <span className="font-mono text-slate-700 font-semibold truncate block">
                      {record.facialVerification.biometricId}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Evidence: Photos of Entrance and Exit in Venue */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-800 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1.5 text-red-600" />
              Evidencia Fotográfica Oficial con Sello (Entrada y Salida)
            </span>

            <div className={`grid grid-cols-1 ${record.exitPhotoUrl ? 'sm:grid-cols-2' : ''} gap-3`}>
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded inline-block">
                  1. Foto de Entrada en Sede
                </span>
                <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-64 shadow-sm border border-slate-200">
                  <img
                    src={record.photoUrl}
                    alt="Foto de entrada en sede"
                    className="w-full h-auto object-contain max-h-64"
                  />
                </div>
              </div>

              {record.exitPhotoUrl ? (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded inline-block">
                    2. Foto de Salida en Sede
                  </span>
                  <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-64 shadow-sm border border-slate-200">
                    <img
                      src={record.exitPhotoUrl}
                      alt="Foto de salida en sede"
                      className="w-full h-auto object-contain max-h-64"
                    />
                  </div>
                </div>
              ) : record.status === 'incumplido' ? (
                <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50/70 p-4 flex flex-col items-center justify-center text-center text-xs text-rose-900">
                  <BadgeAlert className="w-5 h-5 text-rose-600 mb-1" />
                  <span className="font-bold">Sin foto de salida — Sesión Incumplida</span>
                  <span className="text-[11px] text-rose-700 mt-0.5">
                    Excedió los 30 minutos posteriores al término sin registrar salida.
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
              <span className="text-slate-600 font-bold block mb-1">Observaciones de la Sesión:</span>
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
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 transition"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={handleSaveAudit}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center shadow-md shadow-red-500/20"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Guardar Auditoría
          </button>
        </div>
      </div>
    </div>
  );
};
