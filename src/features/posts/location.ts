import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { formatLocationLabel } from './utils';

export type OptionalPostLocation =
  | {
      status: 'available';
      latitude: number;
      longitude: number;
      locationName: string | null;
    }
  | { status: 'denied' | 'unavailable' };

export type LocationSuggestion = {
  latitude: number;
  longitude: number;
  locationName: string;
};

async function ensureGeocodePermission() {
  if (Platform.OS !== 'android') return true;
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission.status === Location.PermissionStatus.GRANTED;
}

export async function getOptionalForegroundLocation(): Promise<OptionalPostLocation> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return { status: 'denied' };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;

    let locationName: string | null = null;
    try {
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
      locationName = formatLocationLabel(address);
    } catch {
      // Coordinates remain useful when reverse geocoding is unavailable.
    }

    return { status: 'available', latitude, longitude, locationName };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Forward-geocode a typed place name into a short list of suggestions. */
export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    if (!(await ensureGeocodePermission())) return [];

    const places = await Location.geocodeAsync(trimmed);
    const suggestions: LocationSuggestion[] = [];
    const seen = new Set<string>();

    for (const place of places.slice(0, 5)) {
      const key = `${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let locationName = trimmed;
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: place.latitude,
          longitude: place.longitude,
        });
        locationName = formatLocationLabel(address) || trimmed;
      } catch {
        // Fall back to the typed query when reverse geocoding fails.
      }

      suggestions.push({
        latitude: place.latitude,
        longitude: place.longitude,
        locationName,
      });
    }

    return suggestions;
  } catch {
    return [];
  }
}
