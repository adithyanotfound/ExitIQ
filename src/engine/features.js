/**
 * Feature Engineering Layer
 *
 * Transforms validated input into a rich feature set that drives
 * valuation and liquidity scoring downstream.
 *
 * Feature groups:
 *   A – Location Intelligence  (rich Geoapify composite scores)
 *   B – Property Characteristics
 *   C – Legal & Ownership
 *   D – Income & Usage
 *   E – Market Dynamics
 *   F – Image-derived (stub, if images present)
 */

const {
  CIRCLE_RATES,
  SUBTYPE_MULTIPLIERS,
  AGE_DEPRECIATION,
  FLOOR_ADJUSTMENTS,
  ZONE_KEYWORDS,
  HIGH_FUNGIBILITY_SUBTYPES,
  LOW_FUNGIBILITY_SUBTYPES,
} = require('../utils/constants');
const { clamp, stringHash01 } = require('../utils/helpers');

// ── Geo enrichment check helper ───────────────────────────────────────────
function isGeoEnriched(geoData) {
  return !!(geoData && !geoData.error && geoData.location);
}

// ── Zone Detection ────────────────────────────────────────────────────────
function detectZone(address, geoData) {
  if (isGeoEnriched(geoData) && geoData.location.display_name) {
    const resolved = geoData.location.display_name.toLowerCase();
    for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
      for (const kw of keywords) {
        if (resolved.includes(kw)) return zone;
      }
    }
  }
  const addr = address.toLowerCase();
  for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
    for (const kw of keywords) {
      if (addr.includes(kw)) return zone;
    }
  }
  return 'suburban';
}

// ── Circle Rate Lookup ────────────────────────────────────────────────────
function getCircleRate(zone, propertyType) {
  const zoneRates = CIRCLE_RATES.default[zone] || CIRCLE_RATES.default.suburban;
  return zoneRates[propertyType] || zoneRates.Residential;
}

// ── Age Depreciation Factor ───────────────────────────────────────────────
function computeDepreciation(age) {
  let totalDep = 0;
  let remaining = age;
  for (const band of AGE_DEPRECIATION) {
    if (remaining <= 0) break;
    const yearsInBand = Math.min(remaining, band.maxAge - (age - remaining));
    const effectiveYears = Math.max(0, Math.min(yearsInBand, remaining));
    totalDep += effectiveYears * band.annualRate;
    remaining -= effectiveYears;
  }
  return clamp(1 - totalDep, 0.65, 1.0);
}

// ── Floor Adjustment ────────────────────────────────────────────────────────
function getFloorAdjustment(input) {
  const floorLevel = input._floor_level || input.floor_level || 'mid';
  let adj = FLOOR_ADJUSTMENTS[floorLevel] || FLOOR_ADJUSTMENTS.mid;

  const hasLift  = input.accessibility?.lift;
  const floorTo  = input.floor_to || 0;
  const span     = input._floor_span || 1;

  if (floorTo > 8 && !hasLift) {
    adj -= 0.06;
  } else if (floorTo > 3 && !hasLift) {
    adj -= 0.03;
  }

  if (span >= 2) adj += 0.04;
  if (span >= 3) adj += 0.02;

  return adj;
}

// ── Infrastructure Score ──────────────────────────────────────────────────
// Uses rich Geoapify composite when available; falls back to synthetic
function computeInfraScore(address, zone, geoData) {
  if (isGeoEnriched(geoData) && geoData.scores) {
    // Pipeline now provides infra_score from metro + hospital + school + bus
    const geoInfra = geoData.scores.infra_score || 0;

    // Zone proxies for categories not covered by POI search (highway, airport)
    const highwayProxy = zone === 'prime' || zone === 'urban' ? 0.70 : 0.40;
    const airportProxy = zone === 'prime' ? 0.60 : zone === 'urban' ? 0.45 : 0.25;

    // 80% real data, 20% zone proxy (was 70/30 with 2 categories)
    const blended = geoInfra * 0.80 + ((highwayProxy + airportProxy) / 2) * 0.20;
    return clamp(blended, 0.1, 1.0);
  }
  return computeInfraScoreSynthetic(address, zone);
}

// Synthetic fallback
function computeInfraScoreSynthetic(address, zone) {
  const zoneBase = { prime: 0.85, urban: 0.68, suburban: 0.50, periurban: 0.35, rural: 0.20 };
  const base = zoneBase[zone] || 0.45;
  const jitter = (stringHash01(address) - 0.5) * 0.15;
  return clamp(base + jitter, 0.1, 1.0);
}

// ── Market Activity ───────────────────────────────────────────────────────
// Uses real commercial_score when available; falls back to zone-based
function computeMarketActivity(zone, subType, geoData) {
  if (isGeoEnriched(geoData) && geoData.scores?.market_activity != null) {
    // Blend real market activity (brokers + banks + commercial) with zone baseline
    const geoActivity = geoData.scores.market_activity;
    const zoneBase = { prime: 0.90, urban: 0.72, suburban: 0.50, periurban: 0.35, rural: 0.20 };
    const base = zoneBase[zone] || 0.45;

    // 80% real data (now sharper with brokers), 20% zone base
    const blended = geoActivity * 0.80 + base * 0.20;
    const subtypeBoost = HIGH_FUNGIBILITY_SUBTYPES.includes(subType) ? 0.06 : -0.03;
    return clamp(blended + subtypeBoost, 0.1, 1.0);
  }

  // Synthetic fallback
  const zoneActivity = { prime: 0.90, urban: 0.72, suburban: 0.50, periurban: 0.35, rural: 0.20 };
  const base = zoneActivity[zone] || 0.45;
  const subtypeBoost = HIGH_FUNGIBILITY_SUBTYPES.includes(subType) ? 0.08 : -0.05;
  return clamp(base + subtypeBoost, 0.1, 1.0);
}

// ── Fungibility Score ─────────────────────────────────────────────────────
function computeFungibility(subType, effectiveArea) {
  let score = 0.55;
  if (HIGH_FUNGIBILITY_SUBTYPES.includes(subType)) score += 0.20;
  if (LOW_FUNGIBILITY_SUBTYPES.includes(subType))  score -= 0.25;
  if (effectiveArea > 5000) score -= 0.15;
  else if (effectiveArea < 300) score -= 0.10;
  return clamp(score, 0.1, 1.0);
}

// ── Neighbourhood Quality ─────────────────────────────────────────────────
// Now uses neighbourhood_quality score from pipeline (planning + mixed-use balance)
function computeNeighbourhoodQuality(zone, address, geoData) {
  const zoneBase = { prime: 0.88, urban: 0.70, suburban: 0.55, periurban: 0.40, rural: 0.30 };
  let base = zoneBase[zone] || 0.50;

  if (isGeoEnriched(geoData) && geoData.scores) {
    // Use neighbourhood_quality from geoPipeline (includes planning + mixed-use balance)
    if (geoData.scores.neighbourhood_quality != null) {
      // Blend with zone base: 75% real, 25% zone
      return clamp(geoData.scores.neighbourhood_quality * 0.75 + base * 0.25, 0.1, 1.0);
    }

    // Fallback to livability
    if (geoData.scores.livability_score != null) {
      return clamp(geoData.scores.livability_score * 0.65 + base * 0.35, 0.1, 1.0);
    }

    // Legacy fallback: count nearby POIs
    let nearbyCount = 0;
    const nearest = geoData.nearest || {};
    for (const cat of ['metro', 'hospital', 'school', 'supermarket', 'mall', 'restaurant']) {
      if (nearest[cat] && nearest[cat].distance_km < 2) nearbyCount++;
    }
    base += Math.min(nearbyCount * 0.04, 0.20);
  } else {
    const jitter = (stringHash01(address + '_nbhd') - 0.5) * 0.10;
    base += jitter;
  }

  return clamp(base, 0.1, 1.0);
}

// ── Legal Clarity Score ───────────────────────────────────────────────────
function computeLegalClarity(legalStatus) {
  let score = 0.50;
  if (legalStatus.freehold)    score += 0.20;
  if (legalStatus.clear_title) score += 0.25;
  if (legalStatus.leasehold)   score -= 0.15;
  if (!legalStatus.clear_title && !legalStatus.freehold) score -= 0.20;
  return clamp(score, 0.1, 1.0);
}

// ── Rental Yield Proxy ────────────────────────────────────────────────────
function computeRentalYield(rentMonthly, estimatedValue) {
  if (rentMonthly <= 0 || estimatedValue <= 0) return 0;
  return (rentMonthly * 12) / estimatedValue;
}

// ── Income Stability ──────────────────────────────────────────────────────
function computeIncomeStability(occupancy, rentMonthly) {
  if (occupancy === 'rented' && rentMonthly > 0) return 0.80;
  if (occupancy === 'self_occupied') return 0.60;
  return 0.30;
}

// ── Age Bucket ────────────────────────────────────────────────────────────
function ageBucket(age) {
  if (age < 5)  return 'new';
  if (age <= 15) return 'mid_age';
  return 'old';
}

// ── Image Feature Stub ────────────────────────────────────────────────────
function computeImageFeatures(images) {
  const hasExterior = images?.exterior && images.exterior.length > 0;
  const hasInterior = images?.interior && images.interior.length > 0;
  
  if (!hasExterior && !hasInterior) {
    return { available: false, quality_score: null, condition_proxy: null, mismatch_flag: false };
  }
  return {
    available: true,
    quality_score: 0.65,
    condition_proxy: 0.60,
    mismatch_flag: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main feature engineering function
// Now accepts rich geoData with composite scores
// ═══════════════════════════════════════════════════════════════════════════
function engineerFeatures(input, geoData) {
  const zone = detectZone(input.address, geoData);

  // A – Location intelligence
  const circleRate           = getCircleRate(zone, input.property_type);
  const infraScore           = computeInfraScore(input.address, zone, geoData);
  const marketActivity       = computeMarketActivity(zone, input.sub_type, geoData);
  const neighbourhoodQuality = computeNeighbourhoodQuality(zone, input.address, geoData);

  const MARKET_RATE_FACTOR = { prime: 2.25, urban: 1.8, suburban: 1.35, periurban: 1.1, rural: 0.9 };
  const adjustedRate = circleRate * (MARKET_RATE_FACTOR[zone] || 1.0);

  const locationPremium = {
    prime: 2.0, urban: 1.6, suburban: 1.25, periurban: 1.0, rural: 0.8,
  }[zone] || 1.00;

  // B – Property characteristics
  const subtypeMultiplier = SUBTYPE_MULTIPLIERS[input.sub_type] || SUBTYPE_MULTIPLIERS.default;
  const depreciationFactor = computeDepreciation(input.age_years);
  const floorAdj           = getFloorAdjustment(input);
  const fungibility        = computeFungibility(input.sub_type, input._effective_area);

  // C – Legal & Ownership
  const legalClarity = computeLegalClarity(input.legal_status);

  // D – Income & Usage
  const roughBaseValue      = adjustedRate * input._effective_area;
  const rentalYield         = computeRentalYield(input.rent_monthly, roughBaseValue);
  const incomeStability     = computeIncomeStability(input.occupancy_status, input.rent_monthly);

  // E – Market dynamics
  // Use geo liquidity signal to boost supply-demand if available
  let supplyDemandBalance = clamp(marketActivity * 0.8 + neighbourhoodQuality * 0.2, 0.1, 1.0);
  if (isGeoEnriched(geoData) && geoData.scores?.liquidity_signal != null) {
    // Blend real liquidity signal with computed S/D: 50/50
    supplyDemandBalance = clamp(
      supplyDemandBalance * 0.50 + geoData.scores.liquidity_signal * 0.50,
      0.1, 1.0
    );
  }

  const priceMomentum = { prime: 0.06, urban: 0.04, suburban: 0.02, periurban: -0.01, rural: -0.03 }[zone] || 0.00;

  // F – Image features
  const imageFeatures = computeImageFeatures(input.images);

  // Build nearest-POI summary for debug output
  const nearestPOIs = {};
  if (isGeoEnriched(geoData) && geoData.nearest) {
    for (const [cat, poi] of Object.entries(geoData.nearest)) {
      if (poi) {
        nearestPOIs[cat] = { name: poi.name, distance_km: poi.distance_km };
      }
    }
  }

  return {
    // Location
    zone,
    circleRate: adjustedRate, // exporting adjustedRate as circleRate so downstream uses real market baselines
    baseCircleRate: circleRate,
    locationPremium,
    infraScore,
    marketActivity,
    neighbourhoodQuality,

    // Geo enrichment metadata
    geoEnriched: isGeoEnriched(geoData),
    geocodedAddress: geoData?.location?.display_name || null,
    nearestPOIs,
    geoScores: geoData?.scores || null,
    geoDensity: geoData?.density || null,
    geoTotalPOIs: geoData?.total_pois || 0,
    neighbourhoodAttributes: geoData?.neighbourhood_attributes || {
      is_mixed_use: false,
      is_planned_proxy: false,
    },

    // Property
    subtypeMultiplier,
    depreciationFactor,
    floorAdj,
    fungibility,
    ageBucket: ageBucket(input.age_years),
    builtupCarpetRatio: input._builtup_carpet_ratio,

    // Legal
    legalClarity,

    // Income
    rentalYield,
    incomeStability,
    occupancy: input.occupancy_status,

    // Market
    supplyDemandBalance,
    priceMomentum,

    // Images
    imageFeatures,

    // Pass-through for downstream
    effectiveArea: input._effective_area,
    plotFootprint: input._plot_footprint,
    totalBuiltArea: input._total_built_area,
    builtupFloorMultiplier: input._builtup_floor_multiplier,
    propertyType: input.property_type,
    subType: input.sub_type,
    ageYears: input.age_years,
    address: input.address,
    legalStatus: input.legal_status,
    accessibility: input.accessibility,
    rentMonthly: input.rent_monthly,
    floorFrom: input.floor_from,
    floorTo: input.floor_to,
    floorSpan: input._floor_span,
    totalBuildingFloors: input.total_building_floors,
    floorAreas: input.floor_areas,
    floorAreaSum: input._floor_area_sum,
  };
}

module.exports = { engineerFeatures, detectZone, getCircleRate };
