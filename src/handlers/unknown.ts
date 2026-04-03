import { sendTextMessage } from "../whatsapp/sender.js";
import { FALLBACK_MESSAGE } from "../llm/prompts.js";

export async function handleUnknown(from: string): Promise<void> {
  await sendTextMessage(from, FALLBACK_MESSAGE);
}
