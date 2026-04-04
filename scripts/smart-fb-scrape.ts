/**
 * Smart Facebook scraper script.
 *
 * Scrapes the top Facebook pages by quality score, uses Claude Vision
 * to extract events from flyer images, and updates quality scores.
 *
 * Usage: npx tsx scripts/smart-fb-scrape.ts
 */
import { loadConfig } from "../src/config.js";
import { getDb, closeDb } from "../src/db/index.js";
import { sources } from "../src/db/schema.js";
import { scrapeSource } from "../src/scraper/apify.js";
import { normalizeApifyPost } from "../src/scraper/normalizer.js";
import { deduplicateEvents } from "../src/scraper/dedup.js";
import { analyzeEventImage, enrichEventWithImageData } from "../src/scraper/image-enricher.js";
import { extractEvent } from "../src/llm/extractor.js";
import { upsertEvent } from "../src/events/repository.js";
import { getSourcesByQuality, updateSourceQuality } from "../src/scraper/source-quality.js";
import { recordScrapeSuccess, recordScrapeFailure } from "../src/scraper/health.js";
import type { NewEvent, Source } from "../src/db/schema.js";
import type { ApifyFacebookPost } from "../src/scraper/apify.js";
import { eq } from "drizzle-orm";

loadConfig();

const MAX_IMAGES_PER_PAGE = 3;
const MAX_SOURCES = 15;
const POSTS_PER_PAGE = 20;

interface PageResult {
  name: string;
  url: string;
  totalPosts: number;
  postsWithImages: number;
  imagesAnalyzed: number;
  eventsFromImages: number;
  eventsFromText: number;
  eventsInserted: number;
  error?: string;
}

async function main() {
  const db = getDb();

  console.log("=== Smart Facebook Scraper ===\n");
  console.log(`Max sources: ${MAX_SOURCES} | Max images/page: ${MAX_IMAGES_PER_PAGE}\n`);

  // Step 1: Get top sources by quality (or all if first run)
  let fbSources = await getSourcesByQuality(MAX_SOURCES);

  if (fbSources.length === 0) {
    // First run or no FB sources — get all active facebook_page sources
    console.log("No quality-scored sources found. Using all active FB sources.\n");
    const allSources = await db
      .select()
      .from(sources)
      .where(eq(sources.isActive, true));

    fbSources = allSources.filter(
      (s) =>
        s.type === "facebook_page" &&
        s.url.includes("facebook.com")
    );
  }

  console.log(`Found ${fbSources.length} Facebook sources to scrape:\n`);
  for (const s of fbSources) {
    console.log(`  ${s.name} (quality: ${(s.qualityScore ?? 0.5).toFixed(2)})`);
  }
  console.log();

  const results: PageResult[] = [];
  let totalInserted = 0;
  let totalFromImages = 0;
  let totalFromText = 0;

  // Step 2: Scrape each page
  for (const source of fbSources) {
    console.log(`--- Scraping: ${source.name} ---`);
    const pageResult: PageResult = {
      name: source.name,
      url: source.url,
      totalPosts: 0,
      postsWithImages: 0,
      imagesAnalyzed: 0,
      eventsFromImages: 0,
      eventsFromText: 0,
      eventsInserted: 0,
    };

    try {
      // Scrape posts via Apify
      const rawPosts = await scrapeSource(source.url);
      pageResult.totalPosts = rawPosts.length;
      console.log(`  Posts fetched: ${rawPosts.length}`);

      // Separate image and text-only posts
      const imagePosts: ApifyFacebookPost[] = [];
      const textPosts: ApifyFacebookPost[] = [];

      for (const post of rawPosts) {
        const hasImage =
          post.media &&
          post.media.length > 0 &&
          (post.media[0].photo_image?.uri || post.media[0].thumbnail);
        if (hasImage) {
          imagePosts.push(post);
        } else {
          textPosts.push(post);
        }
      }

      pageResult.postsWithImages = imagePosts.length;
      console.log(`  Posts with images: ${imagePosts.length}`);

      const events: NewEvent[] = [];

      // Phase 1: Image posts (Vision analysis)
      for (const post of imagePosts.slice(0, MAX_IMAGES_PER_PAGE)) {
        const normalized = normalizeApifyPost(post, "San Miguel de Allende", source.url);
        if (!normalized) continue;

        if (normalized.imageUrl) {
          try {
            const imageData = await analyzeEventImage(normalized.imageUrl);
            pageResult.imagesAnalyzed++;

            if (imageData && imageData.hasEventInfo) {
              enrichEventWithImageData(normalized, imageData);
              normalized.confidence = 0.9;
              pageResult.eventsFromImages++;
              events.push(normalized);
              console.log(`  [IMAGE] ${normalized.title?.substring(0, 50)} | Date: ${normalized.eventDate || "unknown"}`);
              continue;
            }
          } catch {
            // Fall through to text
          }
        }

        // Image didn't work, try text
        const enriched = await enrichWithText(normalized);
        if (enriched && (enriched.confidence ?? 0) >= 0.5) {
          enriched.confidence = 0.5;
          pageResult.eventsFromText++;
          events.push(enriched);
          console.log(`  [TEXT]  ${enriched.title?.substring(0, 50)} | Date: ${enriched.eventDate || "unknown"}`);
        }
      }

      // Phase 2: Remaining image posts (text-only, beyond MAX_IMAGES_PER_PAGE)
      for (const post of imagePosts.slice(MAX_IMAGES_PER_PAGE)) {
        const normalized = normalizeApifyPost(post, "San Miguel de Allende", source.url);
        if (!normalized) continue;

        const enriched = await enrichWithText(normalized);
        if (enriched && (enriched.confidence ?? 0) >= 0.5) {
          enriched.confidence = 0.5;
          pageResult.eventsFromText++;
          events.push(enriched);
        }
      }

      // Phase 3: Text-only posts
      for (const post of textPosts) {
        const normalized = normalizeApifyPost(post, "San Miguel de Allende", source.url);
        if (!normalized) continue;

        const enriched = await enrichWithText(normalized);
        if (enriched && (enriched.confidence ?? 0) >= 0.5) {
          enriched.confidence = 0.5;
          pageResult.eventsFromText++;
          events.push(enriched);
        }
      }

      // Deduplicate and insert
      const { unique, duplicates } = await deduplicateEvents(events);

      for (const event of unique) {
        await upsertEvent(event);
      }

      pageResult.eventsInserted = unique.length;
      totalInserted += unique.length;
      totalFromImages += pageResult.eventsFromImages;
      totalFromText += pageResult.eventsFromText;

      // Update source quality
      await updateSourceQuality(source.id, unique.length, pageResult.eventsFromImages);
      await recordScrapeSuccess(source.id);

      console.log(
        `  Result: ${rawPosts.length} posts, ${imagePosts.length} with images, ` +
        `${pageResult.imagesAnalyzed} analyzed, ${pageResult.eventsFromImages} from images, ` +
        `${pageResult.eventsFromText} from text, ${unique.length} inserted (${duplicates} dupes)`
      );
    } catch (error: any) {
      pageResult.error = error.message || String(error);
      await recordScrapeFailure(source.id);
      // Still update quality with zero results so totalScrapes increments
      await updateSourceQuality(source.id, 0, 0);
      console.log(`  ERROR: ${pageResult.error}`);
    }

    results.push(pageResult);
    console.log();
  }

  // Step 3: Print summary
  console.log("\n=== SUMMARY ===\n");
  console.log(`Sources scraped: ${results.length}`);
  console.log(`Total events inserted: ${totalInserted}`);
  console.log(`Events from images: ${totalFromImages}`);
  console.log(`Events from text: ${totalFromText}`);
  console.log();

  // Re-fetch sources with updated quality scores
  const updatedSources = await getSourcesByQuality(50);

  console.log("Source Quality Rankings:");
  console.log("-".repeat(70));
  for (const s of updatedSources) {
    const score = (s.qualityScore ?? 0.5).toFixed(3);
    const scrapes = s.totalScrapes ?? 0;
    const found = s.eventsFound ?? 0;
    const fromImages = s.eventsFromImages ?? 0;
    const useful = found > 0 ? "USEFUL" : scrapes > 0 ? "NO EVENTS" : "NEW";
    console.log(
      `  ${score} | ${s.name.padEnd(35)} | ${scrapes} scrapes | ${found} events (${fromImages} from images) | ${useful}`
    );
  }

  console.log("\nDone!");
  await closeDb();
  process.exit(0);
}

/**
 * Enrich an event using LLM text extraction.
 */
async function enrichWithText(event: NewEvent): Promise<NewEvent | null> {
  if (!event.rawContent) return event;

  try {
    const extraction = await extractEvent(event.rawContent);

    if (extraction.category && (!event.category || event.category === "other")) {
      event.category = extraction.category as any;
    }
    if (extraction.neighborhood && !event.neighborhood) {
      event.neighborhood = extraction.neighborhood;
    }
    if (extraction.eventDate) {
      try {
        const parsedDate = new Date(extraction.eventDate);
        if (!isNaN(parsedDate.getTime())) {
          event.eventDate = parsedDate;
          event.contentType = "event";
        }
      } catch {
        // Skip
      }
    }
    if (extraction.isRecurring && !event.recurrenceDay) {
      event.contentType = "recurring";
      event.recurrenceDay = extraction.recurrenceDay;
      event.recurrenceTime = extraction.recurrenceTime;
    }
    if (extraction.price && !event.price) event.price = extraction.price;
    if (extraction.duration && !event.duration) event.duration = extraction.duration;
  } catch {
    // Skip extraction failures
  }

  return event;
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
