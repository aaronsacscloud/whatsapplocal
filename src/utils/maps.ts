/**
 * Google Maps deep link utilities.
 * Generates clickable links for venues in San Miguel de Allende.
 */

export function getGoogleMapsUrl(
  name: string,
  address?: string | null,
  lat?: number | null,
  lon?: number | null
): string {
  if (lat && lon) {
    return `https://maps.google.com/?q=${lat},${lon}`;
  }
  const query = address
    ? `${name}, ${address}, San Miguel de Allende`
    : `${name}, San Miguel de Allende`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}`;
}

export function getGoogleMapsSearchUrl(query: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query + ", San Miguel de Allende")}`;
}
