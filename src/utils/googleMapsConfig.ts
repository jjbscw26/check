import { useEffect, useState } from 'react';
import { APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { TransitTravelMode } from '../types';

export const GOOGLE_MAPS_API_KEY: string =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_GOOGLE_MAPS_API_KEY || '';

/**
 * Stable module-level array reference so <APIProvider> never re-runs its loader effect on re-render.
 */
export const GMP_DEFAULT_LIBRARIES: Array<'routes' | 'marker'> = ['routes', 'marker'];

export type GoogleMapsDiagnosticCode =
  | 'auth_failure'
  | 'api_not_activated'
  | 'billing_not_enabled'
  | 'referer_not_allowed'
  | 'invalid_key'
  | 'load_failed';

export interface GoogleMapsDiagnosticInfo {
  code: GoogleMapsDiagnosticCode;
  title: string;
  description: string;
}

let currentDiagnostic: GoogleMapsDiagnosticInfo | null = null;
const diagnosticListeners = new Set<(info: GoogleMapsDiagnosticInfo | null) => void>();
let observerInstalled = false;

function publishDiagnostic(info: GoogleMapsDiagnosticInfo) {
  currentDiagnostic = info;
  diagnosticListeners.forEach((listener) => listener(currentDiagnostic));
}

function classifyConsoleErrorMessage(msg: string): GoogleMapsDiagnosticInfo | null {
  if (msg.includes('ApiNotActivatedMapError')) {
    return {
      code: 'api_not_activated',
      title: 'Maps JavaScript API pendiente de habilitar en Google Cloud',
      description:
        'Habilita "Maps JavaScript API" y "Routes API" en la consola de Google Cloud para la clave configurada.',
    };
  }
  if (msg.includes('RefererNotAllowedMapError')) {
    return {
      code: 'referer_not_allowed',
      title: 'Dominio actual bloqueado por restricción HTTP Referrer',
      description:
        'Agrega la URL actual de la aplicación a los referentes HTTP permitidos de tu clave de Google Maps en Google Cloud.',
    };
  }
  if (msg.includes('BillingNotEnabledMapError')) {
    return {
      code: 'billing_not_enabled',
      title: 'Facturación pendiente en el proyecto de Google Cloud',
      description:
        'Vincula una cuenta de facturación activa al proyecto de Google Cloud para cargar el mapa interactivo.',
    };
  }
  if (msg.includes('InvalidKeyMapError')) {
    return {
      code: 'invalid_key',
      title: 'Clave de API de Google Maps no válida',
      description:
        'Verifica que la clave configurada en VITE_GOOGLE_MAPS_API_KEY sea correcta y no contenga espacios adicionales.',
    };
  }
  return null;
}

export function installGoogleMapsErrorObserver(): void {
  if (observerInstalled || typeof window === 'undefined') return;
  observerInstalled = true;

  const win = window as unknown as {
    gm_authFailure?: () => void;
  };
  const previousAuthFailure = win.gm_authFailure;

  win.gm_authFailure = () => {
    if (typeof previousAuthFailure === 'function') {
      try {
        previousAuthFailure();
      } catch {
        // Ignore downstream handler errors
      }
    }
    if (!currentDiagnostic) {
      publishDiagnostic({
        code: 'auth_failure',
        title: 'No se pudo autenticar Google Maps JavaScript API',
        description:
          'Verifica en Google Cloud Console que "Maps JavaScript API" y "Routes API" estén habilitadas y que el dominio actual esté permitido.',
      });
    }
  };

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    const joined = args.map((a) => String(a)).join(' ');
    if (!joined.includes('Google Maps JavaScript API error')) return;
    const classified = classifyConsoleErrorMessage(joined);
    if (classified) {
      publishDiagnostic(classified);
    }
  };
}

export function useGoogleMapsDiagnostics(): {
  hasKey: boolean;
  isLoaded: boolean;
  diagnostic: GoogleMapsDiagnosticInfo | null;
} {
  const apiStatus = useApiLoadingStatus();
  const [diagnostic, setDiagnostic] = useState<GoogleMapsDiagnosticInfo | null>(currentDiagnostic);

  useEffect(() => {
    installGoogleMapsErrorObserver();
    diagnosticListeners.add(setDiagnostic);
    if (currentDiagnostic) {
      setDiagnostic(currentDiagnostic);
    }
    return () => {
      diagnosticListeners.delete(setDiagnostic);
    };
  }, []);

  const derivedDiagnostic: GoogleMapsDiagnosticInfo | null =
    diagnostic ||
    (apiStatus === APILoadingStatus.AUTH_FAILURE
      ? {
          code: 'auth_failure',
          title: 'Autenticación rechazada por Google Maps API',
          description:
            'Revisa las restricciones de referentes HTTP y que Maps JavaScript API esté activa en tu proyecto de Google Cloud.',
        }
      : apiStatus === APILoadingStatus.FAILED
        ? {
            code: 'load_failed',
            title: 'No se pudo cargar el servicio de mapas',
            description:
              'Comprueba tu conexión a internet o los permisos de red hacia maps.googleapis.com.',
          }
        : null);

  return {
    hasKey: Boolean(GOOGLE_MAPS_API_KEY),
    isLoaded: apiStatus === APILoadingStatus.LOADED && !derivedDiagnostic,
    diagnostic: derivedDiagnostic,
  };
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function buildGoogleMapsDirectionsUrl(params: {
  originLat?: number;
  originLng?: number;
  destLat: number;
  destLng: number;
  travelMode?: TransitTravelMode;
}): string {
  const modeMap: Record<TransitTravelMode, string> = {
    DRIVING: 'driving',
    TWO_WHEELER: 'two-wheeler',
    TRANSIT: 'transit',
    WALKING: 'walking',
  };
  const gmMode = params.travelMode ? modeMap[params.travelMode] || 'driving' : 'driving';
  const query = new URLSearchParams({
    api: '1',
    destination: `${params.destLat},${params.destLng}`,
    travelmode: gmMode,
  });

  if (isValidCoordinate(params.originLat, params.originLng)) {
    query.set('origin', `${params.originLat},${params.originLng}`);
  }

  return `https://www.google.com/maps/dir/?${query.toString()}`;
}
