import React, { useEffect, useState, useCallback } from 'react';
import {
  BellRing,
  LogOut,
  Clock,
  Volume2,
  VolumeX,
  AlarmClock,
  Building2,
  MapPin,
  AlertTriangle,
  X,
} from 'lucide-react';
import { AttendanceRecord } from '../types';
import {
  SessionAlarmStatus,
  formatSecondsClock,
  playAlarmPattern,
  stopAlarmAudioImmediately,
  triggerBrowserCheckoutNotification,
  unlockMobileAlarmAudio,
} from '../utils/sessionAlarm';

interface SessionEndAlarmModalProps {
  record: AttendanceRecord;
  alarmStatus: SessionAlarmStatus;
  isTestMode?: boolean;
  onRegisterCheckOutNow: () => void;
  onSnoozeMinutes: (minutes: number) => void;
  onDismissTemporarily: () => void;
}

export const SessionEndAlarmModal: React.FC<SessionEndAlarmModalProps> = ({
  record,
  alarmStatus,
  isTestMode = false,
  onRegisterCheckOutNow,
  onSnoozeMinutes,
  onDismissTemporarily,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [audioBlockedByMobile, setAudioBlockedByMobile] = useState(false);

  const handleManualSoundActivation = useCallback(async () => {
    setIsMuted(false);
    unlockMobileAlarmAudio();
    const ok = await playAlarmPattern({ fromUserGesture: true });
    if (ok) {
      setAudioBlockedByMobile(false);
    }
  }, []);

  // Trigger notification once when real alarm opens
  useEffect(() => {
    if (!isTestMode) {
      triggerBrowserCheckoutNotification(record);
    }
  }, [isTestMode, record.id]);

  // Trigger audio alarm pattern immediately & repeat every 3.5 seconds unless muted or 60-min grace exceeded
  useEffect(() => {
    if (isMuted || (!isTestMode && alarmStatus.hasExceededUnclosedGrace)) {
      stopAlarmAudioImmediately();
      return;
    }

    let cancelled = false;

    const triggerChime = async (skipRecent: boolean) => {
      const played = await playAlarmPattern({
        skipIfPlayedWithinMs: skipRecent ? 900 : 0,
      });
      if (!cancelled) {
        setAudioBlockedByMobile(!played);
      }
    };

    triggerChime(true);

    const interval = setInterval(() => {
      triggerChime(false);
    }, 3500);

    return () => {
      cancelled = true;
      clearInterval(interval);
      stopAlarmAudioImmediately();
    };
  }, [isMuted, isTestMode, alarmStatus.hasExceededUnclosedGrace]);

  // If mobile browser blocked autoplay after a cold reload, unlock on the very first touch anywhere
  useEffect(() => {
    if (!audioBlockedByMobile || isMuted || (!isTestMode && alarmStatus.hasExceededUnclosedGrace)) return;

    const onFirstTouch = () => {
      handleManualSoundActivation();
    };

    window.addEventListener('touchstart', onFirstTouch, { once: true, passive: true });
    window.addEventListener('click', onFirstTouch, { once: true });

    return () => {
      window.removeEventListener('touchstart', onFirstTouch);
      window.removeEventListener('click', onFirstTouch);
    };
  }, [audioBlockedByMobile, isMuted, isTestMode, alarmStatus.hasExceededUnclosedGrace, handleManualSoundActivation]);

  const elapsedFormatted = formatSecondsClock(alarmStatus.elapsedSeconds);
  const overdueFormatted = formatSecondsClock(alarmStatus.overdueSeconds);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-alarm-title"
    >
      <div className="bg-white border-2 border-red-500 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl my-auto">
        {/* Urgent Header */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 p-4 sm:p-5 text-white relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/15 blur-xl pointer-events-none" />

          <button
            type="button"
            onClick={() => {
              stopAlarmAudioImmediately();
              onDismissTemporarily();
            }}
            className="absolute top-3 right-3 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white transition z-10"
            title="Cerrar aviso temporalmente"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-3 sm:gap-3.5 relative pr-0 sm:pr-8">
            <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white text-red-600 flex items-center justify-center shrink-0 shadow-lg animate-bounce mx-auto sm:mx-0">
              <BellRing className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-300 text-slate-950 shadow-xs">
                  {isTestMode ? 'PRUEBA DE ALARMA' : '¡ALARMA DE FIN DE SESIÓN!'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/25 text-white">
                  Salida pendiente
                </span>
              </div>
              <h3
                id="session-alarm-title"
                className="font-black text-lg sm:text-xl leading-tight mt-1.5"
              >
                ¡La sesión ha finalizado!
              </h3>
              <p className="text-xs text-red-100 mt-0.5">
                No se ha detectado el registro de salida en esta sede corporativa.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 text-slate-800">
          {/* Mobile Autoplay Blocked Fallback Button */}
          {audioBlockedByMobile && !isMuted && (
            <button
              type="button"
              onClick={handleManualSoundActivation}
              className="w-full min-h-[48px] p-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-md border border-amber-500 animate-pulse transition text-center"
            >
              <Volume2 className="w-5 h-5 text-red-700 shrink-0" />
              <span>
                Toca aquí para activar el sonido de alarma en tu celular
              </span>
            </button>
          )}

          {/* Live Counter Callout */}
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center shrink-0 mx-auto sm:mx-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 block">
                  {alarmStatus.isOverdue
                    ? 'Tiempo excedido sin registrar salida'
                    : 'Tiempo transcurrido de la sesión'}
                </span>
                <span className="text-xs text-slate-600">
                  Duración: <strong>{alarmStatus.plannedDurationMinutes} min</strong> (Fin est.{' '}
                  <strong className="font-mono tabular-nums">{alarmStatus.expectedEndTimeFormatted}</strong>)
                </span>
              </div>
            </div>

            <div className="text-center sm:text-right bg-white px-4 py-2 rounded-xl border border-red-200 shadow-2xs shrink-0 w-full sm:w-auto">
              <span className="font-mono tabular-nums text-xl font-black text-red-600 block leading-none">
                {alarmStatus.isOverdue ? `+${overdueFormatted}` : elapsedFormatted}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                Total en sede: {elapsedFormatted}
              </span>
            </div>
          </div>

          {/* 60-Minute Auto-Termination as No Cerrada Warning */}
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 text-xs text-amber-950 flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <div>
              <span className="font-extrabold text-red-800 block">
                Terminación automática en 60 minutos después de la hora de término
              </span>
              <span className="text-[11px] text-amber-900 leading-relaxed">
                {alarmStatus.isOverdue ? (
                  <>
                    Tiempo restante antes de darse por <strong>TERMINADA</strong> y calificarse como <strong>NO CERRADA</strong>:{' '}
                    <strong className="font-mono tabular-nums text-red-700">
                      {formatSecondsClock(alarmStatus.remainingBeforeNonComplianceSeconds)}
                    </strong>{' '}
                    (límite <strong className="font-mono tabular-nums">{alarmStatus.autoLockDeadlineFormatted} hrs</strong>).
                  </>
                ) : (
                  <>
                    Cualquier salida que quede pendiente se dará por <strong>terminada</strong> a los <strong>60 minutos</strong> después de la hora de término y será calificada como <strong>No Cerrada</strong>.
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Session Details Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-0.5 sm:gap-2">
              <span className="text-slate-500 font-medium flex items-center justify-center sm:justify-start shrink-0">
                <Building2 className="w-3.5 h-3.5 mr-1.5 text-red-600 shrink-0" />
                Empresa y Sede:
              </span>
              <span className="font-bold text-slate-900 sm:text-right">
                {record.companyName} — {record.sedeName}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-0.5 sm:gap-2">
              <span className="text-slate-500 font-medium flex items-center justify-center sm:justify-start shrink-0">
                <MapPin className="w-3.5 h-3.5 mr-1.5 text-red-600 shrink-0" />
                Actividad / Área:
              </span>
              <span className="font-semibold text-slate-800 sm:text-right">
                {record.activityName} ({record.locationArea})
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-0.5 sm:gap-2 pt-1.5 border-t border-slate-200/80">
              <span className="text-slate-500 font-medium flex items-center justify-center sm:justify-start">
                <Clock className="w-3.5 h-3.5 mr-1.5 text-red-600 shrink-0" />
                Entrada registrada:
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {record.checkInTime} hrs • {record.trainerName}
              </span>
            </div>
          </div>

          {/* Primary Action: Register Checkout Immediately */}
          <button
            type="button"
            onClick={() => {
              stopAlarmAudioImmediately();
              onRegisterCheckOutNow();
            }}
            className="w-full min-h-[48px] py-3.5 px-5 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:to-rose-800 text-white font-black text-sm sm:text-base shadow-xl shadow-red-500/30 flex items-center justify-center gap-2.5 transition active:scale-98 text-center"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Registrar Salida y Participantes Ahora</span>
          </button>

          {/* Snooze Options if Class Extended */}
          <div className="pt-2 border-t border-slate-200 space-y-2.5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
              <span className="text-[11px] font-bold text-slate-600 flex items-center justify-center sm:justify-start">
                <AlarmClock className="w-3.5 h-3.5 mr-1 text-amber-600 shrink-0" />
                ¿La clase aún continúa? Posponer alarma:
              </span>

              <div className="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={handleManualSoundActivation}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 flex items-center space-x-1 transition"
                  title="Reproducir tono de alarma ahora"
                >
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Sonar Ahora</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMuted((prev) => {
                      const next = !prev;
                      if (next) {
                        stopAlarmAudioImmediately();
                      } else {
                        playAlarmPattern({ fromUserGesture: true });
                      }
                      return next;
                    });
                  }}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center space-x-1 transition ${
                    isMuted
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Silenciado</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-red-600 animate-pulse shrink-0" />
                      <span>Silenciar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 15].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    stopAlarmAudioImmediately();
                    onSnoozeMinutes(mins);
                  }}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold text-xs transition flex items-center justify-center space-x-1 tabular-nums"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>+{mins} min</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer subtle dismiss */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px] text-slate-500 text-center sm:text-left">
          <span>Asegúrate de tener volumen multimedia alto en tu celular.</span>
          <button
            type="button"
            onClick={() => {
              stopAlarmAudioImmediately();
              onDismissTemporarily();
            }}
            className="min-h-[36px] sm:min-h-0 px-2 font-bold text-slate-700 hover:text-red-600 underline"
          >
            Recordar en 3 min
          </button>
        </div>
      </div>
    </div>
  );
};
