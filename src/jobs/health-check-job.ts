import { getSourceHealth } from "../scraper/health.js";
import { getLogger } from "../utils/logger.js";

export async function executeHealthCheckJob(): Promise<void> {
  const logger = getLogger();

  try {
    const health = await getSourceHealth();
    const degraded = health.filter(
      (s) => s.isActive && (s.successRate ?? 1) < 0.8
    );
    const inactive = health.filter((s) => !s.isActive);

    if (degraded.length > 0) {
      logger.warn(
        { degraded: degraded.map((s) => s.name) },
        "Degraded sources detected"
      );
    }

    if (inactive.length > 0) {
      logger.warn(
        { inactive: inactive.map((s) => s.name) },
        "Inactive sources"
      );
    }

    logger.info(
      {
        total: health.length,
        active: health.length - inactive.length,
        degraded: degraded.length,
        inactive: inactive.length,
      },
      "Health check complete"
    );
  } catch (error) {
    logger.error({ error }, "Health check job failed");
  }
}
