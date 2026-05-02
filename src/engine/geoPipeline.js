/**
 * Geo Pipeline — Geoapify Places API + Nominatim geocoding
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
const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || 'YOUR_GEOAPIFY_API_KEY';

// Geoapify category strings
// Full list: https://apidocs.geoapify.com/docs/places/#categories
const POI_CATEGORIES = {
  metro:    'public_transport.train,public_transport.subway,public_transport.light_rail',
  hospital: 'healthcare.hospital',
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
async function withRetry(fn, retries = 3, baseDelayMs = 800) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = baseDelayMs * attempt;
      console.warn(`Attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

// ══════════════════════════════════════════════════════════════
// 1. GEOCODING
// Tries Nominatim first (free, no key),
// falls back to Geoapify geocoding.
// ══════════════════════════════════════════════════════════════
const NOMINATIM_ENDPOINTS = [
  'https://nominatim.openstreetmap.org/search',
  'https://nominatim.geocoding.ai/search',
];

async function geocodeAddress(address) {
  // Try Nominatim mirrors first
  for (const url of NOMINATIM_ENDPOINTS) {
    try {
      const response = await axios.get(url, {
        params: { q: address, format: 'json', addressdetails: 1, limit: 1 },
        headers: {
          'User-Agent': 'collateral-valuation-app/1.0 (contact: your-email@gmail.com)',
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
      console.warn(`Nominatim failed on ${url}: ${err.message}`);
    }
    await sleep(500);
  }

  // Fallback: Geoapify geocoding (uses same API key)
  console.warn('Nominatim unavailable, falling back to Geoapify geocoding...');
  const res = await axios.get('https://api.geoapify.com/v1/geocode/search', {
    params: { text: address, apiKey: GEOAPIFY_KEY, limit: 1 },
    timeout: 10000,
  });

  const feature = res.data?.features?.[0];
  if (!feature) throw new Error(`Geocoding failed: no results for "${address}"`);

  const [lon, lat] = feature.geometry.coordinates;
  return { lat, lon, display_name: feature.properties.formatted };
}

// ══════════════════════════════════════════════════════════════
// 2. POI SEARCH (Geoapify Places)
// ══════════════════════════════════════════════════════════════
async function getNearbyPOIs(lat, lon, { category, radius = 3000, limit = 20 }) {
  return withRetry(async () => {
    const res = await axios.get('https://api.geoapify.com/v2/places', {
      params: {
        categories: category,
        filter: `circle:${lon},${lat},${radius}`,  // Geoapify uses lon,lat order
        limit,
        apiKey: GEOAPIFY_KEY,
      },
      timeout: 15000,
    });

    const features = res.data?.features || [];
    return features.map((f) => ({
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      name: f.properties.name || f.properties.formatted || 'Unknown',
      tags: f.properties,
    }));
  });
}

// ══════════════════════════════════════════════════════════════
// 3. HAVERSINE DISTANCE (km)
// ══════════════════════════════════════════════════════════════
function haversineDistance(lat1, lon1, lat2, lon2) {
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
function findNearest(origin, pois) {
  if (!pois || pois.length === 0) return null;
  let best = null;
  let min = Infinity;
  for (const p of pois) {
    const d = haversineDistance(origin.lat, origin.lon, p.lat, p.lon);
    if (d < min) {
      min = d;
      best = { ...p, distance_km: +d.toFixed(4) };
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════
// 5. INFRA SCORE
// ══════════════════════════════════════════════════════════════
function scoreByDistance(dKm) {
  if (dKm == null) return 0;
  if (dKm < 0.5) return 1.0;
  if (dKm < 1)   return 0.8;
  if (dKm < 3)   return 0.5;
  return 0.2;
}

// ══════════════════════════════════════════════════════════════
// 6. MAIN PIPELINE
// ══════════════════════════════════════════════════════════════
async function analyzeLocation(address) {
  if (!GEOAPIFY_KEY || GEOAPIFY_KEY === 'YOUR_GEOAPIFY_API_KEY') {
    console.error('⚠️  Set GEOAPIFY_KEY env variable or paste your key into .env');
    console.error('    Get a free key at: https://myprojects.geoapify.com/');
    return { error: 'Missing GEOAPIFY_KEY', address };
  }

  // --- Geocode ---
  let geo;
  try {
    await sleep(1000); // Nominatim rate-limit courtesy delay
    geo = await geocodeAddress(address);
    console.log(`✓ Geocoded "${address}" → (${geo.lat}, ${geo.lon})`);
  } catch (err) {
    console.error(`✗ Geocoding error: ${err.message}`);
    return { error: err.message, address };
  }

  // --- Fetch POIs (Geoapify handles parallel fine) ---
  let metros = [], hospitals = [];
  try {
    [metros, hospitals] = await Promise.all([
      getNearbyPOIs(geo.lat, geo.lon, { category: POI_CATEGORIES.metro,    radius: 3000 }),
      getNearbyPOIs(geo.lat, geo.lon, { category: POI_CATEGORIES.hospital, radius: 3000 }),
    ]);
    console.log(`✓ Found ${metros.length} transit stops, ${hospitals.length} hospitals`);
  } catch (err) {
    console.error(`✗ POI fetch error: ${err.message}`);
    // Partial results still returned below
  }

  // --- Score ---
  const nearestMetro    = findNearest(geo, metros);
  const nearestHospital = findNearest(geo, hospitals);
  const metroScore      = scoreByDistance(nearestMetro?.distance_km);
  const hospitalScore   = scoreByDistance(nearestHospital?.distance_km);
  const infraScore      = (metroScore + hospitalScore) / 2;

  return {
    address,
    location: geo,
    nearest_metro:    nearestMetro,
    nearest_hospital: nearestHospital,
    scores: {
      metro_score:    metroScore,
      hospital_score: hospitalScore,
      infra_score:    infraScore,
    },
  };
}

module.exports = { analyzeLocation };
