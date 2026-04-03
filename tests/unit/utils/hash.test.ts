import { describe, it, expect } from "vitest";
import {
  hashPhone,
  normalizeVenueName,
  eventDeduplicationHash,
  levenshteinDistance,
} from "../../../src/utils/hash.js";

describe("hashPhone", () => {
  it("produces a deterministic hash", () => {
    const hash1 = hashPhone("+5491112345678");
    const hash2 = hashPhone("+5491112345678");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different numbers", () => {
    const hash1 = hashPhone("+5491112345678");
    const hash2 = hashPhone("+5491187654321");
    expect(hash1).not.toBe(hash2);
  });
});

describe("normalizeVenueName", () => {
  it("lowercases and strips articles", () => {
    expect(normalizeVenueName("El Bar de Juan")).toBe("bar de juan");
    expect(normalizeVenueName("La Terraza")).toBe("terraza");
    expect(normalizeVenueName("Los Amigos")).toBe("amigos");
    expect(normalizeVenueName("Las Flores")).toBe("flores");
  });

  it("collapses whitespace", () => {
    expect(normalizeVenueName("Bar   El   Poblado")).toBe("bar el poblado");
  });

  it("trims", () => {
    expect(normalizeVenueName("  Bar Central  ")).toBe("bar central");
  });
});

describe("eventDeduplicationHash", () => {
  it("produces same hash for equivalent events", () => {
    const h1 = eventDeduplicationHash("El Bar", "2026-04-05", "Buenos Aires");
    const h2 = eventDeduplicationHash("El Bar", "2026-04-05", "Buenos Aires");
    expect(h1).toBe(h2);
  });

  it("normalizes venue name in hash", () => {
    const h1 = eventDeduplicationHash("El Bar", "2026-04-05", "Buenos Aires");
    const h2 = eventDeduplicationHash("el bar", "2026-04-05", "buenos aires");
    expect(h1).toBe(h2);
  });

  it("different dates produce different hashes", () => {
    const h1 = eventDeduplicationHash("Bar", "2026-04-05", "Buenos Aires");
    const h2 = eventDeduplicationHash("Bar", "2026-04-06", "Buenos Aires");
    expect(h1).not.toBe(h2);
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("bar", "bar")).toBe(0);
  });

  it("returns correct distance for similar strings", () => {
    expect(levenshteinDistance("bar", "baz")).toBe(1);
    expect(levenshteinDistance("bar poblado", "bar pobaldo")).toBe(2);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });
});
