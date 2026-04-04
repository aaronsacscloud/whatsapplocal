import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";

export async function handleStopDigest(
  from: string,
  language: "es" | "en" = "es"
): Promise<string> {
  const logger = getLogger();
  const db = getDb();
  const phoneHash = hashPhone(from);
  const isEn = language === "en";

  try {
    await db
      .update(users)
      .set({ digestEnabled: false })
      .where(eq(users.phoneHash, phoneHash));

    logger.info(
      { phoneHash: phoneHash.slice(0, 8) },
      "User opted out of daily digest"
    );

    const msg = isEn
      ? "Done! You won't receive daily digest messages anymore. You can still ask me about events anytime!"
      : "Listo! Ya no recibiras el resumen diario. Puedes seguir preguntandome sobre eventos cuando quieras!";
    await sendTextMessage(from, msg);
    return msg;
  } catch (error) {
    logger.error({ error }, "Failed to opt out of digest");
    const msg = isEn
      ? "Something went wrong. Try again later."
      : "Algo salio mal. Intenta de nuevo mas tarde.";
    await sendTextMessage(from, msg);
    return msg;
  }
}
