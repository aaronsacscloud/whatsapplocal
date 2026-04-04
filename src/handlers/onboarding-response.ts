import { sendTextMessage } from "../whatsapp/sender.js";
import { updatePreferences } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import { getShareSuggestion } from "./invite.js";
import {
  ONBOARDING_INTERESTS_MESSAGE,
  ONBOARDING_INTERESTS_MESSAGE_EN,
  ONBOARDING_COMPLETE_MESSAGE,
  ONBOARDING_COMPLETE_MESSAGE_EN,
} from "../llm/prompts.js";

type OnboardingStep = "tourist_question" | "interests_question";

const INTEREST_MAP: Record<string, string> = {
  "1": "music",
  "2": "food",
  "3": "culture",
  "4": "nightlife",
  "5": "wellness",
  "6": "adventure",
  "7": "wine",
  "8": "everything",
};

/**
 * Detect what onboarding step the user is responding to based on
 * the last bot message stored in conversation history.
 */
export function detectOnboardingStep(
  lastBotMessage: string | null
): OnboardingStep | null {
  if (!lastBotMessage) return null;

  const lower = lastBotMessage.toLowerCase();

  // Check if last message was the tourist question
  if (
    lower.includes("turista de visita") ||
    lower.includes("vivo aqui") ||
    lower.includes("pensando en mudarme") ||
    lower.includes("visiting as a tourist") ||
    lower.includes("i live here") ||
    lower.includes("thinking about moving")
  ) {
    return "tourist_question";
  }

  // Check if last message was the interests question
  if (
    lower.includes("musica en vivo") ||
    lower.includes("gastronomia y restaurantes") ||
    lower.includes("de todo un poco") ||
    lower.includes("live music") ||
    lower.includes("food and restaurants") ||
    lower.includes("a bit of everything")
  ) {
    return "interests_question";
  }

  return null;
}

/**
 * Handle the user's response to the tourist/resident question (step 1).
 */
async function handleTouristResponse(
  from: string,
  body: string,
  language: "es" | "en"
): Promise<boolean> {
  const trimmed = body.trim();
  const phoneHash = hashPhone(from);
  const isEnglish = language === "en";

  let isTourist: boolean | undefined;

  if (trimmed === "1") {
    isTourist = true;
  } else if (trimmed === "2") {
    isTourist = false;
  } else if (trimmed === "3") {
    isTourist = true; // "thinking about moving" — treat as tourist for now
  } else {
    // Not a valid numbered response — not an onboarding reply
    return false;
  }

  await updatePreferences(phoneHash, { isTourist, language });

  // Send interests question
  const message = isEnglish
    ? ONBOARDING_INTERESTS_MESSAGE_EN
    : ONBOARDING_INTERESTS_MESSAGE;
  await sendTextMessage(from, message);

  return true;
}

/**
 * Handle the user's response to the interests question (step 2).
 */
async function handleInterestsResponse(
  from: string,
  body: string,
  language: "es" | "en"
): Promise<boolean> {
  const logger = getLogger();
  const trimmed = body.trim();
  const phoneHash = hashPhone(from);
  const isEnglish = language === "en";

  // Parse comma-separated or space-separated numbers like "1, 3, 5" or "1 3 5" or "8"
  const numbers = trimmed
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^[1-8]$/.test(s));

  if (numbers.length === 0) {
    // Not a valid numbered response
    return false;
  }

  // Map numbers to interest tags
  let interests: string[];
  if (numbers.includes("8")) {
    interests = ["music", "food", "culture", "nightlife", "wellness", "adventure", "wine"];
  } else {
    interests = [...new Set(numbers.map((n) => INTEREST_MAP[n]).filter(Boolean))];
  }

  logger.info({ phoneHash: phoneHash.slice(-8), interests }, "User interests saved");

  await updatePreferences(phoneHash, {
    interests,
    onboardingComplete: true,
    language,
  });

  // Send completion message
  const message = isEnglish
    ? ONBOARDING_COMPLETE_MESSAGE_EN
    : ONBOARDING_COMPLETE_MESSAGE;
  await sendTextMessage(from, message);

  // After onboarding, suggest sharing with friends
  const shareSuggestion = getShareSuggestion(isEnglish ? "en" : "es");
  await sendTextMessage(from, shareSuggestion);

  return true;
}

/**
 * Try to handle a message as an onboarding response.
 * Returns true if the message was handled as an onboarding response.
 * Returns false if not — the caller should route it normally.
 */
export async function handleOnboardingResponse(
  from: string,
  body: string,
  lastBotMessage: string | null,
  language: "es" | "en" = "es"
): Promise<boolean> {
  const step = detectOnboardingStep(lastBotMessage);

  if (!step) return false;

  switch (step) {
    case "tourist_question":
      return handleTouristResponse(from, body, language);
    case "interests_question":
      return handleInterestsResponse(from, body, language);
    default:
      return false;
  }
}
