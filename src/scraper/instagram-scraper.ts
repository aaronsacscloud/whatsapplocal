import { ApifyClient } from "apify-client";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

let _client: ApifyClient | null = null;

function getApifyClient(): ApifyClient {
  if (_client) return _client;
  const config = getConfig();
  _client = new ApifyClient({ token: config.APIFY_API_TOKEN });
  return _client;
}

export interface ApifyInstagramPost {
  caption?: string;
  url?: string;
  shortCode?: string;
  displayUrl?: string;
  imageUrl?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  ownerUsername?: string;
  ownerFullName?: string;
  type?: string; // "Image", "Video", "Sidecar"
  images?: string[];
  [key: string]: unknown;
}

/**
 * Scrape recent posts from an Instagram account via Apify.
 * Uses the apify/instagram-post-scraper actor.
 */
export async function scrapeInstagramAccount(
  sourceUrl: string,
  limit: number = 10
): Promise<ApifyInstagramPost[]> {
  const logger = getLogger();
  const client = getApifyClient();

  try {
    logger.info({ source: sourceUrl }, "Starting Apify Instagram scrape");

    const run = await client
      .actor("apify/instagram-post-scraper")
      .call(
        {
          directUrls: [sourceUrl],
          resultsLimit: limit,
        },
        { waitSecs: 120 }
      );

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    logger.info(
      { source: sourceUrl, count: items.length },
      "Apify Instagram scrape completed"
    );

    return items as ApifyInstagramPost[];
  } catch (error) {
    logger.error({ error, source: sourceUrl }, "Apify Instagram scrape failed");
    throw error;
  }
}
