import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  ImageOff,
  MapPin,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AttendanceRecord } from '../types';
import { formatDistance } from '../utils/geo';
import {
  downloadSingleEvidenceImage,
  EvidencePhotoSlot,
  exportEvidenceRecordsToPdf,
  getEvidencePhotosForRecord,
} from '../utils/evidenceExport';

interface EvidencePhotoLightboxProps {
  record: AttendanceRecord | null;
  initialSlot?: EvidencePhotoSlot;
  onClose: () => void;
  onOpenFullCertificate?: (record: AttendanceRecord) => void;
}

export const EvidencePhotoLightbox: React.FC<EvidencePhotoLightboxProps> = ({
  record,
  initialSlot = 'entry',
  onClose,
  onOpenFullCertificate,
}) => {
  const photos = useMemo(
    () => (record ? getEvidencePhotosForRecord(record) : []),
    [record]
  );

  const [activeSlot, setActiveSlot] = useState<EvidencePhotoSlot>(initialSlot);
  const [zoomLevel, setZoomLevel] = useState<1 | 1.75 | 2.5>(1);
  const [imageLoadFailed, setImageLoadFailed] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isDownloadingImg, setIsDownloadingImg] = useState<boolean>(false);

  useEffect(() => {
    if (!record) return;
    const available = getEvidencePhotosForRecord(record);
    const hasInitial = available.some((p) => p.slot === initialSlot);
    setActiveSlot(hasInitial ? initialSlot : available[0]?.slot || 'entry');
    setZoomLevel(1);
    setImageLoadFailed(false);
  }, [record, initialSlot]);

  const activeIndex = useMemo(() => {
    const idx = photos.findIndex((p) => p.slot === activeSlot);
    return idx >= 0 ? idx : 0;
  }, [photos, activeSlot]);

  const currentPhoto = photos[activeIndex] || null;

  useEffect(() => {
    if (!record) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && photos.length > 1) {
        const next = photos[(activeIndex + 1) % photos.length];
        if (next) {
          setActiveSlot(next.slot);
          setZoomLevel(1);
          setImageLoadFailed(false);
        }
      } else if (e.key === 'ArrowLeft' && photos.length > 1) {
        const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
        if (prev) {
          setActiveSlot(prev.slot);
          setZoomLevel(1);
          setImageLoadFailed(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [record, photos, activeIndex, onClose]);

  if (!record) return null;

  const handleCycleZoom = () => {
    setZoomLevel((prev) => (prev === 1 ? 1.75 : prev === 1.75 ? 2.5 : 1));
  };

  const handleDownloadCurrentPhoto = async () => {
    if (!currentPhoto) return;
    setIsDownloadingImg(true);
    try {
      await downloadSingleEvidenceImage(
        currentPhoto.url,
        `Evidencia_${currentPhoto.shortLabel}_${record.trainerName}_${record.date}`
      );
    } finally {
      setIsDownloadingImg(false);
    }
  };

  const handleDownloadRecordPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      await exportEvidenceRecordsToPdf([record], {
        title: `Acta Fotográfica de Evidencia — ${record.companyName}`,
        subtitle: `${record.sedeName} · ${record.trainerName} · ${record.date} (${record.scheduledTime} hrs)`,
        filenamePrefix: `Acta_Evidencia_${record.id}`,
        includePhotos: true,
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 print:hidden"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Toolbar */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                  {currentPhoto ? currentPhoto.title : 'Visor de Evidencias Fotográficas'}
                </h3>
                <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                  · {record.id}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {record.companyName} · {record.sedeName} · Entrenador: {record.trainerName}
              </p>
            </div>
          </div>

          {/* Photo Slot Switcher + Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {photos.length > 0 && (
              <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-xl border border-slate-700">
                {photos.map((p) => {
                  const isActive = p.slot === currentPhoto?.slot;
                  return (
                    <button
                      key={p.slot}
                      type="button"
                      onClick={() => {
                        setActiveSlot(p.slot);
                        setZoomLevel(1);
                        setImageLoadFailed(false);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-red-600 text-white'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {p.shortLabel}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handleCycleZoom}
              disabled={!currentPhoto || imageLoadFailed}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Alternar nivel de zoom"
            >
              {zoomLevel > 1 ? (
                <ZoomOut className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <ZoomIn className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className="font-mono tabular-nums">{Math.round(zoomLevel * 100)}%</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadCurrentPhoto()}
              disabled={!currentPhoto || isDownloadingImg}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Descargar esta fotografía"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isDownloadingImg ? 'Descargando...' : 'Guardar Foto'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadRecordPdf()}
              disabled={isDownloadingPdf}
              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Descargar acta individual en PDF con todas sus fotografías"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isDownloadingPdf ? 'Generando PDF...' : 'PDF del Registro'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 cursor-pointer"
              title="Cerrar visor (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Image Viewport */}
        <div className="relative flex-1 min-h-[320px] bg-black/95 overflow-auto flex items-center justify-center p-4">
          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
                if (prev) {
                  setActiveSlot(prev.slot);
                  setZoomLevel(1);
                  setImageLoadFailed(false);
                }
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-slate-900/90 hover:bg-red-600 border border-slate-700 text-white flex items-center justify-center transition cursor-pointer"
              title="Fotografía anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {currentPhoto && !imageLoadFailed ? (
            <div className="flex items-center justify-center">
              <img
                src={currentPhoto.url}
                alt={currentPhoto.title}
                referrerPolicy="no-referrer"
                onError={() => setImageLoadFailed(true)}
                onClick={handleCycleZoom}
                className={`max-h-[62vh] w-auto object-contain rounded-xl border border-slate-800 transition-transform duration-150 ${
                  zoomLevel === 1
                    ? 'scale-100 cursor-zoom-in'
                    : zoomLevel === 1.75
                    ? 'scale-[1.75] cursor-zoom-in'
                    : 'scale-[2.5] cursor-zoom-out'
                }`}
              />
            </div>
          ) : (
            <div className="text-center space-y-2 py-12 px-6 rounded-2xl bg-slate-900/80 border border-slate-800 max-w-md">
              <ImageOff className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Fotografía no disponible para visualizar
              </p>
              <p className="text-xs text-slate-400">
                El registro se encuentra almacenado en Firestore, pero este recurso de imagen no pudo renderizarse.
              </p>
            </div>
          )}

          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const next = photos[(activeIndex + 1) % photos.length];
                if (next) {
                  setActiveSlot(next.slot);
                  setZoomLevel(1);
                  setImageLoadFailed(false);
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-slate-900/90 hover:bg-red-600 border border-slate-700 text-white flex items-center justify-center transition cursor-pointer"
              title="Siguiente fotografía"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Metadata & Thumbnail Strip Footer */}
        <div className="px-4 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="space-y-1 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-white font-semibold">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                {record.date} · Prog {record.scheduledTime} · Ent {record.checkInTime}
                {record.checkOutTime ? ` · Sal ${record.checkOutTime}` : ''}
              </span>
              <span className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                {record.checkInGps.lat.toFixed(5)}, {record.checkInGps.lng.toFixed(5)} (
                {formatDistance(record.checkInGps.distanceToSedeMeters)})
              </span>
              {record.facialVerification && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold font-mono tabular-nums">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Biometría {record.facialVerification.confidenceScore}%
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Actividad: <strong className="text-slate-200">{record.activityName}</strong> ({record.locationArea} ·{' '}
              <span className="font-mono tabular-nums">{record.attendeesCount}</span> participantes)
              {record.observations ? ` — "${record.observations}"` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {photos.map((p) => {
              const selected = p.slot === currentPhoto?.slot;
              return (
                <button
                  key={p.slot}
                  type="button"
                  onClick={() => {
                    setActiveSlot(p.slot);
                    setZoomLevel(1);
                    setImageLoadFailed(false);
                  }}
                  className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition cursor-pointer shrink-0 ${
                    selected
                      ? 'border-red-500 ring-2 ring-red-500/40'
                      : 'border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                  title={p.title}
                >
                  <img
                    src={p.url}
                    alt={p.shortLabel}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}

            {onOpenFullCertificate && (
              <button
                type="button"
                onClick={() => {
                  const target = record;
                  onClose();
                  onOpenFullCertificate(target);
                }}
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Abrir Acta Completa
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
