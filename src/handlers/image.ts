import { extractEventFromImage } from "../llm/extractor.js";
import { processForwardedContentFromExtraction } from "../events/forward.js";
import { downloadWhatsAppMedia } from "../whatsapp/media.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { incrementForwardCount } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import { FORWARD_SUCCESS_MESSAGE } from "../llm/prompts.js";

const IMAGE_NO_EVENT_MESSAGE =
  "No pude identificar un evento en esa imagen. Si es un flyer de evento, intenta enviarlo con mejor resolución o escríbeme los detalles del evento.";

const IMAGE_ERROR_MESSAGE =
  "No pude procesar esa imagen. Intenta enviarme los datos del evento como texto.";

export async function handleImage(
  from: string,
  mediaId: string
): Promise<void> {
  const logger = getLogger();

  try {
    // Download the image from WhatsApp
    const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId);

    // Convert to base64
    const imageBase64 = buffer.toString("base64");

    // Extract event info via Claude Vision
    const extraction = await extractEventFromImage(imageBase64, mimeType);

    if (!extraction.isEvent) {
      await sendTextMessage(from, IMAGE_NO_EVENT_MESSAGE);
      return;
    }

    // Process the extraction the same way forwarded text events are processed
    const result = await processForwardedContentFromExtraction(extraction);

    if (result.success) {
      await sendTextMessage(from, FORWARD_SUCCESS_MESSAGE);
      await incrementForwardCount(hashPhone(from));
    } else if (result.reason === "duplicate") {
      await sendTextMessage(
        from,
        "Ese evento ya lo tengo registrado. Gracias igual!"
      );
    } else {
      await sendTextMessage(from, IMAGE_NO_EVENT_MESSAGE);
    }
  } catch (error) {
    logger.error({ error, from: from.slice(-4) }, "Image handler failed");
    await sendTextMessage(from, IMAGE_ERROR_MESSAGE);
  }
}
