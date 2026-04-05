/**
 * Google Maps deep link utilities.
 * Generates clickable links for venues in San Miguel de Allende.
 * Uses URL shortener to keep WhatsApp messages clean.
 */

import { shortenUrl } from "./short-url.js";

export async function getGoogleMapsUrl(
  name: string,
  address?: string | null,
  lat?: number | null,
  lon?: number | null
): Promise<string> {
  let longUrl: string;
  if (lat && lon) {
    longUrl = `https://maps.google.com/?q=${lat},${lon}`;
  } else {
    const query = address
      ? `${name}, ${address}, San Miguel de Allende`
      : `${name}, San Miguel de Allende`;
    longUrl = `https://maps.google.com/maps?q=${encodeURIComponent(query)}`;
  }
  return shortenUrl(longUrl);
}

export async function getGoogleMapsSearchUrl(query: string): Promise<string> {
  const longUrl = `https://maps.google.com/maps?q=${encodeURIComponent(query + ", San Miguel de Allende")}`;
  return shortenUrl(longUrl);
}
