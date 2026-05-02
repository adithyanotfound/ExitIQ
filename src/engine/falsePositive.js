/**
 * False Positive Detection & Confidence Calibration
 *
 * Guards against overstated size, location-property mismatches,
 * configuration implausibility, and legal-risk suppression.
 */

const { clamp } = require('../utils/helpers');

// Area norms by sub-type (sqft)
const AREA_NORMS = {
  Apartment:  { min: 300,  max: 4000,  typical: 1200 },
  'Detached House': { min: 1500, max: 15000, typical: 3500 },
  Plot:       { min: 500,  max: 50000, typical: 2400 },
  Shop:       { min: 100,  max: 3000,  typical: 500  },
  Warehouse:  { min: 1000, max: 100000,typical: 8000 },
  Office:     { min: 200,  max: 10000, typical: 1500 },
  Penthouse:  { min: 1500, max: 8000,  typical: 3000 },
  Studio:     { min: 200,  max: 800,   typical: 450  },
  Duplex:     { min: 1000, max: 5000,  typical: 2000 },
  Farmhouse:  { min: 2000, max: 50000, typical: 5000 },
};

// Type-zone compatibility
const TYPE_ZONE_COMPAT = {
  Warehouse:  { prime: false, urban: false },
  Farmhouse:  { prime: false, urban: false, suburban: false },
  Shop:       { rural: false },
  Penthouse:  { rural: false, periurban: false },
};

function runFalsePositiveChecks(input, features) {
  const flags = [];
  let confidencePenalty = 0;

  // A – Size sanity
  const norm = AREA_NORMS[input.sub_type] || AREA_NORMS.Apartment;
  const area = input._effective_area;
  if (area < norm.min * 0.5) {
    flags.push(`area_below_minimum: ${area} sqft is unusually small for ${input.sub_type}`);
    confidencePenalty += 0.10;
  }
  if (area > norm.max * 1.5) {
    flags.push(`area_above_maximum: ${area} sqft is unusually large for ${input.sub_type}`);
    confidencePenalty += 0.08;
  }

  // Carpet/builtup consistency
  if (input._builtup_carpet_ratio !== null) {
    if (input._builtup_carpet_ratio < 1.0) {
      flags.push('builtup_smaller_than_carpet: built-up area cannot be less than carpet area');
      confidencePenalty += 0.12;
    }
    if (input._builtup_carpet_ratio > 1.8) {
      flags.push('excessive_loading_factor: built-up to carpet ratio exceeds 1.8×');
      confidencePenalty += 0.06;
    }
  }

  // B – Location-property mismatch
  const compat = TYPE_ZONE_COMPAT[input.sub_type];
  if (compat && compat[features.zone] === false) {
    flags.push(`zone_type_mismatch: ${input.sub_type} in ${features.zone} zone is unusual`);
    confidencePenalty += 0.10;
  }

  // C – Configuration plausibility
  if (input.sub_type === 'Apartment' && input.floor_from === 0 && !input.accessibility.ground_floor_access) {
    flags.push('ground_floor_apartment_no_access: ground floor declared but no ground access');
    confidencePenalty += 0.04;
  }

  // Multi-floor sanity: apartments rarely span more than 2 floors
  if (input.sub_type === 'Apartment' && input._floor_span > 2) {
    flags.push(`apartment_excessive_span: apartment spanning ${input._floor_span} floors is unusual`);
    confidencePenalty += 0.06;
  }

  // Floor exceeds building: floor_to above total floors
  if (input.total_building_floors && input.floor_to > input.total_building_floors) {
    flags.push('floor_exceeds_building: unit floor is above total building floors');
    confidencePenalty += 0.08;
  }

  // Per-floor area consistency checks
  if (input.floor_areas && input.floor_areas.length > 0 && input._floor_area_sum > 0) {
    // Check sum vs carpet area mismatch (> 20% difference)
    const carpet = input.size.carpet_area_sqft;
    if (carpet > 0 && Math.abs(input._floor_area_sum - carpet) / carpet > 0.20) {
      flags.push(`floor_area_sum_mismatch: per-floor sum (${input._floor_area_sum}) differs from carpet area (${carpet}) by >20%`);
      confidencePenalty += 0.05;
    }

    // Check extreme variance between floor sizes (max > 3× min)
    const floorSizes = input.floor_areas.map(fa => fa.area_sqft);
    const maxSize = Math.max(...floorSizes);
    const minSize = Math.min(...floorSizes);
    if (minSize > 0 && maxSize / minSize > 3) {
      flags.push(`floor_area_extreme_variance: largest floor (${maxSize}) is >3× smallest (${minSize})`);
      confidencePenalty += 0.04;
    }
  }

  if (input.age_years > 30 && features.imageFeatures.available && features.imageFeatures.quality_score > 0.8) {
    flags.push('old_property_high_quality_images: declared age conflicts with near-new appearance');
    confidencePenalty += 0.06;
  }

  // D – Legal risk suppression
  const legalRisk = !input.legal_status.clear_title || input.legal_status.leasehold;

  return { flags, confidencePenalty, legalRisk };
}

function computeConfidence(features, fpResult) {
  let confidence = 0.80; // base

  // Boost for rich inputs
  if (features.imageFeatures.available) confidence += 0.05;
  if (features.rentMonthly > 0) confidence += 0.03;
  if (features.builtupCarpetRatio !== null) confidence += 0.02;

  // Penalise for uncertainty
  if (features.zone === 'rural') confidence -= 0.08;
  if (features.zone === 'periurban') confidence -= 0.04;
  if (features.marketActivity < 0.3) confidence -= 0.06;
  if (features.legalClarity < 0.5) confidence -= 0.06;
  if (features.fungibility < 0.35) confidence -= 0.04;
  if (features.ageBucket === 'old') confidence -= 0.03;

  // False positive penalties
  confidence -= fpResult.confidencePenalty;

  return clamp(Math.round(confidence * 100) / 100, 0.15, 0.98);
}

module.exports = { runFalsePositiveChecks, computeConfidence };
