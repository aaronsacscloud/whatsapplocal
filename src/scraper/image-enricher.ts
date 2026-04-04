import { getLLMClient } from "../llm/client.js";
import { getLogger } from "../utils/logger.js";
import type { NewEvent } from "../db/schema.js";

const logger = getLogger();

const IMAGE_ANALYSIS_PROMPT = `Analiza esta imagen de una publicación de redes sociales de un negocio en San Miguel de Allende, México.

Extrae TODA la información que puedas ver:
- Nombre del evento
- Fecha y hora (si aparece)
- Lugar/venue
- Dirección
- Precio/cover
- Artistas/performers
- Descripción del evento
- Categoría (music, food, nightlife, culture, sports, wellness, tour, class, adventure, wine, popup, other)

Responde SOLO con JSON:
{
  "hasEventInfo": boolean,
  "title": string | null,
  "date": string | null,
  "time": string | null,
  "venue": string | null,
  "address": string | null,
  "price": string | null,
  "performers": string | null,
  "description": string | null,
  "category": string | null
}`;

interface ImageAnalysis {
  hasEventInfo: boolean;
  title: string | null;
  date: string | null;
  time: string | null;
  venue: string | null;
  address: string | null;
  price: string | null;
  performers: string | null;
  description: string | null;
  category: string | null;
}

/**
 * Analyze an image URL using Claude Vision to extract event information.
 * Used during scraping to get more context from Facebook post images/flyers.
 */
export async function analyzeEventImage(
  imageUrl: string
): Promise<ImageAnalysis | null> {
  const client = getLLMClient();

  try {
    // Download image and convert to base64
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Only process images (not videos, etc.)
    if (!contentType.startsWith("image/")) return null;

    // Skip tiny images (likely icons/avatars)
    if (buffer.byteLength < 5000) return null;

    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001", // Use Haiku for cost efficiency during scraping
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: contentType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: base64,
              },
            },
            { type: "text", text: IMAGE_ANALYSIS_PROMPT },
          ],
        },
      ],
    });

    const text =
      result.content[0].type === "text" ? result.content[0].text : "";
    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (error) {
    logger.debug({ error, imageUrl: imageUrl.substring(0, 60) }, "Image analysis failed");
    return null;
  }
}

/**
 * Enrich a scraped event with information extracted from its image.
 * Merges image data into the event, preferring image data when the
 * text-based extraction is missing fields.
 */
export function enrichEventWithImageData(
  event: NewEvent,
  imageData: ImageAnalysis
): NewEvent {
  if (!imageData.hasEventInfo) return event;

  // Only override empty/missing fields
  if (imageData.title && (!event.title || event.title === "...")) {
    event.title = imageData.title;
  }

  if (imageData.venue && !event.venueName) {
    event.venueName = imageData.venue;
  }

  if (imageData.address && !event.venueAddress) {
    event.venueAddress = imageData.address;
  }

  if (imageData.category && event.category === "other") {
    event.category = imageData.category as any;
  }

  // Build richer description
  const extras: string[] = [];
  if (imageData.performers) extras.push(`Artistas: ${imageData.performers}`);
  if (imageData.price) extras.push(`Precio: ${imageData.price}`);
  if (imageData.time) extras.push(`Hora: ${imageData.time}`);

  if (extras.length > 0) {
    const extraText = extras.join(". ");
    event.description = event.description
      ? `${event.description}. ${extraText}`
      : extraText;
  }

  // Parse date from image if event has no date
  if (imageData.date && !event.eventDate) {
    try {
      const parsed = new Date(imageData.date);
      if (!isNaN(parsed.getTime())) {
        event.eventDate = parsed;
      }
    } catch {
      // Skip unparseable dates
    }
  }

  // Boost confidence since we have image confirmation
  if (event.confidence && event.confidence < 0.9) {
    event.confidence = Math.min(0.95, (event.confidence || 0.5) + 0.15);
  }

  return event;
}
