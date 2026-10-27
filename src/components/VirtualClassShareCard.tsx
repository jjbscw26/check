import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  MessageCircle,
  Share2,
  Video,
  X,
} from 'lucide-react';
import {
  buildVirtualClassInvitationText,
  buildVirtualClassShareUrl,
  buildWhatsAppShareUrl,
  clearVirtualClassShareParamFromUrl,
  copyTextToClipboard,
  formatDurationLabelEs,
  parseVirtualClassShareUrlFromLocation,
  VirtualClassSharePayload,
} from '../utils/virtualClassShare';

interface VirtualClassQuickShareProps {
  payload: VirtualClassSharePayload;
  compact?: boolean;
  className?: string;
}

export const VirtualClassQuickShare: React.FC<VirtualClassQuickShareProps> = ({
  payload,
  compact = false,
  className = '',
}) => {
  const [copiedTarget, setCopiedTarget] = useState<'link' | 'data' | 'id' | 'passcode' | null>(
    null
  );

  const shareUrl = useMemo(() => buildVirtualClassShareUrl(payload), [payload]);
  const invitationText = useMemo(
    () => buildVirtualClassInvitationText(payload, shareUrl),
    [payload, shareUrl]
  );
  const whatsAppUrl = useMemo(
    () => buildWhatsAppShareUrl(invitationText),
    [invitationText]
  );

  const triggerCopied = (target: 'link' | 'data' | 'id' | 'passcode') => {
    setCopiedTarget(target);
    window.setTimeout(() => {
      setCopiedTarget((prev) => (prev === target ? null : prev));
    }, 2200);
  };

  const handleCopyShareLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) triggerCopied('link');
  };

  const handleCopyDetails = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyTextToClipboard(invitationText);
    if (ok) triggerCopied('data');
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Clase Virtual: ${payload.activityName}`,
          text: buildVirtualClassInvitationText(payload),
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or iframe blocked Web Share; fallback to clipboard copy
      }
    }
    const ok = await copyTextToClipboard(invitationText);
    if (ok) triggerCopied('data');
  };

  if (compact) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`rounded-lg border border-sky-200 bg-sky-50/60 p-2.5 text-xs ${className}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sky-900 font-medium min-w-0">
            <Video className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span className="truncate">Clase Virtual</span>
            <span aria-hidden="true" className="text-sky-400">
              ·
            </span>
            <span className="font-semibold truncate">{payload.virtualPlatform}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyShareLink}
              title="Copiar link para compartir los datos de esta clase virtual"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-sky-200 bg-white text-sky-800 hover:bg-sky-100/70 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedTarget === 'link' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-700">Link copiado</span>
                </>
              ) : (
                <>
                  <Link2 className="w-3 h-3" />
                  <span>Link para compartir</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyDetails}
              title="Copiar todos los datos de plataforma, acceso y horario"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedTarget === 'data' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-700">Datos copiados</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copiar datos</span>
                </>
              )}
            </button>

            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Compartir datos por WhatsApp"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-3 h-3" />
              <span>WhatsApp</span>
            </a>

            <a
              href={payload.virtualMeetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Abrir sala</span>
            </a>
          </div>
        </div>

        {(payload.virtualMeetingId || payload.virtualPasscode) && (
          <div className="mt-1.5 pt-1.5 border-t border-sky-200/70 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 tabular-nums">
            {payload.virtualMeetingId && (
              <span>
                ID sala:{' '}
                <strong className="font-mono text-slate-800">{payload.virtualMeetingId}</strong>
              </span>
            )}
            {payload.virtualMeetingId && payload.virtualPasscode && (
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
            )}
            {payload.virtualPasscode && (
              <span>
                Código:{' '}
                <strong className="font-mono text-slate-800">{payload.virtualPasscode}</strong>
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-sky-900 min-w-0">
          <Video className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="font-semibold">Acceso Virtual</span>
          <span aria-hidden="true" className="text-sky-400">
            ·
          </span>
          <span className="font-medium text-slate-700 truncate">{payload.virtualPlatform}</span>
        </div>

        <a
          href={payload.virtualMeetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Abrir Sala Virtual</span>
        </a>
      </div>

      {(payload.virtualMeetingId || payload.virtualPasscode) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 tabular-nums">
          {payload.virtualMeetingId && (
            <button
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (payload.virtualMeetingId) {
                  const ok = await copyTextToClipboard(payload.virtualMeetingId);
                  if (ok) triggerCopied('id');
                }
              }}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors cursor-pointer"
              title="Clic para copiar ID de reunión"
            >
              <span>ID de reunión:</span>
              <span className="font-mono font-semibold text-slate-900">
                {payload.virtualMeetingId}
              </span>
              {copiedTarget === 'id' ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          )}
          {payload.virtualMeetingId && payload.virtualPasscode && (
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
          )}
          {payload.virtualPasscode && (
            <button
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (payload.virtualPasscode) {
                  const ok = await copyTextToClipboard(payload.virtualPasscode);
                  if (ok) triggerCopied('passcode');
                }
              }}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors cursor-pointer"
              title="Clic para copiar código de acceso"
            >
              <span>Código de acceso:</span>
              <span className="font-mono font-semibold text-slate-900">
                {payload.virtualPasscode}
              </span>
              {copiedTarget === 'passcode' ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Shareable Link Box */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-slate-600">
          Link para compartir datos de la clase virtual (entrenador / participantes):
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full min-w-0 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedTarget === 'link' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>¡Link copiado!</span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5" />
                <span>Copiar Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Share Actions Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopyDetails}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {copiedTarget === 'data' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-semibold">¡Datos copiados!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar Datos Completos</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleNativeShare}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Compartir</span>
        </button>

        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>Enviar por WhatsApp</span>
        </a>
      </div>
    </div>
  );
};

export const VirtualClassInviteLandingModal: React.FC = () => {
  const [payload, setPayload] = useState<VirtualClassSharePayload | null>(() =>
    parseVirtualClassShareUrlFromLocation()
  );
  const [copiedMode, setCopiedMode] = useState<'data' | 'link' | 'id' | 'pw' | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setPayload(parseVirtualClassShareUrlFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (!payload) return null;

  const shareUrl = buildVirtualClassShareUrl(payload);
  const invitationText = buildVirtualClassInvitationText(payload, shareUrl);
  const whatsAppUrl = buildWhatsAppShareUrl(invitationText);
  const durationLabel = formatDurationLabelEs(payload.durationMinutes);

  const markCopied = (mode: 'data' | 'link' | 'id' | 'pw') => {
    setCopiedMode(mode);
    window.setTimeout(() => {
      setCopiedMode((prev) => (prev === mode ? null : prev));
    }, 2200);
  };

  const handleClose = () => {
    clearVirtualClassShareParamFromUrl();
    setPayload(null);
  };

  return (
    <div className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-sky-700 font-semibold">
              <Video className="w-4 h-4 shrink-0" />
              <span>Tarjeta de Acceso a Clase Virtual</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>{payload.virtualPlatform}</span>
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-slate-900 leading-snug">
              {payload.activityName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{payload.companyName}</span>
              {payload.sedeName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{payload.sedeName}</span>
                </>
              )}
              {payload.activityTypeLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{payload.activityTypeLabel}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
            aria-label="Cerrar tarjeta de clase virtual"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Schedule & Trainer Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100 text-sm">
            <div>
              <p className="text-xs text-slate-500">Horario programado</p>
              <p className="font-semibold text-slate-900 tabular-nums mt-0.5">
                {payload.scheduleLabel}
              </p>
              {durationLabel && (
                <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                  Duración estimada: {durationLabel}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-500">Entrenador(a) asignado</p>
              <p className="font-semibold text-slate-900 mt-0.5">{payload.trainerName}</p>
              <p className="text-xs text-slate-500 mt-0.5">Plataforma: {payload.virtualPlatform}</p>
            </div>
          </div>

          {/* Direct Room Entry CTA */}
          <div className="space-y-2.5">
            <a
              href={payload.virtualMeetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>Ingresar a la Clase en {payload.virtualPlatform}</span>
            </a>
            <p className="text-xs text-slate-500 font-mono break-all">
              {payload.virtualMeetingUrl}
            </p>
          </div>

          {/* Credentials if present */}
          {(payload.virtualMeetingId || payload.virtualPasscode) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              {payload.virtualMeetingId && (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500">ID de Reunión</p>
                    <p className="text-xs font-mono font-semibold text-slate-900 tabular-nums truncate">
                      {payload.virtualMeetingId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (payload.virtualMeetingId) {
                        const ok = await copyTextToClipboard(payload.virtualMeetingId);
                        if (ok) markCopied('id');
                      }
                    }}
                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-white transition-colors shrink-0 cursor-pointer"
                    title="Copiar ID de reunión"
                  >
                    {copiedMode === 'id' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}

              {payload.virtualPasscode && (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500">Código de Acceso</p>
                    <p className="text-xs font-mono font-semibold text-slate-900 tabular-nums truncate">
                      {payload.virtualPasscode}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (payload.virtualPasscode) {
                        const ok = await copyTextToClipboard(payload.virtualPasscode);
                        if (ok) markCopied('pw');
                      }
                    }}
                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-white transition-colors shrink-0 cursor-pointer"
                    title="Copiar código de acceso"
                  >
                    {copiedMode === 'pw' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {payload.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500">Indicaciones de la sesión</p>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed">{payload.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Share & Close Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const ok = await copyTextToClipboard(invitationText);
                if (ok) markCopied('data');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedMode === 'data' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Datos copiados</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Datos</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={async () => {
                const ok = await copyTextToClipboard(shareUrl);
                if (ok) markCopied('link');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedMode === 'link' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Link copiado</span>
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>

            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ir a BSCW Check
          </button>
        </div>
      </div>
    </div>
  );
};
