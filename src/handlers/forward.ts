import { processForwardedContent } from "../events/forward.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { incrementForwardCount } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import {
  FORWARD_SUCCESS_MESSAGE,
  FORWARD_FAILURE_MESSAGE,
} from "../llm/prompts.js";

export async function handleForward(
  from: string,
  body: string
): Promise<void> {
  const result = await processForwardedContent(body);

  if (result.success) {
    await sendTextMessage(from, FORWARD_SUCCESS_MESSAGE);
    await incrementForwardCount(hashPhone(from));
  } else if (result.reason === "duplicate") {
    await sendTextMessage(
      from,
      "Ese evento ya lo tengo registrado. Gracias igual!"
    );
  } else {
    await sendTextMessage(from, FORWARD_FAILURE_MESSAGE);
  }
}
