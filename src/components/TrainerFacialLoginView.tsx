import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Lock,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { Trainer, TrainerBiometricSession } from '../types';
import {
  attachStreamToVideoElement,
  compressCanvasToMaxDataUrlLength,
  formatCameraErrorMessage,
  openCameraStreamWithFallback,
  unregisterExclusiveCameraStream,
  VideoDeviceOption,
} from '../utils/cameraStream';
import {
  detectLiveFaceInOval,
  ensureBiometricModelsLoaded,
  identifyTrainerByLiveFace,
  isPlaceholderOrMissingAvatar,
  OvalAlignmentState,
} from '../utils/faceVerification';

interface TrainerFacialLoginViewProps {
  trainers: Trainer[];
  onSessionAuthenticated: (session: TrainerBiometricSession) => void;
}

const LOGIN_CAMERA_OWNER_ID = 'trainer-facial-session-login';

export const TrainerFacialLoginView: React.FC<TrainerFacialLoginViewProps> = ({
  trainers,
  onSessionAuthenticated,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loginFailure, setLoginFailure] = useState<{
    message: string;
    measuredScore?: number;
  } | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDevices, setVideoDevices] = useState<VideoDeviceOption[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  const [preferredTrainerId, setPreferredTrainerId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanningProgress, setScanningProgress] = useState(0);
  const [ovalState, setOvalState] = useState<OvalAlignmentState>('no_face');
  const [ovalHoldProgress, setOvalHoldProgress] = useState<number>(0);
  const [scanStepText, setScanStepText] = useState(
    'Coloca tu rostro dentro del óvalo para iniciar sesión automáticamente'
  );

  const alignedStreakRef = useRef<number>(0);
  const autoCooldownUntilRef = useRef<number>(0);
  const autoOpenAttemptedRef = useRef<boolean>(false);
  const authenticateFnRef = useRef<() => Promise<void>>(async () => {});

  const activeTrainers = trainers.filter((t) => t.active !== false);
  const trainersWithFacePhoto = activeTrainers.filter(
    (t) => !isPlaceholderOrMissingAvatar(t.avatar)
  );

  useEffect(() => {
    ensureBiometricModelsLoaded().catch(() => {
      // Handled with user-facing feedback when scanning
    });
  }, []);

  const stopCamera = useCallback(() => {
    unregisterExclusiveCameraStream(LOGIN_CAMERA_OWNER_ID, streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsVideoReady(false);
    setIsStartingCamera(false);
  }, []);

  useEffect(() => {
    return () => {
      unregisterExclusiveCameraStream(LOGIN_CAMERA_OWNER_ID, streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const bindVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      void attachStreamToVideoElement(el, streamRef.current).then((ok) => {
        if (ok) setIsVideoReady(true);
      });
    }
  }, []);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      void attachStreamToVideoElement(videoRef.current, streamRef.current).then((ok) => {
        if (ok) setIsVideoReady(true);
      });
    }
  }, [cameraActive]);

  const startCamera = useCallback(
    async (
      mode: 'user' | 'environment' = 'user',
      deviceIdOverride?: string,
      silentOnError: boolean = false
    ) => {
      setCameraError(null);
      setLoginFailure(null);
      setIsStartingCamera(true);
      setIsVideoReady(false);
      setCameraActive(true);
      alignedStreakRef.current = 0;
      setOvalState('no_face');
      setOvalHoldProgress(0);
      setScanStepText('Coloca tu rostro dentro del óvalo — verificación automática activa');

      try {
        const opened = await openCameraStreamWithFallback({
          ownerId: LOGIN_CAMERA_OWNER_ID,
          facingMode: mode,
          preferredDeviceId: deviceIdOverride,
          idealWidth: 640,
          idealHeight: 640,
          onPreempted: () => {
            streamRef.current = null;
            setCameraActive(false);
            setIsVideoReady(false);
          },
        });

        streamRef.current = opened.stream;
        setVideoDevices(opened.videoDevices);
        setActiveDeviceId(opened.activeDeviceId);
        setIsMirrored(mode === 'user' && opened.isMirroredSuggested);

        if (videoRef.current) {
          const ready = await attachStreamToVideoElement(videoRef.current, opened.stream);
          if (ready) setIsVideoReady(true);
        }
      } catch (err: unknown) {
        stopCamera();
        if (!silentOnError) {
          setCameraError(formatCameraErrorMessage(err));
        }
      } finally {
        setIsStartingCamera(false);
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (
      !autoOpenAttemptedRef.current &&
      trainersWithFacePhoto.length > 0 &&
      !cameraActive &&
      !isStartingCamera
    ) {
      autoOpenAttemptedRef.current = true;
      void startCamera('user', undefined, true);
    }
  }, [trainersWithFacePhoto.length, cameraActive, isStartingCamera, startCamera]);

  const switchCameraDevice = () => {
    const nextMode: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    if (videoDevices.length > 1 && activeDeviceId) {
      const idx = videoDevices.findIndex((d) => d.deviceId === activeDeviceId);
      const nextDev = videoDevices[(idx + 1) % videoDevices.length];
      void startCamera(nextMode, nextDev?.deviceId);
      return;
    }

    void startCamera(nextMode);
  };

  const captureSessionFaceSnapshot = (
    source: HTMLVideoElement,
    trainerName: string,
    score: number
  ): string => {
    const size = 360;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const vw = source.videoWidth || 640;
    const vh = source.videoHeight || 480;
    const minSide = Math.min(vw, vh);
    const sx = (vw - minSide) / 2;
    const sy = (vh - minSide) / 2;

    ctx.save();
    if (isMirrored) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, sx, sy, minSide, minSide, 0, 0, size, size);
    ctx.restore();

    const grad = ctx.createLinearGradient(0, 260, 0, 360);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 260, size, 100);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(trainerName, 14, 326);

    ctx.fillStyle = '#4ADE80';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(`ACCESO FACIAL ${score.toFixed(1)}%`, 14, 344);

    return compressCanvasToMaxDataUrlLength(canvas, 120000, 0.8);
  };

  const handleAuthenticateByFace = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || isScanning) return;

    setLoginFailure(null);
    setCameraError(null);
    setIsScanning(true);
    setScanningProgress(12);
    setScanStepText('Iniciando identificación biométrica del entrenador...');

    try {
      const outcome = await identifyTrainerByLiveFace(
        videoEl,
        activeTrainers,
        (msg, pct) => {
          setScanStepText(msg);
          setScanningProgress(pct);
        },
        preferredTrainerId || undefined
      );

      if (!outcome.verified || !outcome.matchedTrainer) {
        autoCooldownUntilRef.current = Date.now() + 3500;
        alignedStreakRef.current = 0;
        setOvalHoldProgress(0);
        setOvalState('no_face');
        setIsScanning(false);
        setScanningProgress(0);
        setScanStepText('Acceso no aprobado — centra tu rostro en el óvalo para reintentar');
        setLoginFailure({
          message: outcome.message,
          measuredScore: outcome.confidenceScore > 0 ? outcome.confidenceScore : undefined,
        });
        return;
      }

      const snapshotUrl = captureSessionFaceSnapshot(
        videoEl,
        outcome.matchedTrainer.name,
        outcome.confidenceScore
      );
      stopCamera();
      setIsScanning(false);

      const now = new Date();
      const session: TrainerBiometricSession = {
        trainerId: outcome.matchedTrainer.id,
        trainerName: outcome.matchedTrainer.name,
        confidenceScore: outcome.confidenceScore,
        biometricId: `SES-BIO-${Date.now().toString(36).toUpperCase()}`,
        authenticatedAt: now.toLocaleTimeString('es-MX', { hour12: false }),
        authenticatedIso: now.toISOString(),
        facePhotoUrl: snapshotUrl || undefined,
      };

      onSessionAuthenticated(session);
    } catch (err) {
      console.error('Facial session login error:', err);
      autoCooldownUntilRef.current = Date.now() + 3500;
      alignedStreakRef.current = 0;
      setOvalHoldProgress(0);
      setOvalState('no_face');
      setIsScanning(false);
      setScanningProgress(0);
      setScanStepText('Coloca tu rostro dentro del óvalo para reintentar');
      setLoginFailure({
        message:
          'No fue posible completar la lectura biométrica. Verifica la iluminación frontal e inténtalo de nuevo.',
      });
    }
  };

  authenticateFnRef.current = handleAuthenticateByFace;

  // Automatic verification loop when trainer places their face inside the oval guide
  useEffect(() => {
    if (
      !cameraActive ||
      !isVideoReady ||
      isScanning ||
      isStartingCamera ||
      trainersWithFacePhoto.length === 0
    ) {
      alignedStreakRef.current = 0;
      setOvalHoldProgress(0);
      return;
    }

    let cancelled = false;
    let checking = false;

    const timer = window.setInterval(async () => {
      if (cancelled || checking || !videoRef.current) return;
      if (Date.now() < autoCooldownUntilRef.current) {
        alignedStreakRef.current = 0;
        setOvalHoldProgress(0);
        return;
      }

      checking = true;
      try {
        const check = await detectLiveFaceInOval(videoRef.current);
        if (cancelled) return;

        setOvalState(check.state);

        if (check.aligned) {
          alignedStreakRef.current += 1;
          if (alignedStreakRef.current === 1) {
            setOvalHoldProgress(55);
            setScanStepText('Rostro en el óvalo — mantén tu mirada al frente un instante...');
          } else if (alignedStreakRef.current >= 2) {
            alignedStreakRef.current = 0;
            setOvalHoldProgress(100);
            void authenticateFnRef.current();
          }
        } else {
          alignedStreakRef.current = 0;
          setOvalHoldProgress(0);
          setScanStepText(check.hint);
        }
      } catch {
        // Ignore transient detector frame errors
      } finally {
        checking = false;
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cameraActive, isVideoReady, isScanning, isStartingCamera, trainersWithFacePhoto.length]);

  return (
    <div className="w-full max-w-4xl mx-auto px-3.5 sm:px-6 py-5 sm:py-12">
      <div className="bg-white border border-slate-200/90 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
        {/* Top Header */}
        <div className="p-5 sm:p-8 border-b border-slate-200 flex flex-col sm:flex-row items-center sm:items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-3.5 w-full">
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm mx-auto sm:mx-0">
              <ScanFace className="w-6 h-6" />
            </div>
            <div className="mx-auto sm:mx-0">
              <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight text-balance">
                Acceso Individual de Entrenador
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl mx-auto sm:mx-0 leading-relaxed">
                Ingresa mediante reconocimiento facial en vivo. Al verificar tu identidad contra tu fotografía de registro, se abrirá tu sesión privada con acceso exclusivo a tus clases asignadas.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          {/* Left Column: Camera Biometric Gate */}
          <div className="lg:col-span-7 space-y-4 w-full">
            {/* Optional profile filter (only names, never schedules) */}
            <div className="text-center sm:text-left">
              <label
                htmlFor="trainer-face-login-filter"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Modo de identificación facial
              </label>
              <select
                id="trainer-face-login-filter"
                value={preferredTrainerId}
                onChange={(e) => {
                  setPreferredTrainerId(e.target.value);
                  setLoginFailure(null);
                }}
                disabled={isScanning}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 font-medium text-center sm:text-left focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              >
                <option value="">
                  Reconocimiento facial automático (Identificar mi rostro)
                </option>
                {activeTrainers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    Corroboración 1:1 — {tr.name}
                    {isPlaceholderOrMissingAvatar(tr.avatar) ? ' (Sin foto)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {trainersWithFacePhoto.length === 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-bold">No hay fotografías faciales registradas todavía</p>
                  <p className="mt-0.5 text-amber-900">
                    Para ingresar con reconocimiento facial, un administrador debe capturar o subir la foto de frente de cada entrenador en <strong>Panel Admin → Entrenadores</strong> o en el <strong>Directorio</strong>.
                  </p>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCameraError(null)}
                  className="min-w-[32px] min-h-[32px] flex items-center justify-center text-amber-800 font-bold shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {loginFailure && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-rose-900 tabular-nums">
                      Identidad No Verificada
                      {loginFailure.measuredScore !== undefined
                        ? ` (${loginFailure.measuredScore}% de similitud)`
                        : ''}
                    </p>
                    <p className="text-rose-800">{loginFailure.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLoginFailure(null)}
                  className="min-w-[32px] min-h-[32px] flex items-center justify-center text-rose-700 hover:text-rose-950 font-bold shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Live Scanner Box */}
            {cameraActive ? (
              <div className="space-y-3.5 flex flex-col items-center">
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-square w-full max-w-[310px] sm:max-w-sm mx-auto flex items-center justify-center border-2 border-red-500 shadow-lg">
                  <video
                    ref={bindVideoElement}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => setIsVideoReady(true)}
                    onPlaying={() => setIsVideoReady(true)}
                    className={`w-full h-full object-cover ${isMirrored ? '-scale-x-100' : ''}`}
                  />

                  {/* Oval Guide Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-5 sm:p-6">
                    <div
                      className={`w-44 h-60 sm:w-56 sm:h-72 rounded-full transition-all duration-200 ${
                        isScanning || ovalState === 'aligned'
                          ? 'border-[3px] border-emerald-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.56)]'
                          : ovalState === 'off_center' ||
                              ovalState === 'too_far' ||
                              ovalState === 'too_close' ||
                              ovalState === 'too_dark'
                            ? 'border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.50)]'
                            : 'border-2 border-white/85 shadow-[0_0_0_9999px_rgba(15,23,42,0.48)]'
                      }`}
                    />
                  </div>

                  {/* Top Camera Controls */}
                  <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-[11px] font-semibold">
                      {isStartingCamera
                        ? 'Abriendo cámara...'
                        : isScanning
                          ? 'Verificando identidad...'
                          : isVideoReady
                            ? 'Auto-verificación en óvalo'
                            : 'Preparando video...'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={switchCameraDevice}
                        disabled={isScanning || isStartingCamera}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white border border-white/15 transition disabled:opacity-50"
                        title="Cambiar cámara frontal / trasera"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        disabled={isScanning}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-slate-900/80 hover:bg-rose-600 text-white border border-white/15 transition disabled:opacity-50"
                        title="Cerrar cámara"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Step Status + Progress */}
                  <div className="absolute bottom-2.5 inset-x-2.5 bg-slate-900/85 border border-white/15 rounded-xl p-2.5 text-center space-y-1.5">
                    <p className="text-[11px] font-medium text-white leading-snug">{scanStepText}</p>
                    {(isScanning || ovalHoldProgress > 0) && (
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-300"
                          style={{
                            width: `${isScanning ? scanningProgress : ovalHoldProgress}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    autoCooldownUntilRef.current = 0;
                    void handleAuthenticateByFace();
                  }}
                  disabled={!isVideoReady || isScanning || isStartingCamera}
                  className="w-full max-w-sm mx-auto min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ScanFace className="w-4 h-4 shrink-0" />
                  <span>
                    {isScanning
                      ? 'Verificando identidad facial...'
                      : 'Capturar Manualmente (Auto-detección activa)'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-8 text-center space-y-4 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 text-red-600 flex items-center justify-center mx-auto shadow-xs">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h2 className="text-base font-bold text-slate-900 text-balance">
                    Verificación Facial Requerida para Ver Tus Sesiones
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Activa tu cámara frontal, ubica tu rostro dentro de la guía y el sistema abrirá únicamente las sesiones, sedes y bitácora asignadas a tu perfil.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void startCamera(facingMode)}
                  disabled={isStartingCamera}
                  className="w-full max-w-sm mx-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md transition text-center leading-snug disabled:opacity-50"
                >
                  <ScanFace className="w-5 h-5 shrink-0" />
                  <span>
                    {isStartingCamera ? 'Iniciando cámara...' : 'Activar Cámara e Iniciar Sesión Facial'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Privacy & Session Isolation Rules */}
          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 w-full">
            <div className="flex items-center justify-center sm:justify-start space-x-2 text-slate-900 font-bold text-sm text-center sm:text-left">
              <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />
              <h3>Sesión Individual y Privacidad</h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed text-left">
              <div className="flex items-start space-x-2.5">
                <UserCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">Reconocimiento biométrico 1:1 / 1:N:</strong> Tu rostro en vivo se compara contra tu fotografía oficial registrada (mínimo <span className="font-mono tabular-nums font-semibold">78%</span> de coincidencia).
                </p>
              </div>

              <div className="flex items-start space-x-2.5">
                <Lock className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">Visibilidad exclusiva:</strong> Cada entrenador visualiza únicamente sus propias asignaciones, horarios, sedes y registros personales; las sesiones de otros entrenadores permanecen ocultas.
                </p>
              </div>

              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-900">Cierre de sesión individual:</strong> Al finalizar tu jornada o cambiar de dispositivo compartido, pulsa <strong>«Salir»</strong> en la barra superior para bloquear tu cuenta.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Perfiles con biometría activa</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {trainersWithFacePhoto.length} / {activeTrainers.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
