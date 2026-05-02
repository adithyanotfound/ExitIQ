/**
 * Geo Pipeline — Geoapify Places API + Nominatim geocoding
 *
 * Rich location intelligence pipeline that extracts:
 *   - Connectivity (metro, bus, rail)
 *   - Social infrastructure (hospital, school)
 *   - Commercial activity (mall, supermarket, restaurant, office)
 *   - Density metrics (POI counts per category)
 *   - Composite scores: infra, commercial, livability, location_premium, liquidity_signal
 *
 * POI search: Geoapify Places API (https://www.geoapify.com/)
 * Free tier: 3,000 req/day, no credit card needed
 * Get your key at: https://myprojects.geoapify.com/
 *
 * Geocoding: Nominatim (primary, free) → Geoapify (fallback)
 */

const axios = require('axios');

// ══════════════════════════════════════════════════════════════
// CONFIG — key loaded from .env via dotenv (loaded in server.js)
// ══════════════════════════════════════════════════════════════
const API_KEY = process.env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_KEY || '';

// ══════════════════════════════════════════════════════════════
// POI Category Mapping — Geoapify category strings
// Full list: https://apidocs.geoapify.com/docs/places/#categories
// ══════════════════════════════════════════════════════════════
const CATEGORY_MAP = {
  // Connectivity / Accessibility
  metro:       'public_transport.subway',
  bus_stop:    'public_transport.platform',
  rail:        'public_transport.train,railway.station',

  // Social Infrastructure
  hospital:    'healthcare.hospital',
  school:      'education.school',

  // Commercial Activity
  mall:        'commercial.shopping_mall,commercial.marketplace,commercial.department_store,commercial.supermarket',
  supermarket: 'commercial.supermarket',
  restaurant:  'catering.restaurant',
  office:      'building.office',
};

// Search radii per category (metres)
const SEARCH_RADIUS = {
  metro: 3000,    bus_stop: 2000,   rail: 5000,
  hospital: 3000, school: 2000,
  mall: 3000,     supermarket: 2000, restaurant: 1500, office: 2000,
};

// ══════════════════════════════════════════════════════════════
// Utility: sleep
// ══════════════════════════════════════════════════════════════
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ══════════════════════════════════════════════════════════════
// Utility: retry with backoff
// ══════════════════════════════════════════════════════════════
async function withRetry(fn, retries = 3, baseDelayMs = 600) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = baseDelayMs * attempt;
        console.warn(`  ↻ Attempt ${attempt}/${retries} failed: ${err.message}. Retry in ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ══════════════════════════════════════════════════════════════
// 1. GEOCODING
// Nominatim (free, no key) → Geoapify fallback
// ══════════════════════════════════════════════════════════════
const NOMINATIM_ENDPOINTS = [
  'https://nominatim.openstreetmap.org/search',
  'https://nominatim.geocoding.ai/search',
];

async function geocodeAddress(address) {
  for (const url of NOMINATIM_ENDPOINTS) {
    try {
      const response = await axios.get(url, {
        params: { q: address, format: 'json', addressdetails: 1, limit: 1 },
        headers: {
          'User-Agent': 'collateral-valuation-engine/2.0',
          'Accept-Language': 'en',
        },
        timeout: 10000,
      });
      if (response.data?.length > 0) {
        return {
          lat: parseFloat(response.data[0].lat),
          lon: parseFloat(response.data[0].lon),
          display_name: response.data[0].display_name,
        };
      }
    } catch (err) {
      console.warn(`  Nominatim failed on ${url}: ${err.message}`);
    }
    await sleep(500);
  }

  // Fallback: Geoapify geocoding
  if (API_KEY) {
    console.warn('  Nominatim unavailable, falling back to Geoapify geocoding...');
    const res = await axios.get('https://api.geoapify.com/v1/geocode/search', {
      params: { text: address, apiKey: API_KEY, limit: 1 },
      timeout: 10000,
    });
    const feature = res.data?.features?.[0];
    if (feature) {
      const [lon, lat] = feature.geometry.coordinates;
      return { lat, lon, display_name: feature.properties.formatted };
    }
  }

  throw new Error(`Geocoding failed: no results for "${address}"`);
}

// ══════════════════════════════════════════════════════════════
// 2. POI SEARCH (Geoapify Places API)
// ══════════════════════════════════════════════════════════════
async function getPlaces(lat, lon, category, radius = 2000, limit = 10) {
  return withRetry(async () => {
    const res = await axios.get('https://api.geoapify.com/v2/places', {
      params: {
        categories: category,
        filter: `circle:${lon},${lat},${radius}`,
        limit,
        apiKey: API_KEY,
      },
      timeout: 15000,
    });

    return (res.data?.features || []).map((f) => ({
      lat: f.properties.lat,
      lon: f.properties.lon,
      name: f.properties.name || f.properties.formatted || 'Unknown',
    }));
  });
}

// ══════════════════════════════════════════════════════════════
// 3. HAVERSINE DISTANCE (km)
// ══════════════════════════════════════════════════════════════
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ══════════════════════════════════════════════════════════════
// 4. FIND NEAREST POI
// ══════════════════════════════════════════════════════════════
function findNearest(origin, places) {
  if (!places || places.length === 0) return null;
  let best = null;
  let min = Infinity;
  for (const p of places) {
    const d = haversine(origin.lat, origin.lon, p.lat, p.lon);
    if (d < min) {
      min = d;
      best = { name: p.name, lat: p.lat, lon: p.lon, distance_km: +d.toFixed(4) };
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════
// 5. DISTANCE → SCORE (0–1)
// ══════════════════════════════════════════════════════════════
function scoreByDistance(dKm) {
  if (dKm == null) return 0;
  if (dKm < 0.5) return 1.0;
  if (dKm < 1)   return 0.85;
  if (dKm < 2)   return 0.65;
  if (dKm < 3)   return 0.45;
  if (dKm < 5)   return 0.25;
  return 0.10;
}

// ══════════════════════════════════════════════════════════════
// 6. COMPOSITE SCORE COMPUTATION
// ══════════════════════════════════════════════════════════════

/**
 * Infrastructure Score (0–1)
 * Weighted: metro (0.40) + hospital (0.25) + school (0.20) + bus (0.15)
 */
function computeInfraScore(scores) {
  return (
    0.40 * (scores.metro    || 0) +
    0.25 * (scores.hospital || 0) +
    0.20 * (scores.school   || 0) +
    0.15 * (scores.bus_stop || 0)
  );
}

/**
 * Commercial Activity Score (0–1)
 * Log-scaled density: malls + supermarkets + restaurants + offices
 */
function computeCommercialScore(density) {
  const count = (density.mall || 0) + (density.supermarket || 0) +
                (density.restaurant || 0) + (density.office || 0);
  // log(1 + count) / log(1 + 30) → normalise to ~0–1 range
  return Math.min(Math.log(1 + count) / Math.log(31), 1.0);
}

/**
 * Livability Score (0–1)
 * Schools + hospitals + supermarkets + restaurants nearby
 */
function computeLivabilityScore(scores, density) {
  const proximityPart = 0.40 * (scores.school || 0) +
                        0.30 * (scores.hospital || 0) +
                        0.30 * (scores.supermarket || 0);

  const livabilityDensity = (density.school || 0) + (density.hospital || 0) +
                            (density.supermarket || 0) + (density.restaurant || 0);
  const densityPart = Math.min(livabilityDensity / 15, 1.0); // cap at 15 for score = 1

  return 0.65 * proximityPart + 0.35 * densityPart;
}

/**
 * Location Premium Score (0–1)
 * Combined: infra + commercial + livability
 */
function computeLocationPremium(infraScore, commercialScore, livabilityScore) {
  return 0.45 * infraScore + 0.30 * commercialScore + 0.25 * livabilityScore;
}

/**
 * Liquidity Signal (0–1)
 * Location premium + demand proxy (total POI density as market activity proxy)
 */
function computeLiquiditySignal(locationPremium, totalPOIs, subType) {
  const demandProxy = Math.min(totalPOIs / 40, 1.0); // cap at 40 POIs

  // Niche penalty: warehouses, farmhouses harder to sell
  const nichePenalty = ['Warehouse', 'Farmhouse', 'Plot'].includes(subType) ? 0.15 : 0;

  return Math.max(0, 0.60 * locationPremium + 0.40 * demandProxy - nichePenalty);
}

// ══════════════════════════════════════════════════════════════
// 7. MAIN PIPELINE
// ══════════════════════════════════════════════════════════════
async function analyzeLocation(address, subType) {
  if (!API_KEY) {
    console.error('⚠️  Set GEOAPIFY_API_KEY in .env');
    console.error('    Get a free key at: https://myprojects.geoapify.com/');
    return { error: 'Missing GEOAPIFY_API_KEY', address };
  }

  // --- Geocode ---
  let geo;
  try {
    await sleep(1000); // Nominatim rate-limit courtesy
    geo = await geocodeAddress(address);
    console.log(`✓ Geocoded "${address}" → (${geo.lat}, ${geo.lon})`);
  } catch (err) {
    console.error(`✗ Geocoding error: ${err.message}`);
    return { error: err.message, address };
  }

  // --- Fetch POIs for all categories in parallel ---
  const categories = Object.keys(CATEGORY_MAP);
  const results = {};
  try {
    const fetches = await Promise.allSettled(
      categories.map((cat) =>
        getPlaces(geo.lat, geo.lon, CATEGORY_MAP[cat], SEARCH_RADIUS[cat] || 2000)
      )
    );
    categories.forEach((cat, i) => {
      results[cat] = fetches[i].status === 'fulfilled' ? fetches[i].value : [];
    });

    const counts = categories.map(c => `${c}:${results[c].length}`).join(', ');
    console.log(`✓ POIs found → ${counts}`);
  } catch (err) {
    console.error(`✗ POI batch error: ${err.message}`);
    categories.forEach((cat) => { if (!results[cat]) results[cat] = []; });
  }

  // --- Find nearest per category ---
  const nearest = {};
  for (const cat of categories) {
    nearest[cat] = findNearest(geo, results[cat]);
  }

  // --- Density (count of POIs per category) ---
  const density = {};
  let totalPOIs = 0;
  for (const cat of categories) {
    density[cat] = results[cat].length;
    totalPOIs += results[cat].length;
  }

  // --- Component scores (distance-based, 0–1) ---
  const componentScores = {};
  for (const cat of categories) {
    componentScores[cat] = scoreByDistance(nearest[cat]?.distance_km);
  }

  // --- Composite scores ---
  const infraScore       = computeInfraScore(componentScores);
  const commercialScore  = computeCommercialScore(density);
  const livabilityScore  = computeLivabilityScore(componentScores, density);
  const locationPremium  = computeLocationPremium(infraScore, commercialScore, livabilityScore);
  const liquiditySignal  = computeLiquiditySignal(locationPremium, totalPOIs, subType);

  return {
    address,
    location: geo,
    nearest,
    density,
    total_pois: totalPOIs,
    scores: {
      // Per-category component scores
      ...componentScores,

      // Composite scores
      infra_score:       +infraScore.toFixed(4),
      commercial_score:  +commercialScore.toFixed(4),
      livability_score:  +livabilityScore.toFixed(4),
      location_premium:  +locationPremium.toFixed(4),
      liquidity_signal:  +liquiditySignal.toFixed(4),
    },
  };
}

module.exports = { analyzeLocation };
