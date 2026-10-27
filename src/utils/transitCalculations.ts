import { TrainerTransitTracking, TransitTravelMode } from '../types';

/**
 * Geodesic Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  if (!Number.isFinite(dist) || dist < 0) return 0;
  return Math.round(dist);
}

const URBAN_SPEED_KMH: Record<TransitTravelMode, number> = {
  DRIVING: 26,
  TWO_WHEELER: 31,
  TRANSIT: 19,
  WALKING: 4.8,
};

const ROAD_DETOUR_FACTOR: Record<TransitTravelMode, number> = {
  DRIVING: 1.32,
  TWO_WHEELER: 1.28,
  TRANSIT: 1.38,
  WALKING: 1.20,
};

export function computeArrivalClockHHMM(
  durationMinutes: number,
  baseTimeMs: number = Date.now()
): string {
  const safeMins = Math.max(0, Math.min(10080, Math.round(Number(durationMinutes) || 0)));
  const arrivalDate = new Date(baseTimeMs + safeMins * 60 * 1000);
  const hh = String(arrivalDate.getHours()).padStart(2, '0');
  const mm = String(arrivalDate.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function estimateTransitMetricsFallback(
  trainerLat: number,
  trainerLng: number,
  sedeLat: number,
  sedeLng: number,
  travelMode: TransitTravelMode,
  nowMs: number = Date.now()
): {
  straightDistanceMeters: number;
  routeDistanceMeters: number;
  estimatedDurationMinutes: number;
  estimatedArrivalHHMM: string;
} {
  const straightDistanceMeters = calculateHaversineDistanceMeters(
    trainerLat,
    trainerLng,
    sedeLat,
    sedeLng
  );
  const detour = ROAD_DETOUR_FACTOR[travelMode] || 1.3;
  const routeDistanceMeters =
    straightDistanceMeters <= 35
      ? straightDistanceMeters
      : Math.round(straightDistanceMeters * detour);

  const speedKmh = URBAN_SPEED_KMH[travelMode] || 25;
  const speedMetersPerMin = (speedKmh * 1000) / 60;
  const rawMinutes =
    routeDistanceMeters <= 40 ? 0 : Math.max(1, Math.ceil(routeDistanceMeters / speedMetersPerMin));

  const estimatedDurationMinutes = Math.min(10080, rawMinutes);
  const estimatedArrivalHHMM = computeArrivalClockHHMM(estimatedDurationMinutes, nowMs);

  return {
    straightDistanceMeters,
    routeDistanceMeters,
    estimatedDurationMinutes,
    estimatedArrivalHHMM,
  };
}

export function formatDistanceMetric(meters: number): string {
  const safe = Math.max(0, Math.round(Number(meters) || 0));
  if (safe < 1000) {
    return `${safe} m`;
  }
  const km = safe / 1000;
  return km >= 100 ? `${km.toFixed(0)} km` : `${km.toFixed(2)} km`;
}

export function formatTravelDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  if (safe <= 0) return 'En sede (< 1 min)';
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/**
 * Positive return value => arrives BEFORE scheduledTime (minutes early margin).
 * Negative return value => arrives AFTER scheduledTime (minutes late risk).
 */
export function computePunctualityMarginMinutes(
  dateYMD: string,
  scheduledHHMM: string,
  estimatedDurationMinutes: number,
  nowMs: number = Date.now()
): number | null {
  if (!dateYMD || !scheduledHHMM || !scheduledHHMM.includes(':')) return null;
  const [y, mo, d] = dateYMD.split('-').map(Number);
  const [hh, mm] = scheduledHHMM.slice(0, 5).split(':').map(Number);
  if ([y, mo, d, hh, mm].some((n) => Number.isNaN(n))) return null;

  const scheduledDateMs = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
  const estimatedArrivalMs = nowMs + Math.max(0, estimatedDurationMinutes) * 60 * 1000;
  return Math.round((scheduledDateMs - estimatedArrivalMs) / 60000);
}

function sanitizeSafeId(val: string | undefined, fallback: string): string {
  const cleaned = (val || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned.length >= 1 ? cleaned : fallback;
}

function sanitizeNonEmptyText(val: string | undefined, fallback: string, maxLen: number): string {
  const trimmed = (val || '').trim().slice(0, maxLen).trim();
  if (trimmed.length >= 2) return trimmed;
  return fallback.slice(0, maxLen);
}

/**
 * Ensures outgoing TrainerTransitTracking payload strictly matches firebase-blueprint.json & firestore.rules.
 */
export function sanitizeTransitTrackingPayload(
  raw: TrainerTransitTracking
): TrainerTransitTracking {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
    ? raw.date
    : new Date().toISOString().slice(0, 10);

  const safeScheduled = /^[0-2]\d:[0-5]\d$/.test((raw.scheduledTime || '').slice(0, 5))
    ? raw.scheduledTime.slice(0, 5)
    : '09:00';

  const safeArrival = /^[0-2]\d:[0-5]\d$/.test((raw.estimatedArrivalHHMM || '').slice(0, 5))
    ? raw.estimatedArrivalHHMM.slice(0, 5)
    : computeArrivalClockHHMM(raw.estimatedDurationMinutes || 0);

  const clampNum = (v: number | undefined, min: number, max: number, fallback: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const sanitized: TrainerTransitTracking = {
    id: sanitizeSafeId(raw.id, `trk_${Date.now()}`),
    trainerId: sanitizeSafeId(raw.trainerId, 'trainer_default'),
    trainerName: sanitizeNonEmptyText(raw.trainerName, 'Entrenador BSCW', 120),
    companyId: sanitizeSafeId(raw.companyId, 'comp_default'),
    companyName: sanitizeNonEmptyText(raw.companyName, 'Empresa Corporativa', 150),
    sedeId: sanitizeSafeId(raw.sedeId, 'sede_default'),
    sedeName: sanitizeNonEmptyText(raw.sedeName, 'Sede Corporativa', 150),
    sedeAddress: sanitizeNonEmptyText(raw.sedeAddress, 'Dirección corporativa', 250),
    sedeLat: clampNum(raw.sedeLat, -90, 90, 19.4326),
    sedeLng: clampNum(raw.sedeLng, -180, 180, -99.1332),
    geofenceRadiusMeters: clampNum(raw.geofenceRadiusMeters, 5, 50000, 150),
    date: safeDate,
    scheduledTime: safeScheduled,
    activityName: sanitizeNonEmptyText(raw.activityName, 'Sesión Corporativa', 150),
    trainerLat: clampNum(raw.trainerLat, -90, 90, 19.4326),
    trainerLng: clampNum(raw.trainerLng, -180, 180, -99.1332),
    accuracyMeters: Math.round(clampNum(raw.accuracyMeters, 0, 100000, 15)),
    straightDistanceMeters: Math.round(clampNum(raw.straightDistanceMeters, 0, 25000000, 0)),
    routeDistanceMeters: Math.round(clampNum(raw.routeDistanceMeters, 0, 25000000, 0)),
    estimatedDurationMinutes: Math.round(clampNum(raw.estimatedDurationMinutes, 0, 10080, 0)),
    estimatedArrivalHHMM: safeArrival,
    calculationSource:
      raw.calculationSource === 'google_routes' ? 'google_routes' : 'haversine_estimado',
    travelMode: ['DRIVING', 'TRANSIT', 'WALKING', 'TWO_WHEELER'].includes(raw.travelMode)
      ? raw.travelMode
      : 'DRIVING',
    status: ['en_camino', 'en_geocerca', 'llegada_confirmada', 'detenido'].includes(raw.status)
      ? raw.status
      : 'en_camino',
    isWithinGeofence: Boolean(raw.isWithinGeofence),
    startedAtIso: (raw.startedAtIso || new Date().toISOString()).slice(0, 45),
    lastUpdatedIso: (raw.lastUpdatedIso || new Date().toISOString()).slice(0, 45),
  };

  if (raw.assignmentId) {
    sanitized.assignmentId = sanitizeSafeId(raw.assignmentId, 'asg_ref');
  }
  if (raw.speedMps !== undefined && Number.isFinite(raw.speedMps) && raw.speedMps >= 0) {
    sanitized.speedMps = Math.round(Math.min(200, raw.speedMps) * 10) / 10;
  }
  if (raw.stoppedAtIso && raw.stoppedAtIso.length >= 4) {
    sanitized.stoppedAtIso = raw.stoppedAtIso.slice(0, 45);
  }

  return sanitized;
}
