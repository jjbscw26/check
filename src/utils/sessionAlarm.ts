import {
  ACTIVITY_TYPE_DEFAULT_MINUTES,
  ActivityCatalogItem,
  ActivityType,
  AttendanceRecord,
  ClassAssignment,
  normalizeActivityType,
} from '../types';

export const UNCLOSED_GRACE_MINUTES = 60;
export const UNCLOSED_GRACE_SECONDS = UNCLOSED_GRACE_MINUTES * 60;

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
  const match = catalog.find(
    (item) => item.name.toLowerCase() === activityName.toLowerCase()
  );
  if (match && match.defaultDurationMinutes > 0) {
    return match.defaultDurationMinutes;
  }
  return ACTIVITY_TYPE_DEFAULT_MINUTES[normalizeActivityType(activityType)];
}

export function getAssignmentDurationMinutes(
  assignment: ClassAssignment,
  catalog: ActivityCatalogItem[] = []
): number {
  if (assignment.durationMinutes && assignment.durationMinutes > 0) {
    return assignment.durationMinutes;
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
  const hasExceededUnclosedGrace = isInProgress && (nowMs >= autoLockDeadlineMs || overdueSeconds >= UNCLOSED_GRACE_SECONDS);

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
  const shouldRing = isInProgress && alarmEnabled && isOverdue && !isSnoozed && !hasExceededUnclosedGrace;

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
// MOBILE-COMPATIBLE ALARM AUDIO ENGINE (iOS Safari + Android Chrome)
// ============================================================================
// Why mobile alarms often fail in web apps:
// 1. iOS Safari & Android Chrome block AudioContext / <audio> unless unlocked
//    synchronously inside a direct user gesture (touchstart / pointerdown / click).
// 2. On iPhone/iPad, Web Audio API alone obeys the hardware Silent/Ring switch.
//    Playing a synthesized 16-bit PCM WAV via HTML5 <audio> + setting
//    navigator.audioSession.type = 'playback' routes sound through the Media
//    Playback channel so it rings aloud even if the phone's silent switch is on.
// 3. Phone micro-speakers require rich upper harmonics (880–2600 Hz) at high
//    normalized amplitude (~0.92) rather than quiet low-gain triangle waves.

let sharedAudioContext: AudioContext | null = null;
let sharedAlarmAudioEl: HTMLAudioElement | null = null;
let cachedAlarmWavDataUri: string | null = null;
let mobileAudioUnlocked = false;
let isActivelyRingingNow = false;
let lastAlarmTimestampMs = 0;

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

/**
 * Generates a high-clarity, loud 16-bit PCM WAV data URI optimized for mobile speakers.
 * Two urgent ascending harmonic bursts + attention double-beep (total ~1.45s).
 */
function getAlarmWavDataUri(): string {
  if (cachedAlarmWavDataUri) return cachedAlarmWavDataUri;

  const sampleRate = 16000;
  const durationSec = 1.45;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF / WAVE header
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

  // Loud smartphone-optimized alarm notes (880Hz - 1760Hz with 2nd & 3rd harmonics)
  const notes = [
    { freq: 987.77, start: 0.0, dur: 0.14 },   // B5
    { freq: 1318.51, start: 0.15, dur: 0.14 }, // E6
    { freq: 1760.0, start: 0.30, dur: 0.22 },  // A6
    { freq: 987.77, start: 0.62, dur: 0.14 },  // B5
    { freq: 1318.51, start: 0.77, dur: 0.14 }, // E6
    { freq: 1975.53, start: 0.92, dur: 0.24 }, // B6
    { freq: 1760.0, start: 1.20, dur: 0.22 },  // A6
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sampleVal = 0;

    for (let n = 0; n < notes.length; n++) {
      const note = notes[n];
      if (t >= note.start && t <= note.start + note.dur) {
        const localT = t - note.start;
        // Smooth 8ms attack and 16ms release to prevent speaker clicks
        const attack = Math.min(1, localT / 0.008);
        const release = Math.min(1, (note.dur - localT) / 0.016);
        const env = Math.max(0, Math.min(attack, release));

        const w = 2 * Math.PI * note.freq * localT;
        // Fundamental + 2nd + 3rd harmonic for crisp phone speaker projection
        const wave =
          0.62 * Math.sin(w) +
          0.26 * Math.sin(2 * w) +
          0.12 * Math.sin(3 * w);

        sampleVal += env * wave * 0.92;
      }
    }

    const clamped = Math.max(-1, Math.min(1, sampleVal));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  cachedAlarmWavDataUri = `data:audio/wav;base64,${encodeBase64FromBytes(new Uint8Array(buffer))}`;
  return cachedAlarmWavDataUri;
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
  if (mobileAudioUnlocked) return true;
  if (sharedAudioContext && sharedAudioContext.state === 'running') return true;
  return false;
}

/**
 * Unlocks both HTML5 <audio> and Web Audio API synchronously inside any user tap/click.
 * Safe to call silently on touchstart/pointerdown/click anywhere in the app.
 */
export function unlockMobileAlarmAudio(): void {
  if (typeof window === 'undefined') return;

  configureIosPlaybackAudioSession();

  // 1. Unlock Web Audio API (including iOS 'interrupted' state) with a 1-sample silent buffer
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

  // 2. Prime & unlock the persistent HTML5 <audio> element silently if not currently ringing
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

    // Square/sawtooth blend via square wave cuts through phone speakers clearly
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
 * Returns `true` if audio playback succeeded, or `false` if the mobile browser
 * blocked playback (e.g., page reloaded without any touch gesture yet).
 */
export async function playAlarmPattern(options?: {
  fromUserGesture?: boolean;
  skipIfPlayedWithinMs?: number;
}): Promise<boolean> {
  const nowMs = Date.now();
  if (
    options?.skipIfPlayedWithinMs &&
    nowMs - lastAlarmTimestampMs < options.skipIfPlayedWithinMs
  ) {
    return true;
  }
  lastAlarmTimestampMs = nowMs;

  configureIosPlaybackAudioSession();

  // Trigger mobile vibration on Android devices
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([320, 120, 320, 120, 500]);
    }
  } catch {
    // Ignore vibration errors on iOS / unsupported browsers
  }

  // Also ensure Web Audio context is resumed if inside a user gesture
  if (options?.fromUserGesture) {
    try {
      const ctx = getAudioContext();
      if (ctx && String(ctx.state) !== 'running') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore
    }
  }

  isActivelyRingingNow = true;
  setTimeout(() => {
    isActivelyRingingNow = false;
  }, 1500);

  // Primary: HTML5 <audio> with 16-bit WAV (works on Android Media stream & bypasses iOS silent switch)
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
    // Fallback to Web Audio API if HTML5 <audio>.play() rejected
  }

  // Secondary fallback: Web Audio API
  return playWebAudioFallback();
}

export function stopAlarmAudioImmediately(): void {
  isActivelyRingingNow = false;
  try {
    if (sharedAlarmAudioEl) {
      sharedAlarmAudioEl.pause();
      sharedAlarmAudioEl.currentTime = 0;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
  } catch {
    // Ignore
  }
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
export async function requestAlarmNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
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

  const title = '⚠️ BSCW Check: Salida Pendiente de Registrar';
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: `La sesión "${record.activityName}" en ${record.companyName} (${record.sedeName}) ha finalizado. Por favor registra tu salida.`,
    tag: `bscw-checkout-alarm-${record.id}`,
    vibrate: [320, 120, 320, 120, 500],
    renotify: true,
  };

  // Android Chrome requires ServiceWorkerRegistration.showNotification() instead of new Notification()
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
