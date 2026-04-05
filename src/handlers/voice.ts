import { sendTextMessage } from "../whatsapp/sender.js";
import { downloadWhatsAppMedia } from "../whatsapp/media.js";
import { transcribeAudio } from "../llm/transcriber.js";
import { getLogger } from "../utils/logger.js";

/**
 * Handle incoming voice/audio messages.
 * Downloads the audio, transcribes it via Whisper (Groq or OpenAI),
 * and returns the transcribed text so the router can process it as a normal message.
 *
 * Returns the transcribed text, or null if transcription failed.
 */
export async function handleVoice(
  from: string,
  mediaId: string
): Promise<string | null> {
  const logger = getLogger();

  try {
    // Step 1: Download audio from WhatsApp
    const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId);
    logger.info({ from: from.slice(-4), bytes: buffer.length, mimeType }, "Voice audio downloaded");

    // Step 2: Transcribe
    const text = await transcribeAudio(buffer, mimeType);

    if (!text) {
      await sendTextMessage(
        from,
        "No pude entender el audio. Puedes escribir tu pregunta? Asi te ayudo mejor."
      );
      return null;
    }

    logger.info({ from: from.slice(-4), text: text.substring(0, 100) }, "Voice transcribed");
    return text;
  } catch (error) {
    logger.error({ error }, "Voice handler failed");
    await sendTextMessage(
      from,
      "Hubo un problema al procesar tu audio. Puedes escribir tu pregunta?"
    );
    return null;
  }
}
