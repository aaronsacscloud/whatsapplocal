import { sendTextMessage, sendInteractiveButtons } from "../whatsapp/sender.js";
import { isOnboardingComplete, getUserName, findUserByPhone, updatePreferences } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { searchEvents } from "../events/repository.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { saveMessage } from "../conversations/repository.js";

/**
 * Get today's date range in SMA timezone (UTC-6).
 */
function getTodayRangeSMA(): { todayStart: Date; todayEnd: Date } {
  const now = new Date();
  const sma = new Date(now.getTime() - 6 * 3600000);
  const todayStart = new Date(
    Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate(), 6, 0, 0)
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { todayStart, todayEnd };
}

/**
 * Handle the onboarding entry point.
 * NEW users: Step 1 — ask for name.
 * RETURNING users: personalized greeting + ask what day they want events for.
 */
export async function handleOnboarding(
  from: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const phoneHash = hashPhone(from);
  const completed = await isOnboardingComplete(phoneHash);

  if (completed) {
    // Returning user
    const name = await getUserName(phoneHash);
    const greeting = name
      ? `Hola ${name}! Que bueno verte de nuevo.`
      : `Hola de nuevo!`;

    const msg = `${greeting} Que te gustaria saber?`;
    await sendTextMessage(from, msg);

    try {
      const buttons = [
        { id: "onboard_today", title: "Eventos de hoy" },
        { id: "onboard_tomorrow", title: "Eventos de manana" },
        { id: "onboard_weekend", title: "Este fin de semana" },
      ];
      await sendInteractiveButtons(from, "Elige una opcion o preguntame lo que quieras", buttons);
    } catch {
      // Buttons are optional
    }

    await saveMessage(phoneHash, "assistant", msg, "onboarding");
  } else {
    // New user — Step 1: ask for name
    const msg = `Hola! Soy tu guia local de San Miguel de Allende. Voy a ayudarte a descubrir los mejores eventos, restaurantes y experiencias de la ciudad.\n\nComo te llamas?`;
    await sendTextMessage(from, msg);
    await saveMessage(phoneHash, "assistant", msg, "onboarding");
  }
}
