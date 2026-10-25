/**
 * Real 1:1 Facial Biometric Verification Engine
 *
 * Uses neural face detection, 68-point facial landmark alignment, and 128-dimensional
 * face recognition embeddings (@vladmandic/face-api) to genuinely corroborate the live
 * camera face against the trainer's registered profile photograph (`trainer.avatar`).
 */

import type * as FaceApiModule from '@vladmandic/face-api';

const LOCAL_MODEL_BASE_URL = '/face-models';
const CDN_MODEL_FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

/**
 * Maximum Euclidean distance between 128-D face descriptors to accept two faces
 * as belonging to the same person (standard ResNet-34 face recognition threshold ~0.56).
 */
export const FACE_MATCH_MAX_DISTANCE = 0.56;

let faceApiPromise: Promise<typeof FaceApiModule> | null = null;
let modelsLoadedPromise: Promise<typeof FaceApiModule> | null = null;

// Cache computed 128-D descriptors for registered trainer photos keyed by avatar URL/hash
const registeredDescriptorCache = new Map<string, Float32Array>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFaceApi(): Promise<typeof FaceApiModule> {
  if (!faceApiPromise) {
    faceApiPromise = import('@vladmandic/face-api');
  }
  return faceApiPromise;
}

/**
 * Loads and warms up the face detection, 68-landmark, and 128-D recognition networks.
 */
export async function ensureBiometricModelsLoaded(): Promise<typeof FaceApiModule> {
  if (modelsLoadedPromise) {
    return modelsLoadedPromise;
  }

  modelsLoadedPromise = (async () => {
    const faceapi = await getFaceApi();

    const loadFromBase = async (baseUrl: string) => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(baseUrl),
        faceapi.nets.ssdMobilenetv1.loadFromUri(baseUrl),
        faceapi.nets.faceLandmark68Net.loadFromUri(baseUrl),
        faceapi.nets.faceRecognitionNet.loadFromUri(baseUrl),
      ]);
    };

    try {
      await loadFromBase(LOCAL_MODEL_BASE_URL);
    } catch (localErr) {
      console.warn('Local face models failed, trying CDN fallback:', localErr);
      try {
        await loadFromBase(CDN_MODEL_FALLBACK_URL);
      } catch (cdnErr) {
        modelsLoadedPromise = null;
        throw cdnErr;
      }
    }

    return faceapi;
  })();

  return modelsLoadedPromise;
}

/**
 * Checks whether a trainer avatar is missing or only an auto-generated initials SVG
 * (which cannot be used as a real facial biometric reference).
 */
export function isPlaceholderOrMissingAvatar(avatarUrl: string | undefined | null): boolean {
  if (!avatarUrl || typeof avatarUrl !== 'string') return true;
  const trimmed = avatarUrl.trim();
  if (trimmed.length < 10) return true;
  if (trimmed.startsWith('data:image/svg+xml')) return true;
  return false;
}

/**
 * Loads an image URL (data: URL or HTTPS URL with CORS) onto a clean HTMLCanvasElement
 * so TensorFlow/Canvas pixel reads never throw tainted-canvas SecurityErrors.
 */
async function loadCleanImageCanvas(src: string): Promise<HTMLCanvasElement> {
  const drawToCanvas = (img: HTMLImageElement): HTMLCanvasElement => {
    const maxDim = 640;
    const w = img.naturalWidth || img.width || 360;
    const h = img.naturalHeight || img.height || 360;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, Math.round(w * scale));
    canvas.height = Math.max(64, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No fue posible inicializar el lienzo de procesamiento biométrico.');
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Test pixel read to verify canvas is not CORS-tainted
    ctx.getImageData(0, 0, 1, 1);
    return canvas;
  };

  // Attempt 1: Direct Image load with crossOrigin='anonymous' for remote URLs
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        el.crossOrigin = 'anonymous';
      }
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Error cargando imagen de referencia.'));
      el.src = src;
    });
    return drawToCanvas(img);
  } catch {
    // Attempt 2: Fetch as Blob -> ObjectURL for remote servers needing explicit CORS fetch
    if (!src.startsWith('data:')) {
      const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) {
        throw new Error('No se pudo descargar la fotografía de registro del entrenador.');
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Imagen de registro inválida.'));
          el.src = blobUrl;
        });
        return drawToCanvas(img);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    throw new Error('No se pudo cargar la fotografía de registro del entrenador.');
  }
}

export interface DetectedFaceDescriptor {
  descriptor: Float32Array;
  detectionScore: number;
  box: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
}

/**
 * Extracts a single dominant face's 128-D biometric descriptor from a canvas.
 */
async function extractDominantFaceFromCanvas(
  canvas: HTMLCanvasElement
): Promise<DetectedFaceDescriptor | null> {
  const faceapi = await ensureBiometricModelsLoaded();

  // Primary detector: SSD MobileNet V1 (most accurate for portraits & varied lighting)
  const ssdResult = await faceapi
    .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.42 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (ssdResult) {
    return {
      descriptor: ssdResult.descriptor,
      detectionScore: ssdResult.detection.score,
      box: {
        x: ssdResult.detection.box.x,
        y: ssdResult.detection.box.y,
        width: ssdResult.detection.box.width,
        height: ssdResult.detection.box.height,
      },
      frameWidth: canvas.width,
      frameHeight: canvas.height,
    };
  }

  // Secondary fallback detector: TinyFaceDetector (higher recall on close-up webcams)
  const tinyResult = await faceapi
    .detectSingleFace(
      canvas,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.34 })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (tinyResult) {
    return {
      descriptor: tinyResult.descriptor,
      detectionScore: tinyResult.detection.score,
      box: {
        x: tinyResult.detection.box.x,
        y: tinyResult.detection.box.y,
        width: tinyResult.detection.box.width,
        height: tinyResult.detection.box.height,
      },
      frameWidth: canvas.width,
      frameHeight: canvas.height,
    };
  }

  return null;
}

/**
 * Quick check used in Directory / AdminTrainerModal when capturing or uploading a trainer photo
 * to confirm that a real human face is recognizable in the registration photo.
 */
export async function validateFaceInRegistrationPhoto(
  imageDataUrlOrUrl: string
): Promise<{ valid: boolean; message: string }> {
  if (isPlaceholderOrMissingAvatar(imageDataUrlOrUrl)) {
    return {
      valid: false,
      message: 'La imagen actual corresponde a iniciales y no contiene un rostro biométrico.',
    };
  }

  try {
    const canvas = await loadCleanImageCanvas(imageDataUrlOrUrl);
    const detected = await extractDominantFaceFromCanvas(canvas);
    if (!detected) {
      return {
        valid: false,
        message:
          'No se detectó un rostro claro en la foto. Toma otra fotografía de frente y con buena iluminación para usarla en el check-in.',
      };
    }
    registeredDescriptorCache.set(imageDataUrlOrUrl, detected.descriptor);
    return {
      valid: true,
      message: 'Rostro biométrico detectado y listo para corroboración en check-in.',
    };
  } catch {
    return {
      valid: false,
      message: 'No se pudo analizar el rostro en la fotografía seleccionada.',
    };
  }
}

function captureVideoFrameCanvas(videoEl: HTMLVideoElement): {
  canvas: HTMLCanvasElement;
  meanLuminance: number;
  pixelSample: Uint8ClampedArray;
} {
  const vw = videoEl.videoWidth || 640;
  const vh = videoEl.videoHeight || 480;
  const scale = Math.min(1, 640 / Math.max(vw, vh));
  const width = Math.max(120, Math.round(vw * scale));
  const height = Math.max(120, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo capturar el fotograma de la cámara.');
  }
  ctx.drawImage(videoEl, 0, 0, width, height);

  // Sample central 64x64 patch to check brightness & frame-to-frame live sensor activity
  const patchSize = Math.min(64, width, height);
  const px = Math.floor((width - patchSize) / 2);
  const py = Math.floor((height - patchSize) / 2);
  const imgData = ctx.getImageData(px, py, patchSize, patchSize).data;

  let lumSum = 0;
  const pixelCount = imgData.length / 4;
  for (let i = 0; i < imgData.length; i += 4) {
    lumSum += 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
  }

  return {
    canvas,
    meanLuminance: pixelCount > 0 ? lumSum / pixelCount : 0,
    pixelSample: imgData,
  };
}

function averageDescriptors(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = (a[i] + b[i]) * 0.5;
  }
  return out;
}

/**
 * Converts a 128-D face recognition Euclidean distance into an intuitive 0-100% similarity score.
 * - Distance <= 0.20 => ~99.2%
 * - Distance == 0.40 => ~91.0%
 * - Distance == 0.56 (threshold) => 78.0%
 * - Distance >= 0.95 => < 25%
 */
export function distanceToSimilarityPercent(distance: number): number {
  if (distance <= 0.18) return 99.4;
  if (distance <= FACE_MATCH_MAX_DISTANCE) {
    const ratio = (distance - 0.18) / (FACE_MATCH_MAX_DISTANCE - 0.18);
    const pct = 99.4 - ratio * (99.4 - 78.0);
    return Number(Math.max(78.0, Math.min(99.5, pct)).toFixed(1));
  }
  const mismatchRatio = Math.min(1, (distance - FACE_MATCH_MAX_DISTANCE) / 0.44);
  const lowPct = 74.0 - mismatchRatio * 56.0;
  return Number(Math.max(12.0, lowPct).toFixed(1));
}

export type FaceVerificationFailureCode =
  | 'NO_REGISTERED_PHOTO'
  | 'INVALID_REGISTERED_PHOTO'
  | 'CAMERA_NOT_READY'
  | 'TOO_DARK'
  | 'NO_LIVE_FACE'
  | 'FACE_TOO_SMALL'
  | 'LIVENESS_FAILED'
  | 'FACE_MISMATCH';

export interface LiveFaceVerificationOutcome {
  verified: boolean;
  confidenceScore: number;
  euclideanDistance?: number;
  livenessPassed: boolean;
  failureCode?: FaceVerificationFailureCode;
  message: string;
}

/**
 * Full 1:1 facial verification pipeline comparing the live camera stream against
 * the trainer's registered profile photo (`registeredAvatarUrl`).
 */
export async function verifyLiveFaceAgainstRegisteredPhoto(
  videoEl: HTMLVideoElement,
  registeredAvatarUrl: string,
  trainerName: string,
  onProgress?: (stepMessage: string, progressPercent: number) => void
): Promise<LiveFaceVerificationOutcome> {
  // 1. Verify the trainer actually has a real photo (not SVG initials)
  if (isPlaceholderOrMissingAvatar(registeredAvatarUrl)) {
    return {
      verified: false,
      confidenceScore: 0,
      livenessPassed: false,
      failureCode: 'NO_REGISTERED_PHOTO',
      message: `${trainerName} no tiene una fotografía facial de registro (actualmente solo tiene iniciales). Ve al Directorio o Perfil del Entrenador y toma o sube su fotografía real primero.`,
    };
  }

  if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
    return {
      verified: false,
      confidenceScore: 0,
      livenessPassed: false,
      failureCode: 'CAMERA_NOT_READY',
      message: 'La cámara aún no transmite video activo. Espera un segundo e intenta de nuevo.',
    };
  }

  onProgress?.('Cargando motor biométrico y analizando foto de registro...', 20);
  const faceapi = await ensureBiometricModelsLoaded();

  // 2. Obtain 128-D face descriptor of the registered photo
  let registeredDescriptor = registeredDescriptorCache.get(registeredAvatarUrl);
  if (!registeredDescriptor) {
    let refCanvas: HTMLCanvasElement;
    try {
      refCanvas = await loadCleanImageCanvas(registeredAvatarUrl);
    } catch {
      return {
        verified: false,
        confidenceScore: 0,
        livenessPassed: false,
        failureCode: 'INVALID_REGISTERED_PHOTO',
        message: `No se pudo leer la fotografía de registro de ${trainerName}. Actualiza su foto desde el Directorio con la cámara o subiendo una imagen.`,
      };
    }

    const refFace = await extractDominantFaceFromCanvas(refCanvas);
    if (!refFace) {
      return {
        verified: false,
        confidenceScore: 0,
        livenessPassed: false,
        failureCode: 'INVALID_REGISTERED_PHOTO',
        message: `La foto de registro actual de ${trainerName} no muestra un rostro humano claro. Actualiza su fotografía en el Directorio para poder validar su identidad.`,
      };
    }
    registeredDescriptor = refFace.descriptor;
    registeredDescriptorCache.set(registeredAvatarUrl, registeredDescriptor);
  }

  // 3. Capture two sequential live frames to check lighting, liveness, and extract live face embedding
  onProgress?.('Capturando fotogramas en vivo y comprobando iluminación...', 48);
  const frame1 = captureVideoFrameCanvas(videoEl);

  if (frame1.meanLuminance < 14) {
    return {
      verified: false,
      confidenceScore: 0,
      livenessPassed: false,
      failureCode: 'TOO_DARK',
      message:
        'La imagen de la cámara está demasiado oscura o el lente está cubierto. Ubícate en un lugar iluminado.',
    };
  }

  await delay(280);
  const frame2 = captureVideoFrameCanvas(videoEl);

  // Compute subtle sensor/frame delta to confirm live video feed isn't a dead frozen buffer
  let diffSum = 0;
  const sampleLen = Math.min(frame1.pixelSample.length, frame2.pixelSample.length);
  for (let i = 0; i < sampleLen; i += 4) {
    diffSum += Math.abs(frame1.pixelSample[i] - frame2.pixelSample[i]);
  }
  const meanFrameDelta = sampleLen > 0 ? diffSum / (sampleLen / 4) : 0;
  const livenessPassed = meanFrameDelta > 0.08;

  if (!livenessPassed) {
    return {
      verified: false,
      confidenceScore: 0,
      livenessPassed: false,
      failureCode: 'LIVENESS_FAILED',
      message:
        'El video parece congelado sin señal en vivo. Parpadea o mueve ligeramente el rostro e intenta nuevamente.',
    };
  }

  onProgress?.('Detectando puntos faciales del rostro en cámara...', 72);
  const [liveFace1, liveFace2] = await Promise.all([
    extractDominantFaceFromCanvas(frame1.canvas),
    extractDominantFaceFromCanvas(frame2.canvas),
  ]);

  const primaryLiveFace = liveFace2 || liveFace1;
  if (!primaryLiveFace) {
    return {
      verified: false,
      confidenceScore: 0,
      livenessPassed: true,
      failureCode: 'NO_LIVE_FACE',
      message:
        'No se detectó ningún rostro humano frente a la cámara. Mira de frente hacia la cámara dentro del óvalo sin cubrir ojos ni boca.',
    };
  }

  // Ensure the face occupies a reasonable portion of the frame (not tiny background bystander)
  const minFrameSide = Math.min(primaryLiveFace.frameWidth, primaryLiveFace.frameHeight);
  const faceRelativeSize =
    Math.max(primaryLiveFace.box.width, primaryLiveFace.box.height) / Math.max(1, minFrameSide);

  if (faceRelativeSize < 0.16) {
    return {
      verified: false,
      confidenceScore: 0,
      livenessPassed: true,
      failureCode: 'FACE_TOO_SMALL',
      message:
        'Tu rostro está demasiado lejos de la cámara. Acércate un poco más para centrar tu rostro en el óvalo.',
    };
  }

  // 4. Compute 1:1 Euclidean distance between live face and registered photo
  onProgress?.(`Corroborando identidad contra foto de registro de ${trainerName}...`, 90);
  const combinedLiveDescriptor =
    liveFace1 && liveFace2
      ? averageDescriptors(liveFace1.descriptor, liveFace2.descriptor)
      : primaryLiveFace.descriptor;

  const distance = faceapi.euclideanDistance(combinedLiveDescriptor, registeredDescriptor);
  const similarityPercent = distanceToSimilarityPercent(distance);

  if (distance > FACE_MATCH_MAX_DISTANCE) {
    return {
      verified: false,
      confidenceScore: similarityPercent,
      euclideanDistance: Number(distance.toFixed(3)),
      livenessPassed: true,
      failureCode: 'FACE_MISMATCH',
      message: `El rostro capturado NO coincide con la foto de registro de ${trainerName} (Similitud obtenida: ${similarityPercent}%, mínimo requerido: 78%). Asegúrate de ser el entrenador titular o actualiza su fotografía oficial en el Directorio.`,
    };
  }

  onProgress?.('Identidad facial corroborada con éxito', 100);
  return {
    verified: true,
    confidenceScore: similarityPercent,
    euclideanDistance: Number(distance.toFixed(3)),
    livenessPassed: true,
    message: `Identidad corroborada con la foto de registro de ${trainerName} (${similarityPercent}% de coincidencia biométrica).`,
  };
}
