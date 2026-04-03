import { sendTextMessage } from "../whatsapp/sender.js";
import { ONBOARDING_MESSAGE } from "../llm/prompts.js";

export async function handleOnboarding(from: string): Promise<void> {
  await sendTextMessage(from, ONBOARDING_MESSAGE);
}
