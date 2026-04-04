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
    | "unknown";
  city: string | null;
  neighborhood: string | null;
  date: string | null;
  category: string | null;
  query: string | null;
  language: "es" | "en";
}

const FALLBACK_RESULT: ClassificationResult = {
  intent: "unknown",
  city: null,
  neighborhood: null,
  date: null,
  category: null,
  query: null,
  language: "es",
};

export async function classifyIntent(
  message: string
): Promise<ClassificationResult> {
  const logger = getLogger();
  const client = getLLMClient();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: "user", content: message }],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown code blocks if present (```json ... ```)
    const text = rawText.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

    const parsed = JSON.parse(text);

    if (!parsed.intent) {
      logger.warn({ parsed }, "Classifier returned invalid JSON: no intent");
      return FALLBACK_RESULT;
    }

    return {
      intent: parsed.intent,
      city: parsed.city ?? null,
      neighborhood: parsed.neighborhood ?? null,
      date: parsed.date ?? null,
      category: parsed.category ?? null,
      query: parsed.query ?? null,
      language: parsed.language === "en" ? "en" : "es",
    };
  } catch (error) {
    logger.error({ error, message }, "Intent classification failed");
    return FALLBACK_RESULT;
  }
}
