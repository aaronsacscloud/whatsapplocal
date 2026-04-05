import { getDb } from "../db/index.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { getLLMClient } from "../llm/client.js";
import { sql } from "drizzle-orm";

const logger = getLogger();

// ─── Knowledge Cache Table ───────────────────────────────────────────────
// Uses a simple key-value approach stored in a dedicated table.
// Queries are normalized to keys, answers are cached with TTL.

interface CachedKnowledge {
  id: string;
  queryKey: string;      // normalized search query
  originalQuery: string; // what the user actually asked
  answer: string;        // the answer we found
  source: string;        // where we found it (web search URL, etc.)
  category: string;      // topic category
  city: string;
  hitCount: number;       // how many times this was served
  createdAt: Date;
  expiresAt: Date;
}

// ─── Normalize query to a cache key ──────────────────────────────────────

function normalizeQueryKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[¿?¡!.,;:'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ");
}

// ─── Search cached knowledge ─────────────────────────────────────────────

export async function searchKnowledge(
  query: string,
  city: string
): Promise<string | null> {
  const db = getDb();
  const key = normalizeQueryKey(query);

  try {
    const results = await db.execute(
      sql`SELECT answer, id, hit_count FROM learned_knowledge
          WHERE city = ${city}
          AND expires_at > NOW()
          AND (
            query_key = ${key}
            OR query_key % ${key}
          )
          ORDER BY
            CASE WHEN query_key = ${key} THEN 0 ELSE 1 END,
            hit_count DESC
          LIMIT 1`
    );

    if (results.length > 0) {
      const row = results[0] as any;
      // Increment hit count (fire-and-forget)
      db.execute(
        sql`UPDATE learned_knowledge SET hit_count = hit_count + 1 WHERE id = ${row.id}`
      ).catch(() => {});

      logger.info({ key, hits: row.hit_count }, "Knowledge cache hit");
      return row.answer as string;
    }
  } catch (error) {
    // Table might not exist yet, or trigram extension not available
    // Fall through to web search
    logger.debug({ error: (error as any)?.message }, "Knowledge search failed (non-critical)");
  }

  return null;
}

// ─── Learn from web search ───────────────────────────────────────────────

export interface LearnedResult {
  text: string;
  imageUrl?: string;
  videoLinks?: string[];
}

export async function learnFromWeb(
  userQuery: string,
  city: string,
  language: "es" | "en" = "es"
): Promise<string | null> {
  const config = getConfig();

  // Step 1: Clean query and search the web
  // Remove filler words that hurt search quality
  const cleanedQuery = userQuery
    .replace(/^["']+|["']+$/g, "")              // strip quotes
    .replace(/^(dame|dime|muestrame|dame mas|quiero)\s+(info|informacion|información|datos|mas|más)\s*(de|del|sobre|acerca de)?\s*/i, "")
    .replace(/^(que es|what is|where is|donde esta|donde queda)\s*/i, "")
    .trim() || userQuery;
  const searchQuery = `${cleanedQuery} ${city}`;
  logger.info({ original: userQuery, cleaned: cleanedQuery, searchQuery }, "Web search query");
  const searchResults = await webSearch(searchQuery);

  if (!searchResults || searchResults.length === 0) {
    logger.info({ query: userQuery }, "No web results found for learning");
    return null;
  }

  // Step 2: Scrape top 3 pages for detailed content
  const pageContents: string[] = [];
  for (const result of searchResults.slice(0, 3)) {
    try {
      const content = await scrapePageContent(result.url);
      if (content) {
        pageContents.push(`### ${result.title}\nURL: ${result.url}\n${content}`);
      }
    } catch {
      pageContents.push(`### ${result.title}\nURL: ${result.url}\n${result.snippet}`);
    }
  }

  // Step 2.5: Search for reviews/opinions specifically
  const reviewQuery = `${cleanedQuery} opiniones reseñas`;
  const reviewResults = await webSearch(reviewQuery);
  const reviewContents: string[] = [];
  for (const result of reviewResults.slice(0, 2)) {
    // Prioritize TripAdvisor, Google, Facebook reviews
    if (result.url.includes("tripadvisor") || result.url.includes("google.com/maps") || result.url.includes("facebook") || result.url.includes("yelp")) {
      try {
        const content = await scrapePageContent(result.url);
        if (content) {
          reviewContents.push(`### RESEÑAS: ${result.title}\n${content}`);
        }
      } catch {
        reviewContents.push(`### RESEÑAS: ${result.title}\n${result.snippet}`);
      }
    } else {
      reviewContents.push(`### RESEÑAS: ${result.title}\n${result.snippet}`);
    }
  }

  // Build full context: page content + reviews + remaining snippets
  const contextParts = [...pageContents, ...reviewContents];
  for (const result of searchResults.slice(3, 5)) {
    contextParts.push(`### ${result.title}\n${result.snippet}\n${result.url}`);
  }

  const fullContext = contextParts.join("\n\n");
  if (fullContext.length < 50) return null;

  // Step 2.7: Search for TikTok/Instagram videos
  const videoQuery = `${cleanedQuery} ${city} site:tiktok.com OR site:instagram.com`;
  const videoResults = await webSearch(videoQuery);
  const videoLinks: string[] = [];
  for (const vr of (videoResults || []).slice(0, 3)) {
    if (vr.url.includes("tiktok.com") || vr.url.includes("instagram.com")) {
      videoLinks.push(vr.url);
    }
  }

  // Add video links to context
  if (videoLinks.length > 0) {
    contextParts.push(`### VIDEOS Y REDES SOCIALES:\n${videoLinks.join("\n")}`);
  }

  // Rebuild full context with everything
  const fullContextWithVideos = contextParts.join("\n\n");

  // Step 3: Use LLM to synthesize as a LOCAL GUIDE (conversational, personal)
  const client = getLLMClient();
  const isEn = language === "en";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: isEn
        ? `You are a friendly local guide in ${city} talking to a friend on WhatsApp. Give a warm, personal recommendation based on the web info below. Talk like a real person, not a bot.

Include naturally in your message:
- What the place IS and why it's special (your personal take)
- How to get there (address, landmark references)
- When to go (hours if available, best time to visit)
- What to expect price-wise
- What visitors say (summarize reviews in 1-2 sentences, be honest about good AND bad)
- If you found TikTok/Instagram links, include them: "Check out videos here: [link]"
- End with a personal tip or "pro tip" as a local

Keep it conversational. No bullet points. No headers. No emojis overload (max 2-3).
Write like you're texting a friend who just asked you about this place.
If info is not available, just skip it naturally, don't say "not available".
If no useful info at all, respond "NO_USEFUL_INFO".`
        : `Eres un guia local amigable de ${city} hablando con un amigo por WhatsApp. Da una recomendacion calida y personal basada en la info web abajo. Habla como persona real, no como bot.

Incluye naturalmente en tu mensaje:
- Que ES el lugar y por que es especial (tu opinion personal)
- Como llegar (direccion, referencias de puntos conocidos)
- Cuando ir (horario si hay, mejor momento para visitar)
- Que esperar de precios
- Que dicen los visitantes (resume opiniones en 1-2 frases, se honesto con lo bueno Y lo malo)
- Si encontraste links de TikTok/Instagram, incluyelos: "Checa videos aqui: [link]"
- Termina con un tip personal o "tip de local"

Mantenlo conversacional. Sin bullet points. Sin encabezados con #. Maximo 2-3 emojis.
Escribe como si le estuvieras mandando un mensaje a un amigo que te pregunto por este lugar.
Si algun dato no esta disponible, simplemente no lo menciones, no digas "no disponible".
Si no hay info util, responde "NO_USEFUL_INFO".`,
      messages: [
        {
          role: "user",
          content: `Pregunta: "${userQuery}"\n\nContenido de paginas web, reseñas y videos:\n${fullContextWithVideos.substring(0, 10000)}`,
        },
      ],
    });

    const answer = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    if (!answer || answer === "NO_USEFUL_INFO" || answer.length < 20) {
      return null;
    }

    // Step 4: Store in knowledge cache for future queries
    await storeKnowledge(userQuery, answer, searchResults[0]?.url || "web", city);

    logger.info({ query: userQuery, answerLen: answer.length, pages: pageContents.length, videos: videoLinks.length }, "Learned from web (deep scrape)");

    // Build rich result with media
    const richResult: LearnedResult = { text: answer, videoLinks };

    // Find best image from scraped pages
    for (const result of searchResults.slice(0, 3)) {
      const img = await findBestImage(result.url);
      if (img) {
        richResult.imageUrl = img;
        break;
      }
    }

    // Store the last rich result for handlers to access
    _lastRichResult = richResult;

    return answer;
  } catch (error) {
    logger.error({ error }, "LLM synthesis failed during learning");
    return null;
  }
}

// Store the last rich result so handlers can access media
let _lastRichResult: LearnedResult | null = null;

export function getLastRichResult(): LearnedResult | null {
  const result = _lastRichResult;
  _lastRichResult = null; // consume once
  return result;
}

/**
 * Find the best image from a web page (for sending with venue info).
 */
async function findBestImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsAppLocalBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const html = await response.text();

    // Priority 1: og:image (social share image, usually the best)
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch?.[1] && ogMatch[1].startsWith("http") && ogMatch[1].length > 20) {
      return ogMatch[1];
    }

    // Priority 2: First large content image (skip icons, logos)
    const imgPattern = /<img[^>]*src=["']([^"']+)["'][^>]*/gi;
    let m;
    while ((m = imgPattern.exec(html)) !== null) {
      const src = m[1];
      if (src.length < 20 || !src.startsWith("http")) continue;
      const lower = src.toLowerCase();
      if (lower.includes("logo") || lower.includes("icon") || lower.includes("favicon") ||
          lower.includes("avatar") || lower.includes("pixel") || lower.endsWith(".svg") ||
          lower.includes("spinner") || lower.includes("loading")) continue;
      // Likely a content image
      return src;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Scrape a web page and extract useful text content.
 * Strips HTML, scripts, styles, and returns clean text (max 3000 chars).
 */
async function scrapePageContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsAppLocalBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    let html = await response.text();

    // Remove scripts, styles, nav, footer
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
    html = html.replace(/<nav[\s\S]*?<\/nav>/gi, "");
    html = html.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    html = html.replace(/<header[\s\S]*?<\/header>/gi, "");

    // Extract text from remaining HTML
    let text = html
      .replace(/<[^>]+>/g, " ")        // strip tags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#?\w+;/g, " ")        // other entities
      .replace(/\s+/g, " ")            // collapse whitespace
      .trim();

    // Take the most useful chunk (skip first 200 chars which is usually nav/header text)
    if (text.length > 200) {
      text = text.substring(200);
    }

    return text.substring(0, 3000) || null;
  } catch {
    return null;
  }
}

// ─── Store knowledge ─────────────────────────────────────────────────────

async function storeKnowledge(
  query: string,
  answer: string,
  source: string,
  city: string
): Promise<void> {
  const db = getDb();
  const key = normalizeQueryKey(query);

  // TTL: 30 days for general knowledge, refreshed on hit
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  try {
    await db.execute(
      sql`INSERT INTO learned_knowledge (query_key, original_query, answer, source, city, hit_count, expires_at)
          VALUES (${key}, ${query}, ${answer}, ${source}, ${city}, 0, ${expiresAt})
          ON CONFLICT (query_key, city) DO UPDATE SET
            answer = ${answer},
            source = ${source},
            hit_count = learned_knowledge.hit_count,
            expires_at = ${expiresAt},
            updated_at = NOW()`
    );
  } catch (error) {
    logger.warn({ error: (error as any)?.message }, "Failed to store knowledge (non-critical)");
  }
}

// ─── Web search (Brave Search API — free tier: 2000 queries/month) ──────

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

async function webSearch(query: string): Promise<SearchResult[]> {
  const config = getConfig();
  const apiKey = (config as any).BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    // Fallback: use Google Custom Search or just return null
    return googleFallbackSearch(query);
  }

  try {
    const params = new URLSearchParams({
      q: query,
      count: "5",
      search_lang: "es",
      country: "MX",
    });

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    const results = data.web?.results || [];

    return results.slice(0, 5).map((r: any) => ({
      title: r.title || "",
      snippet: r.description || "",
      url: r.url || "",
    }));
  } catch {
    return [];
  }
}

// Google fallback using programmable search (if configured)
async function googleFallbackSearch(query: string): Promise<SearchResult[]> {
  const config = getConfig();
  const apiKey = (config as any).GOOGLE_SEARCH_API_KEY;
  const cx = (config as any).GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    // Last resort: DuckDuckGo instant answers (no API key needed)
    return duckDuckGoSearch(query);
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      num: "5",
      gl: "mx",
      hl: "es",
    });

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    return (data.items || []).slice(0, 5).map((r: any) => ({
      title: r.title || "",
      snippet: r.snippet || "",
      url: r.link || "",
    }));
  } catch {
    return [];
  }
}

// DuckDuckGo HTML version — reliable, no API key needed
async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const html = await response.text();
    const results: SearchResult[] = [];

    // Parse DDG HTML results: <a class="result__a"> + <a class="result__snippet">
    const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null && results.length < 5) {
      // Extract real URL from DDG redirect
      let resultUrl = match[1];
      const uddgMatch = resultUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        resultUrl = decodeURIComponent(uddgMatch[1]);
      }

      results.push({
        title: match[2].replace(/<[^>]+>/g, "").trim(),
        snippet: match[3].replace(/<[^>]+>/g, "").trim(),
        url: resultUrl,
      });
    }

    return results;
  } catch {
    return [];
  }
}
