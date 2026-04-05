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

export async function learnFromWeb(
  userQuery: string,
  city: string,
  language: "es" | "en" = "es"
): Promise<string | null> {
  const config = getConfig();

  // Step 1: Search the web
  const searchQuery = `${userQuery} ${city}`;
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
      // Use snippet as fallback
      pageContents.push(`### ${result.title}\nURL: ${result.url}\n${result.snippet}`);
    }
  }

  // Build context: scraped pages + search snippets for the rest
  const contextParts = [...pageContents];
  for (const result of searchResults.slice(3, 5)) {
    contextParts.push(`### ${result.title}\n${result.snippet}\n${result.url}`);
  }

  const fullContext = contextParts.join("\n\n");
  if (fullContext.length < 50) return null;

  // Step 3: Use LLM to synthesize a detailed answer
  const client = getLLMClient();
  const isEn = language === "en";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: isEn
        ? `You are a local expert for ${city}. Answer the user's question using ONLY the web content provided below. Be specific: include names, addresses, phone numbers, prices, hours, and any concrete details found. Format for WhatsApp (plain text, max 800 chars). If the content doesn't answer the question, respond with "NO_USEFUL_INFO".`
        : `Eres un experto local de ${city}. Responde la pregunta del usuario usando SOLO el contenido web proporcionado abajo. Se especifico: incluye nombres, direcciones, telefonos, precios, horarios y cualquier detalle concreto. Formatea para WhatsApp (texto plano, max 800 chars). Si el contenido no responde la pregunta, responde "NO_USEFUL_INFO".`,
      messages: [
        {
          role: "user",
          content: `Pregunta: "${userQuery}"\n\nContenido de paginas web:\n${fullContext.substring(0, 8000)}`,
        },
      ],
    });

    const answer = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    if (!answer || answer === "NO_USEFUL_INFO" || answer.length < 20) {
      return null;
    }

    // Step 4: Store in knowledge cache for future queries
    await storeKnowledge(userQuery, answer, searchResults[0]?.url || "web", city);

    logger.info({ query: userQuery, answerLen: answer.length, pages: pageContents.length }, "Learned from web (deep scrape)");
    return answer;
  } catch (error) {
    logger.error({ error }, "LLM synthesis failed during learning");
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

// DuckDuckGo as final fallback (no API key needed, limited)
async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({ q: query, format: "json", no_html: "1" });
    const response = await fetch(`https://api.duckduckgo.com/?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    const results: SearchResult[] = [];

    // Abstract (main result)
    if (data.Abstract && data.AbstractURL) {
      results.push({ title: data.Heading || query, snippet: data.Abstract, url: data.AbstractURL });
    }

    // Related topics
    for (const topic of (data.RelatedTopics || []).slice(0, 4)) {
      if (topic.Text && topic.FirstURL) {
        results.push({ title: topic.Text.substring(0, 60), snippet: topic.Text, url: topic.FirstURL });
      }
    }

    return results;
  } catch {
    return [];
  }
}
