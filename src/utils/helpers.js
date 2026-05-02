/**
 * Shared helper utilities used across the engine layers.
 */

/**
 * Clamp a number between min and max.
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to N decimal places.
 */
function round(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Round to the nearest lakh (1,00,000) for cleaner display.
 */
function roundToLakh(value) {
  return Math.round(value / 100000) * 100000;
}

/**
 * Linear interpolation between a and b by factor t ∈ [0,1].
 */
function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Simple deterministic hash for a string → 0..1 range.
 * Used to create consistent synthetic "signals" from address text.
 */
function stringHash01(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

/**
 * Weighted sum of an object's values using a weight map.
 * Both maps are { key: number }; missing keys are skipped.
 */
function weightedSum(values, weights) {
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (values[key] !== undefined) {
      total += values[key] * weight;
      weightSum += weight;
    }
  }
  return weightSum > 0 ? total / weightSum : 0;
}

module.exports = { clamp, round, roundToLakh, lerp, stringHash01, weightedSum };
