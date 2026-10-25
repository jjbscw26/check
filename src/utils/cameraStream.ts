/**
 * Shared WebRTC Camera Stream & Image Compression Coordinator
 *
 * Solves common cross-device camera issues:
 * 1. Hardware camera lock conflicts (stops any previously active MediaStream across the app before opening a new one).
 * 2. OverconstrainedError / single-webcam desktop fallbacks (progressively relaxes facingMode & resolution constraints).
 * 3. Multi-camera enumeration & cycling (supports switching both via deviceId and facingMode).
 * 4. Deterministic <video> attachment & play() readiness so snapshots are never blank/black.
 * 5. Firestore-compliant JPEG compression so data URLs never exceed security rule byte limits.
 */

let activeGlobalStream: MediaStream | null = null;
let activeGlobalOwnerId: string | null = null;
let activeStopSubscriber: (() => void) | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore already stopped tracks
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Releases any previously active camera stream held by another component in the app
 * so mobile/Windows camera hardware never throws NotReadableError.
 */
export async function releaseOtherActiveCameras(nextOwnerId: string): Promise<void> {
  if (activeGlobalStream && activeGlobalOwnerId !== nextOwnerId) {
    stopMediaStreamTracks(activeGlobalStream);
    activeGlobalStream = null;
    activeGlobalOwnerId = null;
    if (activeStopSubscriber) {
      const notify = activeStopSubscriber;
      activeStopSubscriber = null;
      try {
        notify();
      } catch {
        // ignore subscriber errors
      }
    }
    // Brief hardware release settle window for Android/iOS/Windows drivers
    await delay(100);
  } else if (activeGlobalStream && activeGlobalOwnerId === nextOwnerId) {
    stopMediaStreamTracks(activeGlobalStream);
    activeGlobalStream = null;
    await delay(60);
  }
}

export function registerExclusiveCameraStream(
  ownerId: string,
  stream: MediaStream,
  onPreempted?: () => void
): void {
  activeGlobalStream = stream;
  activeGlobalOwnerId = ownerId;
  activeStopSubscriber = onPreempted || null;
}

export function unregisterExclusiveCameraStream(ownerId: string, stream?: MediaStream | null): void {
  if (stream) {
    stopMediaStreamTracks(stream);
  }
  if (activeGlobalOwnerId === ownerId) {
    if (activeGlobalStream) {
      stopMediaStreamTracks(activeGlobalStream);
    }
    activeGlobalStream = null;
    activeGlobalOwnerId = null;
    activeStopSubscriber = null;
  }
}

export interface VideoDeviceOption {
  deviceId: string;
  label: string;
}

export async function listAvailableVideoInputs(): Promise<VideoDeviceOption[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Cámara ${idx + 1}`,
      }));
  } catch {
    return [];
  }
}

export interface OpenCameraOptions {
  ownerId: string;
  facingMode?: 'user' | 'environment';
  preferredDeviceId?: string;
  idealWidth?: number;
  idealHeight?: number;
  onPreempted?: () => void;
}

export interface OpenedCameraResult {
  stream: MediaStream;
  activeDeviceId?: string;
  videoDevices: VideoDeviceOption[];
  isMirroredSuggested: boolean;
}

/**
 * Opens a live WebRTC camera stream with automatic progressive fallback
 * so laptops with a single webcam, tablets, and dual-camera phones all activate reliably.
 */
export async function openCameraStreamWithFallback(
  options: OpenCameraOptions
): Promise<OpenedCameraResult> {
  const {
    ownerId,
    facingMode = 'user',
    preferredDeviceId,
    idealWidth = 1280,
    idealHeight = 720,
    onPreempted,
  } = options;

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const unsupportedErr = new Error(
      'Este navegador o contexto no soporta acceso directo a cámara WebRTC (getUserMedia).'
    );
    unsupportedErr.name = 'NotSupportedError';
    throw unsupportedErr;
  }

  await releaseOtherActiveCameras(ownerId);

  const constraintCandidates: MediaStreamConstraints[] = [];

  if (preferredDeviceId) {
    constraintCandidates.push({
      video: {
        deviceId: { exact: preferredDeviceId },
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
      },
      audio: false,
    });
    constraintCandidates.push({
      video: {
        deviceId: { ideal: preferredDeviceId },
      },
      audio: false,
    });
  }

  constraintCandidates.push(
    {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
      },
      audio: false,
    },
    {
      video: {
        facingMode: facingMode,
      },
      audio: false,
    },
    {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    },
    {
      video: true,
      audio: false,
    }
  );

  let lastError: unknown = null;

  for (const constraints of constraintCandidates) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stopMediaStreamTracks(stream);
        continue;
      }

      registerExclusiveCameraStream(ownerId, stream, onPreempted);

      const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
      const activeDeviceId = settings.deviceId;
      const trackFacing = settings.facingMode;
      const videoDevices = await listAvailableVideoInputs();

      const labelLower = (videoTrack.label || '').toLowerCase();
      const isBackCamera =
        trackFacing === 'environment' ||
        labelLower.includes('back') ||
        labelLower.includes('rear') ||
        labelLower.includes('trasera') ||
        labelLower.includes('environment');

      const isMirroredSuggested = isBackCamera ? false : facingMode === 'user' || !isBackCamera;

      return {
        stream,
        activeDeviceId,
        videoDevices,
        isMirroredSuggested,
      };
    } catch (err: any) {
      lastError = err;
      // Do not keep retrying if the user or browser explicitly denied camera permission
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        break;
      }
      // Small pause if hardware was momentarily busy
      if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        await delay(120);
      }
    }
  }

  throw lastError || new Error('No se pudo activar la cámara del dispositivo.');
}

export function formatCameraErrorMessage(err: unknown): string {
  const errorObj = err as { name?: string; message?: string } | null;
  const name = errorObj?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permiso de cámara bloqueado. Habilita el icono de cámara en la barra de direcciones del navegador y vuelve a intentar.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se detectó ninguna cámara conectada en este dispositivo.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'La cámara está siendo utilizada por otra aplicación o pestaña. Ciérrala e intenta nuevamente.';
  }
  if (name === 'NotSupportedError') {
    return errorObj?.message || 'Acceso a cámara en vivo no compatible en este navegador.';
  }
  return 'No se pudo iniciar la cámara en vivo. Verifica que tu cámara esté conectada y con permisos activos.';
}

/**
 * Attaches a MediaStream to an HTMLVideoElement and ensures playback starts cleanly.
 */
export async function attachStreamToVideoElement(
  videoEl: HTMLVideoElement | null,
  stream: MediaStream | null
): Promise<boolean> {
  if (!videoEl || !stream) return false;

  try {
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');
    videoEl.setAttribute('muted', 'true');

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    if (videoEl.readyState < 1) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          videoEl.removeEventListener('loadedmetadata', done);
          videoEl.removeEventListener('canplay', done);
          resolve();
        };
        videoEl.addEventListener('loadedmetadata', done, { once: true });
        videoEl.addEventListener('canplay', done, { once: true });
        setTimeout(done, 1200);
      });
    }

    await videoEl.play();
    return videoEl.videoWidth > 0 && videoEl.videoHeight > 0;
  } catch {
    // Retry play once after short tick
    await delay(100);
    try {
      await videoEl.play();
      return videoEl.videoWidth > 0 && videoEl.videoHeight > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Encodes a canvas to JPEG, automatically stepping down quality (and dimensions if needed)
 * so the resulting base64 data URL strictly stays below `maxChars` for Firestore rules.
 */
export function compressCanvasToMaxDataUrlLength(
  canvas: HTMLCanvasElement,
  maxChars: number,
  initialQuality = 0.86
): string {
  const qualities = [initialQuality, 0.78, 0.7, 0.62, 0.52, 0.42];
  let dataUrl = canvas.toDataURL('image/jpeg', initialQuality);

  for (const q of qualities) {
    dataUrl = canvas.toDataURL('image/jpeg', q);
    if (dataUrl.length <= maxChars) {
      return dataUrl;
    }
  }

  // If still above maxChars, scale down canvas dimensions proportionally
  const scaled = document.createElement('canvas');
  scaled.width = Math.max(200, Math.round(canvas.width * 0.72));
  scaled.height = Math.max(200, Math.round(canvas.height * 0.72));
  const ctx = scaled.getContext('2d');
  if (ctx) {
    ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    for (const q of [0.74, 0.62, 0.5]) {
      dataUrl = scaled.toDataURL('image/jpeg', q);
      if (dataUrl.length <= maxChars) {
        return dataUrl;
      }
    }
  }

  return dataUrl;
}

/**
 * Center-crops a video frame or image to a clean square portrait DataURL
 * guaranteed under Firestore's 150,000-character trainer avatar limit.
 */
export function captureSquareAvatarFromSource(
  source: HTMLVideoElement | HTMLImageElement,
  options?: { mirrorHorizontal?: boolean; targetSize?: number; maxDataUrlChars?: number }
): string {
  const targetSize = options?.targetSize ?? 340;
  const maxChars = options?.maxDataUrlChars ?? 125000;
  const mirror = Boolean(options?.mirrorHorizontal);

  const srcWidth =
    source instanceof HTMLVideoElement
      ? source.videoWidth || 640
      : source.naturalWidth || source.width || 640;
  const srcHeight =
    source instanceof HTMLVideoElement
      ? source.videoHeight || 480
      : source.naturalHeight || source.height || 480;

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const minSide = Math.min(srcWidth, srcHeight);
  const sx = (srcWidth - minSide) / 2;
  const sy = (srcHeight - minSide) / 2;

  ctx.save();
  if (mirror) {
    ctx.translate(targetSize, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
  ctx.restore();

  return compressCanvasToMaxDataUrlLength(canvas, maxChars, 0.85);
}
