import { describe, it, expect, vi, beforeEach } from "vitest";
import { processForwardedContent } from "../../../src/events/forward.js";

const mockExtractEvent = vi.fn();
const mockUpsertEvent = vi.fn().mockResolvedValue({ id: "event-1", title: "Test" });
const mockFindByDedupHash = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../src/llm/extractor.js", () => ({
  extractEvent: (...args: any[]) => mockExtractEvent(...args),
}));

vi.mock("../../../src/events/repository.js", () => ({
  upsertEvent: (...args: any[]) => mockUpsertEvent(...args),
  findByDedupHash: (...args: any[]) => mockFindByDedupHash(...args),
}));

describe("processForwardedContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts valid event with high confidence", async () => {
    mockExtractEvent.mockResolvedValue({
      isEvent: true,
      confidence: 0.9,
      title: "Jazz Night",
      venueName: "Bar X",
      venueAddress: null,
      neighborhood: "Palermo",
      eventDate: "2026-04-05T21:00:00Z",
      category: "music",
      description: "Live jazz",
    });

    const result = await processForwardedContent("Jazz en Bar X este sabado");
    expect(result.success).toBe(true);
    expect(result.reason).toBe("extracted");
    expect(mockUpsertEvent).toHaveBeenCalled();
  });

  it("rejects non-event content", async () => {
    mockExtractEvent.mockResolvedValue({
      isEvent: false,
      confidence: 0.1,
      title: null,
      venueName: null,
      venueAddress: null,
      neighborhood: null,
      eventDate: null,
      category: null,
      description: null,
    });

    const result = await processForwardedContent("jajaja mira este meme");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("not_event");
    expect(mockUpsertEvent).not.toHaveBeenCalled();
  });

  it("rejects low confidence content (below 0.7)", async () => {
    mockExtractEvent.mockResolvedValue({
      isEvent: true,
      confidence: 0.5,
      title: "Maybe Event",
      venueName: null,
      venueAddress: null,
      neighborhood: null,
      eventDate: null,
      category: null,
      description: null,
    });

    const result = await processForwardedContent("algo pasa creo");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("low_confidence");
  });

  it("detects duplicates", async () => {
    mockExtractEvent.mockResolvedValue({
      isEvent: true,
      confidence: 0.9,
      title: "Jazz Night",
      venueName: "Bar X",
      venueAddress: null,
      neighborhood: null,
      eventDate: "2026-04-05T21:00:00Z",
      category: "music",
      description: null,
    });

    mockFindByDedupHash.mockResolvedValue({ id: "existing-1", title: "Jazz Night" });

    const result = await processForwardedContent("Jazz en Bar X sabado");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("duplicate");
  });
});
