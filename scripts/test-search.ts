import { classifyIntent } from "../src/llm/classifier.js";
import { searchFromClassification } from "../src/events/search.js";
import { generateResponse } from "../src/llm/responder.js";
import { closeDb } from "../src/db/index.js";
import { loadConfig } from "../src/config.js";

loadConfig();

const cls = await classifyIntent("que hay esta noche?");
console.log(`Intent: ${cls.intent} | Date: ${cls.date}`);

const events = await searchFromClassification(cls);
console.log(`Found ${events.length} events!`);
for (const e of events.slice(0, 8)) {
  const ev = e as any;
  console.log(`  - ${ev.title} @ ${ev.venue_name || ev.venueName || "?"} (${ev.category})`);
}

if (events.length > 0) {
  const mapped = events.map((e: any) => ({
    ...e,
    venueName: e.venue_name ?? e.venueName,
    eventDate: e.event_date ?? e.eventDate,
  }));
  const response = await generateResponse(
    "que hay esta noche?",
    mapped as any,
    "San Miguel de Allende"
  );
  console.log(`\n${response}`);

  const res = await fetch("https://app.kapso.ai/mcp", {
    method: "POST",
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "whatsapp_send_text_message",
        arguments: {
          conversation_selector: { phone_number: "5215610353669" },
          content: response.substring(0, 1000),
        },
      },
      id: 900,
    }),
  });
  const json = (await res.json()) as any;
  console.log(`\n${json.error ? "ERROR: " + json.error.message : "SENT TO WHATSAPP!"}`);
}

await closeDb();
