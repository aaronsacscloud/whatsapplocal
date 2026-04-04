import { sendTextMessage } from "../whatsapp/sender.js";
import { isOnboardingComplete } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import {
  ONBOARDING_WELCOME_MESSAGE,
  ONBOARDING_WELCOME_MESSAGE_EN,
  ONBOARDING_WELCOME_BACK_MESSAGE,
  ONBOARDING_WELCOME_BACK_MESSAGE_EN,
} from "../llm/prompts.js";

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
    // New user — start the onboarding flow
    const message = isEnglish
      ? ONBOARDING_WELCOME_MESSAGE_EN
      : ONBOARDING_WELCOME_MESSAGE;
    await sendTextMessage(from, message);
  }
}
