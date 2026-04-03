import { describe, it, expect } from "vitest";
import { isContentAcceptable, getConfidenceThreshold } from "../../../src/utils/moderation.js";

describe("moderation", () => {
  it("accepts content at or above 0.7 threshold", () => {
    expect(isContentAcceptable(0.7)).toBe(true);
    expect(isContentAcceptable(0.9)).toBe(true);
    expect(isContentAcceptable(1.0)).toBe(true);
  });

  it("rejects content below 0.7 threshold", () => {
    expect(isContentAcceptable(0.69)).toBe(false);
    expect(isContentAcceptable(0.5)).toBe(false);
    expect(isContentAcceptable(0)).toBe(false);
  });

  it("returns threshold value", () => {
    expect(getConfidenceThreshold()).toBe(0.7);
  });
});
