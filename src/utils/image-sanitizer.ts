/**
 * Image URL sanitizer for WhatsApp delivery.
 *
 * Rules:
 * 1. WebP → convert to JPEG via wsrv.nl proxy (WhatsApp drops WebP)
 * 2. Must be full HTTPS URL
 * 3. Must be at least 15 chars
 * 4. Must not be a tracking pixel, icon, or placeholder
 * 5. Resize to max 800px width for fast delivery
 */

const BLOCKED_PATTERNS = [
  "1x1", "pixel", "tracking", "favicon", "icon", "sprite",
  "badge", "logo", "avatar", "placeholder", "no-img", "blank",
  "spacer", "transparent",
];

/**
 * Sanitize an image URL for WhatsApp delivery.
 * Returns cleaned URL or null if invalid.
 */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url || url.length < 15) return null;

  let cleaned = url.trim();

  // Must be full URL
  if (!cleaned.startsWith("http")) return null;

  // Block known bad patterns
  const lower = cleaned.toLowerCase();
  for (const pattern of BLOCKED_PATTERNS) {
    if (lower.includes(pattern)) return null;
  }

  // Block SVGs (not supported as WhatsApp images)
  if (lower.endsWith(".svg")) return null;

  // Already proxied — don't double-encode
  if (lower.includes("wsrv.nl")) return cleaned;

  // Convert WebP to JPEG via proxy
  if (lower.endsWith(".webp") || lower.includes(".webp?") || lower.includes(".webp&")) {
    cleaned = `https://wsrv.nl/?url=${encodeURIComponent(cleaned)}&output=jpg&w=800&q=85`;
  }

  return cleaned;
}

/**
 * Sanitize an image URL at scrape time — stores the clean URL in the DB
 * so it's ready for WhatsApp delivery without runtime conversion.
 */
export function sanitizeImageForStorage(url: string | null | undefined): string | null {
  return sanitizeImageUrl(url);
}
