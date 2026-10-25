import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  RotateCcw,
  Upload,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import { burnWatermarkOnImage } from '../utils/watermark';
import {
  attachStreamToVideoElement,
  formatCameraErrorMessage,
  openCameraStreamWithFallback,
  unregisterExclusiveCameraStream,
  VideoDeviceOption,
} from '../utils/cameraStream';
import { GpsData } from '../types';

interface CameraCaptureProps {
  trainerName: string;
  companyName: string;
  sedeName: string;
  activityName: string;
  gpsData: GpsData | null;
  photoUrl: string | null;
  onPhotoCaptured: (dataUrl: string) => void;
  onPhotoCleared: () => void;
  recordType?: 'ENTRADA' | 'SALIDA';
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  trainerName,
  companyName,
  sedeName,
  activityName,
  gpsData,
  photoUrl,
  onPhotoCaptured,
  onPhotoCleared,
  recordType = 'ENTRADA',
}) => {
  const ownerId = `presence-camera-${recordType}`;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [videoDevices, setVideoDevices] = useState<VideoDeviceOption[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [isMirrored, setIsMirrored] = useState<boolean>(false);

  const stopCamera = useCallback(() => {
    unregisterExclusiveCameraStream(ownerId, streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setIsVideoReady(false);
    setIsStartingCamera(false);
  }, [ownerId]);

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
    if (isCameraOpen && videoRef.current && streamRef.current) {
      attachStreamToVideoElement(videoRef.current, streamRef.current).then((ok) => {
        if (ok) setIsVideoReady(true);
      });
    }
  }, [isCameraOpen]);

  useEffect(() => {
    return () => {
      unregisterExclusiveCameraStream(ownerId, streamRef.current);
      streamRef.current = null;
    };
  }, [ownerId]);

  const startCamera = async (
    mode: 'user' | 'environment' = facingMode,
    preferredDeviceId?: string
  ) => {
    setIsStartingCamera(true);
    setIsVideoReady(false);
    setCameraError(null);
    // Mount the <video> container immediately so videoRef is guaranteed in DOM
    setIsCameraOpen(true);

    try {
      const opened = await openCameraStreamWithFallback({
        ownerId,
        facingMode: mode,
        preferredDeviceId,
        idealWidth: 1280,
        idealHeight: 720,
        onPreempted: () => {
          streamRef.current = null;
          setIsCameraOpen(false);
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
      console.warn('Classroom camera activation error:', err);
      stopCamera();
      setCameraError(formatCameraErrorMessage(err));
    } finally {
      setIsStartingCamera(false);
    }
  };

  const toggleFacingMode = () => {
    const nextMode: 'user' | 'environment' =
      facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);

    if (videoDevices.length > 1 && activeDeviceId) {
      const currentIdx = videoDevices.findIndex((d) => d.deviceId === activeDeviceId);
      const nextDevice = videoDevices[(currentIdx + 1) % videoDevices.length];
      startCamera(nextMode, nextDevice?.deviceId);
      return;
    }

    startCamera(nextMode);
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Esperando señal de video de la cámara. Intenta capturar nuevamente en un instante.');
      return;
    }

    const now = new Date();
    const dateTimeStr = `${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', {
      hour12: false,
    })}`;

    // If front camera was mirrored in preview, un-mirror or preserve natural orientation on canvas before burning text
    let sourceForWatermark: HTMLVideoElement | HTMLCanvasElement = video;
    if (isMirrored) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const tCtx = tempCanvas.getContext('2d');
      if (tCtx) {
        tCtx.translate(tempCanvas.width, 0);
        tCtx.scale(-1, 1);
        tCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        sourceForWatermark = tempCanvas;
      }
    }

    const stampedDataUrl = burnWatermarkOnImage(sourceForWatermark, {
      trainerName,
      companyName,
      sedeName,
      activityName,
      lat: gpsData?.lat || 19.4269,
      lng: gpsData?.lng || -99.1678,
      accuracy: gpsData?.accuracy || 8,
      dateTimeStr,
      recordType,
    });

    stopCamera();
    onPhotoCaptured(stampedDataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const now = new Date();
        const dateTimeStr = `${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString(
          'es-MX',
          { hour12: false }
        )}`;

        const stampedDataUrl = burnWatermarkOnImage(img, {
          trainerName,
          companyName,
          sedeName,
          activityName,
          lat: gpsData?.lat || 19.4269,
          lng: gpsData?.lng || -99.1678,
          accuracy: gpsData?.accuracy || 8,
          dateTimeStr,
          recordType,
        });

        stopCamera();
        onPhotoCaptured(stampedDataUrl);
      };
      img.onerror = () => {
        setCameraError('No se pudo procesar la fotografía seleccionada.');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // When photo has already been captured
  if (photoUrl) {
    return (
      <div className="bg-white border-2 border-red-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center text-red-600 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 mr-1.5 shrink-0" />
            <span>
              {recordType === 'SALIDA'
                ? 'Foto de Salida con Sello Oficial BSCW Check'
                : 'Foto de Presencia con Sello Oficial BSCW Check'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onPhotoCleared();
              startCamera(facingMode);
            }}
            className="flex items-center text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition font-semibold shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Tomar Otra Foto
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-80 flex items-center justify-center bg-slate-900">
          <img
            src={photoUrl}
            alt="Evidencia presencial certificada"
            className="w-full h-auto object-contain max-h-80"
          />
          <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-red-600 text-white font-bold text-[11px] shadow">
            ✓ SELLO QUEMADO
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h4 className="text-sm font-bold text-slate-800 flex items-center">
            <Camera className="w-4 h-4 mr-2 text-red-600 shrink-0" />
            {recordType === 'SALIDA'
              ? 'Foto Obligatoria de Salida en el Salón'
              : 'Foto Obligatoria de Presencia en el Salón'}
          </h4>
          <p className="text-xs text-slate-500">
            Se estampará automáticamente el sello de {recordType === 'SALIDA' ? 'SALIDA' : 'ENTRADA'}, hora exacta, GPS y entrenador.
          </p>
        </div>
      </div>

      {cameraError && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start">
            <AlertCircle className="w-4 h-4 mr-2 text-amber-600 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
          <button
            type="button"
            onClick={() => setCameraError(null)}
            className="text-amber-700 hover:text-amber-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hidden gallery input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Camera Viewfinder or Activation Prompt */}
      {isCameraOpen ? (
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-300 aspect-video max-h-88 mx-auto flex items-center justify-center shadow-lg">
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
            <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center text-white text-xs space-y-2">
              <RefreshCw className="w-6 h-6 text-red-500 animate-spin" />
              <span className="font-semibold">Activando transmisión de cámara en vivo...</span>
            </div>
          )}

          {/* Guide Overlay Grid */}
          <div className="absolute inset-3 sm:inset-4 border border-dashed border-white/40 pointer-events-none rounded-xl flex items-start justify-between p-2.5">
            <span className="text-[11px] font-mono text-white bg-black/70 px-2.5 py-1 rounded">
              Enfoca el salón, área de entrenamiento o participantes
            </span>
          </div>

          {/* Floating Controls */}
          <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-2 sm:gap-3 px-3">
            <button
              type="button"
              onClick={toggleFacingMode}
              disabled={isStartingCamera}
              className="px-3 py-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 text-white text-xs font-semibold border border-slate-700 shadow-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Cambiar entre cámara trasera y frontal"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Girar Cámara</span>
            </button>

            <button
              type="button"
              onClick={takeSnapshot}
              disabled={!isVideoReady || isStartingCamera}
              className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm shadow-xl active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>Capturar Foto con Sello</span>
            </button>

            <button
              type="button"
              onClick={stopCamera}
              className="p-2.5 rounded-xl bg-slate-900/85 hover:bg-red-900/90 text-slate-200 hover:text-white text-xs border border-slate-700 shadow-lg cursor-pointer"
              title="Cerrar Cámara"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-white shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
            <Camera className="w-6 h-6" />
          </div>
          <h5 className="text-sm font-bold text-slate-800 mb-1">
            {recordType === 'SALIDA'
              ? 'Activa la cámara para registrar tu evidencia de salida'
              : 'Activa la cámara para registrar evidencia presencial en el salón'}
          </h5>
          <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
            {recordType === 'SALIDA'
              ? 'La foto de salida es obligatoria para validar el cierre oficial de la sesión dentro de la sede.'
              : 'La foto es obligatoria para validar que el entrenador se encuentra presente en el salón o área asignada.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => startCamera('environment')}
              disabled={isStartingCamera}
              className="flex items-center text-xs sm:text-sm px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              <Camera className="w-4 h-4 mr-2" />
              {isStartingCamera ? 'Iniciando Cámara...' : 'Abrir Cámara en Vivo'}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center text-xs sm:text-sm px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold transition shadow-sm cursor-pointer"
            >
              <Upload className="w-4 h-4 mr-2 text-red-600" />
              Subir Foto desde Galería
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
