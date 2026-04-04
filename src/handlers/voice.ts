import { sendTextMessage } from "../whatsapp/sender.js";
import { getLogger } from "../utils/logger.js";

const VOICE_FALLBACK_MESSAGE =
  "Por ahora solo proceso mensajes de texto e imágenes. ¿Puedes escribir tu pregunta? Así te puedo ayudar mejor.";

/**
 * Handle incoming voice/audio messages.
 *
 * MVP: Sends a polite fallback asking the user to type their message.
 * Future: Could integrate speech-to-text transcription (Whisper, etc.)
 * and then route the transcribed text through the normal message flow.
 */
export async function handleVoice(
  from: string,
  _mediaId: string
): Promise<void> {
  const logger = getLogger();

  logger.info({ from: from.slice(-4) }, "Voice message received (unsupported, sending fallback)");

  await sendTextMessage(from, VOICE_FALLBACK_MESSAGE);
}
