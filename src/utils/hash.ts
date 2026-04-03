import { createHash } from "crypto";
import { getConfig } from "../config.js";

export function hashPhone(phone: string): string {
  const salt = getConfig().PHONE_HASH_SALT;
  return createHash("sha256").update(salt + phone).digest("hex");
}

export function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function eventDeduplicationHash(
  venueName: string,
  eventDate: string,
  city: string
): string {
  const normalized = normalizeVenueName(venueName);
  const input = `${normalized}|${eventDate}|${city.toLowerCase().trim()}`;
  return createHash("sha256").update(input).digest("hex");
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
