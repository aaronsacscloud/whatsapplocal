import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userAlerts } from "../db/schema.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import type { ClassificationResult } from "../llm/classifier.js";

// Map common query terms to valid categories
const CATEGORY_MAP: Record<string, string> = {
  jazz: "music",
  musica: "music",
  música: "music",
  "musica en vivo": "music",
  "live music": "music",
  rock: "music",
  concierto: "music",
  conciertos: "music",
  concert: "music",
  comida: "food",
  gastronomia: "food",
  restaurantes: "food",
  food: "food",
  restaurant: "food",
  restaurants: "food",
  fiesta: "nightlife",
  fiestas: "nightlife",
  nightlife: "nightlife",
  "vida nocturna": "nightlife",
  party: "nightlife",
  arte: "culture",
  cultura: "culture",
  culture: "culture",
  art: "culture",
  museo: "culture",
  galeria: "culture",
  deportes: "sports",
  sports: "sports",
  popup: "popup",
  "pop-up": "popup",
  yoga: "wellness",
  spa: "wellness",
  temazcal: "wellness",
  wellness: "wellness",
  bienestar: "wellness",
  tour: "tour",
  tours: "tour",
  recorrido: "tour",
  recorridos: "tour",
  clase: "class",
  clases: "class",
  taller: "class",
  talleres: "class",
  class: "class",
  workshop: "class",
  aventura: "adventure",
  adventure: "adventure",
  globo: "adventure",
  cabalgata: "adventure",
  vino: "wine",
  mezcal: "wine",
  cata: "wine",
  wine: "wine",
};

function resolveCategory(
  classification: ClassificationResult
): { category: string; displayName: string } | null {
  // Try the classifier's category first
  if (classification.category) {
    return {
      category: classification.category,
      displayName: classification.category,
    };
  }

  // Try to extract from query
  const query = (classification.query || "").toLowerCase().trim();
  for (const [term, cat] of Object.entries(CATEGORY_MAP)) {
    if (query.includes(term)) {
      return { category: cat, displayName: term };
    }
  }

  return null;
}

export async function handleSetAlert(
  from: string,
  classification: ClassificationResult,
  language: "es" | "en" = "es"
): Promise<string> {
  const logger = getLogger();
  const db = getDb();
  const phoneHash = hashPhone(from);
  const isEn = language === "en";

  const resolved = resolveCategory(classification);

  if (!resolved) {
    const msg = isEn
      ? "What type of events would you like alerts for? For example: music, food, culture, wellness, nightlife..."
      : "De que tipo de eventos quieres recibir alertas? Por ejemplo: musica, comida, cultura, bienestar, vida nocturna...";
    await sendTextMessage(from, msg);
    return msg;
  }

  const { category, displayName } = resolved;

  // Check if alert already exists
  const existing = await db
    .select()
    .from(userAlerts)
    .where(
      and(
        eq(userAlerts.phoneHash, phoneHash),
        eq(userAlerts.category, category),
        eq(userAlerts.active, true)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const msg = isEn
      ? `You already have alerts enabled for ${displayName}. I'll let you know when new events come up!`
      : `Ya tienes alertas activas para ${displayName}. Te aviso cuando detecte nuevos eventos!`;
    await sendTextMessage(from, msg);
    return msg;
  }

  // Save the alert
  await db.insert(userAlerts).values({
    phoneHash,
    category,
    query: classification.query,
  });

  logger.info({ phoneHash: phoneHash.slice(0, 8), category }, "Alert created");

  const msg = isEn
    ? `Done! I'll notify you when I detect ${displayName} events.`
    : `Listo! Te aviso cuando detecte eventos de ${displayName}.`;
  await sendTextMessage(from, msg);
  return msg;
}
