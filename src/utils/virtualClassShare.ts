import { ACTIVITY_TYPE_LABELS, ActivityType } from '../types';

export const VIRTUAL_PLATFORM_PRESETS = [
  'Google Meet',
  'Zoom',
  'Microsoft Teams',
  'Webex',
  'Otra Plataforma',
] as const;

export type VirtualPlatformPreset = (typeof VIRTUAL_PLATFORM_PRESETS)[number];

export interface VirtualClassSharePayload {
  activityName: string;
  activityTypeLabel?: string;
  companyName: string;
  sedeName?: string;
  trainerName: string;
  scheduleLabel: string;
  time: string;
  durationMinutes?: number;
  virtualPlatform: string;
  virtualMeetingUrl: string;
  virtualMeetingId?: string;
  virtualPasscode?: string;
  notes?: string;
}

interface CompactShareTokenV1 {
  v: 1;
  a: string; // activityName
  m?: string; // activityTypeLabel
  c: string; // companyName
  s?: string; // sedeName
  t: string; // trainerName
  sc: string; // scheduleLabel
  tm: string; // time
  d?: number; // durationMinutes
  p: string; // virtualPlatform
  u: string; // virtualMeetingUrl
  id?: string; // virtualMeetingId
  pw?: string; // virtualPasscode
  n?: string; // notes
}

const DAY_NAMES_ES: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export function normalizeVirtualMeetingUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim().replace(/\s+/g, '');
  if (!trimmed) return '';
  let withProtocol = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    withProtocol = trimmed.replace(/^https?:\/\//i, (match) => match.toLowerCase());
  } else {
    withProtocol = `https://${trimmed}`;
  }
  return withProtocol.slice(0, 500);
}

export function isValidVirtualMeetingUrl(rawUrl: string): boolean {
  const normalized = normalizeVirtualMeetingUrl(rawUrl);
  if (normalized.length < 8 || normalized.length > 500) return false;
  if (!/^https?:\/\/\S+$/.test(normalized)) return false;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.trim();
    if (!host) return false;
    if (host !== 'localhost' && !host.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}

export function formatDurationLabelEs(minutes?: number): string {
  if (!minutes || minutes <= 0) return '';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs} h ${mins} min`;
  if (hrs > 0) return hrs === 1 ? '1 hora' : `${hrs} horas`;
  return `${mins} min`;
}

export function formatAssignmentScheduleLabel(params: {
  frequency?: 'semanal' | 'mensual' | 'fecha_unica';
  dayOfWeek?: number;
  date?: string;
  dayOfMonth?: number;
  time: string;
}): string {
  const cleanTime = (params.time || '').trim() || '09:00';
  if (params.frequency === 'fecha_unica' && params.date) {
    return `${params.date} · ${cleanTime} hrs`;
  }
  if (params.frequency === 'mensual' && params.dayOfMonth) {
    return `Día ${params.dayOfMonth} de cada mes · ${cleanTime} hrs`;
  }
  if (params.frequency === 'semanal' && typeof params.dayOfWeek === 'number') {
    const dayLabel = DAY_NAMES_ES[params.dayOfWeek] || 'Semanal';
    return `Cada ${dayLabel} · ${cleanTime} hrs`;
  }
  if (params.date) {
    return `${params.date} · ${cleanTime} hrs`;
  }
  return `${cleanTime} hrs`;
}

export function buildSharePayloadFromAssignmentLike(item: {
  activityName: string;
  activityType?: ActivityType;
  companyName: string;
  sedeName?: string;
  trainerName: string;
  frequency?: 'semanal' | 'mensual' | 'fecha_unica';
  dayOfWeek?: number;
  date?: string;
  dayOfMonth?: number;
  time?: string;
  scheduledTime?: string;
  durationMinutes?: number;
  plannedDurationMinutes?: number;
  virtualPlatform?: string;
  virtualMeetingUrl?: string;
  virtualMeetingId?: string;
  virtualPasscode?: string;
  notes?: string;
  observations?: string;
}): VirtualClassSharePayload | null {
  const normalizedUrl = normalizeVirtualMeetingUrl(item.virtualMeetingUrl || '');
  if (!isValidVirtualMeetingUrl(normalizedUrl)) return null;

  const timeValue = (item.time || item.scheduledTime || '09:00').trim();
  const duration = item.durationMinutes ?? item.plannedDurationMinutes;
  const platform = (item.virtualPlatform || 'Google Meet').trim() || 'Google Meet';

  return {
    activityName: (item.activityName || 'Sesión Corporativa').trim(),
    activityTypeLabel: item.activityType ? ACTIVITY_TYPE_LABELS[item.activityType] : undefined,
    companyName: (item.companyName || 'Empresa Cliente').trim(),
    sedeName: item.sedeName?.trim() || undefined,
    trainerName: (item.trainerName || 'Entrenador BSCW').trim(),
    scheduleLabel: formatAssignmentScheduleLabel({
      frequency: item.frequency,
      dayOfWeek: item.dayOfWeek,
      date: item.date,
      dayOfMonth: item.dayOfMonth,
      time: timeValue,
    }),
    time: timeValue,
    durationMinutes: typeof duration === 'number' && duration > 0 ? duration : undefined,
    virtualPlatform: platform,
    virtualMeetingUrl: normalizedUrl,
    virtualMeetingId: item.virtualMeetingId?.trim() || undefined,
    virtualPasscode: item.virtualPasscode?.trim() || undefined,
    notes: (item.notes || item.observations)?.trim() || undefined,
  };
}

function encodeUtf8Base64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeUtf8Base64Url(token: string): string {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export const VIRTUAL_SHARE_QUERY_PARAM = 'clase_virtual';

export function buildVirtualClassShareUrl(payload: VirtualClassSharePayload): string {
  const normalizedUrl = normalizeVirtualMeetingUrl(payload.virtualMeetingUrl);
  const tokenObj: CompactShareTokenV1 = {
    v: 1,
    a: payload.activityName.slice(0, 150),
    m: payload.activityTypeLabel?.slice(0, 50),
    c: payload.companyName.slice(0, 150),
    s: payload.sedeName?.slice(0, 150),
    t: payload.trainerName.slice(0, 120),
    sc: payload.scheduleLabel.slice(0, 100),
    tm: payload.time.slice(0, 10),
    d: payload.durationMinutes,
    p: (payload.virtualPlatform || 'Google Meet').slice(0, 80),
    u: normalizedUrl,
    id: payload.virtualMeetingId?.slice(0, 100) || undefined,
    pw: payload.virtualPasscode?.slice(0, 120) || undefined,
    n: payload.notes?.slice(0, 280) || undefined,
  };

  const encoded = encodeUtf8Base64Url(JSON.stringify(tokenObj));
  if (typeof window === 'undefined') {
    return `?${VIRTUAL_SHARE_QUERY_PARAM}=${encoded}`;
  }
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return `${baseUrl}?${VIRTUAL_SHARE_QUERY_PARAM}=${encoded}`;
}

export function parseVirtualClassShareUrlFromLocation(
  search?: string
): VirtualClassSharePayload | null {
  try {
    const queryStr =
      typeof search === 'string'
        ? search
        : typeof window !== 'undefined'
          ? window.location.search
          : '';
    if (!queryStr) return null;
    const params = new URLSearchParams(queryStr);
    const rawToken = params.get(VIRTUAL_SHARE_QUERY_PARAM);
    if (!rawToken || rawToken.length > 4096) return null;

    const jsonStr = decodeUtf8Base64Url(rawToken.trim());
    const parsed = JSON.parse(jsonStr) as Partial<CompactShareTokenV1>;
    if (!parsed || typeof parsed !== 'object') return null;

    const meetingUrl = normalizeVirtualMeetingUrl(String(parsed.u || ''));
    if (!isValidVirtualMeetingUrl(meetingUrl)) return null;

    const activityName = String(parsed.a || '').trim().slice(0, 150);
    const companyName = String(parsed.c || '').trim().slice(0, 150);
    const trainerName = String(parsed.t || '').trim().slice(0, 120);
    const virtualPlatform = String(parsed.p || 'Plataforma Virtual').trim().slice(0, 80);
    const time = String(parsed.tm || '09:00').trim().slice(0, 10);
    const scheduleLabel = String(parsed.sc || `${time} hrs`).trim().slice(0, 100);

    if (!activityName || !companyName) return null;

    return {
      activityName,
      activityTypeLabel: parsed.m ? String(parsed.m).trim().slice(0, 60) : undefined,
      companyName,
      sedeName: parsed.s ? String(parsed.s).trim().slice(0, 150) : undefined,
      trainerName: trainerName || 'Entrenador BSCW',
      scheduleLabel,
      time,
      durationMinutes:
        typeof parsed.d === 'number' && Number.isFinite(parsed.d) && parsed.d > 0
          ? Math.round(parsed.d)
          : undefined,
      virtualPlatform: virtualPlatform || 'Plataforma Virtual',
      virtualMeetingUrl: meetingUrl,
      virtualMeetingId: parsed.id ? String(parsed.id).trim().slice(0, 100) : undefined,
      virtualPasscode: parsed.pw ? String(parsed.pw).trim().slice(0, 120) : undefined,
      notes: parsed.n ? String(parsed.n).trim().slice(0, 280) : undefined,
    };
  } catch {
    return null;
  }
}

export function clearVirtualClassShareParamFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(VIRTUAL_SHARE_QUERY_PARAM)) return;
    url.searchParams.delete(VIRTUAL_SHARE_QUERY_PARAM);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', nextUrl);
  } catch {
    // Ignore history API errors in restricted environments
  }
}

export function buildVirtualClassInvitationText(
  payload: VirtualClassSharePayload,
  shareCardUrl?: string
): string {
  const durationLabel = formatDurationLabelEs(payload.durationMinutes);
  const lines: string[] = [
    `Clase Virtual: ${payload.activityName}${payload.activityTypeLabel ? ` (${payload.activityTypeLabel})` : ''}`,
    `Empresa: ${payload.companyName}${payload.sedeName ? ` · ${payload.sedeName}` : ''}`,
    `Entrenador(a): ${payload.trainerName}`,
    `Horario: ${payload.scheduleLabel}${durationLabel ? ` · Duración: ${durationLabel}` : ''}`,
    `Plataforma: ${payload.virtualPlatform}`,
    `Enlace directo a la sala: ${payload.virtualMeetingUrl}`,
  ];

  if (payload.virtualMeetingId) {
    lines.push(`ID de reunión: ${payload.virtualMeetingId}`);
  }
  if (payload.virtualPasscode) {
    lines.push(`Código de acceso: ${payload.virtualPasscode}`);
  }
  if (payload.notes) {
    lines.push(`Indicaciones: ${payload.notes}`);
  }
  if (shareCardUrl) {
    lines.push(`Tarjeta de acceso para compartir: ${shareCardUrl}`);
  }

  return lines.join('\n');
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to textarea copy below
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
