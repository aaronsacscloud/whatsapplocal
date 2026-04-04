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

export interface ApifyFacebookPost {
  text?: string;
  url?: string;
  facebookUrl?: string;
  time?: string;
  timestamp?: number;
  pageName?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  media?: Array<{
    thumbnail?: string;
    photo_image?: { uri?: string };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Scrape recent posts from a Facebook page via Apify.
 * Uses the apify/facebook-posts-scraper actor.
 */
export async function scrapeSource(
  sourceUrl: string
): Promise<ApifyFacebookPost[]> {
  const logger = getLogger();
  const client = getApifyClient();

  try {
    logger.info({ source: sourceUrl }, "Starting Apify Facebook scrape");

    const run = await client
      .actor("apify/facebook-posts-scraper")
      .call(
        {
          startUrls: [{ url: sourceUrl }],
          resultsLimit: 20,
        },
        { waitSecs: 120 }
      );

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    logger.info(
      { source: sourceUrl, count: items.length },
      "Apify scrape completed"
    );

    return items as ApifyFacebookPost[];
  } catch (error) {
    logger.error({ error, source: sourceUrl }, "Apify scrape failed");
    throw error;
  }
}
