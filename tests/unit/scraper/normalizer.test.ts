import { describe, it, expect } from "vitest";
import {
  normalizeApifyEvent,
  normalizeApifyEvents,
} from "../../../src/scraper/normalizer.js";
import type { ApifyRawEvent } from "../../../src/scraper/apify.js";

describe("normalizeApifyEvent", () => {
  it("normalizes a full event", () => {
    const raw: ApifyRawEvent = {
      name: "Jazz Night",
      description: "Live jazz at the bar",
      startDate: "2026-04-05T21:00:00Z",
      endDate: "2026-04-06T01:00:00Z",
      location: { name: "Bar El Poblado", address: "Calle 10 #43-12" },
      url: "https://facebook.com/events/123",
      image: "https://img.example.com/jazz.jpg",
    };

    const result = normalizeApifyEvent(raw, "Buenos Aires", "https://fb.com/page");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Jazz Night");
    expect(result!.venueName).toBe("Bar El Poblado");
    expect(result!.venueAddress).toBe("Calle 10 #43-12");
    expect(result!.city).toBe("Buenos Aires");
    expect(result!.sourceType).toBe("facebook_page");
    expect(result!.confidence).toBe(0.9);
    expect(result!.dedupHash).toBeDefined();
    expect(result!.expiresAt).toBeDefined();
  });

  it("returns null for events without a name", () => {
    const raw: ApifyRawEvent = { description: "No name event" };
    expect(normalizeApifyEvent(raw, "BA", "url")).toBeNull();
  });

  it("handles partial data gracefully", () => {
    const raw: ApifyRawEvent = { name: "Mystery Event" };
    const result = normalizeApifyEvent(raw, "Buenos Aires", "url");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Mystery Event");
    expect(result!.venueName).toBeNull();
    expect(result!.eventDate).toBeNull();
    expect(result!.dedupHash).toBeUndefined();
  });
});

describe("normalizeApifyEvents", () => {
  it("filters out invalid events", () => {
    const events: ApifyRawEvent[] = [
      { name: "Good Event" },
      { description: "No name" },
      { name: "Another Good Event" },
    ];

    const results = normalizeApifyEvents(events, "BA", "url");
    expect(results).toHaveLength(2);
  });
});
