import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Navigation, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Sparkles,
  ShieldCheck,
  Compass
} from 'lucide-react';
import { Sede, GpsData } from '../types';
import { calculateDistanceMeters, formatDistance, getCurrentPositionAsync, getSimulatedPosition } from '../utils/geo';

interface GpsVisualizerProps {
  selectedSede: Sede | null;
  onGpsUpdate: (gps: GpsData) => void;
  currentGps: GpsData | null;
}

export const GpsVisualizer: React.FC<GpsVisualizerProps> = ({
  selectedSede,
  onGpsUpdate,
  currentGps,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const captureRealGps = async () => {
    if (!selectedSede) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const pos = await getCurrentPositionAsync(8000);
      const dist = calculateDistanceMeters(
        pos.lat,
        pos.lng,
        selectedSede.lat,
        selectedSede.lng
      );
      const isInside = dist <= selectedSede.geofenceRadiusMeters;

      const gpsData: GpsData = {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        distanceToSedeMeters: dist,
        isWithinGeofence: isInside,
        capturedAt: new Date().toLocaleTimeString('es-MX', { hour12: false }),
      };

      onGpsUpdate(gpsData);
    } catch (err: any) {
      console.warn('GPS query failed, offering simulation fallback:', err);
      setErrorMsg(err.message || 'No se pudo obtener la señal GPS directa.');
    } finally {
      setLoading(false);
    }
  };

  const simulateAtSede = () => {
    if (!selectedSede) return;
    setLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      // Simulate being 12-28 meters from entrance
      const simPos = getSimulatedPosition(selectedSede.lat, selectedSede.lng, 25);
      const dist = calculateDistanceMeters(
        simPos.lat,
        simPos.lng,
        selectedSede.lat,
        selectedSede.lng
      );

      const gpsData: GpsData = {
        lat: simPos.lat,
        lng: simPos.lng,
        accuracy: simPos.accuracy,
        distanceToSedeMeters: dist,
        isWithinGeofence: true,
        capturedAt: new Date().toLocaleTimeString('es-MX', { hour12: false }),
      };

      onGpsUpdate(gpsData);
      setLoading(false);
    }, 400);
  };

  // Auto-acquire simulated or real GPS when sede changes if not yet acquired
  useEffect(() => {
    if (selectedSede && !currentGps) {
      simulateAtSede();
    }
  }, [selectedSede]);

  if (!selectedSede) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center text-slate-500">
        <MapPin className="w-7 h-7 mx-auto text-slate-400 mb-2" />
        <p className="text-xs sm:text-sm">
          En blanco hasta cargar la sesión asignada del día para calibrar las coordenadas GPS de la sede.
        </p>
      </div>
    );
  }

  const isInside = currentGps?.isWithinGeofence ?? false;

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row items-center sm:items-center justify-between gap-3 mb-4 text-center sm:text-left">
        <div>
          <h4 className="text-sm font-bold text-slate-800 flex items-center justify-center sm:justify-start">
            <Compass className="w-4 h-4 mr-2 text-red-600 shrink-0" />
            Geolocalización & Validación de Sede
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Geocerca autorizada: radio de {selectedSede.geofenceRadiusMeters} metros
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={captureRealGps}
            disabled={loading}
            className="min-h-[44px] sm:min-h-0 flex items-center justify-center text-xs px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-xs transition font-medium disabled:opacity-50"
            title="Consultar sensor GPS del teléfono/dispositivo"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 shrink-0 ${loading ? 'animate-spin text-red-600' : 'text-slate-500'}`} />
            <span>{loading ? 'Leyendo...' : 'GPS Real'}</span>
          </button>

          <button
            type="button"
            onClick={simulateAtSede}
            disabled={loading}
            className="min-h-[44px] sm:min-h-0 flex items-center justify-center text-xs px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 shadow-xs transition font-semibold"
            title="Simula estar presente en la entrada de la sede seleccionada"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-red-600 shrink-0" />
            <span>Simular Sede</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 text-amber-600 shrink-0" />
            <span>{errorMsg} (Puedes usar el botón "Simular Sede" para pruebas).</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="min-w-[32px] min-h-[32px] flex items-center justify-center text-amber-700 font-bold shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {currentGps ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center sm:text-left">
          {/* Status Box */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col justify-between shadow-xs ${
              isInside
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-center justify-center sm:justify-between gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider">
                {isInside ? 'Verificación Exitosa' : 'Fuera de Rango'}
              </span>
              {isInside ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
            </div>
            <div className="mt-2">
              <div className="text-xl font-black font-mono tabular-nums">
                {formatDistance(currentGps.distanceToSedeMeters)}
              </div>
              <p className="text-[11px] opacity-80">
                {isInside
                  ? `Dentro del radio permitido (${selectedSede.geofenceRadiusMeters}m)`
                  : `A ${formatDistance(currentGps.distanceToSedeMeters - selectedSede.geofenceRadiusMeters)} fuera del perímetro`}
              </p>
            </div>
          </div>

          {/* Coordinates captured */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs text-xs flex flex-col justify-between">
            <span className="text-slate-500 font-medium">Coordenadas del Entrenador</span>
            <div className="mt-1 font-mono tabular-nums text-slate-800 space-y-0.5">
              <div>Lat: <span className="text-red-600 font-bold">{currentGps.lat.toFixed(6)}</span></div>
              <div>Lng: <span className="text-red-600 font-bold">{currentGps.lng.toFixed(6)}</span></div>
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center justify-center sm:justify-between gap-3 border-t border-slate-100 pt-1 tabular-nums">
              <span>Precisión: ±{currentGps.accuracy}m</span>
              <span>Captura: {currentGps.capturedAt}</span>
            </div>
          </div>

          {/* Venue Target Reference */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs text-xs flex flex-col justify-between">
            <span className="text-slate-500 font-medium flex items-center justify-center sm:justify-start">
              <MapPin className="w-3.5 h-3.5 mr-1 text-red-600 shrink-0" />
              Punto Oficial de la Sede
            </span>
            <div className="mt-1 font-mono tabular-nums text-slate-700 space-y-0.5 truncate">
              <div className="truncate font-bold text-slate-900 font-sans">{selectedSede.name}</div>
              <div>{selectedSede.lat.toFixed(6)}, {selectedSede.lng.toFixed(6)}</div>
            </div>
            <div className="mt-1 text-[11px] text-red-600 font-medium truncate border-t border-slate-100 pt-1">
              {selectedSede.address}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-white border border-slate-200 text-center">
          <p className="text-xs text-slate-500 font-medium">Obteniendo coordenadas GPS para validar la presencia...</p>
        </div>
      )}
    </div>
  );
};
