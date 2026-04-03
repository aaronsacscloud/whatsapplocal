import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyIntent } from "../../../src/llm/classifier.js";

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

describe("classifyIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies event query", async () => {
    mockLLMResponse(
      JSON.stringify({
        intent: "event_query",
        city: "Buenos Aires",
        neighborhood: "Palermo",
        date: "hoy",
        category: null,
        query: null,
      })
    );

    const result = await classifyIntent("que hay para hacer esta noche?");
    expect(result.intent).toBe("event_query");
    expect(result.city).toBe("Buenos Aires");
    expect(result.neighborhood).toBe("Palermo");
  });

  it("classifies onboarding", async () => {
    mockLLMResponse(
      JSON.stringify({
        intent: "onboarding",
        city: null,
        neighborhood: null,
        date: null,
        category: null,
        query: null,
      })
    );

    const result = await classifyIntent("hola");
    expect(result.intent).toBe("onboarding");
  });

  it("classifies feedback", async () => {
    mockLLMResponse(
      JSON.stringify({
        intent: "feedback",
        city: null,
        neighborhood: null,
        date: null,
        category: null,
        query: null,
      })
    );

    const result = await classifyIntent("gracias!");
    expect(result.intent).toBe("feedback");
  });

  it("classifies venue query", async () => {
    mockLLMResponse(
      JSON.stringify({
        intent: "venue_query",
        city: "Buenos Aires",
        neighborhood: null,
        date: null,
        category: "food",
        query: "restaurantes con terraza",
      })
    );

    const result = await classifyIntent("restaurantes con terraza en palermo");
    expect(result.intent).toBe("venue_query");
    expect(result.category).toBe("food");
  });

  it("returns unknown for unrecognized messages", async () => {
    mockLLMResponse(
      JSON.stringify({
        intent: "unknown",
        city: null,
        neighborhood: null,
        date: null,
        category: null,
        query: null,
      })
    );

    const result = await classifyIntent("asdfghjkl");
    expect(result.intent).toBe("unknown");
  });

  it("falls back to unknown on invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "this is not json" }],
    });

    const result = await classifyIntent("test message");
    expect(result.intent).toBe("unknown");
  });

  it("falls back to unknown on LLM error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API timeout"));

    const result = await classifyIntent("test message");
    expect(result.intent).toBe("unknown");
  });
});
