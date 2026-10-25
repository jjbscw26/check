import React, { useState } from 'react';
import {
  LogOut,
  Users,
  CheckCircle2,
  FileText,
  Camera,
  Calendar,
  Minus,
  Plus,
  RotateCcw,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { AttendanceRecord, GpsData } from '../types';
import { CameraCapture } from './CameraCapture';
import { calculateDistanceMeters, getCurrentPositionAsync, getSimulatedPosition } from '../utils/geo';
import confetti from 'canvas-confetti';

interface TrainerCheckOutModalProps {
  record: AttendanceRecord;
  onClose: () => void;
  onConfirmCheckOut: (
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
  ) => void;
}

export const TrainerCheckOutModal: React.FC<TrainerCheckOutModalProps> = ({
  record,
  onClose,
  onConfirmCheckOut,
}) => {
  // Start attendee count from zero ("0") and allow free keyboard typing (including clearing with Backspace)
  const [attendeesInput, setAttendeesInput] = useState<string>('0');
  const [observations, setObservations] = useState<string>(record.observations || '');
  const [exitPhotoUrl, setExitPhotoUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Calculate live elapsed duration
  const now = new Date();
  const startTime = new Date(record.checkInIso);
  const diffMs = Math.max(0, now.getTime() - startTime.getTime());
  const elapsedMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));

  const handleAttendeesChange = (rawVal: string) => {
    const digitsOnly = rawVal.replace(/[^0-9]/g, '');
    if (digitsOnly === '') {
      setAttendeesInput('');
      return;
    }
    const numeric = Math.min(999, parseInt(digitsOnly, 10));
    setAttendeesInput(String(numeric));
  };

  const adjustAttendees = (delta: number) => {
    const current = attendeesInput === '' ? 0 : parseInt(attendeesInput, 10) || 0;
    const next = Math.min(999, Math.max(0, current + delta));
    setAttendeesInput(String(next));
  };

  const handleFinish = async () => {
    setValidationError(null);

    if (!exitPhotoUrl) {
      setValidationError(
        'La foto de salida con sello en el salón o sede es OBLIGATORIA para finalizar el registro.'
      );
      const photoEl = document.getElementById('checkout-mandatory-photo');
      if (photoEl) {
        photoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setSubmitting(true);
    const checkOutDate = new Date();
    const checkOutTime = checkOutDate.toLocaleTimeString('es-MX', { hour12: false });
    const checkOutIso = checkOutDate.toISOString();

    const finalAttendeesCount =
      attendeesInput.trim() === '' ? 0 : Math.min(999, Math.max(0, parseInt(attendeesInput, 10) || 0));

    // Check exit GPS position
    let exitGps: GpsData | undefined = undefined;
    try {
      const pos = await getCurrentPositionAsync(3000);
      const dist = calculateDistanceMeters(pos.lat, pos.lng, record.checkInGps.lat, record.checkInGps.lng);
      exitGps = {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        distanceToSedeMeters: dist,
        isWithinGeofence: dist <= 250,
        capturedAt: checkOutTime,
      };
    } catch {
      // fallback to simulated exit position
      const sim = getSimulatedPosition(record.checkInGps.lat, record.checkInGps.lng, 15);
      exitGps = {
        lat: sim.lat,
        lng: sim.lng,
        accuracy: 8,
        distanceToSedeMeters: 15,
        isWithinGeofence: true,
        capturedAt: checkOutTime,
      };
    }

    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch {}

    onConfirmCheckOut(record.id, {
      checkOutTime,
      checkOutIso,
      finalAttendees: finalAttendeesCount,
      observations,
      exitPhotoUrl,
      exitGps,
      durationMinutes: elapsedMinutes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        {/* Header in BSCW Red */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 p-4 sm:p-5 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 min-w-[36px] min-h-[36px] flex items-center justify-center text-white/85 hover:text-white rounded-xl bg-white/15 hover:bg-white/25 text-sm"
          >
            ✕
          </button>
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 text-center sm:text-left pr-0 sm:pr-8">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mx-auto sm:mx-0">
              <LogOut className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg leading-tight">Registrar Salida de Sede</h3>
              <p className="text-xs text-red-100 truncate max-w-[260px] sm:max-w-none mx-auto sm:mx-0">
                {record.companyName} — {record.sedeName}
              </p>
            </div>
          </div>
        </div>

        {/* Content in Light Theme */}
        <div className="p-4 sm:p-6 space-y-4 text-slate-800 flex-1 overflow-y-auto">
          {validationError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2 shadow-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <div>
                <p className="font-bold">Requisito obligatorio pendiente</p>
                <p className="mt-0.5">{validationError}</p>
              </div>
            </div>
          )}

          {/* Assignment Date Banner */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs bg-red-50 text-red-800 px-3.5 py-2.5 rounded-xl border border-red-200 shadow-xs text-center sm:text-left">
            <span className="flex items-center justify-center sm:justify-start font-semibold">
              <Calendar className="w-4 h-4 mr-1.5 text-red-600 shrink-0" />
              Fecha de la Sesión: <strong className="ml-1 text-slate-900 font-mono tabular-nums">{record.date}</strong>
            </span>
            <span className="font-mono tabular-nums text-xs font-bold text-red-700 bg-white px-2.5 py-0.5 rounded border border-red-200">
              Hora: {record.scheduledTime}
            </span>
          </div>

          {/* Summary Box */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center shadow-inner">
            <div>
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-semibold block">Entrada</span>
              <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-slate-900">
                {record.checkInTime}
              </span>
            </div>
            <div className="border-x border-slate-200 px-1">
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-semibold block">Salida Est.</span>
              <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-red-600">
                {now.toLocaleTimeString('es-MX', { hour12: false })}
              </span>
            </div>
            <div>
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-semibold block">Duración</span>
              <span className="font-bold font-mono tabular-nums text-xs sm:text-sm text-slate-900">
                {elapsedMinutes} min
              </span>
            </div>
          </div>

          {/* Activity Info */}
          <div className="text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
              <span className="text-slate-500 font-medium">Actividad:</span>
              <span className="font-bold text-slate-900">{record.activityName}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
              <span className="text-slate-500 font-medium">Salón / Área:</span>
              <span className="text-slate-700">{record.locationArea}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
              <span className="text-slate-500 font-medium">Entrenador:</span>
              <span className="text-red-600 font-bold">{record.trainerName}</span>
            </div>
          </div>

          {/* Attendees input starting from 0 and keyboard editable */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-1">
              <label
                htmlFor="checkout-attendees-input"
                className="text-xs font-bold text-slate-800 flex items-center justify-center sm:justify-start"
              >
                <Users className="w-4 h-4 mr-1.5 text-red-600 shrink-0" />
                Número Final de Colaboradores Participantes *
              </label>
              <button
                type="button"
                onClick={() => setAttendeesInput('0')}
                className="text-[11px] font-semibold text-slate-500 hover:text-red-600 flex items-center space-x-1"
                title="Reiniciar cuenta a cero"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reiniciar a 0</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 max-w-xs mx-auto sm:max-w-none">
              <button
                type="button"
                onClick={() => adjustAttendees(-1)}
                className="w-11 h-11 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center shadow-2xs active:scale-95 transition shrink-0"
                aria-label="Restar asistente"
              >
                <Minus className="w-4 h-4" />
              </button>

              <input
                id="checkout-attendees-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={attendeesInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleAttendeesChange(e.target.value)}
                onBlur={() => {
                  if (attendeesInput.trim() === '') {
                    setAttendeesInput('0');
                  }
                }}
                className="flex-1 min-h-[44px] bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-center text-lg font-bold text-slate-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 font-mono tabular-nums shadow-sm"
              />

              <button
                type="button"
                onClick={() => adjustAttendees(1)}
                className="w-11 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-sm active:scale-95 transition shrink-0"
                aria-label="Sumar asistente"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              La cuenta inicia en <strong>0</strong>. Puedes escribir la cantidad directamente o usar <strong>- / +</strong>.
            </p>
          </div>

          {/* Final Observations */}
          <div className="text-center sm:text-left">
            <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-center sm:justify-start">
              <FileText className="w-3.5 h-3.5 mr-1.5 text-red-600 shrink-0" />
              Observaciones de Cierre o Novedades de la Sesión
            </label>
            <textarea
              rows={3}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Ej: Sesión completada con total éxito. El equipo solicitó ejercicios de estiramiento..."
              className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 placeholder-slate-400 text-center sm:text-left focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-sm"
            />
          </div>

          {/* Mandatory Exit Photo Capture */}
          <div id="checkout-mandatory-photo" className="pt-3 border-t border-slate-200 space-y-2">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-slate-800 flex items-center justify-center sm:justify-start">
                <Camera className="w-4 h-4 mr-1.5 text-red-600 shrink-0" />
                Foto Obligatoria de Salida con Sello *
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
                  exitPhotoUrl
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                {exitPhotoUrl ? '✓ Capturada' : 'Obligatoria'}
              </span>
            </div>

            <CameraCapture
              trainerName={record.trainerName}
              companyName={record.companyName}
              sedeName={record.sedeName}
              activityName={record.activityName}
              gpsData={record.checkInGps}
              photoUrl={exitPhotoUrl}
              onPhotoCaptured={(url) => {
                setExitPhotoUrl(url);
                setValidationError(null);
              }}
              onPhotoCleared={() => setExitPhotoUrl(null)}
              recordType="SALIDA"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[46px] sm:min-h-0 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold border border-slate-300 transition text-center"
            >
              Cancelar
            </button>
            {!exitPhotoUrl && (
              <span className="text-[11px] text-red-600 font-semibold flex items-center justify-center sm:justify-start">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 shrink-0" />
                Requiere foto de salida con sello
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleFinish}
            disabled={submitting}
            className="w-full sm:w-auto min-h-[48px] sm:min-h-0 px-5 py-3 sm:py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-red-500/25 transition flex items-center justify-center"
          >
            <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" />
            <span>{submitting ? 'Procesando Salida...' : 'Confirmar y Finalizar Salida'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
