/**
 * Valuation Engine
 *
 * Produces market value range and distress value range.
 * Anchor: circle_rate × effective_area.
 */

const { DISTRESS_DISCOUNT } = require('../utils/constants');
const { clamp, roundToLakh } = require('../utils/helpers');

function computeMarketValue(f) {
  // Base value = circle rate × plot footprint (NOT total carpet across all floors)
  // For multi-floor: additional floors add built-up value via multiplier
  const plotBase = f.circleRate * f.effectiveArea;
  const baseValue = plotBase * (f.builtupFloorMultiplier || 1.0);

  const adjustments = {};

  adjustments.location_premium = f.locationPremium - 1.0;
  adjustments.subtype = f.subtypeMultiplier - 1.0;

  // Size scaling uses total built area for multi-floor, not just footprint
  const sizeRef = f.totalBuiltArea || f.effectiveArea;
  if (sizeRef > 3000)      adjustments.size_scaling = -0.05;
  else if (sizeRef > 2000) adjustments.size_scaling = -0.02;
  else if (sizeRef < 500)  adjustments.size_scaling =  0.03;
  else                     adjustments.size_scaling =  0.00;

  adjustments.age_depreciation = f.depreciationFactor - 1.0;
  adjustments.infrastructure = (f.infraScore - 0.5) * 0.20;
  adjustments.floor = f.floorAdj;

  if (f.rentalYield > 0.05)           adjustments.rental_yield = 0.06;
  else if (f.rentalYield > 0.03)      adjustments.rental_yield = 0.03;
  else if (f.occupancy === 'rented')  adjustments.rental_yield = 0.02;
  else                                 adjustments.rental_yield = 0.00;

  if (f.legalClarity >= 0.85)      adjustments.legal =  0.05;
  else if (f.legalClarity >= 0.60) adjustments.legal =  0.00;
  else if (f.legalClarity >= 0.40) adjustments.legal = -0.08;
  else                              adjustments.legal = -0.15;

  adjustments.image_quality = f.imageFeatures.available
    ? (f.imageFeatures.quality_score - 0.5) * 0.10
    : 0.00;

  adjustments.price_momentum = f.priceMomentum;

  const rawAdj = Object.values(adjustments).reduce((s, v) => s + v, 0);
  // Clamp total adjustment so value never drops below 20% of circle-rate anchor
  const totalAdj = clamp(rawAdj, -0.80, 2.0);
  const midValue = baseValue * (1 + totalAdj);

  let spread = 0.08;
  if (f.zone === 'rural' || f.zone === 'periurban') spread += 0.04;
  if (f.marketActivity < 0.4) spread += 0.04;
  if (f.legalClarity < 0.5) spread += 0.03;
  if (!f.imageFeatures.available) spread += 0.02;
  if (f.ageBucket === 'old') spread += 0.02;
  if (f.fungibility < 0.4) spread += 0.03;
  spread = clamp(spread, 0.05, 0.25);

  const lower = roundToLakh(midValue * (1 - spread));
  const upper = roundToLakh(midValue * (1 + spread));
  const floor = roundToLakh(baseValue * 0.20); // absolute floor

  return {
    lower: Math.max(lower, floor),
    upper: Math.max(upper, floor),
    baseValue: roundToLakh(baseValue),
    midValue: Math.max(roundToLakh(midValue), floor),
    adjustments,
  };
}

function computeDistressValue(marketValue, f) {
  const liquiditySignal = (f.marketActivity + f.legalClarity + f.fungibility) / 3;
  let discountRange;

  if (liquiditySignal >= 0.70)      discountRange = { ...DISTRESS_DISCOUNT.high_liquidity };
  else if (liquiditySignal >= 0.45) discountRange = { ...DISTRESS_DISCOUNT.medium_liquidity };
  else                              discountRange = { ...DISTRESS_DISCOUNT.low_liquidity };

  if (!f.legalStatus.clear_title) discountRange.max = clamp(discountRange.max + 0.05, 0, 0.60);
  if (f.ageBucket === 'old')      discountRange.min = clamp(discountRange.min + 0.03, 0, 0.50);
  if (f.propertyType === 'Industrial') discountRange.max = clamp(discountRange.max + 0.05, 0, 0.60);

  return {
    lower: Math.max(roundToLakh(marketValue.lower * (1 - discountRange.max)), 100000),
    upper: Math.max(roundToLakh(marketValue.upper * (1 - discountRange.min)), 100000),
    discountRange,
  };
}

module.exports = { computeMarketValue, computeDistressValue };
