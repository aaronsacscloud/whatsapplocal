import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchFromClassification } from "../../../src/events/search.js";

const mockSearchEvents = vi.fn().mockResolvedValue([]);

vi.mock("../../../src/events/repository.js", () => ({
  searchEvents: (...args: any[]) => mockSearchEvents(...args),
}));

describe("searchFromClassification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches by city and date", async () => {
    await searchFromClassification({
      intent: "event_query",
      city: "Buenos Aires",
      neighborhood: null,
      date: "hoy",
      category: null,
      query: null,
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Buenos Aires",
        dateFrom: expect.any(Date),
        dateTo: expect.any(Date),
      })
    );
  });

  it("searches by neighborhood when provided", async () => {
    await searchFromClassification({
      intent: "event_query",
      city: "Buenos Aires",
      neighborhood: "Palermo",
      date: null,
      category: null,
      query: null,
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Buenos Aires",
        neighborhood: "Palermo",
      })
    );
  });

  it("searches by category when provided", async () => {
    await searchFromClassification({
      intent: "event_query",
      city: "Buenos Aires",
      neighborhood: null,
      date: null,
      category: "music",
      query: null,
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "music",
      })
    );
  });

  it("uses DEFAULT_CITY when city is null", async () => {
    await searchFromClassification({
      intent: "event_query",
      city: null,
      neighborhood: null,
      date: null,
      category: null,
      query: null,
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Buenos Aires",
      })
    );
  });

  it("defaults to today only when no date specified", async () => {
    await searchFromClassification({
      intent: "event_query",
      city: "Buenos Aires",
      neighborhood: null,
      date: null,
      category: null,
      query: null,
    });

    const call = mockSearchEvents.mock.calls[0][0];
    const diffDays =
      (call.dateTo.getTime() - call.dateFrom.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(1, 0); // Today only, not 7 days
  });
});
