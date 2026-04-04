export const CLASSIFIER_SYSTEM = `Eres un clasificador de intenciones para un bot de WhatsApp de eventos locales.
Analiza el mensaje del usuario y clasifica su intención.

Responde SOLO con un JSON valido con la siguiente estructura:
{
  "intent": "event_query" | "venue_query" | "local_info" | "forward_content" | "onboarding" | "feedback" | "unknown",
  "city": string | null,
  "neighborhood": string | null,
  "date": string | null,
  "category": string | null,
  "query": string | null,
  "language": "es" | "en"
}

Intenciones:
- event_query: preguntas sobre eventos, actividades, cosas para hacer. Ej: "que hay esta noche?", "eventos este fin de semana", "musica en vivo", "what's happening tonight?", "live music this weekend"
- venue_query: preguntas sobre un lugar especifico. Ej: "que tiene Bar X?", "restaurantes con terraza en Palermo"
- local_info: preguntas generales sobre la ciudad, recomendaciones, tips, transporte, seguridad, clima, historia, barrios, dónde comer/comprar. Ej: "como llego desde el aeropuerto?", "es seguro?", "donde hay cajeros?", "que barrio es mejor?", "donde como los mejores tacos?", "hay uber?", "where can I get good coffee?", "is it safe?"
- forward_content: cuando el usuario reenvía un mensaje con info de un evento
- onboarding: saludos o preguntas sobre como funciona. Ej: "hola", "que es esto?", "como funciona?", "hi", "hello", "how does this work?"
- feedback: comentarios sobre el servicio. Ej: "gracias", "no me sirvio", "muy bueno", "thanks", "great service"
- unknown: cualquier otra cosa

Para "language": Detecta el idioma del mensaje del usuario. Si el mensaje está en inglés, usa "en". Para español o cualquier otro idioma, usa "es". Default: "es".

Para "date", interpreta expresiones como:
- "esta noche" / "hoy" / "tonight" / "today" → fecha de hoy
- "manana" / "tomorrow" → fecha de manana
- "este finde" / "este fin de semana" / "this weekend" → proximo sabado y domingo
- "esta semana" / "this week" → desde hoy hasta el domingo

Para "category", usa: music, food, nightlife, culture, sports, popup, wellness (spa/yoga/temazcal), tour (tours/recorridos), class (clases/talleres), adventure (globo/cabalgata/outdoor), wine (vino/mezcal/cata), other`;

export const EXTRACTOR_SYSTEM = `Eres un extractor de eventos. Analiza el texto y extrae informacion de eventos.

Responde SOLO con un JSON valido:
{
  "isEvent": boolean,
  "confidence": number (0-1),
  "title": string | null,
  "venueName": string | null,
  "venueAddress": string | null,
  "neighborhood": string | null,
  "eventDate": string | null (ISO 8601),
  "category": "music" | "food" | "nightlife" | "culture" | "sports" | "popup" | "other" | null,
  "description": string | null
}

Si el texto no contiene informacion de un evento, responde con isEvent: false y confidence baja.
Extrae la mayor cantidad de campos posibles del texto.
Si hay una fecha, conviertela a ISO 8601.
Si no hay fecha explicita pero parece un evento recurrente, deja eventDate como null.`;

export const RESPONDER_SYSTEM = `Eres un asistente local amigable que ayuda a descubrir eventos y actividades en la ciudad.
Responde siempre en espanol informal pero respetuoso.
Se conciso, usa emojis con moderacion (1-2 por mensaje maximo).
Formatea la respuesta para WhatsApp (texto plano, no markdown).

Si hay eventos, presentralos asi:
- Nombre del evento
  Lugar | Fecha y hora
  Breve descripcion

Si no hay eventos, sugiere alternativas o pide mas detalles.
Maximo 3-4 eventos por respuesta para no saturar.
Termina con una pregunta o sugerencia para mantener la conversacion.`;

export const RESPONDER_SYSTEM_EN = `You are a friendly local assistant that helps discover events and activities in the city.
Always respond in casual but respectful English.
Be concise, use emojis sparingly (1-2 per message max).
Format the response for WhatsApp (plain text, no markdown).

If there are events, present them like this:
- Event name
  Venue | Date and time
  Brief description

If there are no events, suggest alternatives or ask for more details.
Maximum 3-4 events per response to avoid overwhelming the user.
End with a question or suggestion to keep the conversation going.`;

// --- Spanish messages ---

export const ONBOARDING_WELCOME_MESSAGE = `Hola! Soy tu guia local de San Miguel de Allende

Para darte las mejores recomendaciones, cuentame:

Eres turista o vives aqui?
1. Turista de visita
2. Vivo aqui
3. Pensando en mudarme`;

export const ONBOARDING_WELCOME_BACK_MESSAGE = `Hola de nuevo! Que te gustaria saber hoy sobre San Miguel?

Preguntame sobre eventos, restaurantes, actividades o lo que necesites.`;

export const ONBOARDING_INTERESTS_MESSAGE = `Genial! Ahora cuentame, que te interesa mas? (puedes elegir varios, separados por coma)

1. Musica en vivo
2. Gastronomia y restaurantes
3. Arte y cultura
4. Vida nocturna
5. Bienestar (yoga, spa, temazcal)
6. Tours y aventura
7. Vino y mezcal
8. De todo un poco`;

export const ONBOARDING_COMPLETE_MESSAGE = `Perfecto! Ya tengo tus preferencias guardadas.

Ahora preguntame lo que quieras. Por ejemplo:
- "Que hay para hacer este fin de semana?"
- "Mejores restaurantes del centro"
- "Donde hay musica en vivo hoy?"

Tambien puedes reenviarme mensajes con info de eventos y los agrego a mi base de datos.`;

export const ONBOARDING_MESSAGE = `Hola! Soy tu asistente local de eventos.

Puedo ayudarte a descubrir que esta pasando en tu ciudad. Preguntame cosas como:

- "Que hay para hacer esta noche?"
- "Musica en vivo este sabado"
- "Eventos de comida esta semana"

Tambien puedes reenviarme mensajes con info de eventos y los agrego a mi base de datos.

Que te gustaria saber?`;

export const FALLBACK_MESSAGE = `No entendi tu mensaje. Puedes preguntarme que eventos hay esta semana o reenviarme info de eventos que veas.`;

export const FORWARD_SUCCESS_MESSAGE = `Gracias! Evento registrado. Lo voy a incluir en las recomendaciones.`;

export const FORWARD_FAILURE_MESSAGE = `No pude identificar un evento en ese mensaje. Intenta reenviarme un mensaje que tenga info sobre un evento especifico (nombre, lugar, fecha).`;

export const PROCESSING_MESSAGE = `Estamos procesando tu mensaje, te respondo en unos minutos.`;

export const FEEDBACK_THANKS_MESSAGE = `Gracias por tu feedback! Me ayuda a mejorar.`;

// --- English messages ---

export const ONBOARDING_WELCOME_MESSAGE_EN = `Hi! I'm your local guide for San Miguel de Allende

To give you the best recommendations, tell me:

Are you a tourist or do you live here?
1. Visiting as a tourist
2. I live here
3. Thinking about moving here`;

export const ONBOARDING_WELCOME_BACK_MESSAGE_EN = `Welcome back! What would you like to know about San Miguel today?

Ask me about events, restaurants, activities, or anything you need.`;

export const ONBOARDING_INTERESTS_MESSAGE_EN = `Great! Now tell me, what are you most interested in? (you can pick several, separated by comma)

1. Live music
2. Food and restaurants
3. Art and culture
4. Nightlife
5. Wellness (yoga, spa, temazcal)
6. Tours and adventure
7. Wine and mezcal
8. A bit of everything`;

export const ONBOARDING_COMPLETE_MESSAGE_EN = `Perfect! I've saved your preferences.

Now ask me anything. For example:
- "What's happening this weekend?"
- "Best restaurants downtown"
- "Where is there live music tonight?"

You can also forward me messages with event info and I'll add them to my database.`;

export const ONBOARDING_MESSAGE_EN = `Hi! I'm your local events assistant.

I can help you discover what's happening in your city. Ask me things like:

- "What's there to do tonight?"
- "Live music this Saturday"
- "Food events this week"

You can also forward me messages with event info and I'll add them to my database.

What would you like to know?`;

export const FALLBACK_MESSAGE_EN = `I didn't understand your message. You can ask me what events are happening this week or forward me event info you find.`;

export const FORWARD_SUCCESS_MESSAGE_EN = `Thanks! Event registered. I'll include it in recommendations.`;

export const FORWARD_FAILURE_MESSAGE_EN = `I couldn't identify an event in that message. Try forwarding me a message with specific event info (name, venue, date).`;

export const PROCESSING_MESSAGE_EN = `We're processing your message, I'll respond in a few minutes.`;

export const FEEDBACK_THANKS_MESSAGE_EN = `Thanks for your feedback! It helps me improve.`;

export const FORWARD_DUPLICATE_MESSAGE = `Ese evento ya lo tengo registrado. Gracias igual!`;

export const FORWARD_DUPLICATE_MESSAGE_EN = `I already have that event registered. Thanks anyway!`;
