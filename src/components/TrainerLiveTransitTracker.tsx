import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Car,
  Bike,
  TrainFront,
  Footprints,
  Navigation,
  Square,
  LocateFixed,
  Route as RouteIcon,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AttendanceRecord,
  ClassAssignment,
  Company,
  Sede,
  TRANSIT_TRAVEL_MODE_LABELS,
  Trainer,
  TrainerTransitTracking,
  TransitTravelMode,
} from '../types';
import {
  calculateHaversineDistanceMeters,
  computeArrivalClockHHMM,
  computePunctualityMarginMinutes,
  estimateTransitMetricsFallback,
  formatDistanceMetric,
  formatTravelDuration,
  sanitizeTransitTrackingPayload,
} from '../utils/transitCalculations';
import { doesAssignmentApplyToDate, formatLocalYYYYMMDD } from '../utils/assignmentLock';

const GOOGLE_MAPS_API_KEY: string =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_GOOGLE_MAPS_API_KEY || '';

interface ComputedRouteResult {
  distanceMeters: number;
  durationMinutes: number;
  source: 'google_routes' | 'haversine_estimado';
}

interface TargetTransitContext {
  assignmentId?: string;
  company: Company;
  sede: Sede;
  scheduledTime: string;
  activityName: string;
  date: string;
}

export interface ActiveTrainerTransitState {
  isLiveTracking: boolean;
  assignmentId?: string;
  sedeId: string;
}

export interface TrainerLiveTransitTrackerHandle {
  startTransitForAssignment: (asg: ClassAssignment) => void;
  stopTransit: () => void;
}

interface RouteOverlayProps {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number };
  geofenceRadiusMeters: number;
  travelMode: TransitTravelMode;
  routeTriggerKey: string;
  onRouteComputed: (result: ComputedRouteResult) => void;
}

const LiveRouteOverlay: React.FC<RouteOverlayProps> = ({
  origin,
  destination,
  geofenceRadiusMeters,
  travelMode,
  routeTriggerKey,
  onRouteComputed,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const hasFittedOnceRef = useRef<string>('');

  // Render subtle geofence circle around target sede
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.Circle) return;

    if (circleRef.current) {
      circleRef.current.setMap(null);
    }

    const circle = new google.maps.Circle({
      map,
      center: destination,
      radius: Math.max(20, geofenceRadiusMeters || 150),
      strokeColor: '#dc2626',
      strokeOpacity: 0.65,
      strokeWeight: 1.5,
      fillColor: '#ef4444',
      fillOpacity: 0.1,
      clickable: false,
    });
    circleRef.current = circle;

    return () => {
      circle.setMap(null);
      circleRef.current = null;
    };
  }, [map, destination.lat, destination.lng, geofenceRadiusMeters]);

  // Compute route via modern Maps JS SDK `Route.computeRoutes`
  useEffect(() => {
    if (!map || !routesLib || !origin) return;

    let cancelled = false;

    const clearPolylines = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    const routeClass = (routesLib as unknown as { Route?: any }).Route;
    if (!routeClass || typeof routeClass.computeRoutes !== 'function') {
      const fb = estimateTransitMetricsFallback(
        origin.lat,
        origin.lng,
        destination.lat,
        destination.lng,
        travelMode
      );
      onRouteComputed({
        distanceMeters: fb.routeDistanceMeters,
        durationMinutes: fb.estimatedDurationMinutes,
        source: 'haversine_estimado',
      });
      return;
    }

    const request = {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };

    routeClass
      .computeRoutes(request)
      .then((res: { routes?: any[] }) => {
        if (cancelled) return;
        const primaryRoute = res?.routes?.[0];
        if (!primaryRoute) {
          throw new Error('Empty route response');
        }

        clearPolylines();

        if (typeof primaryRoute.createPolylines === 'function') {
          const created: google.maps.Polyline[] = primaryRoute.createPolylines();
          created.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#dc2626',
              strokeOpacity: 0.9,
              strokeWeight: 5,
            });
            poly.setMap(map);
          });
          polylinesRef.current = created;
        } else if (Array.isArray(primaryRoute.path) && primaryRoute.path.length > 0) {
          const fallbackPoly = new google.maps.Polyline({
            path: primaryRoute.path,
            geodesic: true,
            strokeColor: '#dc2626',
            strokeOpacity: 0.9,
            strokeWeight: 5,
            map,
          });
          polylinesRef.current = [fallbackPoly];
        }

        const fitKey = `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}:${travelMode}`;
        if (primaryRoute.viewport && hasFittedOnceRef.current !== fitKey) {
          hasFittedOnceRef.current = fitKey;
          map.fitBounds(primaryRoute.viewport, 44);
        }

        const rawDistanceMeters = Number(primaryRoute.distanceMeters || 0);
        let durationMillis = Number(primaryRoute.durationMillis || 0);
        if (!durationMillis && typeof primaryRoute.duration === 'string') {
          const secMatch = primaryRoute.duration.match(/^(\d+(?:\.\d+)?)s$/);
          if (secMatch) {
            durationMillis = parseFloat(secMatch[1]) * 1000;
          }
        }

        const fallbackMetrics = estimateTransitMetricsFallback(
          origin.lat,
          origin.lng,
          destination.lat,
          destination.lng,
          travelMode
        );

        const resolvedDistance =
          rawDistanceMeters > 0 ? Math.round(rawDistanceMeters) : fallbackMetrics.routeDistanceMeters;
        const resolvedMinutes =
          durationMillis > 0
            ? Math.max(1, Math.round(durationMillis / 60000))
            : fallbackMetrics.estimatedDurationMinutes;

        onRouteComputed({
          distanceMeters: resolvedDistance,
          durationMinutes: resolvedMinutes,
          source: 'google_routes',
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('Routes SDK fallback to geodesic estimation:', err);
        const fb = estimateTransitMetricsFallback(
          origin.lat,
          origin.lng,
          destination.lat,
          destination.lng,
          travelMode
        );
        onRouteComputed({
          distanceMeters: fb.routeDistanceMeters,
          durationMinutes: fb.estimatedDurationMinutes,
          source: 'haversine_estimado',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [map, routesLib, routeTriggerKey, travelMode, destination.lat, destination.lng, onRouteComputed]);

  useEffect(() => {
    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, []);

  return null;
};

interface TrainerLiveTransitTrackerProps {
  currentTrainer: Trainer;
  companies: Company[];
  assignments: ClassAssignment[];
  loadedAssignment: ClassAssignment | null;
  activeSession?: AttendanceRecord;
  transitTrackings: TrainerTransitTracking[];
  onUpsertTransitTracking: (record: TrainerTransitTracking) => void;
  onActiveTransitStateChange?: (state: ActiveTrainerTransitState | null) => void;
}

export const TrainerLiveTransitTracker = forwardRef<
  TrainerLiveTransitTrackerHandle,
  TrainerLiveTransitTrackerProps
>(
  (
    {
      currentTrainer,
      companies,
      assignments,
      loadedAssignment,
      activeSession,
      transitTrackings,
      onUpsertTransitTracking,
      onActiveTransitStateChange,
    },
    ref
  ) => {
    const todayYMD = formatLocalYYYYMMDD(new Date());

    // Only physical (non-virtual) active assignments require transit to a sede
    const trainerActiveAssignments = useMemo(() => {
      const list = assignments.filter(
        (a) => a.trainerId === currentTrainer.id && a.active && !a.closed && !a.isVirtual
      );
      return [...list].sort((a, b) => {
        const aToday = doesAssignmentApplyToDate(a, todayYMD) ? 0 : 1;
        const bToday = doesAssignmentApplyToDate(b, todayYMD) ? 0 : 1;
        if (aToday !== bToday) return aToday - bToday;
        return (a.time || '').localeCompare(b.time || '');
      });
    }, [assignments, currentTrainer.id, todayYMD]);

    const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
    const [manualCompanyId, setManualCompanyId] = useState<string>('');
    const [manualSedeId, setManualSedeId] = useState<string>('');
    const [travelMode, setTravelMode] = useState<TransitTravelMode>('DRIVING');
    const [showMapWorkspace, setShowMapWorkspace] = useState<boolean>(false);

    // Sync automatically when trainer loads a physical assignment into the check-in form
    useEffect(() => {
      if (loadedAssignment && !loadedAssignment.isVirtual) {
        setSelectedAssignmentId(loadedAssignment.id);
        setManualCompanyId(loadedAssignment.companyId);
        setManualSedeId(loadedAssignment.sedeId);
        return;
      }
      if (!selectedAssignmentId && trainerActiveAssignments.length > 0) {
        const firstAsg = trainerActiveAssignments[0];
        setSelectedAssignmentId(firstAsg.id);
        setManualCompanyId(firstAsg.companyId);
        setManualSedeId(firstAsg.sedeId);
      } else if (!manualCompanyId && companies.length > 0) {
        setManualCompanyId(companies[0].id);
        setManualSedeId(companies[0].sedes[0]?.id || '');
      }
    }, [
      loadedAssignment,
      trainerActiveAssignments,
      companies,
      selectedAssignmentId,
      manualCompanyId,
    ]);

    const resolveContextFromAssignment = useCallback(
      (asg: ClassAssignment | null | undefined): TargetTransitContext | null => {
        if (!asg) return null;
        const comp = companies.find((c) => c.id === asg.companyId);
        const sede: Sede | undefined = comp?.sedes.find((s) => s.id === asg.sedeId);
        if (!comp || !sede) return null;
        return {
          assignmentId: asg.id,
          company: comp,
          sede,
          scheduledTime: (asg.time || '09:00').slice(0, 5),
          activityName: asg.activityName,
          date:
            asg.frequency === 'fecha_unica' && asg.date
              ? asg.date
              : todayYMD,
        };
      },
      [companies, todayYMD]
    );

    const targetContext = useMemo<TargetTransitContext | null>(() => {
      const chosenAsg =
        trainerActiveAssignments.find((a) => a.id === selectedAssignmentId) ||
        (loadedAssignment && !loadedAssignment.isVirtual ? loadedAssignment : null);

      const resolvedFromAsg = resolveContextFromAssignment(chosenAsg);
      if (resolvedFromAsg) return resolvedFromAsg;

      const comp = companies.find((c) => c.id === manualCompanyId) || companies[0];
      const sede = comp?.sedes.find((s) => s.id === manualSedeId) || comp?.sedes[0];
      if (!comp || !sede) return null;

      return {
        assignmentId: undefined,
        company: comp,
        sede,
        scheduledTime: '09:00',
        activityName: 'Traslado a Sede Corporativa',
        date: todayYMD,
      };
    }, [
      trainerActiveAssignments,
      selectedAssignmentId,
      loadedAssignment,
      resolveContextFromAssignment,
      companies,
      manualCompanyId,
      manualSedeId,
      todayYMD,
    ]);

    const [isLiveTracking, setIsLiveTracking] = useState<boolean>(false);
    const [isConnectingGps, setIsConnectingGps] = useState<boolean>(false);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [isLocatingOnce, setIsLocatingOnce] = useState<boolean>(false);

    const [liveCoords, setLiveCoords] = useState<{
      lat: number;
      lng: number;
      accuracy: number;
      speedMps?: number;
      updatedAtMs: number;
    } | null>(null);

    const [routeCalc, setRouteCalc] = useState<ComputedRouteResult | null>(null);
    const [routeTriggerKey, setRouteTriggerKey] = useState<string>('init');

    const watchIdRef = useRef<number | null>(null);
    const startedAtIsoRef = useRef<string | null>(null);
    const activeTrackingDocIdRef = useRef<string>('');
    const targetContextRef = useRef<TargetTransitContext | null>(targetContext);
    const travelModeRef = useRef<TransitTravelMode>(travelMode);
    const routeCalcRef = useRef<ComputedRouteResult | null>(routeCalc);
    const lastRouteOriginRef = useRef<{ lat: number; lng: number; atMs: number } | null>(null);
    const lastFirestoreSyncRef = useRef<{
      lat: number;
      lng: number;
      atMs: number;
      status: string;
    } | null>(null);

    useEffect(() => {
      targetContextRef.current = targetContext;
    }, [targetContext]);

    useEffect(() => {
      travelModeRef.current = travelMode;
    }, [travelMode]);

    useEffect(() => {
      routeCalcRef.current = routeCalc;
    }, [routeCalc]);

    useEffect(() => {
      if (!onActiveTransitStateChange) return;
      if (isLiveTracking && targetContext) {
        onActiveTransitStateChange({
          isLiveTracking: true,
          assignmentId: targetContext.assignmentId,
          sedeId: targetContext.sede.id,
        });
      } else {
        onActiveTransitStateChange(null);
      }
    }, [isLiveTracking, targetContext, onActiveTransitStateChange]);

    const myRecentTrackings = useMemo(
      () =>
        transitTrackings
          .filter((t) => t.trainerId === currentTrainer.id)
          .sort((a, b) => (b.lastUpdatedIso || '').localeCompare(a.lastUpdatedIso || '')),
      [transitTrackings, currentTrainer.id]
    );

    const buildTrackingDocId = useCallback(
      (sedeId: string) => {
        const cleanTrainer = currentTrainer.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanSede = sedeId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `trk_${cleanTrainer}_${todayYMD}_${cleanSede}`.slice(0, 120);
      },
      [currentTrainer.id, todayYMD]
    );

    const pushTrackingSnapshot = useCallback(
      (
        coords: { lat: number; lng: number; accuracy: number; speedMps?: number },
        overrideStatus?: 'en_camino' | 'en_geocerca' | 'llegada_confirmada' | 'detenido',
        latestRoute?: ComputedRouteResult | null,
        explicitCtx?: TargetTransitContext | null
      ) => {
        const ctx = explicitCtx || targetContextRef.current;
        if (!ctx) return;

        const mode = travelModeRef.current;
        const straightDist = calculateHaversineDistanceMeters(
          coords.lat,
          coords.lng,
          ctx.sede.lat,
          ctx.sede.lng
        );
        const withinGeofence = straightDist <= (ctx.sede.geofenceRadiusMeters || 150);

        const fallback = estimateTransitMetricsFallback(
          coords.lat,
          coords.lng,
          ctx.sede.lat,
          ctx.sede.lng,
          mode
        );

        const effectiveRoute = latestRoute ?? routeCalcRef.current;
        const routeDist = effectiveRoute
          ? effectiveRoute.distanceMeters
          : fallback.routeDistanceMeters;
        const durationMins = withinGeofence
          ? 0
          : effectiveRoute
            ? effectiveRoute.durationMinutes
            : fallback.estimatedDurationMinutes;
        const source = effectiveRoute ? effectiveRoute.source : 'haversine_estimado';

        const status = overrideStatus || (withinGeofence ? 'en_geocerca' : 'en_camino');

        const nowIso = new Date().toISOString();
        if (!startedAtIsoRef.current) {
          startedAtIsoRef.current = nowIso;
        }
        const docId = activeTrackingDocIdRef.current || buildTrackingDocId(ctx.sede.id);
        activeTrackingDocIdRef.current = docId;

        const payload = sanitizeTransitTrackingPayload({
          id: docId,
          trainerId: currentTrainer.id,
          trainerName: currentTrainer.name,
          assignmentId: ctx.assignmentId,
          companyId: ctx.company.id,
          companyName: ctx.company.name,
          sedeId: ctx.sede.id,
          sedeName: ctx.sede.name,
          sedeAddress: ctx.sede.address,
          sedeLat: ctx.sede.lat,
          sedeLng: ctx.sede.lng,
          geofenceRadiusMeters: ctx.sede.geofenceRadiusMeters || 150,
          date: ctx.date,
          scheduledTime: ctx.scheduledTime,
          activityName: ctx.activityName,
          trainerLat: coords.lat,
          trainerLng: coords.lng,
          accuracyMeters: coords.accuracy,
          speedMps: coords.speedMps,
          straightDistanceMeters: straightDist,
          routeDistanceMeters: routeDist,
          estimatedDurationMinutes: durationMins,
          estimatedArrivalHHMM: computeArrivalClockHHMM(durationMins),
          calculationSource: source,
          travelMode: mode,
          status,
          isWithinGeofence: withinGeofence,
          startedAtIso: startedAtIsoRef.current,
          lastUpdatedIso: nowIso,
          ...(status === 'detenido' || status === 'llegada_confirmada'
            ? { stoppedAtIso: nowIso }
            : {}),
        });

        onUpsertTransitTracking(payload);
        lastFirestoreSyncRef.current = {
          lat: coords.lat,
          lng: coords.lng,
          atMs: Date.now(),
          status,
        };
      },
      [buildTrackingDocId, currentTrainer.id, currentTrainer.name, onUpsertTransitTracking]
    );

    const handleRouteComputed = useCallback(
      (res: ComputedRouteResult) => {
        setRouteCalc(res);
        routeCalcRef.current = res;
        if (isLiveTracking && liveCoords) {
          pushTrackingSnapshot(liveCoords, undefined, res);
        }
      },
      [isLiveTracking, liveCoords, pushTrackingSnapshot]
    );

    const handlePositionUpdate = useCallback(
      (
        pos: GeolocationPosition,
        isLiveStream: boolean,
        explicitCtx?: TargetTransitContext | null
      ) => {
        const nextCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 12),
          speedMps:
            pos.coords.speed !== null && Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0
              ? pos.coords.speed
              : undefined,
          updatedAtMs: Date.now(),
        };
        setLiveCoords(nextCoords);
        setIsConnectingGps(false);
        setGpsError(null);

        const prevRouteOrigin = lastRouteOriginRef.current;
        const movedFromLastRoute = prevRouteOrigin
          ? calculateHaversineDistanceMeters(
              prevRouteOrigin.lat,
              prevRouteOrigin.lng,
              nextCoords.lat,
              nextCoords.lng
            )
          : Infinity;
        const elapsedSinceRouteMs = prevRouteOrigin ? Date.now() - prevRouteOrigin.atMs : Infinity;

        if (!prevRouteOrigin || (movedFromLastRoute >= 35 && elapsedSinceRouteMs >= 15000)) {
          lastRouteOriginRef.current = {
            lat: nextCoords.lat,
            lng: nextCoords.lng,
            atMs: Date.now(),
          };
          setRouteTriggerKey(
            `${nextCoords.lat.toFixed(5)},${nextCoords.lng.toFixed(5)}:${Date.now()}`
          );
        }

        const ctx = explicitCtx || targetContextRef.current;
        if (isLiveStream && ctx) {
          const prevSync = lastFirestoreSyncRef.current;
          const movedFromSync = prevSync
            ? calculateHaversineDistanceMeters(
                prevSync.lat,
                prevSync.lng,
                nextCoords.lat,
                nextCoords.lng
              )
            : Infinity;
          const elapsedSyncMs = prevSync ? Date.now() - prevSync.atMs : Infinity;

          if (!prevSync || movedFromSync >= 15 || elapsedSyncMs >= 8000) {
            pushTrackingSnapshot(nextCoords, undefined, undefined, ctx);
          }
        }
      },
      [pushTrackingSnapshot]
    );

    // Re-trigger route calculation when target sede or travelMode changes while we have coordinates
    useEffect(() => {
      if (!liveCoords || !targetContext) return;
      lastRouteOriginRef.current = {
        lat: liveCoords.lat,
        lng: liveCoords.lng,
        atMs: Date.now(),
      };
      setRouteTriggerKey(
        `${liveCoords.lat.toFixed(5)},${liveCoords.lng.toFixed(5)}:${targetContext.sede.id}:${travelMode}`
      );
    }, [targetContext?.sede.id, travelMode]);

    const stopGpsWatchCleanly = useCallback(
      (finalStatus?: 'detenido' | 'llegada_confirmada') => {
        if (
          watchIdRef.current !== null &&
          typeof navigator !== 'undefined' &&
          navigator.geolocation
        ) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        setIsLiveTracking(false);
        setIsConnectingGps(false);
        if (finalStatus && liveCoords) {
          pushTrackingSnapshot(liveCoords, finalStatus);
        }
        startedAtIsoRef.current = null;
      },
      [liveCoords, pushTrackingSnapshot]
    );

    // Automatically confirm arrival & stop live transit stream once trainer completes Check-In at sede
    useEffect(() => {
      if (isLiveTracking && activeSession && activeSession.status === 'en_curso') {
        stopGpsWatchCleanly('llegada_confirmada');
      }
    }, [activeSession?.id, activeSession?.status, isLiveTracking, stopGpsWatchCleanly]);

    // Cleanup GPS watcher on unmount or trainer switch
    useEffect(() => {
      return () => {
        if (
          watchIdRef.current !== null &&
          typeof navigator !== 'undefined' &&
          navigator.geolocation
        ) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      };
    }, [currentTrainer.id]);

    const activateLiveTransit = useCallback(
      (explicitCtx?: TargetTransitContext | null) => {
        const ctx = explicitCtx || targetContextRef.current;
        if (!ctx) return;

        setShowMapWorkspace(true);

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setGpsError('Tu navegador no soporta geolocalización GPS.');
          return;
        }

        setGpsError(null);
        startedAtIsoRef.current = new Date().toISOString();
        activeTrackingDocIdRef.current = buildTrackingDocId(ctx.sede.id);
        lastFirestoreSyncRef.current = null;
        routeCalcRef.current = null;
        setRouteCalc(null);
        setIsLiveTracking(true);
        setIsConnectingGps(true);

        // If we already have recent coordinates on device, publish "Voy en trayecto" immediately
        if (liveCoords) {
          setIsConnectingGps(false);
          pushTrackingSnapshot(liveCoords, 'en_camino', null, ctx);
        }

        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => handlePositionUpdate(pos, true, ctx),
          (err) => {
            setIsConnectingGps(false);
            if (err.code === err.PERMISSION_DENIED) {
              setGpsError(
                'Permiso de ubicación denegado. Habilita el GPS del navegador para activar "Voy en trayecto" y compartir tu avance en tiempo real.'
              );
              setIsLiveTracking(false);
            } else {
              setGpsError(
                'Señal GPS débil o en espera de satélites. Reintentando conexión automáticamente...'
              );
            }
          },
          {
            enableHighAccuracy: true,
            maximumAge: 4000,
            timeout: 15000,
          }
        );
      },
      [buildTrackingDocId, handlePositionUpdate, liveCoords, pushTrackingSnapshot]
    );

    useImperativeHandle(
      ref,
      () => ({
        startTransitForAssignment: (asg: ClassAssignment) => {
          if (asg.isVirtual) return;
          setSelectedAssignmentId(asg.id);
          setManualCompanyId(asg.companyId);
          setManualSedeId(asg.sedeId);
          const ctx = resolveContextFromAssignment(asg);
          if (ctx) {
            targetContextRef.current = ctx;
            activateLiveTransit(ctx);
          }
        },
        stopTransit: () => {
          stopGpsWatchCleanly('detenido');
        },
      }),
      [activateLiveTransit, resolveContextFromAssignment, stopGpsWatchCleanly]
    );

    const handleCalculateOnce = () => {
      if (!targetContext) return;
      setShowMapWorkspace(true);
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setGpsError('Tu navegador no soporta geolocalización GPS.');
        return;
      }

      setIsLocatingOnce(true);
      setGpsError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocatingOnce(false);
          handlePositionUpdate(pos, isLiveTracking);
        },
        (err) => {
          setIsLocatingOnce(false);
          setGpsError(
            err.code === err.PERMISSION_DENIED
              ? 'Permiso de ubicación denegado en el navegador.'
              : 'No se pudo obtener tu ubicación actual. Verifica que el GPS esté encendido.'
          );
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
    };

    const computedSummary = useMemo(() => {
      if (!liveCoords || !targetContext) return null;
      const straightMeters = calculateHaversineDistanceMeters(
        liveCoords.lat,
        liveCoords.lng,
        targetContext.sede.lat,
        targetContext.sede.lng
      );
      const withinGeofence = straightMeters <= (targetContext.sede.geofenceRadiusMeters || 150);
      const fallback = estimateTransitMetricsFallback(
        liveCoords.lat,
        liveCoords.lng,
        targetContext.sede.lat,
        targetContext.sede.lng,
        travelMode
      );

      const routeDistanceMeters = routeCalc
        ? routeCalc.distanceMeters
        : fallback.routeDistanceMeters;
      const durationMinutes = withinGeofence
        ? 0
        : routeCalc
          ? routeCalc.durationMinutes
          : fallback.estimatedDurationMinutes;
      const arrivalHHMM = computeArrivalClockHHMM(durationMinutes);
      const marginMinutes = computePunctualityMarginMinutes(
        targetContext.date,
        targetContext.scheduledTime,
        durationMinutes
      );

      return {
        straightMeters,
        withinGeofence,
        routeDistanceMeters,
        durationMinutes,
        arrivalHHMM,
        marginMinutes,
        source: routeCalc ? routeCalc.source : ('haversine_estimado' as const),
      };
    }, [liveCoords, targetContext, routeCalc, travelMode]);

    if (!targetContext) return null;

    const travelModeButtons: { mode: TransitTravelMode; icon: React.ReactNode; label: string }[] = [
      { mode: 'DRIVING', icon: <Car className="w-3.5 h-3.5 shrink-0" />, label: 'Auto' },
      { mode: 'TWO_WHEELER', icon: <Bike className="w-3.5 h-3.5 shrink-0" />, label: 'Moto' },
      { mode: 'TRANSIT', icon: <TrainFront className="w-3.5 h-3.5 shrink-0" />, label: 'Transporte' },
      { mode: 'WALKING', icon: <Footprints className="w-3.5 h-3.5 shrink-0" />, label: 'A pie' },
    ];

    const isExpanded = isLiveTracking || showMapWorkspace;

    return (
      <section
        id="trainer-transit-tracker"
        className={`rounded-2xl border overflow-hidden transition-colors ${
          isLiveTracking
            ? 'bg-white border-emerald-400 shadow-sm'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        {/* Active "Voy en trayecto" Live Status Banner */}
        {isLiveTracking && (
          <div className="bg-emerald-950 text-white px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                <Navigation className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-emerald-200">
                  Aviso «Voy en trayecto» activo · Transmitiendo avance a Administración
                </p>
                <p className="text-[11px] text-emerald-100/90 truncate">
                  {isConnectingGps
                    ? 'Conectando con GPS de alta precisión...'
                    : `Rumbo a ${targetContext.company.name} — ${targetContext.sede.name} (${targetContext.scheduledTime} hrs)`}
                </p>
              </div>
            </div>
            <span className="font-mono tabular-nums text-[11px] text-emerald-300 shrink-0">
              Se detiene al registrar entrada o manualmente
            </span>
          </div>
        )}

        {/* Primary Header & "Voy en trayecto" Trigger */}
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-900">
                Aviso de Traslado y Seguimiento GPS
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {isLiveTracking
                  ? 'Seguimiento activo en tiempo real'
                  : 'Inactivo hasta que avises tu salida rumbo a la sede'}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 text-balance">
              {targetContext.company.name} — {targetContext.sede.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {targetContext.activityName} · Inicio programado:{' '}
              <strong className="font-mono tabular-nums text-slate-800">
                {targetContext.scheduledTime} hrs
              </strong>{' '}
              · {targetContext.sede.address}
            </p>
          </div>

          {/* Primary Action: "Voy en trayecto" */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isLiveTracking ? (
              <>
                <button
                  type="button"
                  onClick={() => activateLiveTransit(targetContext)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold flex items-center gap-2 transition shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Navigation className="w-4 h-4 shrink-0" />
                  <span>Voy en trayecto</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!showMapWorkspace) {
                      handleCalculateOnce();
                    } else {
                      setShowMapWorkspace(false);
                    }
                  }}
                  disabled={isLocatingOnce}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  {showMapWorkspace ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Ocultar Mapa</span>
                    </>
                  ) : (
                    <>
                      <LocateFixed className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span>{isLocatingOnce ? 'Ubicando...' : 'Consultar Ruta'}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCalculateOnce}
                  disabled={isLocatingOnce}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>{isLocatingOnce ? 'Actualizando...' : 'Actualizar GPS'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => stopGpsWatchCleanly('detenido')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>Detener Seguimiento</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Target Sede Selector + Travel Mode Bar */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {trainerActiveAssignments.length > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
                <label
                  htmlFor="transit-target-assignment"
                  className="text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0"
                >
                  Sede destino:
                </label>
                <select
                  id="transit-target-assignment"
                  value={selectedAssignmentId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedAssignmentId(id);
                    const found = trainerActiveAssignments.find((a) => a.id === id);
                    if (found) {
                      setManualCompanyId(found.companyId);
                      setManualSedeId(found.sedeId);
                    }
                  }}
                  className="w-full sm:max-w-md bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500"
                >
                  {trainerActiveAssignments.map((asg) => (
                    <option key={asg.id} value={asg.id}>
                      {asg.time} hrs · {asg.companyName} — {asg.sedeName} ({asg.activityName})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                  Sede destino:
                </span>
                <select
                  value={manualCompanyId}
                  onChange={(e) => {
                    const nextComp = companies.find((c) => c.id === e.target.value);
                    setManualCompanyId(e.target.value);
                    setManualSedeId(nextComp?.sedes[0]?.id || '');
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={manualSedeId}
                  onChange={(e) => setManualSedeId(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800"
                >
                  {(companies.find((c) => c.id === manualCompanyId)?.sedes || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2">
            {/* Segmented Travel Mode Control */}
            <div
              className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full"
              role="group"
              aria-label="Modo de traslado"
            >
              {travelModeButtons.map((btn) => (
                <button
                  key={btn.mode}
                  type="button"
                  onClick={() => setTravelMode(btn.mode)}
                  className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
                    travelMode === btn.mode
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {btn.icon}
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>

            {!isLiveTracking && myRecentTrackings.length > 0 && !showMapWorkspace && (
              <button
                type="button"
                onClick={() => setShowMapWorkspace(true)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Historial</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Expanded Workspace: Live Metrics + Google Map (Shown immediately when "Voy en trayecto" or "Consultar Ruta" is active) */}
        {(isExpanded || gpsError) && (
          <div className="p-4 sm:p-5 border-t border-slate-200 space-y-4">
            {gpsError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{gpsError}</span>
              </div>
            )}

            {/* Calculated Distance & ETA Strip */}
            {computedSummary && liveCoords ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  <span className="text-xs text-slate-500 block">Distancia a la Sede</span>
                  <span className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
                    {formatDistanceMetric(computedSummary.routeDistanceMeters)}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                    Lineal: {formatDistanceMetric(computedSummary.straightMeters)} ·{' '}
                    {TRANSIT_TRAVEL_MODE_LABELS[travelMode]}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  <span className="text-xs text-slate-500 block">Tiempo Estimado</span>
                  <span className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
                    {formatTravelDuration(computedSummary.durationMinutes)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {computedSummary.source === 'google_routes'
                      ? 'Vía Google Routes'
                      : 'Estimación geodésica urbana'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  <span className="text-xs text-slate-500 block">Hora Estimada de Llegada</span>
                  <span className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 block">
                    {computedSummary.arrivalHHMM} hrs
                  </span>
                  <span
                    className={`text-[11px] font-medium font-mono tabular-nums ${
                      computedSummary.marginMinutes !== null && computedSummary.marginMinutes < 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {computedSummary.marginMinutes === null
                      ? `Cita: ${targetContext.scheduledTime} hrs`
                      : computedSummary.marginMinutes >= 0
                        ? `${computedSummary.marginMinutes} min antes del inicio`
                        : `Riesgo de retraso: +${Math.abs(computedSummary.marginMinutes)} min`}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  <span className="text-xs text-slate-500 block">Estado de Geocerca</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {computedSummary.withinGeofence ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-sm font-bold text-emerald-800">Dentro de Sede</span>
                      </>
                    ) : (
                      <>
                        <RouteIcon className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-sm font-bold text-slate-900">En Trayecto</span>
                      </>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums block mt-0.5">
                    Radio sede: {targetContext.sede.geofenceRadiusMeters} m · GPS ±
                    {liveCoords.accuracy} m
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p className="font-semibold text-slate-800">
                    {isConnectingGps
                      ? 'Obteniendo tu ubicación GPS para calcular ruta y notificar tu avance...'
                      : `Calcula tu ruta hacia ${targetContext.sede.name}`}
                  </p>
                  <p>
                    Al pulsar <strong>Voy en trayecto</strong>, Administración recibe el aviso y
                    visualiza tu distancia y tiempo estimado de llegada en tiempo real.
                  </p>
                </div>
              </div>
            )}

            {/* Interactive Google Map */}
            {GOOGLE_MAPS_API_KEY ? (
              <div className="w-full h-[300px] sm:h-[340px] rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100">
                <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="es" region="MX">
                  <Map
                    defaultCenter={{
                      lat: targetContext.sede.lat,
                      lng: targetContext.sede.lng,
                    }}
                    defaultZoom={14}
                    mapId="DEMO_MAP_ID"
                    gestureHandling="cooperative"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    className="w-full h-full"
                  >
                    {/* Target Corporate Sede Marker */}
                    <AdvancedMarker
                      position={{ lat: targetContext.sede.lat, lng: targetContext.sede.lng }}
                      title={`${targetContext.company.name} — ${targetContext.sede.name}`}
                    >
                      <Pin
                        background="#dc2626"
                        borderColor="#7f1d1d"
                        glyphColor="#ffffff"
                        glyphText="S"
                      />
                    </AdvancedMarker>

                    {/* Trainer Live Position Marker */}
                    {liveCoords && (
                      <AdvancedMarker
                        position={{ lat: liveCoords.lat, lng: liveCoords.lng }}
                        title={`Tu ubicación (${currentTrainer.name})`}
                      >
                        <Pin
                          background="#0f172a"
                          borderColor="#334155"
                          glyphColor="#38bdf8"
                          glyphText="E"
                        />
                      </AdvancedMarker>
                    )}

                    <LiveRouteOverlay
                      origin={liveCoords ? { lat: liveCoords.lat, lng: liveCoords.lng } : null}
                      destination={{ lat: targetContext.sede.lat, lng: targetContext.sede.lng }}
                      geofenceRadiusMeters={targetContext.sede.geofenceRadiusMeters || 150}
                      travelMode={travelMode}
                      routeTriggerKey={routeTriggerKey}
                      onRouteComputed={handleRouteComputed}
                    />
                  </Map>
                </APIProvider>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
                Mapa interactivo no disponible (clave de Google Maps no configurada). El cálculo
                geodésico de distancia y tiempo sigue activo.
              </div>
            )}

            {/* Trainer's Recent Transit Log Summary */}
            {myRecentTrackings.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className="font-semibold text-slate-700">
                    Mis últimos registros de traslado
                  </span>
                  <span className="font-mono tabular-nums">
                    {myRecentTrackings.length} registro{myRecentTrackings.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Fecha / Sede</th>
                        <th className="py-2 px-3 font-medium text-right">Distancia</th>
                        <th className="py-2 px-3 font-medium text-right">Tiempo Est.</th>
                        <th className="py-2 px-3 font-medium text-right">Llegada Est.</th>
                        <th className="py-2 pl-3 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myRecentTrackings.slice(0, 3).map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="py-2 pr-3">
                            <span className="font-semibold text-slate-800 block">
                              {item.companyName} — {item.sedeName}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {item.date} · Cita {item.scheduledTime} hrs ·{' '}
                              {TRANSIT_TRAVEL_MODE_LABELS[item.travelMode] || item.travelMode}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800">
                            {formatDistanceMetric(item.routeDistanceMeters)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800">
                            {formatTravelDuration(item.estimatedDurationMinutes)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800">
                            {item.estimatedArrivalHHMM} hrs
                          </td>
                          <td className="py-2 pl-3 text-slate-700">
                            {item.status === 'en_camino'
                              ? 'En trayecto'
                              : item.status === 'en_geocerca'
                                ? 'En geocerca'
                                : item.status === 'llegada_confirmada'
                                  ? 'Llegada confirmada'
                                  : 'Detenido'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Mandatory Google Maps End-User Terms & Privacy Disclosure */}
            <p className="text-[11px] text-slate-400 leading-relaxed">
              El seguimiento de ubicación se activa únicamente cuando pulsas «Voy en trayecto» y
              puedes detenerlo en cualquier momento. Las funciones de mapa y rutas integran Google
              Maps y están sujetas a las{' '}
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
            </p>
          </div>
        )}
      </section>
    );
  }
);

TrainerLiveTransitTracker.displayName = 'TrainerLiveTransitTracker';
