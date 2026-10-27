import {
  ACTIVITY_TYPE_DEFAULT_MINUTES,
  ActivityCatalogItem,
  ActivityType,
  AttendanceRecord,
  ClassAssignment,
  normalizeActivityType,
} from '../types';

export const MIN_ASSIGNMENT_DURATION_MINUTES = 5;
export const MAX_ASSIGNMENT_DURATION_MINUTES = 480; // Hasta 8 horas continuas (Gimnasio Corporativo / jornadas largas)
export const UNCLOSED_GRACE_MINUTES = 60;
export const UNCLOSED_GRACE_SECONDS = UNCLOSED_GRACE_MINUTES * 60;

export function clampAssignmentDurationMinutes(totalMinutes: number): number {
  if (!Number.isFinite(totalMinutes)) return 20;
  return Math.max(
    MIN_ASSIGNMENT_DURATION_MINUTES,
    Math.min(MAX_ASSIGNMENT_DURATION_MINUTES, Math.round(totalMinutes))
  );
}

export function splitMinutesToHoursAndMinutes(totalMinutes: number): {
  hours: number;
  minutes: number;
} {
  const safeTotal = Math.max(
    0,
    Math.min(MAX_ASSIGNMENT_DURATION_MINUTES, Math.round(Number(totalMinutes) || 0))
  );
  const hours = Math.floor(safeTotal / 60);
  const minutes = safeTotal % 60;
  return { hours, minutes };
}

export function combineHoursAndMinutes(hours: number, minutes: number): number {
  const safeHours = Math.max(0, Math.min(8, Math.floor(Number(hours) || 0)));
  const safeMinutes =
    safeHours >= 8 ? 0 : Math.max(0, Math.min(59, Math.floor(Number(minutes) || 0)));
  return clampAssignmentDurationMinutes(safeHours * 60 + safeMinutes);
}

export function formatDurationHoursMinutes(
  totalMinutes: number,
  compact: boolean = false
): string {
  const safe = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;

  if (h <= 0) {
    return compact ? `${m}m` : `${m} min`;
  }
  if (m === 0) {
    return compact ? `${h}h` : `${h} h`;
  }
  return compact ? `${h}h ${m}m` : `${h} h ${m} min`;
}

export interface SessionAlarmStatus {
  plannedDurationMinutes: number;
  alarmEnabled: boolean;
  startMs: number;
  expectedEndMs: number;
  expectedEndTimeFormatted: string;
  autoLockDeadlineMs: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  overdueSeconds: number;
  graceLimitSeconds: number;
  remainingBeforeNonComplianceSeconds: number;
  hasExceededUnclosedGrace: boolean;
  autoLockDeadlineFormatted: string;
  progressPercent: number;
  isNearEnd: boolean;
  isOverdue: boolean;
  snoozedUntilMs: number | null;
  isSnoozed: boolean;
  shouldRing: boolean;
}

export function getDefaultDurationMinutes(
  activityType: ActivityType,
  activityName: string,
  catalog: ActivityCatalogItem[] = []
): number {
  const normalizedTarget = activityName.trim().toLowerCase();
  const match =
    catalog.find((item) => item.name.trim().toLowerCase() === normalizedTarget) ||
    catalog.find((item) => {
      const colonIdx = item.name.indexOf(':');
      if (colonIdx === -1) return false;
      return item.name.slice(colonIdx + 1).trim().toLowerCase() === normalizedTarget;
    });
  if (match && match.defaultDurationMinutes > 0) {
    return clampAssignmentDurationMinutes(match.defaultDurationMinutes);
  }
  return ACTIVITY_TYPE_DEFAULT_MINUTES[normalizeActivityType(activityType)];
}

export function getAssignmentDurationMinutes(
  assignment: ClassAssignment,
  catalog: ActivityCatalogItem[] = []
): number {
  if (assignment.durationMinutes && assignment.durationMinutes > 0) {
    return clampAssignmentDurationMinutes(assignment.durationMinutes);
  }
  return getDefaultDurationMinutes(assignment.activityType, assignment.activityName, catalog);
}

export function calculateEndTimeHHMM(startTimeHHMM: string, durationMinutes: number): string {
  if (!startTimeHHMM || !startTimeHHMM.includes(':')) return '';
  const [hStr, mStr] = startTimeHHMM.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const totalMins = ((h * 60 + m + durationMinutes) % 1440 + 1440) % 1440;
  const endH = Math.floor(totalMins / 60);
  const endM = totalMins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export function parseRecordStartMs(record: AttendanceRecord): number {
  if (record.checkInIso) {
    const parsed = new Date(record.checkInIso).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  const dateParts = (record.date || '').split('-').map(Number);
  const rawTime = (record.checkInTime || record.scheduledTime || '09:00').trim();
  const timeMatch = rawTime.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (dateParts.length === 3 && !dateParts.some(Number.isNaN) && timeMatch) {
    const hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2], 10);
    const ss = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const localMs = new Date(
      dateParts[0],
      dateParts[1] - 1,
      dateParts[2],
      hh,
      mm,
      ss,
      0
    ).getTime();
    if (!Number.isNaN(localMs)) {
      return localMs;
    }
  }
  const fallback = new Date(`${record.date}T${record.checkInTime}`).getTime();
  return Number.isNaN(fallback) ? Date.now() : fallback;
}

export function getSessionAlarmStatus(
  record: AttendanceRecord,
  catalog: ActivityCatalogItem[] = [],
  nowMs: number = Date.now()
): SessionAlarmStatus {
  const plannedDurationMinutes =
    record.plannedDurationMinutes && record.plannedDurationMinutes > 0
      ? record.plannedDurationMinutes
      : getDefaultDurationMinutes(record.activityType, record.activityName, catalog);

  const startMs = parseRecordStartMs(record);
  const totalDurationMs = plannedDurationMinutes * 60 * 1000;
  const expectedEndMs = startMs + totalDurationMs;

  const endDate = new Date(expectedEndMs);
  const expectedEndTimeFormatted = endDate.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const remainingSeconds = Math.floor((expectedEndMs - nowMs) / 1000);
  const overdueSeconds = Math.max(0, -remainingSeconds);

  const autoLockDeadlineMs = expectedEndMs + UNCLOSED_GRACE_SECONDS * 1000;
  const autoLockDeadlineFormatted = new Date(autoLockDeadlineMs).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((nowMs - startMs) / totalDurationMs) * 100))
  );

  const isInProgress = record.status === 'en_curso' && !record.checkOutTime;
  const isOverdue = isInProgress && remainingSeconds <= 0;
  const isNearEnd = isInProgress && remainingSeconds > 0 && remainingSeconds <= 180;
  const remainingBeforeNonComplianceSeconds = Math.max(0, UNCLOSED_GRACE_SECONDS - overdueSeconds);
  const hasExceededUnclosedGrace =
    isInProgress && (nowMs >= autoLockDeadlineMs || overdueSeconds >= UNCLOSED_GRACE_SECONDS);

  // Deactivate alarm automatically if 60-minute post-end unclosed limit has been reached
  const alarmEnabled = record.alarmEnabled !== false && !hasExceededUnclosedGrace;

  let snoozedUntilMs: number | null = null;
  if (record.alarmSnoozedUntilIso && !hasExceededUnclosedGrace) {
    const parsedSnooze = new Date(record.alarmSnoozedUntilIso).getTime();
    if (!Number.isNaN(parsedSnooze)) {
      snoozedUntilMs = Math.min(parsedSnooze, autoLockDeadlineMs);
    }
  }

  const isSnoozed = Boolean(snoozedUntilMs && nowMs < snoozedUntilMs);
  const shouldRing =
    isInProgress && alarmEnabled && isOverdue && !isSnoozed && !hasExceededUnclosedGrace;

  return {
    plannedDurationMinutes,
    alarmEnabled,
    startMs,
    expectedEndMs,
    expectedEndTimeFormatted,
    autoLockDeadlineMs,
    elapsedSeconds,
    remainingSeconds,
    overdueSeconds,
    graceLimitSeconds: UNCLOSED_GRACE_SECONDS,
    remainingBeforeNonComplianceSeconds,
    hasExceededUnclosedGrace,
    autoLockDeadlineFormatted,
    progressPercent,
    isNearEnd,
    isOverdue,
    snoozedUntilMs,
    isSnoozed,
    shouldRing,
  };
}

export function clampSnoozeIsoToGraceLimit(
  alarmStatus: SessionAlarmStatus,
  requestedMinutes: number,
  nowMs: number = Date.now()
): string | null {
  if (alarmStatus.hasExceededUnclosedGrace || nowMs >= alarmStatus.autoLockDeadlineMs) {
    return null;
  }
  const desiredMs = nowMs + Math.max(1, requestedMinutes) * 60 * 1000;
  const clampedMs = Math.min(desiredMs, alarmStatus.autoLockDeadlineMs);
  if (clampedMs <= nowMs) {
    return null;
  }
  return new Date(clampedMs).toISOString();
}

export function formatSecondsClock(totalSeconds: number): string {
  const abs = Math.max(0, Math.abs(Math.floor(totalSeconds)));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

// ============================================================================
// SLEEP-PROOF MOBILE ALARM ENGINE (iOS Safari + Android Chrome en Reposo)
// ============================================================================
// Why standard web alarms fail when a phone enters sleep/lock mode (`en reposo`):
// 1. Mobile browsers freeze/throttle JS `setInterval` & `setTimeout` when the
//    screen turns off (`document.visibilityState === 'hidden'`).
// 2. Mobile OSes reject new `.play()` calls initiated while the screen is locked.
// 3. Solution:
//    - Maintain a persistent HTML5 `<audio>` element (`sentinelAudioEl`) on the
//      `playback` audio session looping a 2s sub-audible (-84 dBFS, non-zero LSB)
//      16-bit PCM WAV during an active `en_curso` session.
//    - Because non-zero PCM audio is continuously playing, iOS CoreAudio and
//      Android AudioTrack keep the media pipeline + `timeupdate` events alive
//      even when the phone is locked in the trainer's pocket!
//    - The hardware audio clock fires `timeupdate` (~4x/sec) in sleep mode: the
//      exact moment `Date.now() >= targetAlarmMs`, `sentinelAudioEl` swaps in-place
//      to a 3.2s looping high-clarity alarm WAV at `volume = 1.0`, updates the
//      lock-screen MediaSession banner, vibrates, and triggers the Service Worker
//      lock-screen notification (`/alarm-sw.js`).

let sharedAudioContext: AudioContext | null = null;
let sharedAlarmAudioEl: HTMLAudioElement | null = null;
let sentinelAudioEl: HTMLAudioElement | null = null;

let cachedAlarmWavDataUri: string | null = null;
let cachedLoopingAlarmWavDataUri: string | null = null;
let cachedSubAudibleWavDataUri: string | null = null;

let mobileAudioUnlocked = false;
let isActivelyRingingNow = false;
let lastAlarmTimestampMs = 0;

type SentinelMode = 'off' | 'sentinel' | 'ringing';
let currentSentinelMode: SentinelMode = 'off';
let sleepSentinelArmed = false;
let sleepAlarmLocallyMuted = false;
let lastSwScheduleSignature = '';
let lastBackgroundNotifiedTargetKey = '';

interface ActiveSleepAlarmTarget {
  record: AttendanceRecord;
  targetAlarmMs: number;
  autoLockDeadlineMs: number;
  expectedEndTimeFormatted: string;
  shouldBeActive: boolean;
  onLockScreenSnooze5m?: () => void;
  onLockScreenStop?: () => void;
}

let activeSleepTarget: ActiveSleepAlarmTarget | null = null;
const sentinelListeners = new Set<(armed: boolean) => void>();

function notifySentinelListeners(): void {
  const armed = sleepSentinelArmed && currentSentinelMode !== 'off';
  sentinelListeners.forEach((fn) => {
    try {
      fn(armed);
    } catch {
      // Ignore listener errors
    }
  });
}

export function isSleepAlarmSentinelArmed(): boolean {
  return sleepSentinelArmed && currentSentinelMode !== 'off';
}

export function subscribeSleepSentinelState(listener: (armed: boolean) => void): () => void {
  sentinelListeners.add(listener);
  listener(isSleepAlarmSentinelArmed());
  return () => {
    sentinelListeners.delete(listener);
  };
}

function configureIosPlaybackAudioSession(): void {
  try {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session && session.type !== 'playback') {
        session.type = 'playback';
      }
    }
  } catch {
    // Ignore on browsers without navigator.audioSession
  }
}

function encodeBase64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function writeWavHeader(view: DataView, sampleRate: number, dataBytes: number): void {
  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1 (Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
}

function renderAlarmChimeIntoPcm(
  view: DataView,
  sampleRate: number,
  totalSamples: number
): void {
  const notes = [
    { freq: 987.77, start: 0.0, dur: 0.14 },   // B5
    { freq: 1318.51, start: 0.15, dur: 0.14 }, // E6
    { freq: 1760.0, start: 0.30, dur: 0.22 },  // A6
    { freq: 987.77, start: 0.62, dur: 0.14 },  // B5
    { freq: 1318.51, start: 0.77, dur: 0.14 }, // E6
    { freq: 1975.53, start: 0.92, dur: 0.24 }, // B6
    { freq: 1760.0, start: 1.20, dur: 0.22 },  // A6
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sampleVal = 0;

    if (t <= 1.48) {
      for (let n = 0; n < notes.length; n++) {
        const note = notes[n];
        if (t >= note.start && t <= note.start + note.dur) {
          const localT = t - note.start;
          const attack = Math.min(1, localT / 0.008);
          const release = Math.min(1, (note.dur - localT) / 0.016);
          const env = Math.max(0, Math.min(attack, release));

          const w = 2 * Math.PI * note.freq * localT;
          const wave =
            0.62 * Math.sin(w) +
            0.26 * Math.sin(2 * w) +
            0.12 * Math.sin(3 * w);

          sampleVal += env * wave * 0.94;
        }
      }
    } else {
      // Keep non-zero ±2 LSB during inter-burst gap so OS never classifies gap as digital silence
      const carrier = Math.sin(2 * Math.PI * 30 * t) >= 0 ? 2 / 32767 : -2 / 32767;
      sampleVal = carrier;
    }

    const clamped = Math.max(-1, Math.min(1, sampleVal));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
}

/**
 * Single 1.45s alarm burst WAV for manual button tests / foreground chimes.
 */
function getAlarmWavDataUri(): string {
  if (cachedAlarmWavDataUri) return cachedAlarmWavDataUri;

  const sampleRate = 16000;
  const durationSec = 1.45;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeWavHeader(view, sampleRate, dataBytes);
  renderAlarmChimeIntoPcm(view, sampleRate, numSamples);

  cachedAlarmWavDataUri = `data:audio/wav;base64,${encodeBase64FromBytes(new Uint8Array(buffer))}`;
  return cachedAlarmWavDataUri;
}

/**
 * Continuous 3.2s looping alarm WAV (1.45s loud harmonic burst + 1.75s cadence gap)
 * so HTML5 `<audio loop>` rings repeatedly in sleep mode without needing JS setInterval.
 */
function getLoopingAlarmWavDataUri(): string {
  if (cachedLoopingAlarmWavDataUri) return cachedLoopingAlarmWavDataUri;

  const sampleRate = 16000;
  const durationSec = 3.2;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeWavHeader(view, sampleRate, dataBytes);
  renderAlarmChimeIntoPcm(view, sampleRate, numSamples);

  cachedLoopingAlarmWavDataUri = `data:audio/wav;base64,${encodeBase64FromBytes(new Uint8Array(buffer))}`;
  return cachedLoopingAlarmWavDataUri;
}

/**
 * 2.0s sub-audible (-84 dBFS, ±2 LSB at 25 Hz) PCM WAV keep-alive stream.
 * Completely imperceptible to human ears, yet prevents iOS Safari & Android Chrome
 * from suspending the media session when the screen is turned off (`en reposo`).
 */
function getSubAudibleSentinelWavDataUri(): string {
  if (cachedSubAudibleWavDataUri) return cachedSubAudibleWavDataUri;

  const sampleRate = 8000;
  const durationSec = 2.0;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeWavHeader(view, sampleRate, dataBytes);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const lsbSample = Math.sin(2 * Math.PI * 25 * t) >= 0 ? 2 : -2;
    view.setInt16(44 + i * 2, lsbSample, true);
  }

  cachedSubAudibleWavDataUri = `data:audio/wav;base64,${encodeBase64FromBytes(new Uint8Array(buffer))}`;
  return cachedSubAudibleWavDataUri;
}

function getSharedAlarmAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!sharedAlarmAudioEl) {
    const audio = new Audio(getAlarmWavDataUri());
    audio.preload = 'auto';
    audio.volume = 1.0;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    sharedAlarmAudioEl = audio;
  }
  return sharedAlarmAudioEl;
}

function updateLockScreenMediaSession(mode: SentinelMode): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession) {
    return;
  }
  try {
    if (mode === 'off' || !activeSleepTarget) {
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const rec = activeSleepTarget.record;
    if (typeof MediaMetadata !== 'undefined') {
      if (mode === 'ringing') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '⚠️ ¡Sesión Finalizada! Registra tu Salida',
          artist: `${rec.companyName} — ${rec.sedeName}`,
          album: `BSCW Check · ${rec.activityName}`,
        });
      } else {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `Sesión en Curso · Fin ${activeSleepTarget.expectedEndTimeFormatted} hrs`,
          artist: `${rec.companyName} — ${rec.sedeName}`,
          album: 'BSCW Check · Alarma en Reposo Activa',
        });
      }
    }

    navigator.mediaSession.playbackState = 'playing';

    navigator.mediaSession.setActionHandler('pause', () => {
      if (currentSentinelMode === 'ringing') {
        if (activeSleepTarget?.onLockScreenSnooze5m) {
          activeSleepTarget.onLockScreenSnooze5m();
        } else {
          setSleepAlarmLocalMute(true);
        }
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      if (currentSentinelMode === 'ringing') {
        if (activeSleepTarget?.onLockScreenStop) {
          activeSleepTarget.onLockScreenStop();
        } else {
          setSleepAlarmLocalMute(true);
        }
      }
    });
  } catch {
    // Ignore unsupported MediaSession handlers
  }
}

function evaluateSleepSentinelTick(): void {
  if (!activeSleepTarget || !activeSleepTarget.shouldBeActive) {
    if (currentSentinelMode !== 'off') {
      stopSentinelCompletely();
    }
    return;
  }

  const now = Date.now();

  // Hard 60-minute post-end unclosed limit: stop ringing automatically
  if (now >= activeSleepTarget.autoLockDeadlineMs) {
    stopSentinelCompletely();
    cancelServiceWorkerAlarm();
    return;
  }

  const shouldRingNow = now >= activeSleepTarget.targetAlarmMs && !sleepAlarmLocallyMuted;

  if (shouldRingNow && currentSentinelMode !== 'ringing') {
    switchSentinelToRinging();
  } else if (!shouldRingNow && currentSentinelMode === 'ringing') {
    // Snoozed or locally muted while session is still en_curso -> drop back to silent keep-alive sentinel
    switchSentinelToSilentKeepAlive();
  }
}

function getOrCreateSentinelAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!sentinelAudioEl) {
    const el = new Audio(getSubAudibleSentinelWavDataUri());
    el.preload = 'auto';
    el.loop = true;
    el.volume = 0.02;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');

    el.addEventListener('timeupdate', () => {
      evaluateSleepSentinelTick();
    });

    el.addEventListener('pause', () => {
      // If mobile OS paused unexpectedly while session still needs sentinel (e.g., transient call interruption), try resuming
      if (activeSleepTarget?.shouldBeActive && sleepSentinelArmed) {
        setTimeout(() => {
          if (activeSleepTarget?.shouldBeActive && sentinelAudioEl && sentinelAudioEl.paused) {
            sentinelAudioEl.play().catch(() => {
              sleepSentinelArmed = false;
              notifySentinelListeners();
            });
          }
        }, 350);
      }
    });

    sentinelAudioEl = el;
  }
  return sentinelAudioEl;
}

function switchSentinelToSilentKeepAlive(): void {
  const el = getOrCreateSentinelAudioElement();
  if (!el) return;

  configureIosPlaybackAudioSession();
  const silentSrc = getSubAudibleSentinelWavDataUri();
  if (el.src !== silentSrc) {
    el.src = silentSrc;
  }
  el.loop = true;
  el.muted = false;
  el.volume = 0.02;

  const p = el.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      currentSentinelMode = 'sentinel';
      sleepSentinelArmed = true;
      mobileAudioUnlocked = true;
      updateLockScreenMediaSession('sentinel');
      notifySentinelListeners();
    }).catch(() => {
      sleepSentinelArmed = false;
      notifySentinelListeners();
    });
  }
}

function switchSentinelToRinging(): void {
  const el = getOrCreateSentinelAudioElement();
  if (!el) return;

  configureIosPlaybackAudioSession();
  const loudLoopSrc = getLoopingAlarmWavDataUri();
  if (el.src !== loudLoopSrc) {
    el.src = loudLoopSrc;
  }
  el.loop = true;
  el.muted = false;
  el.volume = 1.0;

  currentSentinelMode = 'ringing';
  isActivelyRingingNow = true;
  lastAlarmTimestampMs = Date.now();

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([500, 150, 500, 150, 800, 200, 800]);
    }
  } catch {
    // Ignore vibration errors
  }

  if (activeSleepTarget) {
    const notifKey = `${activeSleepTarget.record.id}:${activeSleepTarget.targetAlarmMs}`;
    if (lastBackgroundNotifiedTargetKey !== notifKey) {
      lastBackgroundNotifiedTargetKey = notifKey;
      triggerBrowserCheckoutNotification(activeSleepTarget.record);
    }
  }

  updateLockScreenMediaSession('ringing');

  const p = el.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      sleepSentinelArmed = true;
      mobileAudioUnlocked = true;
      notifySentinelListeners();
    }).catch(() => {
      sleepSentinelArmed = false;
      notifySentinelListeners();
      void playWebAudioFallback();
    });
  }
}

function stopSentinelCompletely(): void {
  currentSentinelMode = 'off';
  sleepSentinelArmed = false;
  isActivelyRingingNow = false;
  if (sentinelAudioEl) {
    try {
      sentinelAudioEl.pause();
      sentinelAudioEl.currentTime = 0;
    } catch {
      // Ignore
    }
  }
  updateLockScreenMediaSession('off');
  notifySentinelListeners();
}

export function setSleepAlarmLocalMute(muted: boolean): void {
  sleepAlarmLocallyMuted = muted;
  if (muted) {
    if (sharedAlarmAudioEl) {
      try {
        sharedAlarmAudioEl.pause();
        sharedAlarmAudioEl.currentTime = 0;
      } catch {
        // Ignore
      }
    }
    if (currentSentinelMode === 'ringing' && activeSleepTarget?.shouldBeActive) {
      switchSentinelToSilentKeepAlive();
    }
  } else {
    evaluateSleepSentinelTick();
  }
}

/**
 * Arms the sleep-mode sentinel immediately inside a user tap/click gesture.
 */
export function armSleepProofSentinelFromGesture(): void {
  unlockMobileAlarmAudio();
  if (!activeSleepTarget || !activeSleepTarget.shouldBeActive) return;

  const now = Date.now();
  if (now >= activeSleepTarget.autoLockDeadlineMs) return;

  if (now >= activeSleepTarget.targetAlarmMs && !sleepAlarmLocallyMuted) {
    switchSentinelToRinging();
  } else {
    switchSentinelToSilentKeepAlive();
  }
}

/**
 * Synchronizes the active `en_curso` session with both the sub-audible HTML5 media
 * sentinel (for loud audio in lock/sleep mode) and the Service Worker notification scheduler.
 */
export function syncSleepProofSessionAlarm(params: {
  record: AttendanceRecord | null | undefined;
  alarmStatus: SessionAlarmStatus | null | undefined;
  onLockScreenSnooze5m?: () => void;
  onLockScreenStop?: () => void;
}): void {
  const { record, alarmStatus, onLockScreenSnooze5m, onLockScreenStop } = params;

  const shouldBeActive = Boolean(
    record &&
      alarmStatus &&
      record.status === 'en_curso' &&
      !record.checkOutTime &&
      alarmStatus.alarmEnabled &&
      !alarmStatus.hasExceededUnclosedGrace
  );

  if (!shouldBeActive || !record || !alarmStatus) {
    activeSleepTarget = null;
    sleepAlarmLocallyMuted = false;
    lastSwScheduleSignature = '';
    stopSentinelCompletely();
    cancelServiceWorkerAlarm();
    return;
  }

  const effectiveTargetMs =
    alarmStatus.snoozedUntilMs && alarmStatus.snoozedUntilMs > alarmStatus.expectedEndMs
      ? alarmStatus.snoozedUntilMs
      : alarmStatus.expectedEndMs;

  // Reset local mute whenever the trainer changes duration or snoozes to a new future target
  if (activeSleepTarget && activeSleepTarget.targetAlarmMs !== effectiveTargetMs) {
    sleepAlarmLocallyMuted = false;
  }

  activeSleepTarget = {
    record,
    targetAlarmMs: effectiveTargetMs,
    autoLockDeadlineMs: alarmStatus.autoLockDeadlineMs,
    expectedEndTimeFormatted: alarmStatus.expectedEndTimeFormatted,
    shouldBeActive: true,
    onLockScreenSnooze5m,
    onLockScreenStop,
  };

  // Schedule backup notification in Service Worker
  const swSig = `${record.id}|${effectiveTargetMs}|${alarmStatus.autoLockDeadlineMs}`;
  if (swSig !== lastSwScheduleSignature) {
    lastSwScheduleSignature = swSig;
    scheduleServiceWorkerAlarm(record, effectiveTargetMs, alarmStatus);
  }

  const now = Date.now();
  if (now >= effectiveTargetMs && !sleepAlarmLocallyMuted) {
    if (currentSentinelMode !== 'ringing') {
      switchSentinelToRinging();
    }
  } else {
    if (currentSentinelMode === 'ringing' || currentSentinelMode === 'off') {
      switchSentinelToSilentKeepAlive();
    } else {
      updateLockScreenMediaSession('sentinel');
    }
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

export function isMobileAlarmAudioUnlocked(): boolean {
  if (mobileAudioUnlocked || isSleepAlarmSentinelArmed()) return true;
  if (sharedAudioContext && sharedAudioContext.state === 'running') return true;
  return false;
}

/**
 * Unlocks HTML5 <audio>, the Sleep-Mode Sentinel, and Web Audio API synchronously inside any user tap/click.
 */
export function unlockMobileAlarmAudio(): void {
  if (typeof window === 'undefined') return;

  configureIosPlaybackAudioSession();

  // 1. Unlock Web Audio API
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const stateStr = String(ctx.state);
      if (stateStr === 'suspended' || stateStr === 'interrupted') {
        ctx.resume().catch(() => {});
      }
      const silentBuf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    // Ignore Web Audio unlock errors
  }

  // 2. Prime foreground HTML5 <audio> element silently if not currently ringing
  if (!mobileAudioUnlocked && !isActivelyRingingNow) {
    try {
      const audioEl = getSharedAlarmAudioElement();
      if (audioEl) {
        audioEl.muted = true;
        const p = audioEl.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (!isActivelyRingingNow) {
              audioEl.pause();
              audioEl.currentTime = 0;
            }
            audioEl.muted = false;
            audioEl.volume = 1.0;
            mobileAudioUnlocked = true;
          }).catch(() => {
            audioEl.muted = false;
          });
        }
      }
    } catch {
      // Ignore silent priming errors
    }
  }

  // 3. Also prime or arm the sleep-mode sentinel element on user gesture
  try {
    const sentinel = getOrCreateSentinelAudioElement();
    if (sentinel && activeSleepTarget?.shouldBeActive && currentSentinelMode === 'off') {
      const now = Date.now();
      if (now >= activeSleepTarget.targetAlarmMs && !sleepAlarmLocallyMuted) {
        switchSentinelToRinging();
      } else {
        switchSentinelToSilentKeepAlive();
      }
    }
  } catch {
    // Ignore sentinel priming errors
  }
}

function scheduleWebAudioOscillators(ctx: AudioContext): void {
  const now = ctx.currentTime + 0.01;
  const notes = [
    { freq: 987.77, offset: 0.0, duration: 0.14 },
    { freq: 1318.51, offset: 0.15, duration: 0.14 },
    { freq: 1760.0, offset: 0.30, duration: 0.22 },
    { freq: 987.77, offset: 0.62, duration: 0.14 },
    { freq: 1318.51, offset: 0.77, duration: 0.14 },
    { freq: 1975.53, offset: 0.92, duration: 0.24 },
    { freq: 1760.0, offset: 1.20, duration: 0.22 },
  ];

  notes.forEach(({ freq, offset, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now + offset);

    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.38, now + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + offset);
    osc.stop(now + offset + duration + 0.02);
  });
}

async function playWebAudioFallback(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const stateStr = String(ctx.state);
    if (stateStr === 'suspended' || stateStr === 'interrupted') {
      await ctx.resume();
    }

    if (String(ctx.state) !== 'running') {
      return false;
    }

    scheduleWebAudioOscillators(ctx);
    mobileAudioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays a loud, mobile-compatible corporate alarm chime + vibration.
 * If the sleep-mode sentinel is already actively looping the alarm WAV, avoids
 * overlapping duplicate audio streams unless `forceBurst` / `fromUserGesture` is requested.
 */
export async function playAlarmPattern(options?: {
  fromUserGesture?: boolean;
  skipIfPlayedWithinMs?: number;
}): Promise<boolean> {
  configureIosPlaybackAudioSession();

  // Trigger mobile vibration on Android devices
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([400, 140, 400, 140, 650]);
    }
  } catch {
    // Ignore vibration errors on iOS / unsupported browsers
  }

  // If the sleep-mode sentinel is already playing the continuous loud alarm loop, keep it going cleanly
  if (
    currentSentinelMode === 'ringing' &&
    sentinelAudioEl &&
    !sentinelAudioEl.paused &&
    !options?.fromUserGesture
  ) {
    return true;
  }

  const nowMs = Date.now();
  if (
    options?.skipIfPlayedWithinMs &&
    nowMs - lastAlarmTimestampMs < options.skipIfPlayedWithinMs
  ) {
    return true;
  }
  lastAlarmTimestampMs = nowMs;

  if (options?.fromUserGesture) {
    setSleepAlarmLocalMute(false);
    try {
      const ctx = getAudioContext();
      if (ctx && String(ctx.state) !== 'running') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore
    }
    // If real session is overdue, arm the continuous sleep-proof ringing stream too
    if (activeSleepTarget?.shouldBeActive && nowMs >= activeSleepTarget.targetAlarmMs) {
      switchSentinelToRinging();
      return true;
    }
  }

  isActivelyRingingNow = true;
  setTimeout(() => {
    if (currentSentinelMode !== 'ringing') {
      isActivelyRingingNow = false;
    }
  }, 1500);

  try {
    const audioEl = getSharedAlarmAudioElement();
    if (audioEl) {
      audioEl.muted = false;
      audioEl.volume = 1.0;
      audioEl.currentTime = 0;
      await audioEl.play();
      mobileAudioUnlocked = true;
      return true;
    }
  } catch {
    // Fallback to Web Audio API
  }

  return playWebAudioFallback();
}

export function stopAlarmAudioImmediately(): void {
  isActivelyRingingNow = false;
  try {
    if (sharedAlarmAudioEl) {
      sharedAlarmAudioEl.pause();
      sharedAlarmAudioEl.currentTime = 0;
    }
    if (currentSentinelMode === 'ringing') {
      if (activeSleepTarget?.shouldBeActive) {
        sleepAlarmLocallyMuted = true;
        switchSentinelToSilentKeepAlive();
      } else {
        stopSentinelCompletely();
      }
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
  } catch {
    // Ignore
  }
}

// ============================================================================
// SERVICE WORKER REGISTRATION & SLEEP-MODE NOTIFICATION SCHEDULER
// ============================================================================
let alarmSwRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerAlarmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!alarmSwRegistrationPromise) {
    alarmSwRegistrationPromise = navigator.serviceWorker
      .register('/alarm-sw.js')
      .then((reg) => reg)
      .catch(() => null);
  }
  return alarmSwRegistrationPromise;
}

function postMessageToAlarmSw(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  registerAlarmServiceWorker()
    .then((reg) => {
      const targetWorker =
        reg?.active || reg?.waiting || reg?.installing || navigator.serviceWorker.controller;
      if (targetWorker) {
        targetWorker.postMessage(payload);
      }
    })
    .catch(() => {});
}

function scheduleServiceWorkerAlarm(
  record: AttendanceRecord,
  targetAlarmMs: number,
  alarmStatus: SessionAlarmStatus
): void {
  postMessageToAlarmSw({
    type: 'SCHEDULE_SESSION_ALARM',
    recordId: record.id,
    targetAlarmMs,
    autoLockDeadlineMs: alarmStatus.autoLockDeadlineMs,
    expectedEndTimeFormatted: alarmStatus.expectedEndTimeFormatted,
    title: '⚠️ BSCW Check: ¡Sesión Finalizada!',
    body: `La sesión "${record.activityName}" en ${record.companyName} (${record.sedeName}) ha terminado. Registra tu salida ahora.`,
  });
}

function cancelServiceWorkerAlarm(): void {
  postMessageToAlarmSw({
    type: 'CANCEL_SESSION_ALARM',
  });
}

export function subscribeToAlarmServiceWorkerActions(
  handler: (action: 'checkout' | 'snooze_5m' | 'open' | 'sw_fired', recordId: string) => void
): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const listener = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ALARM_NOTIFICATION_ACTION') {
      const act =
        data.action === 'checkout' || data.action === 'snooze_5m' ? data.action : 'open';
      handler(act, String(data.recordId || ''));
    } else if (data.type === 'SW_ALARM_FIRED') {
      evaluateSleepSentinelTick();
      handler('sw_fired', String(data.recordId || ''));
    }
  };

  navigator.serviceWorker.addEventListener('message', listener);
  return () => {
    navigator.serviceWorker.removeEventListener('message', listener);
  };
}

// ============================================================================
// SCREEN WAKE LOCK FOR ACTIVE MOBILE SESSIONS
// ============================================================================
interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}

let activeWakeLock: WakeLockSentinelLike | null = null;

export async function requestSessionWakeLock(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }
    if (activeWakeLock && !activeWakeLock.released) {
      return true;
    }
    const wl = await (
      navigator as unknown as {
        wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      }
    ).wakeLock.request('screen');
    activeWakeLock = wl;
    return true;
  } catch {
    return false;
  }
}

export async function releaseSessionWakeLock(): Promise<void> {
  try {
    if (activeWakeLock) {
      await activeWakeLock.release();
      activeWakeLock = null;
    }
  } catch {
    activeWakeLock = null;
  }
}

// ============================================================================
// MOBILE & DESKTOP NOTIFICATIONS
// ============================================================================
export async function requestAlarmNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function triggerBrowserCheckoutNotification(record: AttendanceRecord): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = '⚠️ BSCW Check: ¡Sesión Finalizada! Salida Pendiente';
  const body = `La sesión "${record.activityName}" en ${record.companyName} (${record.sedeName}) ha finalizado. Por favor registra tu salida.`;
  const options: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
    requireInteraction?: boolean;
  } = {
    body,
    tag: `bscw-checkout-alarm-${record.id}`,
    vibrate: [500, 150, 500, 150, 800, 200, 800],
    renotify: true,
    requireInteraction: true,
  };

  postMessageToAlarmSw({
    type: 'SHOW_ALARM_NOTIFICATION',
    recordId: record.id,
    title,
    body,
  });

  if ('serviceWorker' in navigator && navigator.serviceWorker) {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg && typeof reg.showNotification === 'function') {
          return reg.showNotification(title, options);
        }
        try {
          new Notification(title, options);
        } catch {
          // Ignore constructor restrictions on mobile webviews without SW
        }
      })
      .catch(() => {
        try {
          new Notification(title, options);
        } catch {
          // Ignore
        }
      });
    return;
  }

  try {
    new Notification(title, options);
  } catch {
    // Ignore notification constructor restrictions in restricted webviews
  }
}

/**
 * Plays a pleasant ascending 3-note notification chime for the Administrator
 * when a trainer starts an assignment in real time.
 */
export async function playAdminSessionStartChime(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    const stateStr = String(ctx.state);
    if (stateStr === 'suspended' || stateStr === 'interrupted') {
      await ctx.resume();
    }
    if (String(ctx.state) !== 'running') {
      return false;
    }

    const now = ctx.currentTime + 0.01;
    const chimeNotes = [
      { freq: 587.33, offset: 0.0, duration: 0.14 },  // D5
      { freq: 880.0, offset: 0.13, duration: 0.16 },  // A5
      { freq: 1174.66, offset: 0.27, duration: 0.28 }, // D6
    ];

    chimeNotes.forEach(({ freq, offset, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + duration + 0.02);
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Triggers a desktop browser Notification for the Administrator when a trainer checks in.
 */
export function triggerAdminSessionStartNotification(record: AttendanceRecord): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = `BSCW Check: ${record.trainerName} inició su asignación`;
  const options: NotificationOptions & { renotify?: boolean } = {
    body: `${record.activityName} en ${record.companyName} (${record.sedeName}) · Entrada ${record.checkInTime} hrs.`,
    tag: `bscw-admin-start-${record.id}`,
    renotify: true,
  };

  if ('serviceWorker' in navigator && navigator.serviceWorker) {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg && typeof reg.showNotification === 'function') {
          return reg.showNotification(title, options);
        }
        try {
          new Notification(title, options);
        } catch {
          // Ignore constructor restrictions
        }
      })
      .catch(() => {
        try {
          new Notification(title, options);
        } catch {
          // Ignore
        }
      });
    return;
  }

  try {
    new Notification(title, options);
  } catch {
    // Ignore notification restrictions
  }
}
