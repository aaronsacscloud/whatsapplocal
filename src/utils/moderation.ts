const CONFIDENCE_THRESHOLD = 0.7;

export function isContentAcceptable(confidence: number): boolean {
  return confidence >= CONFIDENCE_THRESHOLD;
}

export function getConfidenceThreshold(): number {
  return CONFIDENCE_THRESHOLD;
}
