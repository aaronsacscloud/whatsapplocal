import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { favorites, events } from "../db/schema.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import { getRecentMessages } from "../conversations/repository.js";

// SMA timezone offset: UTC-6 (CST)
const SMA_TZ_OFFSET = -6;

/**
 * Try to find the last event mentioned in recent conversation context.
 * Looks for event IDs or event titles in the bot's last messages.
 */
async function findLastMentionedEvent(
  phoneHash: string
): Promise<{ id: string; title: string } | null> {
  const db = getDb();
  const logger = getLogger();

  try {
    // Get the most recent bot messages that likely contain event recommendations
    const recentMessages = await getRecentMessages(phoneHash, 10);
    const botMessages = recentMessages
      .filter((m) => m.role === "assistant")
      .reverse(); // Most recent first

    // Look through recent bot messages for event titles
    for (const msg of botMessages) {
      // Extract event titles from the formatted cards (lines starting with emoji + *title*)
      const titleMatches = msg.content.match(/\*([^*]+)\*/g);
      if (titleMatches && titleMatches.length > 0) {
        // Get the first mentioned event title (most recently displayed)
        const title = titleMatches[0].replace(/\*/g, "").trim();

        // Try to find this event in the database
        const result = await db
          .select({ id: events.id, title: events.title })
          .from(events)
          .where(eq(events.title, title))
          .limit(1);

        if (result.length > 0) {
          return { id: result[0].id, title: result[0].title };
        }

        // Try a fuzzy match with ILIKE
        const fuzzyResult = await db.execute(
          sql.raw(
            `SELECT id, title FROM events WHERE title ILIKE '%${title.replace(/'/g, "''")}%' LIMIT 1`
          )
        );
        const rows = fuzzyResult as unknown as Array<{
          id: string;
          title: string;
        }>;
        if (rows.length > 0) {
          return { id: rows[0].id, title: rows[0].title };
        }
      }
    }
  } catch (error) {
    logger.error({ error }, "Failed to find last mentioned event");
  }

  return null;
}

export async function handleSaveFavorite(
  from: string,
  language: "es" | "en" = "es"
): Promise<string> {
  const logger = getLogger();
  const db = getDb();
  const phoneHash = hashPhone(from);
  const isEn = language === "en";

  // Find the last event from conversation context
  const lastEvent = await findLastMentionedEvent(phoneHash);

  if (!lastEvent) {
    const msg = isEn
      ? "I couldn't find a recent event to save. Ask me about events first, then say 'save it'!"
      : "No encontre un evento reciente para guardar. Preguntame sobre eventos primero, y luego dime 'guardalo'!";
    await sendTextMessage(from, msg);
    return msg;
  }

  try {
    // Check if already saved
    const existing = await db
      .select()
      .from(favorites)
      .where(
        and(
          eq(favorites.phoneHash, phoneHash),
          eq(favorites.eventId, lastEvent.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const msg = isEn
        ? `"${lastEvent.title}" is already in your favorites!`
        : `"${lastEvent.title}" ya esta en tus favoritos!`;
      await sendTextMessage(from, msg);
      return msg;
    }

    await db.insert(favorites).values({
      phoneHash,
      eventId: lastEvent.id,
    });

    logger.info(
      { phoneHash: phoneHash.slice(0, 8), eventId: lastEvent.id },
      "Favorite saved"
    );

    const msg = isEn
      ? `Saved! "${lastEvent.title}" added to your favorites. Say "my favorites" to see them all.`
      : `Guardado! "${lastEvent.title}" agregado a tus favoritos. Di "mis favoritos" para verlos todos.`;
    await sendTextMessage(from, msg);
    return msg;
  } catch (error) {
    logger.error({ error }, "Failed to save favorite");
    const msg = isEn
      ? "Something went wrong saving that event. Try again!"
      : "Algo salio mal al guardar ese evento. Intenta de nuevo!";
    await sendTextMessage(from, msg);
    return msg;
  }
}

export async function handleListFavorites(
  from: string,
  language: "es" | "en" = "es"
): Promise<string> {
  const logger = getLogger();
  const db = getDb();
  const phoneHash = hashPhone(from);
  const isEn = language === "en";

  try {
    const result = await db.execute(
      sql.raw(
        `SELECT f.id as fav_id, e.id, e.title, e.venue_name, e.event_date, e.category, e.description, e.source_url
         FROM favorites f
         JOIN events e ON f.event_id = e.id
         WHERE f.phone_hash = '${phoneHash.replace(/'/g, "''")}'
         ORDER BY f.created_at DESC
         LIMIT 10`
      )
    );

    const rows = result as unknown as Array<{
      fav_id: string;
      id: string;
      title: string;
      venue_name: string | null;
      event_date: string | null;
      category: string | null;
      description: string | null;
      source_url: string | null;
    }>;

    if (rows.length === 0) {
      const msg = isEn
        ? "You don't have any saved events yet. When I show you events, say 'save it' to add to your favorites!"
        : "Aun no tienes eventos guardados. Cuando te muestre eventos, di 'guardalo' para agregarlo a tus favoritos!";
      await sendTextMessage(from, msg);
      return msg;
    }

    const header = isEn
      ? `Your saved events (${rows.length}):`
      : `Tus eventos guardados (${rows.length}):`;

    const eventLines = rows.map((e, i) => {
      const parts: string[] = [`${i + 1}. *${e.title}*`];
      if (e.venue_name) parts.push(`   ${e.venue_name}`);
      if (e.event_date) {
        const d = new Date(e.event_date);
        const smaDate = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
        const dateStr = smaDate.toLocaleDateString(isEn ? "en-US" : "es-MX", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        });
        parts.push(`   ${dateStr}`);
      }
      if (e.source_url) parts.push(`   ${e.source_url}`);
      return parts.join("\n");
    });

    const footer = isEn
      ? '\nSay "remove favorite" to remove one.'
      : '\nDi "quitar favorito" para eliminar uno.';

    const msg = `${header}\n\n${eventLines.join("\n\n")}${footer}`;
    await sendTextMessage(from, msg);
    return msg;
  } catch (error) {
    logger.error({ error }, "Failed to list favorites");
    const msg = isEn
      ? "Something went wrong loading your favorites."
      : "Algo salio mal al cargar tus favoritos.";
    await sendTextMessage(from, msg);
    return msg;
  }
}

export async function handleRemoveFavorite(
  from: string,
  language: "es" | "en" = "es"
): Promise<string> {
  const logger = getLogger();
  const db = getDb();
  const phoneHash = hashPhone(from);
  const isEn = language === "en";

  try {
    // Remove the most recently saved favorite
    const result = await db.execute(
      sql.raw(
        `DELETE FROM favorites
         WHERE id = (
           SELECT id FROM favorites
           WHERE phone_hash = '${phoneHash.replace(/'/g, "''")}'
           ORDER BY created_at DESC
           LIMIT 1
         )
         RETURNING event_id`
      )
    );

    const rows = result as unknown as Array<{ event_id: string }>;

    if (rows.length === 0) {
      const msg = isEn
        ? "You don't have any favorites to remove."
        : "No tienes favoritos para eliminar.";
      await sendTextMessage(from, msg);
      return msg;
    }

    logger.info(
      { phoneHash: phoneHash.slice(0, 8), eventId: rows[0].event_id },
      "Favorite removed"
    );

    const msg = isEn
      ? 'Most recent favorite removed. Say "my favorites" to see the rest.'
      : 'Ultimo favorito eliminado. Di "mis favoritos" para ver los demas.';
    await sendTextMessage(from, msg);
    return msg;
  } catch (error) {
    logger.error({ error }, "Failed to remove favorite");
    const msg = isEn
      ? "Something went wrong removing your favorite."
      : "Algo salio mal al eliminar tu favorito.";
    await sendTextMessage(from, msg);
    return msg;
  }
}
