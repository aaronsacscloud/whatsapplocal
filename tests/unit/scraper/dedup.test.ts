import { describe, it, expect, vi, beforeEach } from "vitest";
import { deduplicateEvents } from "../../../src/scraper/dedup.js";
import type { NewEvent } from "../../../src/db/schema.js";

// Mock the repository
vi.mock("../../../src/events/repository.js", () => ({
  findByDedupHash: vi.fn().mockResolvedValue(undefined),
}));

function makeEvent(overrides: Partial<NewEvent> = {}): NewEvent {
  return {
    title: "Test Event",
    city: "Buenos Aires",
    venueName: "Bar Test",
    eventDate: new Date("2026-04-05"),
    dedupHash: "hash123",
    ...overrides,
  };
}

describe("deduplicateEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all unique events when no duplicates", async () => {
    const events = [
      makeEvent({ title: "Event 1", dedupHash: "hash1", venueName: "Bar Alpha" }),
      makeEvent({ title: "Event 2", dedupHash: "hash2", venueName: "Restaurante Omega" }),
    ];

    const result = await deduplicateEvents(events);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toBe(0);
  });

  it("detects near-matches by venue name similarity", async () => {
    const events = [
      makeEvent({
        title: "Event 1",
        venueName: "Bar Poblado",
        dedupHash: "hash1",
        eventDate: new Date("2026-04-05"),
      }),
      makeEvent({
        title: "Event 2",
        venueName: "Bar Pobaldo", // Levenshtein distance = 2
        dedupHash: "hash2",
        eventDate: new Date("2026-04-05"),
      }),
    ];

    const result = await deduplicateEvents(events);
    expect(result.unique).toHaveLength(1);
    expect(result.nearMatches).toHaveLength(1);
  });

  it("allows events with different dates at same venue", async () => {
    const events = [
      makeEvent({
        title: "Event Fri",
        venueName: "Bar Test",
        dedupHash: "hash1",
        eventDate: new Date("2026-04-05"),
      }),
      makeEvent({
        title: "Event Sat",
        venueName: "Bar Test",
        dedupHash: "hash2",
        eventDate: new Date("2026-04-06"),
      }),
    ];

    const result = await deduplicateEvents(events);
    expect(result.unique).toHaveLength(2);
  });
});
