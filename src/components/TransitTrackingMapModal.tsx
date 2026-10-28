import React, { useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
  X,
} from 'lucide-react';
import { TRANSIT_TRAVEL_MODE_LABELS, TrainerTransitTracking } from '../types';
import {
  calculateHaversineDistanceMeters,
  computePunctualityMarginMinutes,
  formatDistanceMetric,
  formatTravelDuration,
} from '../utils/transitCalculations';
import {
  buildGoogleMapsDirectionsUrl,
  isValidCoordinate,
  useGoogleMapsDiagnostics,
} from '../utils/googleMapsConfig';

interface SchematicRouteRadarProps {
  trainerName: string;
  trainerLat: number;
  trainerLng: number;
  sedeName: string;
  sedeAddress: string;
  sedeLat: number;
  sedeLng: number;
  geofenceRadiusMeters: number;
  routeDistanceMeters: number;
  estimatedDurationMinutes: number;
  directionsUrl: string;
}

export const SchematicRouteRadar: React.FC<SchematicRouteRadarProps> = ({
  trainerName,
  trainerLat,
  trainerLng,
  sedeName,
  sedeAddress,
  sedeLat,
  sedeLng,
  geofenceRadiusMeters,
  routeDistanceMeters,
  estimatedDurationMinutes,
  directionsUrl,
}) => {
  // Compute relative vector from Sede (center-right) to Trainer so geometry reflects real cardinal bearing
  const dLat = trainerLat - sedeLat;
  const dLng = (trainerLng - sedeLng) * Math.cos((sedeLat * Math.PI) / 180);
  const mag = Math.hypot(dLng, dLat);

  const sedeX = 360;
  const sedeY = 135;

  let trainerX = 140;
  let trainerY = 155;
  if (mag > 0.00005) {
    const normX = dLng / mag;
    const normY = -dLat / mag; // North is up (-Y)
    const pixelDist = Math.min(185, Math.max(38, Math.log10(Math.max(10, routeDistanceMeters)) * 46));
    trainerX = Math.max(60, Math.min(440, sedeX + normX * pixelDist));
    trainerY = Math.max(45, Math.min(225, sedeY + normY * pixelDist));
  } else {
    trainerX = sedeX - 24;
    trainerY = sedeY + 14;
  }

  const midX = (trainerX + sedeX) / 2;
  const midY = Math.min(trainerY, sedeY) - 24;

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-900 text-white p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-emerald-300">
            Vista Vectorial Georreferenciada en Vivo
          </p>
          <p className="text-[11px] text-slate-300">
            Coordenadas GPS en tiempo real entre {trainerName} y {sedeName}
          </p>
        </div>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <span>Abrir Ruta en Google Maps</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        </a>
      </div>

      <div className="w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden">
        <svg
          viewBox="0 0 500 270"
          className="w-full h-[220px] sm:h-[250px] block"
          role="img"
          aria-label={`Trayecto de ${trainerName} hacia ${sedeName}`}
        >
          {/* Subtle coordinate grid */}
          <g stroke="#1e293b" strokeWidth="1">
            <line x1="0" y1="54" x2="500" y2="54" />
            <line x1="0" y1="108" x2="500" y2="108" />
            <line x1="0" y1="162" x2="500" y2="162" />
            <line x1="0" y1="216" x2="500" y2="216" />
            <line x1="100" y1="0" x2="100" y2="270" />
            <line x1="200" y1="0" x2="200" y2="270" />
            <line x1="300" y1="0" x2="300" y2="270" />
            <line x1="400" y1="0" x2="400" y2="270" />
          </g>

          {/* Compass N indicator */}
          <g transform="translate(462, 32)">
            <circle cx="0" cy="0" r="16" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
            <text
              x="0"
              y="4"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="10"
              fontWeight="700"
            >
              N
            </text>
          </g>

          {/* Sede Geofence Circle */}
          <circle
            cx={sedeX}
            cy={sedeY}
            r="42"
            fill="#ef4444"
            fillOpacity="0.14"
            stroke="#ef4444"
            strokeOpacity="0.7"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />

          {/* Curved Route Path */}
          <path
            d={`M ${trainerX} ${trainerY} Q ${midX} ${midY} ${sedeX} ${sedeY}`}
            fill="none"
            stroke="#ef4444"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Distance Pill on Path */}
          <g transform={`translate(${midX}, ${midY - 6})`}>
            <rect
              x="-58"
              y="-12"
              width="116"
              height="22"
              rx="6"
              fill="#0f172a"
              stroke="#475569"
              strokeWidth="1"
            />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="10"
              fontWeight="700"
            >
              {formatDistanceMetric(routeDistanceMeters)} · {formatTravelDuration(estimatedDurationMinutes)}
            </text>
          </g>

          {/* Sede Target Pin */}
          <g transform={`translate(${sedeX}, ${sedeY})`}>
            <circle cx="0" cy="0" r="13" fill="#dc2626" stroke="#ffffff" strokeWidth="2.5" />
            <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">
              S
            </text>
            <text
              x="0"
              y="28"
              textAnchor="middle"
              fill="#fecaca"
              fontSize="10"
              fontWeight="700"
            >
              {sedeName.slice(0, 24)}
            </text>
          </g>

          {/* Trainer Live Pin */}
          <g transform={`translate(${trainerX}, ${trainerY})`}>
            <circle cx="0" cy="0" r="13" fill="#0ea5e9" stroke="#ffffff" strokeWidth="2.5" />
            <text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="800">
              {trainerName.slice(0, 1).toUpperCase()}
            </text>
            <text
              x="0"
              y="28"
              textAnchor="middle"
              fill="#bae6fd"
              fontSize="10"
              fontWeight="700"
            >
              {trainerName.slice(0, 22)}
            </text>
          </g>
        </svg>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] font-mono tabular-nums text-slate-300">
        <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
          <span className="text-sky-300 font-sans font-semibold block">
            Posición GPS Entrenador
          </span>
          <span>
            {trainerLat.toFixed(6)}, {trainerLng.toFixed(6)}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
          <span className="text-red-300 font-sans font-semibold block">
            Sede Destino ( Geocerca {geofenceRadiusMeters}m )
          </span>
          <span className="block">
            {sedeLat.toFixed(6)}, {sedeLng.toFixed(6)}
          </span>
          <span className="font-sans text-slate-400 line-clamp-1">{sedeAddress}</span>
        </div>
      </div>
    </div>
  );
};

interface ModalRouteOverlayProps {
  tracking: TrainerTransitTracking;
  recenterCount: number;
}

const ModalRouteOverlay: React.FC<ModalRouteOverlayProps> = ({ tracking, recenterCount }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const circleRef = useRef<google.maps.Circle | null>(null);

  // Frame Trainer + Sede safely (preventing zoom 22 blank tiles when very close)
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.LatLngBounds) return;
    if (
      !isValidCoordinate(tracking.trainerLat, tracking.trainerLng) ||
      !isValidCoordinate(tracking.sedeLat, tracking.sedeLng)
    ) {
      return;
    }

    const distMeters = calculateHaversineDistanceMeters(
      tracking.trainerLat,
      tracking.trainerLng,
      tracking.sedeLat,
      tracking.sedeLng
    );

    if (distMeters < 120) {
      map.panTo({ lat: tracking.sedeLat, lng: tracking.sedeLng });
      map.setZoom(16);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: tracking.trainerLat, lng: tracking.trainerLng });
    bounds.extend({ lat: tracking.sedeLat, lng: tracking.sedeLng });
    map.fitBounds(bounds, 64);
  }, [
    map,
    tracking.id,
    tracking.trainerLat,
    tracking.trainerLng,
    tracking.sedeLat,
    tracking.sedeLng,
    recenterCount,
  ]);

  // Render geofence circle + modern Route.computeRoutes polyline
  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }

    if (
      !map ||
      !isValidCoordinate(tracking.trainerLat, tracking.trainerLng) ||
      !isValidCoordinate(tracking.sedeLat, tracking.sedeLng)
    ) {
      return;
    }

    if (typeof google !== 'undefined' && google.maps?.Circle) {
      circleRef.current = new google.maps.Circle({
        map,
        center: { lat: tracking.sedeLat, lng: tracking.sedeLng },
        radius: Math.max(20, tracking.geofenceRadiusMeters || 150),
        strokeColor: '#dc2626',
        strokeOpacity: 0.7,
        strokeWeight: 1.5,
        fillColor: '#ef4444',
        fillOpacity: 0.12,
        clickable: false,
      });
    }

    const distMeters = calculateHaversineDistanceMeters(
      tracking.trainerLat,
      tracking.trainerLng,
      tracking.sedeLat,
      tracking.sedeLng
    );

    // Draw clean geodesic dashed connector immediately while road route resolves
    let fallbackConnector: google.maps.Polyline | null = null;
    if (typeof google !== 'undefined' && google.maps?.Polyline && distMeters >= 15) {
      fallbackConnector = new google.maps.Polyline({
        path: [
          { lat: tracking.trainerLat, lng: tracking.trainerLng },
          { lat: tracking.sedeLat, lng: tracking.sedeLng },
        ],
        geodesic: true,
        strokeColor: '#dc2626',
        strokeOpacity: 0.45,
        strokeWeight: 3,
        map,
      });
    }

    if (!routesLib || distMeters < 15) {
      return () => {
        if (fallbackConnector) fallbackConnector.setMap(null);
        if (circleRef.current) {
          circleRef.current.setMap(null);
          circleRef.current = null;
        }
      };
    }

    const routeClass = (routesLib as unknown as { Route?: any }).Route;
    if (!routeClass || typeof routeClass.computeRoutes !== 'function') {
      return () => {
        if (fallbackConnector) fallbackConnector.setMap(null);
        if (circleRef.current) {
          circleRef.current.setMap(null);
          circleRef.current = null;
        }
      };
    }

    let cancelled = false;

    routeClass
      .computeRoutes({
        origin: { lat: tracking.trainerLat, lng: tracking.trainerLng },
        destination: { lat: tracking.sedeLat, lng: tracking.sedeLng },
        travelMode: tracking.travelMode || 'DRIVING',
        fields: ['path', 'viewport'],
      })
      .then((res: { routes?: any[] }) => {
        if (cancelled) return;
        const primary = res?.routes?.[0];
        if (!primary) return;

        if (fallbackConnector) {
          fallbackConnector.setMap(null);
          fallbackConnector = null;
        }

        if (typeof primary.createPolylines === 'function') {
          const created: google.maps.Polyline[] = primary.createPolylines();
          created.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#dc2626',
              strokeOpacity: 0.92,
              strokeWeight: 5,
            });
            poly.setMap(map);
          });
          polylinesRef.current = created;
        }
      })
      .catch((err: unknown) => {
        console.warn('Modal route calculation fallback:', err);
      });

    return () => {
      cancelled = true;
      if (fallbackConnector) fallbackConnector.setMap(null);
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [
    map,
    routesLib,
    tracking.id,
    tracking.trainerLat,
    tracking.trainerLng,
    tracking.sedeLat,
    tracking.sedeLng,
    tracking.geofenceRadiusMeters,
    tracking.travelMode,
  ]);

  return null;
};

interface TransitTrackingMapModalProps {
  tracking: TrainerTransitTracking | null;
  onClose: () => void;
}

export const TransitTrackingMapModal: React.FC<TransitTrackingMapModalProps> = ({
  tracking,
  onClose,
}) => {
  const [recenterCount, setRecenterCount] = useState<number>(0);
  const { hasKey, diagnostic } = useGoogleMapsDiagnostics();

  useEffect(() => {
    if (!tracking) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracking, onClose]);

  if (!tracking) return null;

  const safeSedeLat = isValidCoordinate(tracking.sedeLat, tracking.sedeLng)
    ? tracking.sedeLat
    : 19.4326;
  const safeSedeLng = isValidCoordinate(tracking.sedeLat, tracking.sedeLng)
    ? tracking.sedeLng
    : -99.1332;
  const safeTrainerLat = isValidCoordinate(tracking.trainerLat, tracking.trainerLng)
    ? tracking.trainerLat
    : safeSedeLat;
  const safeTrainerLng = isValidCoordinate(tracking.trainerLat, tracking.trainerLng)
    ? tracking.trainerLng
    : safeSedeLng;

  const marginMins = computePunctualityMarginMinutes(
    tracking.date,
    tracking.scheduledTime,
    tracking.estimatedDurationMinutes
  );
  const hasDelayRisk =
    tracking.status === 'en_camino' && marginMins !== null && marginMins < 0;

  const directionsUrl = buildGoogleMapsDirectionsUrl({
    originLat: safeTrainerLat,
    originLng: safeTrainerLng,
    destLat: safeSedeLat,
    destLng: safeSedeLng,
    travelMode: tracking.travelMode,
  });

  const formatTimeShort = (iso: string | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(11, 16) || '—';
    return d.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-900/65 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Mapa de seguimiento de ${tracking.trainerName}`}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
              <Navigation className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {tracking.trainerName}
                </h3>
                <span className="text-xs text-slate-400" aria-hidden="true">
                  ·
                </span>
                {tracking.status === 'en_camino' ? (
                  <span
                    className={`text-xs font-bold inline-flex items-center gap-1 ${
                      hasDelayRisk ? 'text-red-700' : 'text-amber-700'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {hasDelayRisk ? 'En camino (Riesgo de retraso)' : 'En camino en vivo'}
                  </span>
                ) : tracking.status === 'en_geocerca' ? (
                  <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    Dentro de geocerca
                  </span>
                ) : tracking.status === 'llegada_confirmada' ? (
                  <span className="text-xs font-bold text-emerald-800 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Llegada confirmada
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-500">
                    Seguimiento detenido
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5 truncate">
                Destino: <strong>{tracking.companyName} — {tracking.sedeName}</strong> ·{' '}
                {tracking.activityName} ({tracking.date} · Cita {tracking.scheduledTime} hrs)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasKey && !diagnostic && (
              <button
                type="button"
                onClick={() => setRecenterCount((c) => c + 1)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                title="Encuadrar entrenador y sede en el mapa"
              >
                <LocateFixed className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Recentrar</span>
              </button>
            )}

            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap"
              title="Abrir navegación externa en Google Maps"
            >
              <span>Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5 text-red-400 shrink-0" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
              title="Cerrar mapa"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Telemetry Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[11px] text-slate-500 block">Distancia a Sede</span>
              <span className="text-base sm:text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
                {formatDistanceMetric(tracking.routeDistanceMeters)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                Lineal: {formatDistanceMetric(tracking.straightDistanceMeters)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[11px] text-slate-500 block">Tiempo Estimado</span>
              <span className="text-base sm:text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
                {formatTravelDuration(tracking.estimatedDurationMinutes)}
              </span>
              <span className="text-[11px] text-slate-500">
                {TRANSIT_TRAVEL_MODE_LABELS[tracking.travelMode] || tracking.travelMode}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[11px] text-slate-500 block">Hora Estimada Llegada</span>
              <span className="text-base sm:text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
                {tracking.estimatedArrivalHHMM} hrs
              </span>
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  hasDelayRisk ? 'text-red-700 font-semibold' : 'text-emerald-700 font-medium'
                }`}
              >
                {marginMins === null
                  ? `Cita ${tracking.scheduledTime} hrs`
                  : marginMins >= 0
                    ? `${marginMins} min de margen`
                    : `+${Math.abs(marginMins)} min de retraso`}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[11px] text-slate-500 block">Última Señal GPS</span>
              <span className="text-base sm:text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
                {formatTimeShort(tracking.lastUpdatedIso)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                Precisión ±{tracking.accuracyMeters} m · Radio {tracking.geofenceRadiusMeters} m
              </span>
            </div>
          </div>

          {/* Interactive Google Map or Production Diagnostic + Schematic Fallback */}
          {diagnostic && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">{diagnostic.title}</p>
                <p className="text-amber-900/90">{diagnostic.description}</p>
              </div>
            </div>
          )}

          {hasKey && !diagnostic ? (
            <div className="w-full h-[360px] sm:h-[440px] rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100">
              <Map
                id="transit-tracking-modal-map"
                defaultCenter={{ lat: safeSedeLat, lng: safeSedeLng }}
                defaultZoom={14}
                mapId="DEMO_MAP_ID"
                gestureHandling="greedy"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              >
                <AdvancedMarker
                  position={{ lat: safeSedeLat, lng: safeSedeLng }}
                  title={`Sede: ${tracking.companyName} — ${tracking.sedeName}`}
                >
                  <Pin
                    background="#dc2626"
                    borderColor="#7f1d1d"
                    glyphColor="#ffffff"
                    glyphText="S"
                  />
                </AdvancedMarker>

                <AdvancedMarker
                  position={{ lat: safeTrainerLat, lng: safeTrainerLng }}
                  title={`${tracking.trainerName} · ${formatDistanceMetric(tracking.routeDistanceMeters)}`}
                >
                  <Pin
                    background={
                      tracking.status === 'en_geocerca' || tracking.status === 'llegada_confirmada'
                        ? '#16a34a'
                        : '#0f172a'
                    }
                    borderColor="#0f172a"
                    glyphColor="#ffffff"
                    glyphText={tracking.trainerName.slice(0, 1).toUpperCase()}
                  />
                </AdvancedMarker>

                <ModalRouteOverlay
                  tracking={{
                    ...tracking,
                    sedeLat: safeSedeLat,
                    sedeLng: safeSedeLng,
                    trainerLat: safeTrainerLat,
                    trainerLng: safeTrainerLng,
                  }}
                  recenterCount={recenterCount}
                />
              </Map>
            </div>
          ) : (
            <SchematicRouteRadar
              trainerName={tracking.trainerName}
              trainerLat={safeTrainerLat}
              trainerLng={safeTrainerLng}
              sedeName={tracking.sedeName}
              sedeAddress={tracking.sedeAddress}
              sedeLat={safeSedeLat}
              sedeLng={safeSedeLng}
              geofenceRadiusMeters={tracking.geofenceRadiusMeters || 150}
              routeDistanceMeters={tracking.routeDistanceMeters}
              estimatedDurationMinutes={tracking.estimatedDurationMinutes}
              directionsUrl={directionsUrl}
            />
          )}

          {/* Legend & Address Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" />
                <span>Entrenador ({tracking.trainerName})</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                <span>Sede ({tracking.sedeName})</span>
              </span>
            </div>
            <span className="text-[11px] text-slate-500 truncate">{tracking.sedeAddress}</span>
          </div>
        </div>

        {/* Footer Attribution */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400 shrink-0">
          <span>
            Datos de rutas y visualización geográfica provistos por Google Maps Platform, sujetos a las{' '}
            <a
              href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
            >
              Condiciones Adicionales de Google Maps
            </a>{' '}
            y la{' '}
            <a
              href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
            >
              Política de Privacidad de Google
            </a>
            .
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold self-end sm:self-auto shrink-0 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
