import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

interface MediaInfo {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
}

/**
 * Download media from WhatsApp Cloud API.
 *
 * Two-step process:
 * 1. GET /{media-id} to retrieve the download URL
 * 2. GET the download URL with auth header to get the actual bytes
 */
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const logger = getLogger();
  const config = getConfig();

  // Step 1: Get media URL from Meta Graph API
  const mediaInfoUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
  const mediaInfoResponse = await fetch(mediaInfoUrl, {
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
    },
  });

  if (!mediaInfoResponse.ok) {
    const errorText = await mediaInfoResponse.text();
    logger.error(
      { mediaId, status: mediaInfoResponse.status, error: errorText },
      "Failed to get media info"
    );
    throw new Error(`Failed to get media info: ${mediaInfoResponse.status}`);
  }

  const mediaInfo = (await mediaInfoResponse.json()) as MediaInfo;
  logger.debug(
    { mediaId, mimeType: mediaInfo.mime_type, size: mediaInfo.file_size },
    "Media info retrieved"
  );

  // Step 2: Download the actual media file
  const mediaResponse = await fetch(mediaInfo.url, {
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
    },
  });

  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    logger.error(
      { mediaId, status: mediaResponse.status, error: errorText },
      "Failed to download media"
    );
    throw new Error(`Failed to download media: ${mediaResponse.status}`);
  }

  const arrayBuffer = await mediaResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  logger.info(
    { mediaId, mimeType: mediaInfo.mime_type, bytes: buffer.length },
    "Media downloaded"
  );

  return { buffer, mimeType: mediaInfo.mime_type };
}
