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

export interface ApifyRawEvent {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    name?: string;
    address?: string;
  };
  url?: string;
  image?: string;
  [key: string]: unknown;
}

export async function scrapeSource(
  sourceUrl: string
): Promise<ApifyRawEvent[]> {
  const logger = getLogger();
  const client = getApifyClient();

  try {
    const run = await client.actor("apify/facebook-events-scraper").call({
      startUrls: [{ url: sourceUrl }],
      maxItems: 50,
    });

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    logger.info(
      { source: sourceUrl, count: items.length },
      "Apify scrape completed"
    );

    return items as ApifyRawEvent[];
  } catch (error) {
    logger.error({ error, source: sourceUrl }, "Apify scrape failed");
    throw error;
  }
}
