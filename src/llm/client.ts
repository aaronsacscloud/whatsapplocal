import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config.js";

let _client: Anthropic | null = null;

export function getLLMClient(): Anthropic {
  if (_client) return _client;
  const config = getConfig();
  _client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return _client;
}
