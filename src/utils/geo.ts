/**
 * Utility functions for geolocation calculations and accuracy verification
 */

// Earth radius in meters
const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates distance between two coordinates in meters using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Formats distance nicely in meters or kilometers
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export interface GeolocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

/**
 * Retrieves the current device position using HTML5 Geolocation API
 */
export function getCurrentPositionAsync(
  timeoutMs: number = 10000
): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('La geolocalización no está soportada en este navegador.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy || 10),
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        let msg = 'Error al obtener ubicación GPS.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permiso de ubicación denegado por el usuario o navegador.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Señal de ubicación no disponible.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tiempo de espera agotado al consultar GPS.';
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Generates slight jitter around target sede coordinate for demo/simulation
 */
export function getSimulatedPosition(targetLat: number, targetLng: number, radiusMeters: number = 30): GeolocationResult {
  // 1 deg latitude is approx 111,000 meters
  const latOffset = ((Math.random() - 0.5) * 2 * radiusMeters) / 111000;
  const lngOffset =
    ((Math.random() - 0.5) * 2 * radiusMeters) /
    (111000 * Math.cos(toRadians(targetLat)));

  return {
    lat: Number((targetLat + latOffset).toFixed(6)),
    lng: Number((targetLng + lngOffset).toFixed(6)),
    accuracy: Math.floor(Math.random() * 8) + 4, // 4-12 meters accuracy
    timestamp: Date.now(),
  };
}
