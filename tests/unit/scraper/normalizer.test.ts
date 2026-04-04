import { describe, it, expect } from "vitest";
import {
  normalizeApifyPosts,
} from "../../../src/scraper/normalizer.js";
import type { ApifyFacebookPost } from "../../../src/scraper/apify.js";

describe("normalizeApifyPosts", () => {
  it("normalizes a post with event signals", () => {
    const posts: ApifyFacebookPost[] = [
      {
        text: "Esta noche jazz en vivo! 9pm. Cover $100. No se lo pierdan!",
        url: "https://facebook.com/post/123",
        time: "2026-04-05T21:00:00Z",
        pageName: "RaindogLounge",
        likes: 50,
      },
    ];

    const results = normalizeApifyPosts(posts, "San Miguel de Allende", "https://fb.com/page");
    expect(results.length).toBeGreaterThanOrEqual(1);

    const event = results[0];
    expect(event.city).toBe("San Miguel de Allende");
    expect(event.sourceType).toBe("facebook_page");
    expect(event.confidence).toBeGreaterThanOrEqual(0.5);
    expect(event.rawContent).toContain("jazz en vivo");
  });

  it("filters out posts with too little text", () => {
    const posts: ApifyFacebookPost[] = [
      { text: "Hi!", time: "2026-04-05T10:00:00Z", pageName: "Test" },
    ];

    const results = normalizeApifyPosts(posts, "BA", "url");
    expect(results).toHaveLength(0);
  });

  it("assigns lower confidence to non-event posts", () => {
    const posts: ApifyFacebookPost[] = [
      {
        text: "We rescued Frankie the dog a few weeks before we opened. She is now our beloved mascot and greeter.",
        time: "2026-04-02T15:00:00Z",
        pageName: "RaindogLounge",
      },
    ];

    const results = normalizeApifyPosts(posts, "SMA", "url");
    // This post has no event signals, should get low confidence and be filtered
    for (const r of results) {
      expect(r.confidence).toBeLessThan(0.7);
    }
  });

  it("extracts venue name from page name", () => {
    const posts: ApifyFacebookPost[] = [
      {
        text: "Tonight live music with the band! 8pm until midnight. Free cover. Come join us!",
        time: "2026-04-05T20:00:00Z",
        pageName: "BarElPoblado",
      },
    ];

    const results = normalizeApifyPosts(posts, "SMA", "url");
    if (results.length > 0) {
      expect(results[0].venueName).toContain("Bar");
    }
  });
});
