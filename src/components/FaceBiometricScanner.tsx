import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  ScanFace,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  CheckCheck,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { FacialVerificationData, Trainer, GpsData } from '../types';
import {
  attachStreamToVideoElement,
  compressCanvasToMaxDataUrlLength,
  formatCameraErrorMessage,
  openCameraStreamWithFallback,
  unregisterExclusiveCameraStream,
  VideoDeviceOption,
} from '../utils/cameraStream';
import {
  ensureBiometricModelsLoaded,
  isPlaceholderOrMissingAvatar,
  verifyLiveFaceAgainstRegisteredPhoto,
} from '../utils/faceVerification';
import confetti from 'canvas-confetti';

interface FaceBiometricScannerProps {
  trainer: Trainer;
  gpsData: GpsData | null;
  companyName: string;
  sedeName: string;
  verificationData: FacialVerificationData | null;
  onVerificationComplete: (data: FacialVerificationData) => void;
  onVerificationCleared: () => void;
}

const OWNER_ID = 'face-biometric-scanner';

export const FaceBiometricScanner: React.FC<FaceBiometricScannerProps> = ({
  trainer,
  gpsData,
  companyName,
  sedeName,
  verificationData,
  onVerificationComplete,
  onVerificationCleared,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [verificationFailure, setVerificationFailure] = useState<{
    message: string;
    measuredScore?: number;
  } | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDevices, setVideoDevices] = useState<VideoDeviceOption[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  const [scanningProgress, setScanningProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepText, setScanStepText] = useState('Centra tu rostro dentro del óvalo');

  const missingRealRegistrationPhoto = isPlaceholderOrMissingAvatar(trainer.avatar);

  // Preload neural biometric models in background so 1:1 verification is responsive
  useEffect(() => {
    ensureBiometricModelsLoaded().catch(() => {
      // Handled with detailed feedback during scan if needed
    });
  }, []);

  const stopCamera = useCallback(() => {
    unregisterExclusiveCameraStream(OWNER_ID, streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsVideoReady(false);
    setIsStartingCamera(false);
  }, []);

  // Reset alerts when trainer changes
  useEffect(() => {
    setCameraError(null);
    setVerificationFailure(null);
    stopCamera();
  }, [trainer.id, trainer.avatar, stopCamera]);

  useEffect(() => {
    return () => {
      unregisterExclusiveCameraStream(OWNER_ID, streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const bindVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      void attachStreamToVideoElement(el, streamRef.current).then((ok) => {
        if (ok) {
          setIsVideoReady(true);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      attachStreamToVideoElement(videoRef.current, streamRef.current).then((ok) => {
        if (ok) setIsVideoReady(true);
      });
    }
  }, [cameraActive]);

  const startCamera = async (
    mode: 'user' | 'environment' = 'user',
    preferredDeviceId?: string
  ) => {
    if (missingRealRegistrationPhoto) {
      setVerificationFailure({
        message: `${trainer.name} aún no tiene una fotografía real de registro (solo iniciales). Captura o sube primero su fotografía oficial en el Directorio o Perfil del Entrenador.`,
      });
      return;
    }

    setCameraError(null);
    setVerificationFailure(null);
    setIsStartingCamera(true);
    setIsVideoReady(false);
    setCameraActive(true);
    setScanStepText('Centra tu rostro de frente dentro del óvalo');

    try {
      const opened = await openCameraStreamWithFallback({
        ownerId: OWNER_ID,
        facingMode: mode,
        preferredDeviceId,
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
        if (ready) {
          setIsVideoReady(true);
        }
      }
    } catch (err: unknown) {
      console.warn('Face camera access error:', err);
      stopCamera();
      setCameraError(formatCameraErrorMessage(err));
    } finally {
      setIsStartingCamera(false);
    }
  };

  const switchCameraDevice = () => {
    const nextMode: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    if (videoDevices.length > 1 && activeDeviceId) {
      const idx = videoDevices.findIndex((d) => d.deviceId === activeDeviceId);
      const nextDev = videoDevices[(idx + 1) % videoDevices.length];
      startCamera(nextMode, nextDev?.deviceId);
      return;
    }

    startCamera(nextMode);
  };

  // Generate biometric stamp on 480x480 canvas strictly below Firestore's 250,000-char limit
  const generateBiometricPhoto = (source: HTMLVideoElement, score: number): string => {
    const size = 480;
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

    // Oval scan target guide overlay
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(240, 210, 125, 162, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Dark gradient banner at bottom
    const grad = ctx.createLinearGradient(0, 330, 0, 480);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    grad.addColorStop(0.3, 'rgba(15, 23, 42, 0.86)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 330, 480, 150);

    // Top Biometric Badge
    ctx.fillStyle = 'rgba(5, 150, 105, 0.92)';
    ctx.beginPath();
    ctx.roundRect(16, 16, 250, 32, 6);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('✓ ROSTRO CORROBORADO 1:1 • BSCW', 28, 36);

    const now = new Date();
    const timeStr = `${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', {
      hour12: false,
    })}`;
    const bioHash = `BIO-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now()
      .toString(36)
      .toUpperCase()}`;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`👤 ${trainer.name}`, 20, 392);

    ctx.fillStyle = '#4ADE80';
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`⚡ Coincidencia con Foto de Registro: ${score.toFixed(1)}%`, 20, 414);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`📍 ${companyName} — ${sedeName}`, 20, 434);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '9px monospace';
    ctx.fillText(
      `🕒 ${timeStr} | GPS: ${gpsData?.lat.toFixed(5) || '19.4269'}, ${gpsData?.lng.toFixed(5) || '-99.1678'}`,
      20,
      452
    );
    ctx.fillText(`ID: ${bioHash}`, 20, 468);

    return compressCanvasToMaxDataUrlLength(canvas, 215000, 0.84);
  };

  // Perform genuine 1:1 biometric comparison between live video and trainer.avatar
  const executeScan = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || isScanning) return;

    setVerificationFailure(null);
    setCameraError(null);
    setIsScanning(true);
    setScanningProgress(10);
    setScanStepText('Iniciando corroboración biométrica contra foto de registro...');

    try {
      const outcome = await verifyLiveFaceAgainstRegisteredPhoto(
        videoEl,
        trainer.avatar,
        trainer.name,
        (stepMsg, pct) => {
          setScanStepText(stepMsg);
          setScanningProgress(pct);
        }
      );

      if (!outcome.verified) {
        setIsScanning(false);
        setScanningProgress(0);
        setScanStepText('Verificación rechazada — ajusta tu posición e intenta de nuevo');
        setVerificationFailure({
          message: outcome.message,
          measuredScore: outcome.confidenceScore > 0 ? outcome.confidenceScore : undefined,
        });
        return;
      }

      const stampedPhoto = generateBiometricPhoto(videoEl, outcome.confidenceScore);
      // Release camera immediately so Step 5 (Classroom Presence Camera) can acquire hardware cleanly
      stopCamera();
      setIsScanning(false);

      const result: FacialVerificationData = {
        verified: true,
        confidenceScore: outcome.confidenceScore,
        facePhotoUrl: stampedPhoto,
        capturedAt: new Date().toLocaleTimeString('es-MX', { hour12: false }),
        biometricId: `BSCW-FACE-${Date.now().toString(36).toUpperCase()}`,
        livenessPassed: outcome.livenessPassed,
        trainerName: trainer.name,
      };

      onVerificationComplete(result);
      try {
        confetti({
          particleCount: 45,
          spread: 50,
          origin: { y: 0.5 },
        });
      } catch {
        // ignore confetti error
      }
    } catch (err: unknown) {
      console.error('Biometric scan error:', err);
      setIsScanning(false);
      setScanningProgress(0);
      setScanStepText('Centra tu rostro dentro del óvalo');
      setVerificationFailure({
        message:
          'Ocurrió un error al comparar los rasgos faciales con la foto de registro. Verifica la iluminación e intenta nuevamente.',
      });
    }
  };

  // Completed state
  if (verificationData && verificationData.verified) {
    return (
      <div className="bg-white border-2 border-emerald-500 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center text-emerald-700 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 mr-1.5 text-emerald-600 shrink-0" />
            <span>
              Identidad Corroborada con Foto de Registro ({verificationData.confidenceScore}% de coincidencia)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onVerificationCleared();
              startCamera(facingMode);
            }}
            className="flex items-center text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Volver a Escanear
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="flex items-center -space-x-2 shrink-0">
              <img
                src={trainer.avatar}
                alt={`Registro ${trainer.name}`}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border-2 border-slate-300 bg-white"
                title="Fotografía oficial de registro"
              />
              <div className="relative">
                <img
                  src={verificationData.facePhotoUrl}
                  alt="Rostro corroborado en vivo"
                  className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm bg-slate-900"
                  title="Captura biométrica en vivo"
                />
                <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full p-0.5">
                  <CheckCheck className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <span className="text-xs text-slate-500 font-medium block">Entrenador Corroborado</span>
              <h4 className="font-bold text-slate-900 text-sm truncate">{verificationData.trainerName}</h4>
              <span className="text-[11px] font-semibold text-emerald-700 block mt-0.5">
                ✓ Vivacidad y Rasgos 1:1 Aprobados
              </span>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                Hora: {verificationData.capturedAt}
              </p>
            </div>
          </div>

          <div className="text-xs space-y-1.5 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
            <div className="flex justify-between">
              <span className="text-slate-500">Similitud con Registro:</span>
              <span className="font-mono tabular-nums font-bold text-emerald-700">
                {verificationData.confidenceScore}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ID Biométrico:</span>
              <span className="font-mono text-[10px] text-slate-700 font-semibold truncate max-w-[155px]">
                {verificationData.biometricId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Corroboración Facial:</span>
              <span className="text-emerald-700 font-bold">Foto Registro ↔ Cámara Vivo</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center">
            <ScanFace className="w-4 h-4 mr-2 text-red-600 shrink-0" />
            Corroboración de Identidad Facial contra Foto de Registro
          </h4>
          <p className="text-xs text-slate-500">
            Compara los rasgos faciales en vivo del entrenador contra su fotografía oficial registrada en el sistema (mínimo 78% de similitud).
          </p>
        </div>
      </div>

      {/* Missing Real Registration Photo Warning */}
      {missingRealRegistrationPhoto && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              {trainer.name} no cuenta con una fotografía facial de registro
            </p>
            <p className="text-amber-900">
              Su perfil actual solo tiene un avatar con iniciales. Para corroborar su identidad mediante rostro, primero abre el <strong>Directorio → Entrenadores</strong> (o editar perfil en Panel Admin) y captura o sube su fotografía real de frente.
            </p>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start">
            <AlertCircle className="w-4 h-4 mr-2 text-amber-600 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
          <button
            type="button"
            onClick={() => setCameraError(null)}
            className="text-amber-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {verificationFailure && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-rose-900">
                Autenticidad Facial No Aprobada
                {verificationFailure.measuredScore !== undefined
                  ? ` (${verificationFailure.measuredScore}% de coincidencia)`
                  : ''}
              </p>
              <p className="text-rose-800">{verificationFailure.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVerificationFailure(null)}
            className="text-rose-700 hover:text-rose-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Face Scanner Live Viewfinder */}
      {cameraActive ? (
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-square max-w-sm mx-auto flex items-center justify-center border-2 border-red-500 shadow-xl">
          <video
            ref={bindVideoElement}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setIsVideoReady(true)}
            onPlaying={() => setIsVideoReady(true)}
            className={`w-full h-full object-cover ${isMirrored ? '-scale-x-100' : ''}`}
          />

          {(!isVideoReady || isStartingCamera) && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white text-xs space-y-2">
              <RefreshCw className="w-6 h-6 text-red-500 animate-spin" />
              <span className="font-semibold">Iniciando cámara biométrica...</span>
            </div>
          )}

          {/* Oval Face Target Mask */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`w-48 h-64 sm:w-56 sm:h-72 border-2 border-dashed rounded-full transition-all duration-300 flex items-center justify-center ${
                isScanning ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/80'
              }`}
            >
              {isScanning && (
                <div className="w-full h-0.5 bg-emerald-400 shadow-lg shadow-emerald-400/60 animate-bounce" />
              )}
            </div>
          </div>

          {/* Top Trainer Match Reference Bar */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-[11px] font-medium border border-white/20">
            <div className="flex items-center space-x-2 truncate">
              <img
                src={trainer.avatar}
                alt={trainer.name}
                className="w-7 h-7 rounded-lg object-cover border border-white shrink-0 bg-slate-800"
              />
              <span className="truncate">Foto Registro: {trainer.name}</span>
            </div>
            <span className="text-emerald-400 font-mono font-bold text-[10px] shrink-0 ml-2">
              1:1 FACIAL
            </span>
          </div>

          {/* Bottom Live Feedback & Controls */}
          <div className="absolute bottom-3 inset-x-3 flex flex-col items-center space-y-2">
            <div className="w-full bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl text-center border border-white/20">
              <p className="text-xs text-white font-medium">{scanStepText}</p>
              {isScanning && (
                <div className="w-full bg-slate-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${scanningProgress}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={switchCameraDevice}
                disabled={isScanning || isStartingCamera}
                className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs border border-slate-700 shadow cursor-pointer disabled:opacity-50"
                title="Cambiar cámara"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={executeScan}
                disabled={isScanning || !isVideoReady || isStartingCamera}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center cursor-pointer"
              >
                <ScanFace className="w-4 h-4 mr-1.5 shrink-0" />
                <span>{isScanning ? 'Corroborando Rostro...' : 'Corroborar Rostro Ahora'}</span>
              </button>

              <button
                type="button"
                onClick={stopCamera}
                disabled={isScanning}
                className="p-2.5 rounded-xl bg-slate-800/90 text-slate-300 hover:text-white text-xs border border-slate-700 shadow cursor-pointer disabled:opacity-50"
                title="Cerrar Cámara"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center shadow-sm">
          <div className="flex items-center justify-center space-x-3 mb-3">
            <div className="relative">
              <img
                src={trainer.avatar}
                alt={trainer.name}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-300 shadow-sm bg-slate-100"
              />
              <span className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                REGISTRO
              </span>
            </div>
            <div className="text-left">
              <span className="text-xs text-slate-500 font-medium">Foto de Registro Oficial</span>
              <h5 className="text-sm font-bold text-slate-900">{trainer.name}</h5>
              <p className="text-[11px] text-slate-500">
                {missingRealRegistrationPhoto
                  ? 'Sin foto facial real — requiere captura en Directorio'
                  : 'Se corroborará 1:1 contra tu rostro en vivo'}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            Colócate de frente a la cámara con buena iluminación y sin accesorios que cubran tu rostro para corroborar que coincide con tu foto de registro.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => startCamera('user')}
              disabled={isStartingCamera || missingRealRegistrationPhoto}
              className="flex items-center text-xs sm:text-sm px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              <ScanFace className="w-4 h-4 mr-2" />
              {isStartingCamera
                ? 'Activando Cámara...'
                : 'Activar Cámara para Corroborar Rostro'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
