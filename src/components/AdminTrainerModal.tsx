import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trainer } from '../types';
import {
  UserCheck,
  Check,
  Image as ImageIcon,
  Camera,
  Upload,
  RefreshCw,
  X,
  Link2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  attachStreamToVideoElement,
  captureSquareAvatarFromSource,
  formatCameraErrorMessage,
  openCameraStreamWithFallback,
  unregisterExclusiveCameraStream,
  VideoDeviceOption,
} from '../utils/cameraStream';
import { validateFaceInRegistrationPhoto } from '../utils/faceVerification';

interface AdminTrainerModalProps {
  trainer: Trainer | null; // null if creating a new one
  isOpen: boolean;
  onClose: () => void;
  onSave: (trainer: Trainer) => void;
}

const OWNER_ID = 'admin-trainer-modal-camera';

const PRESET_SPECIALTIES = [
  'Pausas Activas',
  'Entrenamiento Funcional',
  'Ergonomía Laboral',
  'Yoga Corporativo',
  'Pilates Mat',
  'Mindfulness y Respiración',
  'HIIT & Cardio',
  'Zumba / Ritmos Latinos',
  'Movilidad Articular',
  'Tonificación con Bandas',
  'Gimnasia Cerebral',
];

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=360&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=360&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=360&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=360&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=360&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=360&auto=format&fit=crop&q=80',
];

function processImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const dataUrl = captureSquareAvatarFromSource(img, {
          mirrorHorizontal: false,
          targetSize: 340,
          maxDataUrlChars: 120000,
        });
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('No se pudo procesar la imagen seleccionada.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export const AdminTrainerModal: React.FC<AdminTrainerModalProps> = ({
  trainer,
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState(PRESET_AVATARS[0]);
  const [specialties, setSpecialties] = useState<string[]>(['Pausas Activas']);
  const [active, setActive] = useState(true);
  const [customSpecialty, setCustomSpecialty] = useState('');

  // Photo upload / camera states
  const [photoSourceLabel, setPhotoSourceLabel] = useState<string>('Avatar actual');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [biometricFaceNotice, setBiometricFaceNotice] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showUrlAndPresets, setShowUrlAndPresets] = useState(false);

  // Live Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDevices, setVideoDevices] = useState<VideoDeviceOption[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = useCallback(() => {
    unregisterExclusiveCameraStream(OWNER_ID, streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsVideoReady(false);
    setIsStartingCamera(false);
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
    if (isCameraActive && videoRef.current && streamRef.current) {
      attachStreamToVideoElement(videoRef.current, streamRef.current).then((ok) => {
        if (ok) setIsVideoReady(true);
      });
    }
  }, [isCameraActive]);

  useEffect(() => {
    if (trainer) {
      setName(trainer.name);
      setEmail(trainer.email);
      setPhone(trainer.phone);
      setAvatar(trainer.avatar);
      setSpecialties(trainer.specialties || ['Pausas Activas']);
      setActive(trainer.active !== false);
      setPhotoSourceLabel(
        trainer.avatar?.startsWith('data:image/jpeg')
          ? 'Foto personalizada cargada'
          : 'Foto de perfil actual'
      );
    } else {
      setName('');
      setEmail('');
      setPhone('');
      setAvatar(PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)]);
      setSpecialties(['Pausas Activas', 'Entrenamiento Funcional']);
      setActive(true);
      setPhotoSourceLabel('Avatar predeterminado');
    }
    setPhotoError(null);
    setBiometricFaceNotice(null);
    setShowUrlAndPresets(false);
    stopCameraStream();
  }, [trainer, isOpen, stopCameraStream]);

  useEffect(() => {
    return () => {
      unregisterExclusiveCameraStream(OWNER_ID, streamRef.current);
      streamRef.current = null;
    };
  }, []);

  if (!isOpen) return null;

  const verifyCapturedOrUploadedFace = async (imgUrl: string) => {
    const check = await validateFaceInRegistrationPhoto(imgUrl);
    setBiometricFaceNotice(check);
  };

  const handleFileSelected = async (file: File | undefined, sourceDescription: string) => {
    if (!file) return;
    setPhotoError(null);
    setBiometricFaceNotice(null);
    if (!file.type.startsWith('image/')) {
      setPhotoError('Por favor selecciona un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }
    try {
      const dataUrl = await processImageFileToDataUrl(file);
      setAvatar(dataUrl);
      setPhotoSourceLabel(sourceDescription);
      stopCameraStream();
      verifyCapturedOrUploadedFace(dataUrl);
    } catch {
      setPhotoError('No fue posible cargar la imagen. Intenta con otra fotografía.');
    }
  };

  const startLiveCamera = async (
    desiredFacing: 'user' | 'environment' = facingMode,
    preferredDeviceId?: string
  ) => {
    setPhotoError(null);
    setBiometricFaceNotice(null);
    setIsStartingCamera(true);
    setIsVideoReady(false);
    setIsCameraActive(true);

    try {
      const opened = await openCameraStreamWithFallback({
        ownerId: OWNER_ID,
        facingMode: desiredFacing,
        preferredDeviceId,
        idealWidth: 640,
        idealHeight: 640,
        onPreempted: () => {
          streamRef.current = null;
          setIsCameraActive(false);
          setIsVideoReady(false);
        },
      });

      streamRef.current = opened.stream;
      setVideoDevices(opened.videoDevices);
      setActiveDeviceId(opened.activeDeviceId);
      setIsMirrored(desiredFacing === 'user' && opened.isMirroredSuggested);

      if (videoRef.current) {
        const ready = await attachStreamToVideoElement(videoRef.current, opened.stream);
        if (ready) {
          setIsVideoReady(true);
        }
      }
    } catch (err: unknown) {
      stopCameraStream();
      setPhotoError(formatCameraErrorMessage(err));
    } finally {
      setIsStartingCamera(false);
    }
  };

  const toggleCameraFacing = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (videoDevices.length > 1 && activeDeviceId) {
      const idx = videoDevices.findIndex((d) => d.deviceId === activeDeviceId);
      const nextDev = videoDevices[(idx + 1) % videoDevices.length];
      startLiveCamera(next, nextDev?.deviceId);
      return;
    }
    startLiveCamera(next);
  };

  const captureFromLiveCamera = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setPhotoError('Esperando señal de video de la cámara. Intenta de nuevo en un segundo.');
      return;
    }

    const capturedDataUrl = captureSquareAvatarFromSource(video, {
      mirrorHorizontal: isMirrored,
      targetSize: 340,
      maxDataUrlChars: 120000,
    });
    setAvatar(capturedDataUrl);
    setPhotoSourceLabel('Capturada con cámara');
    stopCameraStream();
    verifyCapturedOrUploadedFace(capturedDataUrl);
  };

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelected(droppedFile, `Archivo subido: ${droppedFile.name}`);
    }
  };

  const toggleSpecialty = (spec: string) => {
    if (specialties.includes(spec)) {
      if (specialties.length > 1) {
        setSpecialties(specialties.filter((s) => s !== spec));
      }
    } else {
      setSpecialties([...specialties, spec]);
    }
  };

  const addCustomSpecialty = () => {
    if (customSpecialty.trim() && !specialties.includes(customSpecialty.trim())) {
      setSpecialties([...specialties, customSpecialty.trim()]);
      setCustomSpecialty('');
    }
  };

  const handleCloseModal = () => {
    stopCameraStream();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    stopCameraStream();

    const savedTrainer: Trainer = {
      id: trainer ? trainer.id : `tr_${Date.now()}`,
      name: name.trim(),
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '.')}@bscw.corp`,
      phone: phone.trim() || '+52 55 0000 0000',
      avatar,
      specialties: specialties.length > 0 ? specialties : ['Pausas Activas'],
      active,
    };

    onSave(savedTrainer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner shrink-0">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                {trainer ? 'Editar Entrenador' : 'Agregar Nuevo Entrenador'}
              </h3>
              <p className="text-xs text-red-100">
                Gestión de perfil, fotografía oficial de registro facial y especialidades BSCW
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="text-white/80 hover:text-white p-1.5 rounded-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-slate-800 text-xs flex-1 overflow-y-auto">
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFileSelected(e.target.files?.[0], 'Seleccionada de Galería');
              e.target.value = '';
            }}
          />
          <input
            ref={fileUploadInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              handleFileSelected(f, f ? `Archivo: ${f.name}` : 'Archivo subido');
              e.target.value = '';
            }}
          />

          {/* Avatar / Profile Photo Section */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="font-bold text-slate-800 text-xs sm:text-sm">
                Fotografía de Registro (Referencia Biométrica 1:1)
              </label>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                {photoSourceLabel}
              </span>
            </div>

            {/* Current Avatar + 3 Main Upload Methods */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative shrink-0">
                <img
                  src={avatar}
                  alt="Foto del entrenador"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-red-500 shadow-md bg-white"
                />
              </div>

              <div className="flex-1 w-full space-y-2">
                <p className="text-[11px] text-slate-500 font-medium">
                  Captura una foto de frente con cámara o sube una imagen clara del rostro:
                </p>

                <div className="grid grid-cols-3 gap-2">
                  {/* Option 1: Galería */}
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-700 hover:text-red-700 font-bold transition shadow-2xs gap-1 cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-red-600" />
                    <span className="text-[11px]">Galería</span>
                  </button>

                  {/* Option 2: Cámara en Vivo */}
                  <button
                    type="button"
                    onClick={() => (isCameraActive ? stopCameraStream() : startLiveCamera('user'))}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border font-bold transition shadow-2xs gap-1 cursor-pointer ${
                      isCameraActive
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white hover:bg-red-50 border-slate-200 hover:border-red-300 text-slate-700 hover:text-red-700'
                    }`}
                  >
                    <Camera className={`w-4 h-4 ${isCameraActive ? 'text-white' : 'text-red-600'}`} />
                    <span className="text-[11px]">{isCameraActive ? 'Cerrar Cámara' : 'Cámara'}</span>
                  </button>

                  {/* Option 3: Subir Archivo */}
                  <button
                    type="button"
                    onClick={() => fileUploadInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-700 hover:text-red-700 font-bold transition shadow-2xs gap-1 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-red-600" />
                    <span className="text-[11px]">Subir Archivo</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            {!isCameraActive && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleDropFile}
                onClick={() => fileUploadInputRef.current?.click()}
                className={`cursor-pointer border border-dashed rounded-xl px-3 py-2 text-center transition ${
                  isDraggingFile
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-slate-300 bg-white/80 hover:border-red-300 text-slate-500'
                }`}
              >
                <span className="text-[11px] font-medium">
                  Arrastra una imagen aquí o haz clic para seleccionar archivo (<strong className="text-slate-700">JPG, PNG, WEBP</strong>)
                </span>
              </div>
            )}

            {/* Live Camera Preview Box */}
            {isCameraActive && (
              <div className="bg-slate-900 rounded-2xl p-3 text-white space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-red-300 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5" />
                    Cámara activa en vivo
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      disabled={isStartingCamera}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center space-x-1 cursor-pointer"
                      title="Cambiar cámara frontal/trasera"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Girar</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCameraStream}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="relative w-52 h-52 mx-auto rounded-2xl overflow-hidden border-2 border-red-500 bg-black flex items-center justify-center">
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
                    <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center text-white text-[11px] space-y-1.5">
                      <RefreshCw className="w-5 h-5 text-red-500 animate-spin" />
                      <span>Iniciando cámara...</span>
                    </div>
                  )}
                  <div className="absolute inset-4 border border-dashed border-white/50 rounded-full pointer-events-none" />
                </div>

                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={captureFromLiveCamera}
                    disabled={!isVideoReady || isStartingCamera}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capturar Fotografía de Registro</span>
                  </button>
                </div>
              </div>
            )}

            {biometricFaceNotice && (
              <div
                className={`text-[11px] font-semibold rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 border ${
                  biometricFaceNotice.valid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {biometricFaceNotice.valid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                )}
                <span>{biometricFaceNotice.message}</span>
              </div>
            )}

            {photoError && (
              <p className="text-[11px] text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                {photoError}
              </p>
            )}

            {/* Collapsible Presets & URL option */}
            <div className="pt-1 border-t border-slate-200/80">
              <button
                type="button"
                onClick={() => setShowUrlAndPresets((prev) => !prev)}
                className="text-[11px] font-semibold text-slate-500 hover:text-red-600 flex items-center space-x-1 cursor-pointer"
              >
                <Link2 className="w-3 h-3" />
                <span>
                  {showUrlAndPresets
                    ? 'Ocultar avatares predeterminados y enlace URL'
                    : 'Usar avatar predeterminado o pegar enlace URL'}
                </span>
              </button>

              {showUrlAndPresets && (
                <div className="mt-2.5 space-y-2">
                  <div className="flex items-center space-x-2">
                    {PRESET_AVATARS.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setAvatar(url);
                          setPhotoSourceLabel('Avatar predeterminado');
                          verifyCapturedOrUploadedFace(url);
                        }}
                        className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                          avatar === url
                            ? 'border-red-600 scale-105'
                            : 'border-slate-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`Preset ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <input
                    type="url"
                    value={avatar.startsWith('data:') ? '' : avatar}
                    onChange={(e) => {
                      setAvatar(e.target.value);
                      setPhotoSourceLabel('URL externa');
                    }}
                    placeholder="https://ejemplo.com/foto-entrenador.jpg"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-red-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nombre Completo del Entrenador *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Carlos Mendoza"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-semibold focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@bscw.corp"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Teléfono de Contacto
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+52 55 1234 5678"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Specialties */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Especialidades y Habilidades (Selecciona las que apliquen)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {PRESET_SPECIALTIES.map((spec) => {
                const selected = specialties.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => toggleSpecialty(spec)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition flex items-center cursor-pointer ${
                      selected
                        ? 'bg-red-600 text-white font-bold shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 mr-1" />}
                    {spec}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add custom specialty */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={customSpecialty}
              onChange={(e) => setCustomSpecialty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomSpecialty();
                }
              }}
              placeholder="Agregar otra especialidad..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-red-500"
            />
            <button
              type="button"
              onClick={addCustomSpecialty}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl border border-slate-300 text-xs cursor-pointer"
            >
              Agregar
            </button>
          </div>

          {/* Status Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="font-bold text-slate-800 block">Estado del Entrenador</span>
              <span className="text-[11px] text-slate-500">
                {active ? 'Habilitado para visitas y clases' : 'Deshabilitado temporalmente'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-500/20 cursor-pointer"
            >
              {trainer ? 'Guardar Cambios' : 'Crear Entrenador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
