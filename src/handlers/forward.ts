import { processForwardedContent } from "../events/forward.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { incrementForwardCount } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import {
  FORWARD_SUCCESS_MESSAGE,
  FORWARD_SUCCESS_MESSAGE_EN,
  FORWARD_FAILURE_MESSAGE,
  FORWARD_FAILURE_MESSAGE_EN,
  FORWARD_DUPLICATE_MESSAGE,
  FORWARD_DUPLICATE_MESSAGE_EN,
} from "../llm/prompts.js";

export async function handleForward(
  from: string,
  body: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const result = await processForwardedContent(body);
  const isEnglish = language === "en";

  if (result.success) {
    const message = isEnglish
      ? FORWARD_SUCCESS_MESSAGE_EN
      : FORWARD_SUCCESS_MESSAGE;
    await sendTextMessage(from, message);
    await incrementForwardCount(hashPhone(from));
  } else if (result.reason === "duplicate") {
    const message = isEnglish
      ? FORWARD_DUPLICATE_MESSAGE_EN
      : FORWARD_DUPLICATE_MESSAGE;
    await sendTextMessage(from, message);
  } else {
    const message = isEnglish
      ? FORWARD_FAILURE_MESSAGE_EN
      : FORWARD_FAILURE_MESSAGE;
    await sendTextMessage(from, message);
  }
}
