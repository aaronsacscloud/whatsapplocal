import { sendTextMessage } from "../whatsapp/sender.js";
import {
  FALLBACK_MESSAGE,
  FALLBACK_MESSAGE_EN,
} from "../llm/prompts.js";

export async function handleUnknown(
  from: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const message = language === "en"
    ? FALLBACK_MESSAGE_EN
    : FALLBACK_MESSAGE;
  await sendTextMessage(from, message);
}
