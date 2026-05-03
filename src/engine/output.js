/**
 * Output Mapping & Key Drivers / Risk Flags Generator
 *
 * Assembles the final JSON response from all engine outputs.
 */

function identifyKeyDrivers(features, marketValue) {
  const drivers = [];
  const adj = marketValue.adjustments;

  // Rank adjustments by absolute impact
  const ranked = Object.entries(adj)
    .map(([k, v]) => ({ key: k, impact: Math.abs(v), direction: v >= 0 ? '+' : '-' }))
    .sort((a, b) => b.impact - a.impact);

  // Top positive drivers
  for (const r of ranked) {
    if (drivers.length >= 4) break;
    if (r.direction === '+' && r.impact > 0.01) {
      drivers.push(formatDriverName(r.key));
    }
  }

  // Location and subtype are always drivers
  if (!drivers.includes('location_premium') && features.locationPremium > 1.0) {
    drivers.push(formatDriverName('prime_location'));
  }

  // Age bucket
  if (features.ageBucket === 'new') drivers.push('New Construction');
  else if (features.ageBucket === 'mid_age') drivers.push('Mid Age Building');

  // Infrastructure
  if (features.infraScore > 0.7) drivers.push('Strong Infrastructure Access');

  // Rental
  if (features.rentalYield > 0.04) drivers.push('Healthy Rental Yield');

  // AI Insights
  if (features.geminiData?.key_drivers) {
    features.geminiData.key_drivers.forEach(driver => {
      drivers.push(driver);
    });
  }

  return [...new Set(drivers)].slice(0, 8);
}

function identifyRiskFlags(features, fpResult) {
  const risks = [];

  // From false positive checks
  for (const flag of fpResult.flags) {
    risks.push(flag.split(':')[0]);
  }

  // Legal
  if (!features.legalStatus.clear_title) risks.push('unclear title');
  if (features.legalStatus.leasehold) risks.push('leasehold property');

  // Market
  if (features.marketActivity < 0.4) risks.push('low market activity');
  if (features.supplyDemandBalance < 0.4) risks.push('weak demand');

  // Age
  if (features.ageYears > 25) risks.push('significant building age');
  if (features.ageBucket === 'old' && (!features.geminiData)) {
    risks.push('old property, no visual verification');
  }

  // Fungibility
  if (features.fungibility < 0.35) risks.push('niche asset, low fungibility');

  // Competition
  if (features.marketActivity > 0.80 && features.zone === 'urban') {
    risks.push('high micro market competition');
  }

  // AI Vision Risks
  if (features.geminiData?.risk_flags) {
    features.geminiData.risk_flags.forEach(flag => {
      risks.push(flag);
    });
  }

  return [...new Set(risks)].slice(0, 8);
}

function formatDriverName(key) {
  return key
    .replace(/([A-Z])/g, '_$1')
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function buildOutput(marketValue, distressValue, resaleIndex, timeToLiquidate, confidence, features, fpResult) {
  return {
    market_value_range: [marketValue.lower, marketValue.upper],
    distress_value_range: [distressValue.lower, distressValue.upper],
    resale_potential_index: resaleIndex,
    estimated_time_to_sell_days: [timeToLiquidate.min, timeToLiquidate.max],
    confidence_score: confidence,
    key_drivers: identifyKeyDrivers(features, marketValue),
    risk_flags: identifyRiskFlags(features, fpResult),
  };
}

module.exports = { buildOutput };
