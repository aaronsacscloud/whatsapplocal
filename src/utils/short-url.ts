/**
 * URL shortener using TinyURL API (free, no API key needed).
 * Falls back to original URL if shortening fails.
 */

const cache = new Map<string, string>();
const CACHE_MAX = 500;

export async function shortenUrl(longUrl: string): Promise<string> {
  // Return cached if available
  const cached = cache.get(longUrl);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (!response.ok) return longUrl;

    const shortUrl = (await response.text()).trim();

    // Validate it looks like a URL
    if (!shortUrl.startsWith("https://tinyurl.com/")) return longUrl;

    // Cache it
    if (cache.size > CACHE_MAX) cache.clear();
    cache.set(longUrl, shortUrl);

    return shortUrl;
  } catch {
    return longUrl;
  }
}
