import React, { useRef, useState, useEffect } from 'react';
import { 
  Camera, 
  RotateCcw, 
  Check, 
  Upload, 
  AlertCircle, 
  Sparkles, 
  Image as ImageIcon,
  ShieldCheck
} from 'lucide-react';
import { burnWatermarkOnImage } from '../utils/watermark';
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setIsStartingCamera(true);
    setCameraError(null);

    // Stop current stream if any
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Cámara no compatible en este navegador.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Camera error:', err);
      let msg = 'No se pudo acceder a la cámara en vivo.';
      if (err.name === 'NotAllowedError') {
        msg = 'Permiso de cámara denegado. Puedes subir una foto o usar simulación.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No se detectó un dispositivo de cámara activo.';
      }
      setCameraError(msg);
    } finally {
      setIsStartingCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // Flip camera between front and back
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture current video frame and burn watermark
  const takeSnapshot = () => {
    if (!videoRef.current) return;

    const now = new Date();
    const dateTimeStr = `${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', { hour12: false })}`;

    const stampedDataUrl = burnWatermarkOnImage(videoRef.current, {
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

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const now = new Date();
        const dateTimeStr = `${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', { hour12: false })}`;

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
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Simulate corporate gym/salon photo
  const simulatePhoto = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw stylish salon background in bright energetic tones
    const bgGradient = ctx.createLinearGradient(0, 0, 640, 480);
    bgGradient.addColorStop(0, '#f8fafc');
    bgGradient.addColorStop(0.5, '#e2e8f0');
    bgGradient.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 640, 480);

    // Modern studio floor lines
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    for (let y = 180; y <= 480; y += 45) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }

    // Yoga mats representation
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(80, 240, 140, 180);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(250, 240, 140, 180);
    ctx.fillStyle = '#059669';
    ctx.fillRect(420, 240, 140, 180);

    // Trainer silhouette / presence
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(320, 140, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(320, 220, 45, 60, 0, 0, Math.PI * 2);
    ctx.fill();

    const now = new Date();
    const dateTimeStr = `${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', { hour12: false })}`;

    const stamped = burnWatermarkOnImage(canvas as any, {
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
    onPhotoCaptured(stamped);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // When photo has already been captured
  if (photoUrl) {
    return (
      <div className="bg-white border-2 border-red-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center text-red-600 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 mr-1.5" />
            {recordType === 'SALIDA'
              ? 'Foto de Salida con Sello Oficial BSCW Check'
              : 'Foto de Presencia con Sello Oficial BSCW Check'}
          </div>
          <button
            type="button"
            onClick={() => {
              onPhotoCleared();
              startCamera();
            }}
            className="flex items-center text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Tomar Otra Foto
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-80 flex items-center justify-center bg-slate-900 shadow-inner">
          <img
            src={photoUrl}
            alt="Evidencia presencial certificada"
            className="w-full h-auto object-contain max-h-80"
          />
          <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-red-600 text-white font-bold text-[11px] shadow">
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
            <Camera className="w-4 h-4 mr-2 text-red-600" />
            {recordType === 'SALIDA'
              ? 'Foto Obligatoria de Salida en Salón / Sede'
              : 'Foto Obligatoria de Presencia en Salón / Sede'}
          </h4>
          <p className="text-xs text-slate-500">
            Se estampará automáticamente el sello de {recordType === 'SALIDA' ? 'SALIDA' : 'ENTRADA'}, hora exacta, GPS y entrenador.
          </p>
        </div>

        {/* Quick simulation helper */}
        <button
          type="button"
          onClick={simulatePhoto}
          className="self-start sm:self-auto flex items-center text-xs px-2.5 py-1.5 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-slate-200 shadow-sm transition font-medium"
          title="Genera foto de demostración de salón con sello en tiempo real"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1 text-red-600" />
          Foto Demo Rápida
        </button>
      </div>

      {cameraError && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 text-amber-600 shrink-0" />
            <span>{cameraError}</span>
          </div>
        </div>
      )}

      {/* Camera Viewfinder or Prompt */}
      {stream ? (
        <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-300 aspect-video max-h-80 mx-auto flex items-center justify-center shadow-lg">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Guide Overlay Grid */}
          <div className="absolute inset-4 border border-dashed border-white/40 pointer-events-none rounded-lg flex items-end p-3">
            <span className="text-[11px] font-mono text-red-200 bg-black/70 px-2.5 py-1 rounded">
              Enfoca el salón, área de entrenamiento o personal
            </span>
          </div>

          {/* Floating Controls */}
          <div className="absolute bottom-3 inset-x-0 flex items-center justify-center space-x-2 sm:space-x-4 px-2">
            <button
              type="button"
              onClick={toggleFacingMode}
              className="p-2 sm:p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white text-xs border border-slate-700 shadow-lg"
              title="Girar Cámara"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={takeSnapshot}
              className="flex items-center space-x-1.5 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs sm:text-sm shadow-xl hover:scale-105 active:scale-95 transition"
            >
              <Camera className="w-4 h-4 mr-1 shrink-0" />
              <span>Capturar Foto con Sello</span>
            </button>

            <button
              type="button"
              onClick={stopCamera}
              className="p-2 sm:p-2.5 rounded-full bg-slate-900/80 hover:bg-red-900/90 text-slate-300 hover:text-white text-xs border border-slate-700 shadow-lg"
              title="Cerrar Cámara"
            >
              ✕
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
              : 'Activa la cámara para registrar evidencia presencial'}
          </h5>
          <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
            {recordType === 'SALIDA'
              ? 'La foto de salida es obligatoria para validar el cierre oficial de la sesión dentro de la sede.'
              : 'La foto es obligatoria para validar que el entrenador se encuentra dentro del área de la empresa.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => startCamera('environment')}
              disabled={isStartingCamera}
              className="flex items-center text-xs sm:text-sm px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4 mr-2" />
              {isStartingCamera ? 'Iniciando Cámara...' : 'Abrir Cámara en Vivo'}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center text-xs sm:text-sm px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold transition shadow-sm"
            >
              <Upload className="w-4 h-4 mr-2 text-red-600" />
              Subir Foto desde Galería
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
};
