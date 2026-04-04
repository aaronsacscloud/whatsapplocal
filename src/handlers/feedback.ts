import { sendTextMessage } from "../whatsapp/sender.js";
import {
  FEEDBACK_THANKS_MESSAGE,
  FEEDBACK_THANKS_MESSAGE_EN,
} from "../llm/prompts.js";

export async function handleFeedback(
  from: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const message = language === "en"
    ? FEEDBACK_THANKS_MESSAGE_EN
    : FEEDBACK_THANKS_MESSAGE;
  await sendTextMessage(from, message);
}
