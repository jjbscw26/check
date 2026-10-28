import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Navigation,
  Search,
  Trash2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Maximize2,
  LocateFixed,
  ExternalLink,
} from 'lucide-react';
import {
  Company,
  TRANSIT_TRAVEL_MODE_LABELS,
  Trainer,
  TrainerTransitTracking,
} from '../types';
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
import { SchematicRouteRadar, TransitTrackingMapModal } from './TransitTrackingMapModal';

interface FallbackVenuePin {
  id: string;
  companyName: string;
  sedeName: string;
  lat: number;
  lng: number;
}

interface SelectedTrainerRouteOverlayProps {
  selectedTracking: TrainerTransitTracking | null;
  allVisibleTrackings: TrainerTransitTracking[];
  fallbackVenuePins: FallbackVenuePin[];
  focusNonce: number;
}

const SelectedTrainerRouteOverlay: React.FC<SelectedTrainerRouteOverlayProps> = ({
  selectedTracking,
  allVisibleTrackings,
  fallbackVenuePins,
  focusNonce,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const circleRef = useRef<google.maps.Circle | null>(null);

  // Fit bounds safely when selection, focusNonce, or visible list changes
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.LatLngBounds) return;

    if (
      selectedTracking &&
      isValidCoordinate(selectedTracking.trainerLat, selectedTracking.trainerLng) &&
      isValidCoordinate(selectedTracking.sedeLat, selectedTracking.sedeLng)
    ) {
      const distMeters = calculateHaversineDistanceMeters(
        selectedTracking.trainerLat,
        selectedTracking.trainerLng,
        selectedTracking.sedeLat,
        selectedTracking.sedeLng
      );

      if (distMeters < 120) {
        map.panTo({ lat: selectedTracking.sedeLat, lng: selectedTracking.sedeLng });
        map.setZoom(16);
        return;
      }

      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: selectedTracking.trainerLat, lng: selectedTracking.trainerLng });
      bounds.extend({ lat: selectedTracking.sedeLat, lng: selectedTracking.sedeLng });
      map.fitBounds(bounds, 64);
      return;
    }

    if (allVisibleTrackings.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      let count = 0;
      allVisibleTrackings.forEach((t) => {
        if (isValidCoordinate(t.trainerLat, t.trainerLng)) {
          bounds.extend({ lat: t.trainerLat, lng: t.trainerLng });
          count += 1;
        }
        if (isValidCoordinate(t.sedeLat, t.sedeLng)) {
          bounds.extend({ lat: t.sedeLat, lng: t.sedeLng });
          count += 1;
        }
      });
      if (count >= 2) {
        map.fitBounds(bounds, 64);
      }
      return;
    }

    if (fallbackVenuePins.length > 0) {
      if (fallbackVenuePins.length === 1) {
        map.panTo({ lat: fallbackVenuePins[0].lat, lng: fallbackVenuePins[0].lng });
        map.setZoom(14);
        return;
      }
      const bounds = new google.maps.LatLngBounds();
      fallbackVenuePins.forEach((pin) => {
        bounds.extend({ lat: pin.lat, lng: pin.lng });
      });
      map.fitBounds(bounds, 64);
    }
  }, [
    map,
    selectedTracking?.id,
    selectedTracking?.trainerLat,
    selectedTracking?.trainerLng,
    selectedTracking?.sedeLat,
    selectedTracking?.sedeLng,
    allVisibleTrackings.length,
    fallbackVenuePins.length,
    focusNonce,
  ]);

  // Draw geofence & route polyline for selected trainer
  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }

    if (
      !map ||
      !selectedTracking ||
      !isValidCoordinate(selectedTracking.trainerLat, selectedTracking.trainerLng) ||
      !isValidCoordinate(selectedTracking.sedeLat, selectedTracking.sedeLng)
    ) {
      return;
    }

    if (typeof google !== 'undefined' && google.maps?.Circle) {
      circleRef.current = new google.maps.Circle({
        map,
        center: { lat: selectedTracking.sedeLat, lng: selectedTracking.sedeLng },
        radius: Math.max(20, selectedTracking.geofenceRadiusMeters || 150),
        strokeColor: '#dc2626',
        strokeOpacity: 0.65,
        strokeWeight: 1.5,
        fillColor: '#ef4444',
        fillOpacity: 0.1,
        clickable: false,
      });
    }

    const distMeters = calculateHaversineDistanceMeters(
      selectedTracking.trainerLat,
      selectedTracking.trainerLng,
      selectedTracking.sedeLat,
      selectedTracking.sedeLng
    );

    let fallbackConnector: google.maps.Polyline | null = null;
    if (typeof google !== 'undefined' && google.maps?.Polyline && distMeters >= 15) {
      fallbackConnector = new google.maps.Polyline({
        path: [
          { lat: selectedTracking.trainerLat, lng: selectedTracking.trainerLng },
          { lat: selectedTracking.sedeLat, lng: selectedTracking.sedeLng },
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
        origin: { lat: selectedTracking.trainerLat, lng: selectedTracking.trainerLng },
        destination: { lat: selectedTracking.sedeLat, lng: selectedTracking.sedeLng },
        travelMode: selectedTracking.travelMode || 'DRIVING',
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
              strokeOpacity: 0.9,
              strokeWeight: 5,
            });
            poly.setMap(map);
          });
          polylinesRef.current = created;
        }
      })
      .catch((err: unknown) => {
        console.warn('Admin route preview fallback:', err);
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
    selectedTracking?.id,
    selectedTracking?.trainerLat,
    selectedTracking?.trainerLng,
    selectedTracking?.sedeLat,
    selectedTracking?.sedeLng,
    selectedTracking?.geofenceRadiusMeters,
    selectedTracking?.travelMode,
  ]);

  return null;
};

interface AdminLiveTrackingViewProps {
  transitTrackings: TrainerTransitTracking[];
  trainers: Trainer[];
  companies: Company[];
  onDeleteTransitTracking?: (id: string) => void;
}

export const AdminLiveTrackingView: React.FC<AdminLiveTrackingViewProps> = ({
  transitTrackings,
  companies,
  onDeleteTransitTracking,
}) => {
  const [statusFilter, setStatusFilter] = useState<
    'activos' | 'en_camino' | 'en_geocerca' | 'llegada_confirmada' | 'todos'
  >('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalTrackingId, setModalTrackingId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState<number>(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const mapSectionRef = useRef<HTMLDivElement | null>(null);
  const { hasKey, diagnostic } = useGoogleMapsDiagnostics();

  const sortedTrackings = useMemo(() => {
    return [...transitTrackings].sort((a, b) => {
      const aActive = a.status === 'en_camino' || a.status === 'en_geocerca' ? 1 : 0;
      const bActive = b.status === 'en_camino' || b.status === 'en_geocerca' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (b.lastUpdatedIso || '').localeCompare(a.lastUpdatedIso || '');
    });
  }, [transitTrackings]);

  const filteredTrackings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedTrackings.filter((item) => {
      if (statusFilter === 'activos' && item.status !== 'en_camino' && item.status !== 'en_geocerca') {
        return false;
      }
      if (statusFilter === 'en_camino' && item.status !== 'en_camino') return false;
      if (statusFilter === 'en_geocerca' && item.status !== 'en_geocerca') return false;
      if (statusFilter === 'llegada_confirmada' && item.status !== 'llegada_confirmada') {
        return false;
      }

      if (!q) return true;
      return (
        item.trainerName.toLowerCase().includes(q) ||
        item.companyName.toLowerCase().includes(q) ||
        item.sedeName.toLowerCase().includes(q) ||
        item.activityName.toLowerCase().includes(q) ||
        item.date.includes(q)
      );
    });
  }, [sortedTrackings, statusFilter, searchQuery]);

  const selectedTracking = useMemo(() => {
    if (selectedId) {
      const exact = filteredTrackings.find((t) => t.id === selectedId);
      if (exact) return exact;
    }
    return (
      filteredTrackings.find((t) => t.status === 'en_camino' || t.status === 'en_geocerca') ||
      filteredTrackings[0] ||
      null
    );
  }, [selectedId, filteredTrackings]);

  const modalTracking = useMemo(() => {
    if (!modalTrackingId) return null;
    return transitTrackings.find((t) => t.id === modalTrackingId) || null;
  }, [modalTrackingId, transitTrackings]);

  const fallbackVenuePins = useMemo<FallbackVenuePin[]>(() => {
    const list: FallbackVenuePin[] = [];
    companies.forEach((comp) => {
      (comp.sedes || []).forEach((sede) => {
        if (isValidCoordinate(sede.lat, sede.lng)) {
          list.push({
            id: `${comp.id}_${sede.id}`,
            companyName: comp.name,
            sedeName: sede.name,
            lat: sede.lat,
            lng: sede.lng,
          });
        }
      });
    });
    return list;
  }, [companies]);

  const metrics = useMemo(() => {
    let enCamino = 0;
    let enSede = 0;
    let conRiesgoRetraso = 0;

    transitTrackings.forEach((t) => {
      if (t.status === 'en_camino') {
        enCamino += 1;
        const margin = computePunctualityMarginMinutes(
          t.date,
          t.scheduledTime,
          t.estimatedDurationMinutes
        );
        if (margin !== null && margin < 0) {
          conRiesgoRetraso += 1;
        }
      } else if (t.status === 'en_geocerca' || t.status === 'llegada_confirmada') {
        enSede += 1;
      }
    });

    return {
      enCamino,
      enSede,
      conRiesgoRetraso,
      total: transitTrackings.length,
    };
  }, [transitTrackings]);

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

  const handleSelectRowAndScrollMap = (id: string) => {
    setSelectedId(id);
    setFocusNonce((n) => n + 1);
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleOpenMapModal = (id: string) => {
    setSelectedId(id);
    setFocusNonce((n) => n + 1);
    setModalTrackingId(id);
  };

  const defaultCenter =
    selectedTracking && isValidCoordinate(selectedTracking.sedeLat, selectedTracking.sedeLng)
      ? { lat: selectedTracking.sedeLat, lng: selectedTracking.sedeLng }
      : fallbackVenuePins[0]
        ? { lat: fallbackVenuePins[0].lat, lng: fallbackVenuePins[0].lng }
        : { lat: 19.4326, lng: -99.1332 };

  const selectedDirectionsUrl = selectedTracking
    ? buildGoogleMapsDirectionsUrl({
        originLat: selectedTracking.trainerLat,
        originLng: selectedTracking.trainerLng,
        destLat: selectedTracking.sedeLat,
        destLng: selectedTracking.sedeLng,
        travelMode: selectedTracking.travelMode,
      })
    : null;

  return (
    <div className="space-y-6">
      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs text-slate-500 block">Entrenadores en Camino</span>
          <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1 block">
            {metrics.enCamino}
          </span>
          <span className="text-xs text-slate-500">Con transmisión GPS activa</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs text-slate-500 block">En Geocerca / Llegada en Sede</span>
          <span className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1 block">
            {metrics.enSede}
          </span>
          <span className="text-xs text-slate-500">Ubicados dentro del radio autorizado</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs text-slate-500 block">Riesgo de Retraso en Ruta</span>
          <span
            className={`text-2xl font-bold font-mono tabular-nums mt-1 block ${
              metrics.conRiesgoRetraso > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {metrics.conRiesgoRetraso}
          </span>
          <span className="text-xs text-slate-500">ETA posterior a la hora programada</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-xs text-slate-500 block">Total Registros en Bitácora</span>
          <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1 block">
            {metrics.total}
          </span>
          <span className="text-xs text-slate-500">Sincronizados en tiempo real</span>
        </div>
      </div>

      {/* Live Map + Selected Trainer Route Inspector */}
      <div
        ref={mapSectionRef}
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Mapa de Seguimiento en Tiempo Real hacia Sedes
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecciona cualquier entrenador en la tabla o pulsa «Mapa» para abrir el detalle interactivo de ruta, distancia y ETA.
            </p>
          </div>

          {selectedTracking && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
                <span className="font-bold text-slate-900">{selectedTracking.trainerName}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Destino: <strong>{selectedTracking.sedeName}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatDistanceMetric(selectedTracking.routeDistanceMeters)} ·{' '}
                  {formatTravelDuration(selectedTracking.estimatedDurationMinutes)}
                </span>
              </div>

              {hasKey && !diagnostic && (
                <button
                  type="button"
                  onClick={() => setFocusNonce((n) => n + 1)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                  title="Recentrar ruta seleccionada"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>Recentrar</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleOpenMapModal(selectedTracking.id)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                title="Abrir mapa ampliado de seguimiento"
              >
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                <span>Ampliar Mapa</span>
              </button>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-3">
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
            <div className="w-full h-[380px] sm:h-[430px] rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100">
              <Map
                id="admin-live-tracking-map"
                defaultCenter={defaultCenter}
                defaultZoom={12}
                mapId="DEMO_MAP_ID"
                gestureHandling="cooperative"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              >
                {filteredTrackings.length > 0
                  ? filteredTrackings.map((trk) => {
                      const isSelected = selectedTracking?.id === trk.id;
                      const validSede = isValidCoordinate(trk.sedeLat, trk.sedeLng);
                      const validTrainer = isValidCoordinate(trk.trainerLat, trk.trainerLng);
                      return (
                        <React.Fragment key={trk.id}>
                          {validSede && (
                            <AdvancedMarker
                              position={{ lat: trk.sedeLat, lng: trk.sedeLng }}
                              title={`Sede: ${trk.companyName} — ${trk.sedeName}`}
                              onClick={() => handleOpenMapModal(trk.id)}
                            >
                              <Pin
                                background={isSelected ? '#dc2626' : '#ef4444'}
                                borderColor="#7f1d1d"
                                glyphColor="#ffffff"
                                glyphText="S"
                              />
                            </AdvancedMarker>
                          )}

                          {validTrainer && (
                            <AdvancedMarker
                              position={{ lat: trk.trainerLat, lng: trk.trainerLng }}
                              title={`${trk.trainerName} · ${formatDistanceMetric(trk.routeDistanceMeters)} (${formatTravelDuration(trk.estimatedDurationMinutes)})`}
                              onClick={() => handleOpenMapModal(trk.id)}
                            >
                              <Pin
                                background={
                                  trk.status === 'en_geocerca' ||
                                  trk.status === 'llegada_confirmada'
                                    ? '#16a34a'
                                    : isSelected
                                      ? '#0f172a'
                                      : '#334155'
                                }
                                borderColor="#0f172a"
                                glyphColor="#ffffff"
                                glyphText={trk.trainerName.slice(0, 1).toUpperCase()}
                              />
                            </AdvancedMarker>
                          )}
                        </React.Fragment>
                      );
                    })
                  : fallbackVenuePins.map((pin) => (
                      <AdvancedMarker
                        key={pin.id}
                        position={{ lat: pin.lat, lng: pin.lng }}
                        title={`Sede registrada: ${pin.companyName} — ${pin.sedeName}`}
                      >
                        <Pin
                          background="#dc2626"
                          borderColor="#7f1d1d"
                          glyphColor="#ffffff"
                          glyphText="S"
                        />
                      </AdvancedMarker>
                    ))}

                <SelectedTrainerRouteOverlay
                  selectedTracking={selectedTracking}
                  allVisibleTrackings={filteredTrackings}
                  fallbackVenuePins={fallbackVenuePins}
                  focusNonce={focusNonce}
                />
              </Map>
            </div>
          ) : selectedTracking && selectedDirectionsUrl ? (
            <SchematicRouteRadar
              trainerName={selectedTracking.trainerName}
              trainerLat={selectedTracking.trainerLat}
              trainerLng={selectedTracking.trainerLng}
              sedeName={selectedTracking.sedeName}
              sedeAddress={selectedTracking.sedeAddress}
              sedeLat={selectedTracking.sedeLat}
              sedeLng={selectedTracking.sedeLng}
              geofenceRadiusMeters={selectedTracking.geofenceRadiusMeters || 150}
              routeDistanceMeters={selectedTracking.routeDistanceMeters}
              estimatedDurationMinutes={selectedTracking.estimatedDurationMinutes}
              directionsUrl={selectedDirectionsUrl}
            />
          ) : (
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
              {hasKey
                ? 'Cuando un entrenador active su traslado en tiempo real, aquí podrás consultar su trayectoria georreferenciada hacia la sede.'
                : 'Clave de Google Maps no detectada en el entorno. La tabla de seguimiento en tiempo real continúa activa.'}
            </div>
          )}
        </div>
      </div>

      {/* Real-Time Transit Registry Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Registro de Seguimiento en Tiempo Real
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Bitácora operativa de ubicación, distancia vial y tiempo estimado de traslado de entrenadores a cada sede asignada.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar entrenador o sede..."
                className="w-full sm:w-56 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'activos', label: 'Activos' },
                  { id: 'en_camino', label: 'En Camino' },
                  { id: 'en_geocerca', label: 'En Geocerca' },
                  { id: 'llegada_confirmada', label: 'Confirmados' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredTrackings.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Navigation className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">
              No hay registros de seguimiento para este filtro
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Cuando un entrenador pulse &ldquo;Voy en trayecto&rdquo; desde su portal rumbo a su sede asignada, su distancia, ruta y tiempo estimado aparecerán aquí al instante.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-3 px-4 font-semibold">Entrenador</th>
                  <th className="py-3 px-4 font-semibold">Empresa / Sede Asignada</th>
                  <th className="py-3 px-4 font-semibold">Actividad / Horario</th>
                  <th className="py-3 px-4 font-semibold">Modo</th>
                  <th className="py-3 px-4 font-semibold text-right">Distancia a Sede</th>
                  <th className="py-3 px-4 font-semibold text-right">Tiempo / Llegada Est.</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrackings.map((item) => {
                  const isSelected = selectedTracking?.id === item.id;
                  const marginMins = computePunctualityMarginMinutes(
                    item.date,
                    item.scheduledTime,
                    item.estimatedDurationMinutes
                  );
                  const hasDelayRisk =
                    item.status === 'en_camino' && marginMins !== null && marginMins < 0;
                  const rowDirectionsUrl = buildGoogleMapsDirectionsUrl({
                    originLat: item.trainerLat,
                    originLng: item.trainerLng,
                    destLat: item.sedeLat,
                    destLng: item.sedeLng,
                    travelMode: item.travelMode,
                  });

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleSelectRowAndScrollMap(item.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-red-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4 align-top">
                        <span className="font-semibold text-slate-900 block">
                          {item.trainerName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          Act: {formatTimeShort(item.lastUpdatedIso)} · ±{item.accuracyMeters}m
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <span className="font-semibold text-slate-800 block">
                          {item.companyName} — {item.sedeName}
                        </span>
                        <span className="text-[11px] text-slate-500 line-clamp-1">
                          {item.sedeAddress}
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <span className="font-medium text-slate-800 block">
                          {item.activityName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {item.date} · Cita {item.scheduledTime} hrs
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top text-slate-700 whitespace-nowrap">
                        {TRANSIT_TRAVEL_MODE_LABELS[item.travelMode] || item.travelMode}
                      </td>

                      <td className="py-3 px-4 align-top text-right font-mono tabular-nums">
                        <span className="font-bold text-slate-900 block">
                          {formatDistanceMetric(item.routeDistanceMeters)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Lineal: {formatDistanceMetric(item.straightDistanceMeters)}
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top text-right font-mono tabular-nums">
                        <span className="font-bold text-slate-900 block">
                          {formatTravelDuration(item.estimatedDurationMinutes)}
                        </span>
                        <span
                          className={`text-[11px] ${
                            hasDelayRisk ? 'text-red-700 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          ETA {item.estimatedArrivalHHMM} hrs
                          {marginMins !== null && item.status === 'en_camino'
                            ? marginMins >= 0
                              ? ` (${marginMins}m margen)`
                              : ` (+${Math.abs(marginMins)}m retraso)`
                            : ''}
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {item.status === 'en_camino' ? (
                            hasDelayRisk ? (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                <span className="font-semibold text-red-700">
                                  En camino (Riesgo retraso)
                                </span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span className="font-semibold text-slate-800">En camino</span>
                              </>
                            )
                          ) : item.status === 'en_geocerca' ? (
                            <>
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-semibold text-emerald-700">
                                Dentro de geocerca
                              </span>
                            </>
                          ) : item.status === 'llegada_confirmada' ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-semibold text-emerald-800">
                                Llegada confirmada
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-500">Seguimiento detenido</span>
                          )}
                        </div>
                      </td>

                      <td
                        className="py-3 px-4 align-top text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenMapModal(item.id)}
                            className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold inline-flex items-center gap-1 transition whitespace-nowrap cursor-pointer"
                            title="Abrir mapa interactivo de seguimiento"
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                            <span>Mapa</span>
                          </button>

                          <a
                            href={rowDirectionsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition inline-flex items-center justify-center"
                            title="Abrir ruta en Google Maps"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          {onDeleteTransitTracking &&
                            (confirmDeleteId === item.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTransitTracking(item.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition whitespace-nowrap cursor-pointer"
                              >
                                Confirmar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-500 hover:text-red-600 transition cursor-pointer"
                                title="Eliminar registro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-400">
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
        </div>
      </div>

      {/* Interactive Transit Map Modal (Opened from "Mapa" button or "Ampliar Mapa") */}
      <TransitTrackingMapModal
        tracking={modalTracking}
        onClose={() => setModalTrackingId(null)}
      />
    </div>
  );
};
