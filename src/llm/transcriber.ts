import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

/**
 * Transcribe audio using Groq's Whisper API (free, fast).
 * Falls back to OpenAI Whisper if Groq key not available.
 * Supports ogg/opus (WhatsApp default), mp3, wav, m4a.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const logger = getLogger();
  const config = getConfig();

  // Determine file extension from mime type
  const extMap: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/ogg; codecs=opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/amr": "amr",
  };
  const ext = extMap[mimeType] || "ogg";

  // Try Groq first (free Whisper), then OpenAI
  const groqKey = config.GROQ_API_KEY;
  const openaiKey = config.OPENAI_API_KEY;

  if (groqKey) {
    return transcribeWithGroq(audioBuffer, ext, groqKey, logger);
  }
  if (openaiKey) {
    return transcribeWithOpenAI(audioBuffer, ext, openaiKey, logger);
  }

  logger.warn("No transcription API key (GROQ_API_KEY or OPENAI_API_KEY). Cannot transcribe voice.");
  return null;
}

async function transcribeWithGroq(
  buffer: Buffer,
  ext: string,
  apiKey: string,
  logger: any
): Promise<string | null> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: `audio/${ext}` });
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-large-v3");
    formData.append("language", "es");
    formData.append("response_format", "text");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error({ status: response.status, err }, "Groq transcription failed");
      return null;
    }

    const text = (await response.text()).trim();
    logger.info({ chars: text.length }, "Audio transcribed via Groq");
    return text || null;
  } catch (error) {
    logger.error({ error }, "Groq transcription error");
    return null;
  }
}

async function transcribeWithOpenAI(
  buffer: Buffer,
  ext: string,
  apiKey: string,
  logger: any
): Promise<string | null> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: `audio/${ext}` });
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "es");
    formData.append("response_format", "text");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error({ status: response.status, err }, "OpenAI transcription failed");
      return null;
    }

    const text = (await response.text()).trim();
    logger.info({ chars: text.length }, "Audio transcribed via OpenAI");
    return text || null;
  } catch (error) {
    logger.error({ error }, "OpenAI transcription error");
    return null;
  }
}
