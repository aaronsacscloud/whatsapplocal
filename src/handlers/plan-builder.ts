import { getLLMClient } from "../llm/client.js";
import { searchEvents, type SearchFilters } from "../events/repository.js";
import { sendTextMessage, sendInteractiveButtons } from "../whatsapp/sender.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import type { ConversationMessage } from "../llm/responder.js";

// ─── Types ────────────────────────────────────────────────────────────────

interface PlanRequest {
  date: string | null;       // "sabado", "mañana", "hoy"
  groupSize: number;
  budgetMxn: number | null;  // total for group
  preferences: {
    cuisines: string[];
    musicGenres: string[];
    vibes: string[];         // chill, party, culture, romantic, family, adventure, wellness
    avoid: string[];
  };
  timeStart: string;         // "19:00"
  timeEnd: string;           // "01:00"
}

interface PlanStep {
  order: number;
  type: string;              // dinner, bar, show, walk, drinks, activity
  title: string;
  venueName: string;
  venueAddress?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  estimatedCostPerPerson: number;
  estimatedCostTotal: number;
  description: string;
  whyIncluded: string;
  reservationPhone?: string;
  googleMapsUrl?: string;
  transitToNext?: string;    // "10 min caminando"
}

interface GeneratedPlan {
  title: string;
  steps: PlanStep[];
  totalCostMxn: number;
  totalCostPerPerson: number;
  totalDurationMinutes: number;
}

// ─── SMA timezone helper ──────────────────────────────────────────────────

function getSMATodayRange(): { todayStart: Date; todayEnd: Date } {
  const now = new Date();
  const sma = new Date(now.getTime() - 6 * 3600000);
  const todayStart = new Date(Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate(), 6, 0, 0));
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { todayStart, todayEnd };
}

function getDateRange(dateStr: string | null): { dateFrom: Date; dateTo: Date } {
  const now = new Date();
  const sma = new Date(now.getTime() - 6 * 3600000);
  const todayStart = new Date(Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate(), 6, 0, 0));
  const tomorrow = new Date(todayStart.getTime() + 24 * 3600000);

  if (!dateStr) return { dateFrom: todayStart, dateTo: new Date(todayStart.getTime() + 24 * 3600000) };

  const lower = (dateStr || "").toLowerCase();

  if (lower.includes("mañana") || lower.includes("manana") || lower.includes("tomorrow")) {
    return { dateFrom: tomorrow, dateTo: new Date(tomorrow.getTime() + 24 * 3600000) };
  }

  if (lower.includes("sabad") || lower.includes("saturday")) {
    const dayOfWeek = sma.getUTCDay();
    const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
    const sat = new Date(todayStart.getTime() + daysUntilSat * 24 * 3600000);
    return { dateFrom: sat, dateTo: new Date(sat.getTime() + 24 * 3600000) };
  }

  if (lower.includes("domingo") || lower.includes("sunday")) {
    const dayOfWeek = sma.getUTCDay();
    const daysUntilSun = (7 - dayOfWeek) % 7 || 7;
    const sun = new Date(todayStart.getTime() + daysUntilSun * 24 * 3600000);
    return { dateFrom: sun, dateTo: new Date(sun.getTime() + 24 * 3600000) };
  }

  if (lower.includes("viernes") || lower.includes("friday")) {
    const dayOfWeek = sma.getUTCDay();
    const daysUntilFri = (5 - dayOfWeek + 7) % 7 || 7;
    const fri = new Date(todayStart.getTime() + daysUntilFri * 24 * 3600000);
    return { dateFrom: fri, dateTo: new Date(fri.getTime() + 24 * 3600000) };
  }

  // Default: today
  return { dateFrom: todayStart, dateTo: new Date(todayStart.getTime() + 24 * 3600000) };
}

// ─── Step 1: Parse the plan request ───────────────────────────────────────

async function parsePlanRequest(message: string): Promise<PlanRequest> {
  const client = getLLMClient();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: `Eres un parser de solicitudes de planes. Extrae los detalles del plan solicitado.

Responde SOLO con JSON valido:
{
  "date": string | null,
  "groupSize": number,
  "budgetMxn": number | null,
  "timeStart": string,
  "timeEnd": string,
  "preferences": {
    "cuisines": string[],
    "musicGenres": string[],
    "vibes": string[],
    "avoid": string[]
  }
}

Reglas:
- Si dice "para 4" o "4 personas" -> groupSize: 4. Default: 2
- Si dice "$2000" o "2000 pesos" -> budgetMxn: 2000 (total grupo)
- Si dice "noche" -> timeStart: "19:00", timeEnd: "01:00"
- Si dice "tarde" -> timeStart: "14:00", timeEnd: "19:00"
- Si dice "dia completo" -> timeStart: "10:00", timeEnd: "22:00"
- Default: timeStart: "18:00", timeEnd: "23:00"
- vibes: "chill", "party", "culture", "romantic", "family", "adventure", "wellness"
- Extrae preferencias de comida, musica, vibe del mensaje`,
    messages: [{ role: "user", content: message }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const text = rawText.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

  try {
    const parsed = JSON.parse(text);
    return {
      date: parsed.date ?? null,
      groupSize: parsed.groupSize ?? 2,
      budgetMxn: parsed.budgetMxn ?? null,
      timeStart: parsed.timeStart ?? "18:00",
      timeEnd: parsed.timeEnd ?? "23:00",
      preferences: {
        cuisines: parsed.preferences?.cuisines ?? [],
        musicGenres: parsed.preferences?.musicGenres ?? [],
        vibes: parsed.preferences?.vibes ?? [],
        avoid: parsed.preferences?.avoid ?? [],
      },
    };
  } catch {
    return {
      date: null,
      groupSize: 2,
      budgetMxn: null,
      timeStart: "18:00",
      timeEnd: "23:00",
      preferences: { cuisines: [], musicGenres: [], vibes: [], avoid: [] },
    };
  }
}

// ─── Step 2: Search events and activities ─────────────────────────────────

async function searchForPlan(
  planReq: PlanRequest,
  city: string
): Promise<any[]> {
  const { dateFrom, dateTo } = getDateRange(planReq.date);

  // Search across multiple categories
  const categories = ["music", "food", "nightlife", "culture", "wellness", "wine"];
  const allEvents: any[] = [];

  // General search (no category filter, get everything for the date)
  const generalFilters: SearchFilters = {
    city,
    dateFrom,
    dateTo,
    limit: 30,
    contentType: "all",
  };
  const generalResults = await searchEvents(generalFilters);
  allEvents.push(...generalResults);

  // Also search by specific preference categories
  for (const cuisine of planReq.preferences.cuisines) {
    const results = await searchEvents({ ...generalFilters, category: "food", query: cuisine, limit: 10 });
    for (const r of results) {
      if (!allEvents.find((e) => e.id === r.id)) allEvents.push(r);
    }
  }
  for (const genre of planReq.preferences.musicGenres) {
    const results = await searchEvents({ ...generalFilters, category: "music", query: genre, limit: 10 });
    for (const r of results) {
      if (!allEvents.find((e) => e.id === r.id)) allEvents.push(r);
    }
  }

  return allEvents;
}

// ─── Step 3: Generate the plan with Sonnet ────────────────────────────────

async function generatePlan(
  planReq: PlanRequest,
  availableEvents: any[],
  language: "es" | "en"
): Promise<GeneratedPlan> {
  const client = getLLMClient();
  const isEnglish = language === "en";

  // Format events for LLM
  const eventsContext = availableEvents
    .slice(0, 20) // Limit to avoid token overflow
    .map((e, i) => {
      const parts = [`${i + 1}. ${e.title}`];
      if (e.venueName) parts.push(`   Venue: ${e.venueName}`);
      if (e.venueAddress) parts.push(`   Address: ${e.venueAddress}`);
      if (e.category) parts.push(`   Category: ${e.category}`);
      if (e.price) parts.push(`   Price: ${e.price}`);
      if (e.eventDate) parts.push(`   Date/Time: ${new Date(e.eventDate).toISOString()}`);
      if (e.description) parts.push(`   Description: ${(e.description || "").substring(0, 150)}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const budgetNote = planReq.budgetMxn
    ? isEnglish
      ? `Total budget: $${planReq.budgetMxn} MXN (~$${Math.round(planReq.budgetMxn / planReq.groupSize)} per person)`
      : `Presupuesto total: $${planReq.budgetMxn} MXN (~$${Math.round(planReq.budgetMxn / planReq.groupSize)} por persona)`
    : "";

  const systemPrompt = isEnglish
    ? `You are a local concierge in San Miguel de Allende, Mexico. Build an evening/day plan.

RULES:
- Create 3-5 steps (activities) for the plan
- Each step should flow naturally to the next (dinner -> show -> drinks)
- Consider walking distance between venues (SMA Centro is compact, most venues 5-15 min walk)
- Stay within budget if specified
- Include a mix of the user's preferences
- Use REAL events from the list when available, but you can also suggest well-known permanent venues
- For restaurants/bars without events, suggest popular SMA spots that match the vibe
- Include estimated costs in MXN
- Include reservation phone numbers when you know them

Respond ONLY with valid JSON (no markdown):
{
  "title": "Plan title",
  "steps": [
    {
      "order": 1,
      "type": "dinner|bar|show|walk|drinks|activity|culture",
      "title": "Step title",
      "venueName": "Venue name",
      "venueAddress": "Address in SMA",
      "startTime": "19:00",
      "endTime": "20:30",
      "durationMinutes": 90,
      "estimatedCostPerPerson": 350,
      "estimatedCostTotal": 1400,
      "description": "Brief description",
      "whyIncluded": "Why this fits the plan",
      "reservationPhone": "415-xxx-xxxx",
      "transitToNext": "8 min walk"
    }
  ],
  "totalCostMxn": 3200,
  "totalCostPerPerson": 800,
  "totalDurationMinutes": 300
}`
    : `Eres un concierge local en San Miguel de Allende, Mexico. Crea un plan de salida.

REGLAS:
- Crea 3-5 pasos (actividades) para el plan
- Cada paso debe fluir naturalmente al siguiente (cena -> show -> drinks)
- Considera distancia caminando entre venues (el Centro de SMA es compacto, 5-15 min entre venues)
- Respeta el presupuesto si se especifica
- Incluye una mezcla de las preferencias del usuario
- Usa eventos REALES de la lista cuando esten disponibles, pero tambien puedes sugerir venues permanentes conocidos
- Para restaurantes/bares sin eventos, sugiere spots populares de SMA que vayan con el vibe
- Incluye costos estimados en MXN
- Incluye telefonos de reservacion cuando los conozcas

Responde SOLO con JSON valido (sin markdown):
{
  "title": "Titulo del plan",
  "steps": [
    {
      "order": 1,
      "type": "dinner|bar|show|walk|drinks|activity|culture",
      "title": "Titulo del paso",
      "venueName": "Nombre del venue",
      "venueAddress": "Direccion en SMA",
      "startTime": "19:00",
      "endTime": "20:30",
      "durationMinutes": 90,
      "estimatedCostPerPerson": 350,
      "estimatedCostTotal": 1400,
      "description": "Breve descripcion",
      "whyIncluded": "Por que incluir esto en el plan",
      "reservationPhone": "415-xxx-xxxx",
      "transitToNext": "8 min caminando"
    }
  ],
  "totalCostMxn": 3200,
  "totalCostPerPerson": 800,
  "totalDurationMinutes": 300
}`;

  const userMessage = isEnglish
    ? `Plan request:
- Group: ${planReq.groupSize} people
- Time: ${planReq.timeStart} to ${planReq.timeEnd}
${budgetNote ? `- ${budgetNote}` : ""}
- Preferences: ${[...planReq.preferences.cuisines, ...planReq.preferences.musicGenres, ...planReq.preferences.vibes].join(", ") || "open to anything"}
${planReq.preferences.avoid.length > 0 ? `- Avoid: ${planReq.preferences.avoid.join(", ")}` : ""}

Available events and venues for the date:
${eventsContext || "No specific events found for this date. Suggest well-known permanent venues in SMA."}`
    : `Solicitud de plan:
- Grupo: ${planReq.groupSize} personas
- Horario: ${planReq.timeStart} a ${planReq.timeEnd}
${budgetNote ? `- ${budgetNote}` : ""}
- Preferencias: ${[...planReq.preferences.cuisines, ...planReq.preferences.musicGenres, ...planReq.preferences.vibes].join(", ") || "abierto a todo"}
${planReq.preferences.avoid.length > 0 ? `- Evitar: ${planReq.preferences.avoid.join(", ")}` : ""}

Eventos y venues disponibles para la fecha:
${eventsContext || "No hay eventos especificos para esta fecha. Sugiere venues permanentes conocidos de SMA."}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20241022",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const text = rawText.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

  try {
    return JSON.parse(text);
  } catch {
    // Fallback plan
    return {
      title: isEnglish ? "Your Plan" : "Tu Plan",
      steps: [],
      totalCostMxn: 0,
      totalCostPerPerson: 0,
      totalDurationMinutes: 0,
    };
  }
}

// ─── Step 4: Format and send via WhatsApp ─────────────────────────────────

function getStepEmoji(type: string): string {
  const map: Record<string, string> = {
    dinner: "🍽",
    bar: "🍸",
    show: "🎵",
    drinks: "🥂",
    activity: "🎯",
    culture: "🎨",
    walk: "🚶",
    wellness: "🧘",
  };
  return map[type] || "📍";
}

function formatPlanMessages(
  plan: GeneratedPlan,
  planReq: PlanRequest,
  language: "es" | "en"
): string[] {
  const isEn = language === "en";
  const messages: string[] = [];

  // Header message
  const budgetLine = planReq.budgetMxn
    ? isEn
      ? `Budget: $${planReq.budgetMxn.toLocaleString()} MXN`
      : `Presupuesto: $${planReq.budgetMxn.toLocaleString()} MXN`
    : "";

  const header = [
    `*${plan.title}*`,
    "",
    isEn
      ? `${planReq.groupSize} people | ${planReq.timeStart} - ${planReq.timeEnd}`
      : `${planReq.groupSize} personas | ${planReq.timeStart} - ${planReq.timeEnd}`,
    budgetLine,
    isEn
      ? `Est. duration: ${Math.round(plan.totalDurationMinutes / 60)}h ${plan.totalDurationMinutes % 60}min`
      : `Duracion est.: ${Math.round(plan.totalDurationMinutes / 60)}h ${plan.totalDurationMinutes % 60}min`,
  ]
    .filter(Boolean)
    .join("\n");

  messages.push(header);

  // Step messages
  for (const step of plan.steps) {
    const emoji = getStepEmoji(step.type);
    const lines = [
      `${emoji} *${step.order}. ${step.title}*`,
      `${step.venueName} | ${step.startTime} - ${step.endTime}`,
    ];

    if (step.description) {
      lines.push(step.description);
    }

    lines.push(
      isEn
        ? `~$${step.estimatedCostPerPerson}/person`
        : `~$${step.estimatedCostPerPerson}/persona`
    );

    if (step.reservationPhone) {
      lines.push(
        isEn
          ? `Reservation: ${step.reservationPhone}`
          : `Reservacion: ${step.reservationPhone}`
      );
    }

    if (step.transitToNext) {
      lines.push("");
      lines.push(`→ ${step.transitToNext}`);
    }

    messages.push(lines.join("\n"));
  }

  // Summary message
  const summary = [
    "─────────────",
    isEn
      ? `Total est.: $${plan.totalCostMxn.toLocaleString()} MXN ($${plan.totalCostPerPerson.toLocaleString()}/person)`
      : `Total est.: $${plan.totalCostMxn.toLocaleString()} MXN ($${plan.totalCostPerPerson.toLocaleString()}/persona)`,
    isEn
      ? `Duration: ~${Math.round(plan.totalDurationMinutes / 60)} hours`
      : `Duracion: ~${Math.round(plan.totalDurationMinutes / 60)} horas`,
  ].join("\n");

  messages.push(summary);

  return messages;
}

// ─── Main handler ─────────────────────────────────────────────────────────

export async function handlePlanRequest(
  from: string,
  body: string,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es"
): Promise<string> {
  const config = getConfig();
  const logger = getLogger();
  const isEnglish = language === "en";
  const city = config.DEFAULT_CITY;

  try {
    // Send "working on it" message
    const workingMsg = isEnglish
      ? "Building your plan... give me a moment."
      : "Armando tu plan... dame un momento.";
    await sendTextMessage(from, workingMsg);

    // Step 1: Parse request
    const planReq = await parsePlanRequest(body);
    logger.info({ planReq }, "Plan request parsed");

    // Step 2: Search for events/activities
    const availableEvents = await searchForPlan(planReq, city);
    logger.info({ eventCount: availableEvents.length }, "Events found for plan");

    // Step 3: Generate plan with Sonnet
    const plan = await generatePlan(planReq, availableEvents, language);
    logger.info({ steps: plan.steps.length }, "Plan generated");

    if (plan.steps.length === 0) {
      const noResults = isEnglish
        ? "I couldn't put together a plan right now. Try asking for specific events instead, like 'what's happening tonight?'"
        : "No pude armar un plan ahorita. Intenta preguntar por eventos especificos, como 'que hay esta noche?'";
      await sendTextMessage(from, noResults);
      return noResults;
    }

    // Step 4: Format and send messages
    const planMessages = formatPlanMessages(plan, planReq, language);

    for (const msg of planMessages) {
      await sendTextMessage(from, msg);
    }

    // Send action buttons
    try {
      const buttons = isEnglish
        ? [
            { id: "plan_modify", title: "Modify plan" },
            { id: "plan_new", title: "New plan" },
          ]
        : [
            { id: "plan_modify", title: "Modificar plan" },
            { id: "plan_new", title: "Nuevo plan" },
          ];

      const buttonBody = isEnglish
        ? "What would you like to do?"
        : "Que te gustaria hacer?";

      await sendInteractiveButtons(from, buttonBody, buttons);
    } catch {
      // Buttons are optional
    }

    return planMessages[0] || "";
  } catch (error) {
    logger.error({ error }, "Plan builder failed");
    const errorMsg = isEnglish
      ? "Sorry, I couldn't build the plan. Try again or ask me about specific events."
      : "Perdon, no pude armar el plan. Intenta de nuevo o preguntame por eventos especificos.";
    await sendTextMessage(from, errorMsg);
    return errorMsg;
  }
}
