/**
 * Feature Engineering Layer
 *
 * Transforms validated input into a rich feature set that drives
 * valuation and liquidity scoring downstream.
 *
 * Feature groups:
 *   A – Location Intelligence  (now uses real geocoding + POI data)
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
// Try geocoded display_name first for broader matching, then raw address
function detectZone(address, geoData) {
  // If we have a resolved display_name, use it for better keyword matching
  if (isGeoEnriched(geoData) && geoData.location.display_name) {
    const resolved = geoData.location.display_name.toLowerCase();
    for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
      for (const kw of keywords) {
        if (resolved.includes(kw)) return zone;
      }
    }
  }

  // Fallback: keyword match on raw address
  const addr = address.toLowerCase();
  for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
    for (const kw of keywords) {
      if (addr.includes(kw)) return zone;
    }
  }
  return 'suburban'; // conservative default
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
  return clamp(1 - totalDep, 0.40, 1.0); // floor at 60% depreciation
}

// ── Floor Adjustment ────────────────────────────────────────────────────────
// Now uses numeric floor_from, floor_to, total_building_floors + _floor_level
function getFloorAdjustment(input) {
  const floorLevel = input._floor_level || input.floor_level || 'mid';
  let adj = FLOOR_ADJUSTMENTS[floorLevel] || FLOOR_ADJUSTMENTS.mid;

  const hasLift  = input.accessibility?.lift;
  const floorTo  = input.floor_to || 0;
  const span     = input._floor_span || 1;

  // Walk-up penalty for high floors without lift
  if (floorTo > 8 && !hasLift) {
    adj -= 0.06;
  } else if (floorTo > 3 && !hasLift) {
    adj -= 0.03;
  }

  // Multi-floor span premium (duplex, villa, multi-level unit)
  if (span >= 2) {
    adj += 0.04;  // 2-floor span (duplex)
  }
  if (span >= 3) {
    adj += 0.02;  // 3+ floors (independent house / villa)
  }

  return adj;
}

// ── Infrastructure Score ──────────────────────────────────────────────────
// Uses Geoapify infra_score when available; falls back to synthetic
function computeInfraScore(address, zone, geoData) {
  if (isGeoEnriched(geoData) && geoData.scores) {
    // Geoapify pipeline provides a pre-computed infra_score (0–1)
    // Blend it with zone-proxy scores for categories not covered by POI search
    const geoInfra = geoData.scores.infra_score;

    // Zone proxies for highway / airport (not covered by Geoapify POI search)
    const highwayProxy = zone === 'prime' || zone === 'urban' ? 0.70 : 0.40;
    const airportProxy = zone === 'prime' ? 0.60 : zone === 'urban' ? 0.45 : 0.25;

    // Weighted blend: 70% from real POI scores, 30% from zone proxies
    const blended = geoInfra * 0.70 + ((highwayProxy + airportProxy) / 2) * 0.30;
    return clamp(blended, 0.1, 1.0);
  }

  return computeInfraScoreSynthetic(address, zone);
}

// Synthetic fallback (original logic)
function computeInfraScoreSynthetic(address, zone) {
  const zoneBase = { prime: 0.85, urban: 0.68, suburban: 0.50, periurban: 0.35, rural: 0.20 };
  const base = zoneBase[zone] || 0.45;
  const jitter = (stringHash01(address) - 0.5) * 0.15;
  return clamp(base + jitter, 0.1, 1.0);
}

// ── Market Activity Proxy ─────────────────────────────────────────────────
function computeMarketActivity(zone, subType) {
  const zoneActivity = { prime: 0.90, urban: 0.72, suburban: 0.50, periurban: 0.35, rural: 0.20 };
  const base = zoneActivity[zone] || 0.45;
  const subtypeBoost = HIGH_FUNGIBILITY_SUBTYPES.includes(subType) ? 0.08 : -0.05;
  return clamp(base + subtypeBoost, 0.1, 1.0);
}

// ── Fungibility Score ─────────────────────────────────────────────────────
function computeFungibility(subType, effectiveArea) {
  let score = 0.55; // baseline
  if (HIGH_FUNGIBILITY_SUBTYPES.includes(subType)) score += 0.20;
  if (LOW_FUNGIBILITY_SUBTYPES.includes(subType))  score -= 0.25;

  // Very large or very small properties are less fungible
  if (effectiveArea > 5000) score -= 0.15;
  else if (effectiveArea < 300) score -= 0.10;

  return clamp(score, 0.1, 1.0);
}

// ── Neighbourhood Quality ─────────────────────────────────────────────────
// Boost when geo data confirms nearby amenities
function computeNeighbourhoodQuality(zone, address, geoData) {
  const zoneBase = { prime: 0.88, urban: 0.70, suburban: 0.55, periurban: 0.40, rural: 0.30 };
  let base = zoneBase[zone] || 0.50;

  if (isGeoEnriched(geoData)) {
    // Count nearby POI categories found within 2 km
    let nearbyCount = 0;
    if (geoData.nearest_metro    && geoData.nearest_metro.distance_km    < 2) nearbyCount++;
    if (geoData.nearest_hospital && geoData.nearest_hospital.distance_km < 2) nearbyCount++;
    // Each nearby amenity adds a small bump (up to +0.15)
    base += Math.min(nearbyCount * 0.05, 0.15);
  } else {
    // Synthetic jitter
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
  // Disputed or unclear = lower
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
  return 0.30; // vacant
}

// ── Age Bucket ────────────────────────────────────────────────────────────
function ageBucket(age) {
  if (age < 5)  return 'new';
  if (age <= 15) return 'mid_age';
  return 'old';
}

// ── Image Feature Stub ────────────────────────────────────────────────────
function computeImageFeatures(images) {
  if (!images || images.length === 0) {
    return { available: false, quality_score: null, condition_proxy: null, mismatch_flag: false };
  }
  // In production this would invoke a vision model.
  // For now, presence of images boosts confidence slightly.
  return {
    available: true,
    quality_score: 0.65,
    condition_proxy: 0.60,
    mismatch_flag: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main feature engineering function
// Now accepts optional geoData from the geo pipeline
// ═══════════════════════════════════════════════════════════════════════════
function engineerFeatures(input, geoData) {
  const zone = detectZone(input.address, geoData);

  // A – Location intelligence (uses real geo data when available)
  const circleRate           = getCircleRate(zone, input.property_type);
  const infraScore           = computeInfraScore(input.address, zone, geoData);
  const marketActivity       = computeMarketActivity(zone, input.sub_type);
  const neighbourhoodQuality = computeNeighbourhoodQuality(zone, input.address, geoData);

  // Location premium as a multiplier
  const locationPremium = {
    prime: 1.40, urban: 1.15, suburban: 1.00, periurban: 0.85, rural: 0.70,
  }[zone] || 1.00;

  // B – Property characteristics
  const subtypeMultiplier = SUBTYPE_MULTIPLIERS[input.sub_type] || SUBTYPE_MULTIPLIERS.default;
  const depreciationFactor = computeDepreciation(input.age_years);
  const floorAdj           = getFloorAdjustment(input);
  const fungibility        = computeFungibility(input.sub_type, input._effective_area);

  // C – Legal & Ownership
  const legalClarity = computeLegalClarity(input.legal_status);

  // D – Income & Usage
  // We need a rough base value for yield calculation; use circle rate × area
  const roughBaseValue      = circleRate * input._effective_area;
  const rentalYield         = computeRentalYield(input.rent_monthly, roughBaseValue);
  const incomeStability     = computeIncomeStability(input.occupancy_status, input.rent_monthly);

  // E – Market dynamics
  const supplyDemandBalance = clamp(marketActivity * 0.8 + neighbourhoodQuality * 0.2, 0.1, 1.0);
  // Synthetic price momentum based on zone
  const priceMomentum = { prime: 0.06, urban: 0.04, suburban: 0.02, periurban: -0.01, rural: -0.03 }[zone] || 0.00;

  // F – Image features
  const imageFeatures = computeImageFeatures(input.images);

  // Build nearest-POI summary for debug output
  const nearestPOIs = {};
  if (isGeoEnriched(geoData)) {
    if (geoData.nearest_metro) {
      nearestPOIs.metro = { name: geoData.nearest_metro.name, distance_km: geoData.nearest_metro.distance_km };
    }
    if (geoData.nearest_hospital) {
      nearestPOIs.hospital = { name: geoData.nearest_hospital.name, distance_km: geoData.nearest_hospital.distance_km };
    }
  }

  return {
    // Location
    zone,
    circleRate,
    locationPremium,
    infraScore,
    marketActivity,
    neighbourhoodQuality,

    // Geo enrichment metadata
    geoEnriched: isGeoEnriched(geoData),
    geocodedAddress: geoData?.location?.display_name || null,
    nearestPOIs,
    geoScores: geoData?.scores || null,

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
  };
}

module.exports = { engineerFeatures, detectZone, getCircleRate };
