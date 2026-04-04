import { sendTextMessage, sendInteractiveButtons } from "../whatsapp/sender.js";
import { isOnboardingComplete } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import {
  ONBOARDING_WELCOME_BACK_MESSAGE,
  ONBOARDING_WELCOME_BACK_MESSAGE_EN,
} from "../llm/prompts.js";

// Interactive button versions of the welcome message (body text only, buttons sent separately)
const ONBOARDING_WELCOME_BODY = `Hola! Soy tu guia local de San Miguel de Allende

Para darte las mejores recomendaciones, cuentame:

Eres turista o vives aqui?`;

const ONBOARDING_WELCOME_BODY_EN = `Hi! I'm your local guide for San Miguel de Allende

To give you the best recommendations, tell me:

Are you a tourist or do you live here?`;

const ONBOARDING_BUTTONS_ES: Array<{ id: string; title: string }> = [
  { id: "onboarding_tourist", title: "Turista de visita" },
  { id: "onboarding_local", title: "Vivo aqui" },
  { id: "onboarding_moving", title: "Pensando en mudarme" },
];

const ONBOARDING_BUTTONS_EN: Array<{ id: string; title: string }> = [
  { id: "onboarding_tourist", title: "Visiting as tourist" },
  { id: "onboarding_local", title: "I live here" },
  { id: "onboarding_moving", title: "Thinking of moving" },
];

export async function handleOnboarding(
  from: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const phoneHash = hashPhone(from);
  const completed = await isOnboardingComplete(phoneHash);

  const isEnglish = language === "en";

  if (completed) {
    // User has completed onboarding before — send a shorter welcome back
    const message = isEnglish
      ? ONBOARDING_WELCOME_BACK_MESSAGE_EN
      : ONBOARDING_WELCOME_BACK_MESSAGE;
    await sendTextMessage(from, message);
  } else {
    // New user — start the onboarding flow with interactive buttons
    const body = isEnglish ? ONBOARDING_WELCOME_BODY_EN : ONBOARDING_WELCOME_BODY;
    const buttons = isEnglish ? ONBOARDING_BUTTONS_EN : ONBOARDING_BUTTONS_ES;
    await sendInteractiveButtons(from, body, buttons);
  }
}
