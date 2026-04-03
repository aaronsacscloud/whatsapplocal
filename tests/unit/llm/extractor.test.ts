import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractEvent } from "../../../src/llm/extractor.js";

const mockCreate = vi.fn();

vi.mock("../../../src/llm/client.js", () => ({
  getLLMClient: () => ({
    messages: { create: mockCreate },
  }),
}));

function mockLLMResponse(text: string) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text }],
  });
}

describe("extractEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts a well-formed event", async () => {
    mockLLMResponse(
      JSON.stringify({
        isEvent: true,
        confidence: 0.95,
        title: "Noche de Jazz",
        venueName: "Bar El Poblado",
        venueAddress: "Calle 10 #43",
        neighborhood: "Palermo",
        eventDate: "2026-04-05T21:00:00Z",
        category: "music",
        description: "Jazz en vivo con banda local",
      })
    );

    const result = await extractEvent("Jazz en vivo este sabado en Bar El Poblado");
    expect(result.isEvent).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.title).toBe("Noche de Jazz");
    expect(result.venueName).toBe("Bar El Poblado");
    expect(result.category).toBe("music");
  });

  it("handles partial data", async () => {
    mockLLMResponse(
      JSON.stringify({
        isEvent: true,
        confidence: 0.7,
        title: "Evento",
        venueName: null,
        venueAddress: null,
        neighborhood: null,
        eventDate: null,
        category: null,
        description: "Algo pasa este finde",
      })
    );

    const result = await extractEvent("algo pasa este finde");
    expect(result.isEvent).toBe(true);
    expect(result.confidence).toBe(0.7);
    expect(result.venueName).toBeNull();
  });

  it("rejects non-event content", async () => {
    mockLLMResponse(
      JSON.stringify({
        isEvent: false,
        confidence: 0.1,
        title: null,
        venueName: null,
        venueAddress: null,
        neighborhood: null,
        eventDate: null,
        category: null,
        description: null,
      })
    );

    const result = await extractEvent("jajaja mira este meme");
    expect(result.isEvent).toBe(false);
    expect(result.confidence).toBe(0.1);
  });

  it("returns empty result on LLM error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API error"));

    const result = await extractEvent("test");
    expect(result.isEvent).toBe(false);
    expect(result.confidence).toBe(0);
  });
});
