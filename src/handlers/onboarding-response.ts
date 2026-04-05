import { sendTextMessage, sendInteractiveList } from "../whatsapp/sender.js";
import { updatePreferences, getUserName } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import { getShareSuggestion } from "./invite.js";
import { getTodayEventsText } from "./onboarding.js";

type OnboardingStep = "name_question" | "interests_question";

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

/** Interest list row IDs used in the interactive list */
const INTEREST_ROW_IDS = [
  "interest_music",
  "interest_food",
  "interest_culture",
  "interest_nightlife",
  "interest_wellness",
  "interest_adventure",
  "interest_wine",
  "interest_everything",
];

const INTEREST_ROW_MAP: Record<string, string> = {
  interest_music: "music",
  interest_food: "food",
  interest_culture: "culture",
  interest_nightlife: "nightlife",
  interest_wellness: "wellness",
  interest_adventure: "adventure",
  interest_wine: "wine",
  interest_everything: "everything",
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

  // Step 1: We asked for name — message contains "como te llamas"
  if (
    lower.includes("como te llamas")
  ) {
    return "name_question";
  }

  // Step 3: We showed interest options — detect by interest keywords
  if (
    lower.includes("musica en vivo") ||
    lower.includes("gastronomia") ||
    lower.includes("de todo un poco") ||
    lower.includes("que te interesa mas")
  ) {
    return "interests_question";
  }

  // Backward compat: old tourist/local question still routes to interests
  // (existing onboarding_tourist/local/moving buttons are handled in interactive-reply.ts)
  if (
    lower.includes("turista de visita") ||
    lower.includes("vivo aqui") ||
    lower.includes("pensando en mudarme") ||
    lower.includes("visiting as a tourist") ||
    lower.includes("i live here") ||
    lower.includes("thinking about moving")
  ) {
    return "interests_question";
  }

  // Backward compat: old English interest question
  if (
    lower.includes("live music") ||
    lower.includes("food and restaurants") ||
    lower.includes("a bit of everything")
  ) {
    return "interests_question";
  }

  return null;
}

/**
 * Send the interests selection message (Step 3).
 * Uses an interactive list for better UX, with numbered text fallback.
 */
async function sendInterestsQuestion(from: string, name: string): Promise<void> {
  const greeting = `Mucho gusto ${name}! Voy a ser tu guia personal. Te ayudo a encontrar los mejores eventos, restaurantes, actividades y experiencias en San Miguel.`;
  await sendTextMessage(from, greeting);

  const body = `Que te interesa mas? (puedes elegir varios)`;
  const sections = [
    {
      title: "Intereses",
      rows: [
        { id: "interest_music", title: "Musica en vivo", description: "Conciertos, jazz, trova" },
        { id: "interest_food", title: "Gastronomia", description: "Restaurantes, pop-ups, catas" },
        { id: "interest_culture", title: "Arte y cultura", description: "Galerias, museos, teatro" },
        { id: "interest_nightlife", title: "Vida nocturna", description: "Bares, fiestas, clubs" },
        { id: "interest_wellness", title: "Bienestar", description: "Yoga, spa, temazcal" },
        { id: "interest_adventure", title: "Tours y aventura", description: "Globo, cabalgata, outdoor" },
        { id: "interest_wine", title: "Vino y mezcal", description: "Catas, vinerias, mezcalerias" },
        { id: "interest_everything", title: "De todo un poco", description: "Todas las categorias" },
      ],
    },
  ];

  await sendInteractiveList(from, body, "Ver opciones", sections);
}

/**
 * Handle the user's name reply (step 1 → step 2+3).
 * Saves the name and sends the interests question.
 */
async function handleNameResponse(
  from: string,
  body: string,
): Promise<boolean> {
  const trimmed = body.trim();
  const phoneHash = hashPhone(from);

  // Basic validation: name should be 1-50 chars and look like a name (not a command)
  if (trimmed.length === 0 || trimmed.length > 50) {
    return false;
  }

  // If the message is only numbers, it's not a name
  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  // Extract the first word as name (or full string if short enough)
  // Capitalize first letter
  const name = trimmed
    .split(/\s+/)[0]
    .replace(/^./, (c) => c.toUpperCase());

  await updatePreferences(phoneHash, { name });

  // Send Step 2 greeting + Step 3 interests question
  await sendInterestsQuestion(from, name);

  return true;
}

/**
 * Handle the user's interest selection (step 3 → completion).
 * Supports numbered text replies ("1, 3, 5"), single numbers ("8"),
 * and interactive list row IDs ("interest_music").
 */
async function handleInterestsResponse(
  from: string,
  body: string,
): Promise<boolean> {
  const logger = getLogger();
  const trimmed = body.trim();
  const phoneHash = hashPhone(from);

  let interests: string[] = [];

  // Check if it's an interactive list reply ID
  const interestFromId = INTEREST_ROW_MAP[trimmed];
  if (interestFromId) {
    if (interestFromId === "everything") {
      interests = ["music", "food", "culture", "nightlife", "wellness", "adventure", "wine"];
    } else {
      interests = [interestFromId];
    }
  } else {
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
    if (numbers.includes("8")) {
      interests = ["music", "food", "culture", "nightlife", "wellness", "adventure", "wine"];
    } else {
      interests = [...new Set(numbers.map((n) => INTEREST_MAP[n]).filter(Boolean))];
    }
  }

  logger.info({ phoneHash: phoneHash.slice(-8), interests }, "User interests saved");

  await updatePreferences(phoneHash, {
    interests,
    onboardingComplete: true,
  });

  // Fetch user name for personalized completion message
  const name = await getUserName(phoneHash);
  const nameStr = name ?? "amigo";

  // Fetch today's top events matching their selected interests
  const eventsText = await getTodayEventsText(interests);

  const message = `Perfecto ${nameStr}! Ya te tengo. Cada vez que platiquemos voy aprendiendo mas de lo que te gusta para darte mejores recomendaciones.\n\nAqui tienes lo mejor de hoy:\n\n${eventsText}\n\nPreguntame lo que quieras sobre San Miguel!`;
  await sendTextMessage(from, message);

  // After onboarding, suggest sharing with friends
  const shareSuggestion = getShareSuggestion("es");
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
    case "name_question":
      return handleNameResponse(from, body);
    case "interests_question":
      return handleInterestsResponse(from, body);
    default:
      return false;
  }
}
