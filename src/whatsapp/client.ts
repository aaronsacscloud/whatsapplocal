import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { getConfig } from "../config.js";

let _client: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (_client) return _client;
  const config = getConfig();

  const kapsoApiKey = config.KAPSO_API_KEY;

  if (kapsoApiKey) {
    // Use Kapso proxy (handles rate limits, retries, analytics)
    _client = new WhatsAppClient({
      kapsoApiKey,
      baseUrl: "https://graph.kapso.ai",
    });
  } else {
    // Direct Meta Graph API
    _client = new WhatsAppClient({
      accessToken: config.WHATSAPP_ACCESS_TOKEN,
    });
  }

  return _client;
}

export function getPhoneNumberId(): string {
  return getConfig().WHATSAPP_PHONE_NUMBER_ID;
}
