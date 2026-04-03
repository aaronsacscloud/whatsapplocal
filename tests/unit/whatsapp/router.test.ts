import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeMessage } from "../../../src/whatsapp/router.js";

const mockClassify = vi.fn();
const mockSendText = vi.fn().mockResolvedValue(undefined);
const mockUpsertUser = vi.fn().mockResolvedValue({ id: "user-1" });
const mockSearchFromClassification = vi.fn().mockResolvedValue([]);
const mockGenerateResponse = vi.fn().mockResolvedValue("Respuesta test");
const mockProcessForwarded = vi.fn();
const mockIncrementQuery = vi.fn().mockResolvedValue(undefined);
const mockIncrementForward = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../src/llm/classifier.js", () => ({
  classifyIntent: (...args: any[]) => mockClassify(...args),
}));

vi.mock("../../../src/whatsapp/sender.js", () => ({
  sendTextMessage: (...args: any[]) => mockSendText(...args),
}));

vi.mock("../../../src/users/repository.js", () => ({
  upsertUser: (...args: any[]) => mockUpsertUser(...args),
  incrementQueryCount: (...args: any[]) => mockIncrementQuery(...args),
  incrementForwardCount: (...args: any[]) => mockIncrementForward(...args),
}));

vi.mock("../../../src/events/search.js", () => ({
  searchFromClassification: (...args: any[]) =>
    mockSearchFromClassification(...args),
}));

vi.mock("../../../src/llm/responder.js", () => ({
  generateResponse: (...args: any[]) => mockGenerateResponse(...args),
}));

vi.mock("../../../src/events/forward.js", () => ({
  processForwardedContent: (...args: any[]) => mockProcessForwarded(...args),
}));

describe("routeMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes onboarding intent", async () => {
    mockClassify.mockResolvedValue({ intent: "onboarding" });

    await routeMessage({
      from: "+5491112345678",
      body: "hola",
      messageId: "msg-1",
      isForwarded: false,
    });

    expect(mockSendText).toHaveBeenCalledWith(
      "+5491112345678",
      expect.stringContaining("Hola")
    );
  });

  it("routes event_query intent", async () => {
    mockClassify.mockResolvedValue({
      intent: "event_query",
      city: "Buenos Aires",
      neighborhood: null,
      date: "hoy",
      category: null,
      query: null,
    });

    await routeMessage({
      from: "+5491112345678",
      body: "que hay esta noche?",
      messageId: "msg-2",
      isForwarded: false,
    });

    expect(mockSearchFromClassification).toHaveBeenCalled();
    expect(mockGenerateResponse).toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalled();
  });

  it("routes forwarded messages directly to forward handler", async () => {
    mockProcessForwarded.mockResolvedValue({
      success: true,
      reason: "extracted",
    });

    await routeMessage({
      from: "+5491112345678",
      body: "Jazz en vivo sabado en Bar X",
      messageId: "msg-3",
      isForwarded: true,
    });

    expect(mockClassify).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledWith(
      "+5491112345678",
      expect.stringContaining("Gracias")
    );
  });

  it("routes unknown intent to fallback", async () => {
    mockClassify.mockResolvedValue({ intent: "unknown" });

    await routeMessage({
      from: "+5491112345678",
      body: "asdfghjkl",
      messageId: "msg-4",
      isForwarded: false,
    });

    expect(mockSendText).toHaveBeenCalledWith(
      "+5491112345678",
      expect.stringContaining("No entendi")
    );
  });

  it("routes feedback intent", async () => {
    mockClassify.mockResolvedValue({ intent: "feedback" });

    await routeMessage({
      from: "+5491112345678",
      body: "gracias!",
      messageId: "msg-5",
      isForwarded: false,
    });

    expect(mockSendText).toHaveBeenCalledWith(
      "+5491112345678",
      expect.stringContaining("feedback")
    );
  });

  it("sends error message on routing failure", async () => {
    // Mock classify to always reject (withRetry will retry with delays)
    mockClassify.mockRejectedValue(new Error("LLM down"));

    await routeMessage({
      from: "+5491112345678",
      body: "test",
      messageId: "msg-6",
      isForwarded: false,
    });

    // After all retries fail, user gets the processing message
    expect(mockSendText).toHaveBeenCalledWith(
      "+5491112345678",
      expect.stringContaining("procesando")
    );
  }, 30000);
});
