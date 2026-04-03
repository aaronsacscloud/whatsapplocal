import { sendTextMessage } from "../whatsapp/sender.js";
import { FEEDBACK_THANKS_MESSAGE } from "../llm/prompts.js";

export async function handleFeedback(from: string): Promise<void> {
  await sendTextMessage(from, FEEDBACK_THANKS_MESSAGE);
}
