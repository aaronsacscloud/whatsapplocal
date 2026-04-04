import { getLLMClient } from "./client.js";
import { CLASSIFIER_SYSTEM } from "./prompts.js";
import { getLogger } from "../utils/logger.js";

export interface ClassificationResult {
  intent:
    | "event_query"
    | "venue_query"
    | "local_info"
    | "forward_content"
    | "onboarding"
    | "feedback"
    | "invite"
    | "set_alert"
    | "save_favorite"
    | "list_favorites"
    | "remove_favorite"
    | "stop_digest"
    | "unknown";
  city: string | null;
  neighborhood: string | null;
  date: string | null;
  category: string | null;
  query: string | null;
  language: "es" | "en";
  budget: "free" | "low" | "high" | null;
}

const FALLBACK_RESULT: ClassificationResult = {
  intent: "unknown",
  city: null,
  neighborhood: null,
  date: null,
  category: null,
  query: null,
  language: "es",
  budget: null,
};

/**
 * Classify user intent with conversation context.
 * The conversation history helps understand follow-up messages like
 * "dime más", "el primero", "y mañana?" which only make sense in context.
 */
export async function classifyIntent(
  message: string,
  conversationContext?: Array<{ role: string; content: string }>
): Promise<ClassificationResult> {
  const logger = getLogger();
  const client = getLLMClient();

  try {
    // Build messages array with context
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // Include last 3 conversation turns for context (keeps tokens low)
    if (conversationContext && conversationContext.length > 0) {
      const recentContext = conversationContext.slice(-6); // last 3 exchanges
      for (const msg of recentContext) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content.substring(0, 200), // Truncate to save tokens
        });
      }
    }

    // Add the current message
    messages.push({ role: "user", content: message });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: CLASSIFIER_SYSTEM,
      messages,
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown code blocks if present
    const text = rawText
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();

    const parsed = JSON.parse(text);

    if (!parsed.intent) {
      logger.warn({ parsed }, "Classifier returned invalid JSON: no intent");
      return FALLBACK_RESULT;
    }

    // Normalize budget value
    let budget: "free" | "low" | "high" | null = null;
    if (
      parsed.budget === "free" ||
      parsed.budget === "low" ||
      parsed.budget === "high"
    ) {
      budget = parsed.budget;
    }

    return {
      intent: parsed.intent,
      city: parsed.city ?? null,
      neighborhood: parsed.neighborhood ?? null,
      date: parsed.date ?? null,
      category: parsed.category ?? null,
      query: parsed.query ?? null,
      language: parsed.language === "en" ? "en" : "es",
      budget,
    };
  } catch (error) {
    logger.error({ error, message }, "Intent classification failed");
    return FALLBACK_RESULT;
  }
}
