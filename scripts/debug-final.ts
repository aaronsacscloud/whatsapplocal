import { classifyIntent } from "../src/llm/classifier.js";
import { searchFromClassification } from "../src/events/search.js";
import { loadConfig, getConfig } from "../src/config.js";
import { closeDb } from "../src/db/index.js";
loadConfig();

console.log("Config DEFAULT_CITY:", getConfig().DEFAULT_CITY);

const cls = await classifyIntent("que hay esta noche?");
console.log("Classifier result:", JSON.stringify(cls));

const city = cls.city ?? getConfig().DEFAULT_CITY;
console.log("Using city:", city);

const events = await searchFromClassification(cls);
console.log("Events:", events.length);

await closeDb();
