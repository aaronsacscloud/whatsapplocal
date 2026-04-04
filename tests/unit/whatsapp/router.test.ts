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
const mockSaveMessage = vi.fn().mockResolvedValue(undefined);
const mockGetRecentMessages = vi.fn().mockResolvedValue([]);
const mockTrackQuery = vi.fn();
const mockIsOnboardingComplete = vi.fn().mockResolvedValue(true);
const mockHandleLocalInfo = vi.fn().mockResolvedValue("info response");

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
  isOnboardingComplete: (...args: any[]) => mockIsOnboardingComplete(...args),
  getUserLanguage: vi.fn().mockResolvedValue("es"),
  updatePreferences: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../../../src/conversations/repository.js", () => ({
  saveMessage: (...args: any[]) => mockSaveMessage(...args),
  getRecentMessages: (...args: any[]) => mockGetRecentMessages(...args),
}));

vi.mock("../../../src/analytics/tracker.js", () => ({
  trackQuery: (...args: any[]) => mockTrackQuery(...args),
}));

vi.mock("../../../src/handlers/local-info.js", () => ({
  handleLocalInfo: (...args: any[]) => mockHandleLocalInfo(...args),
}));

vi.mock("../../../src/handlers/image.js", () => ({
  handleImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/handlers/voice.js", () => ({
  handleVoice: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/handlers/onboarding-response.js", () => ({
  handleOnboardingResponse: vi.fn().mockResolvedValue(false),
}));

describe("routeMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes onboarding intent", async () => {
    mockClassify.mockResolvedValue({ intent: "onboarding", language: "es" });

    await routeMessage({
      from: "+5491112345678",
      body: "hola",
      messageId: "msg-1",
      isForwarded: false,
    });

    expect(mockSendText).toHaveBeenCalled();
  });

  it("routes event_query intent", async () => {
    mockClassify.mockResolvedValue({
      intent: "event_query",
      city: "Buenos Aires",
      neighborhood: null,
      date: "hoy",
      category: null,
      query: null,
      language: "es",
    });

    await routeMessage({
      from: "+5491112345678",
      body: "que hay esta noche?",
      messageId: "msg-2",
      isForwarded: false,
    });

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

    expect(mockProcessForwarded).toHaveBeenCalled();
  });

  it("routes unknown intent to fallback", async () => {
    mockClassify.mockResolvedValue({ intent: "unknown", language: "es" });

    await routeMessage({
      from: "+5491112345678",
      body: "asdfghjkl",
      messageId: "msg-4",
      isForwarded: false,
    });

    expect(mockSendText).toHaveBeenCalled();
  });

  it("routes feedback intent", async () => {
    mockClassify.mockResolvedValue({ intent: "feedback", language: "es" });

    await routeMessage({
      from: "+5491112345678",
      body: "gracias!",
      messageId: "msg-5",
      isForwarded: false,
    });

    expect(mockSendText).toHaveBeenCalled();
  });

  it("saves messages to conversation history", async () => {
    mockClassify.mockResolvedValue({ intent: "onboarding", language: "es" });

    await routeMessage({
      from: "+5491112345678",
      body: "hola",
      messageId: "msg-6",
      isForwarded: false,
    });

    expect(mockSaveMessage).toHaveBeenCalledWith(
      expect.any(String),
      "user",
      "hola"
    );
  });
});
