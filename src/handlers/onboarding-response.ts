import { sendTextMessage, sendInteractiveButtons } from "../whatsapp/sender.js";
import { updatePreferences, getUserName } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import { saveMessage } from "../conversations/repository.js";

/**
 * Detect what onboarding step the user is responding to.
 */
export function detectOnboardingStep(
  lastBotMessage: string | null
): "name_question" | null {
  if (!lastBotMessage) return null;
  const lower = lastBotMessage.toLowerCase();

  if (lower.includes("como te llamas")) {
    return "name_question";
  }

  return null;
}

/**
 * Handle onboarding response (name reply).
 * After receiving name: greet, mark complete, ask what they want to see.
 */
export async function handleOnboardingResponse(
  from: string,
  body: string,
  lastBotMessage: string | null,
  language: "es" | "en" = "es"
): Promise<boolean> {
  const step = detectOnboardingStep(lastBotMessage);
  if (step !== "name_question") return false;

  const logger = getLogger();
  const trimmed = body.trim();
  const phoneHash = hashPhone(from);

  // Validate: name should be 1-50 chars and not purely numeric
  if (trimmed.length === 0 || trimmed.length > 50 || /^\d+$/.test(trimmed)) {
    return false;
  }

  // Extract first word as name, capitalize
  const name = trimmed
    .split(/\s+/)[0]
    .replace(/^./, (c) => c.toUpperCase());

  // Save name and mark onboarding complete
  await updatePreferences(phoneHash, {
    name,
    interests: ["music", "food", "culture", "nightlife", "wellness", "adventure", "wine"],
    onboardingComplete: true,
  });

  logger.info({ phoneHash: phoneHash.slice(-8), name }, "Onboarding complete");

  // Greet and ask what they want to see
  const msg = `Mucho gusto ${name}! Voy a ser tu guia personal en San Miguel de Allende. Cada vez que platiquemos voy aprendiendo mas de lo que te gusta para darte mejores recomendaciones.\n\nQue te gustaria ver?`;
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
  return true;
}
