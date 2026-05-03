/**
 * Liquidity Engine
 *
 * Produces Resale Potential Index (0–100) and
 * Estimated Time to Liquidate (days range).
 */

const { LIQUIDITY_WEIGHTS, LIQUIDATION_BANDS } = require('../utils/constants');
const { clamp, weightedSum } = require('../utils/helpers');

function computeResaleIndex(f) {
  const scores = {
    location_demand:       f.zone === 'prime' ? 0.95 : f.zone === 'urban' ? 0.75 : f.zone === 'suburban' ? 0.55 : f.zone === 'periurban' ? 0.35 : 0.20,
    infrastructure:        f.infraScore,
    configuration:         f.fungibility,
    legal_clarity:         f.legalClarity,
    age_condition:         f.depreciationFactor,
    fungibility:           f.fungibility,
    rental_attractiveness: f.rentalYield > 0.04 ? 0.85 : f.rentalYield > 0.02 ? 0.60 : f.incomeStability,
    market_activity:       f.marketActivity,
    accessibility:         f.accessibility.lift ? 0.80 : f.accessibility.ground_floor_access ? 0.70 : 0.40,
  };

  let raw = weightedSum(scores, LIQUIDITY_WEIGHTS);
  
  if (f.geminiData?.liquidity_impact_factor) {
    raw *= f.geminiData.liquidity_impact_factor;
  }
  
  return Math.round(clamp(raw * 100, 0, 100));
}

function computeTimeToLiquidate(resaleIndex, f) {
  let band;
  if (resaleIndex >= 80)      band = { ...LIQUIDATION_BANDS.high };
  else if (resaleIndex >= 50) band = { ...LIQUIDATION_BANDS.medium };
  else                        band = { ...LIQUIDATION_BANDS.low };

  // Type adjustment
  if (f.propertyType === 'Commercial')  { band.min += 10; band.max += 20; }
  if (f.propertyType === 'Industrial')  { band.min += 30; band.max += 60; }

  // Niche subtype adjustment
  if (f.fungibility < 0.4) { band.min += 15; band.max += 30; }

  // Legal complexity
  if (f.legalClarity < 0.5) { band.min += 10; band.max += 25; }

  // Old property
  if (f.ageBucket === 'old') { band.min += 5; band.max += 15; }

  return { min: band.min, max: band.max };
}

module.exports = { computeResaleIndex, computeTimeToLiquidate };
