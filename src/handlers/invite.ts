import { sendTextMessage } from "../whatsapp/sender.js";
import { trackQuery } from "../analytics/tracker.js";
import { hashPhone } from "../utils/hash.js";

const INVITE_MESSAGE_ES = `Descubre que hacer en San Miguel de Allende!

Yo uso este bot de WhatsApp para encontrar eventos, restaurantes y actividades.

Escribele por aqui:
wa.me/12058920417?text=Hola

Es gratis y responde al instante!`;

const INVITE_MESSAGE_EN = `Discover what to do in San Miguel de Allende!

I use this WhatsApp bot to find events, restaurants and activities.

Message it here:
wa.me/12058920417?text=Hola

It's free and replies instantly!`;

const INVITE_PROMPT_ES = `Aqui tienes un mensaje para compartir con tus amigos. Solo reenvialo:`;
const INVITE_PROMPT_EN = `Here's a message to share with your friends. Just forward it:`;

export async function handleInvite(
  from: string,
  language: "es" | "en" = "es"
): Promise<string> {
  const isEnglish = language === "en";
  const phoneHash = hashPhone(from);

  const prompt = isEnglish ? INVITE_PROMPT_EN : INVITE_PROMPT_ES;
  const inviteMsg = isEnglish ? INVITE_MESSAGE_EN : INVITE_MESSAGE_ES;

  // Send the prompt first, then the shareable message
  await sendTextMessage(from, prompt);
  await sendTextMessage(from, inviteMsg);

  // Track the invite in analytics
  trackQuery({
    phoneHash,
    intent: "invite",
    query: "invite friend",
  });

  return prompt;
}

/**
 * Get the sharing suggestion message to send after onboarding completion.
 */
export function getShareSuggestion(language: "es" | "en"): string {
  return language === "en"
    ? `Know someone who'd find this bot useful? Forward the message above!`
    : `Conoces a alguien que le serviria este bot? Reenvia el mensaje de arriba!`;
}
