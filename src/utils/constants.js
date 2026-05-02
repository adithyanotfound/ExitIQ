/**
 * Constants and reference data for the Collateral Valuation + Liquidity Engine.
 *
 * Circle rates, infrastructure weights, depreciation curves, and scoring
 * parameters are all centralised here so the engine layer stays pure logic.
 */

// ── Circle Rate Benchmarks (₹ per sq ft) ──────────────────────────────────
// Indexed by city → zone → property_type
// These are illustrative statutory floor rates; in production they would be
// fetched from a state-level registry API.
const CIRCLE_RATES = {
  default: {
    prime:     { Residential: 8500, Commercial: 12000, Industrial: 6000 },
    urban:     { Residential: 5500, Commercial: 8000,  Industrial: 4000 },
    suburban:  { Residential: 3500, Commercial: 5000,  Industrial: 2800 },
    periurban: { Residential: 2000, Commercial: 3000,  Industrial: 1800 },
    rural:     { Residential: 1200, Commercial: 1800,  Industrial: 1000 },
  },
};

// ── Property Sub-type Premiums / Discounts ─────────────────────────────────
const SUBTYPE_MULTIPLIERS = {
  Apartment:   1.00,
  'Detached House': 1.25,
  Plot:        0.85,
  Shop:        1.10,
  Warehouse:   0.75,
  Office:      1.15,
  Penthouse:   1.40,
  Studio:      0.90,
  Duplex:      1.15,
  Farmhouse:   0.70,
  default:     1.00,
};

// ── Age Depreciation Curve ─────────────────────────────────────────────────
// Piecewise-linear depreciation applied to built structures (not land)
const AGE_DEPRECIATION = [
  { maxAge:  2, annualRate: 0.005 },   // Near-new
  { maxAge:  5, annualRate: 0.010 },
  { maxAge: 10, annualRate: 0.015 },
  { maxAge: 20, annualRate: 0.020 },
  { maxAge: 40, annualRate: 0.025 },
  { maxAge: Infinity, annualRate: 0.030 },
];

// ── Infrastructure Proximity Weights ───────────────────────────────────────
// Used when computing the weighted infrastructure score (0–1)
const INFRA_WEIGHTS = {
  metro:        0.25,
  rail:         0.10,
  highway:      0.15,
  business_hub: 0.20,
  school:       0.10,
  hospital:     0.10,
  airport:      0.10,
};

// ── Floor Level Adjustments ────────────────────────────────────────────────
const FLOOR_ADJUSTMENTS = {
  ground:    0.05,    // Ground-floor premium
  low:       0.02,    // Floors 1–3
  mid:       0.00,    // Floors 4–8 (baseline)
  high:      0.03,    // Floors 9–15
  penthouse: 0.08,    // Top floor / penthouse
};

// ── Liquidity Scoring Weights ──────────────────────────────────────────────
const LIQUIDITY_WEIGHTS = {
  location_demand:      0.20,
  infrastructure:       0.12,
  configuration:        0.12,
  legal_clarity:        0.15,
  age_condition:        0.10,
  fungibility:          0.10,
  rental_attractiveness:0.08,
  market_activity:      0.08,
  accessibility:        0.05,
};

// ── Time-to-Liquidate Bands (days) ─────────────────────────────────────────
const LIQUIDATION_BANDS = {
  high:   { min: 15, max: 45 },   // Resale index 80–100
  medium: { min: 45, max: 120 },  // Resale index 50–79
  low:    { min: 120, max: 365 }, // Resale index < 50
};

// ── Distress Discount Ranges ───────────────────────────────────────────────
const DISTRESS_DISCOUNT = {
  high_liquidity:   { min: 0.12, max: 0.20 },   // 12–20 % off market value
  medium_liquidity: { min: 0.20, max: 0.35 },
  low_liquidity:    { min: 0.35, max: 0.50 },
};

// ── Location Zone Classification Keywords ──────────────────────────────────
const ZONE_KEYWORDS = {
  prime: [
    'bandra', 'juhu', 'andheri west', 'powai', 'south mumbai', 'colaba',
    'connaught place', 'khan market', 'hauz khas', 'vasant vihar',
    'indiranagar', 'koramangala', 'whitefield', 'mg road',
    'jubilee hills', 'banjara hills', 'hitech city',
    'anna nagar', 'adyar', 't nagar', 'boat club',
    'salt lake', 'park street', 'alipore',
    'aundh', 'koregaon park', 'viman nagar',
    'gomti nagar', 'hazratganj',
    'sector 17', 'sector 35', 'dlf',
  ],
  urban: [
    'malad', 'goregaon', 'borivali', 'thane',
    'dwarka', 'rohini', 'saket', 'lajpat nagar',
    'electronic city', 'marathahalli', 'hebbal',
    'gachibowli', 'madhapur', 'kukatpally',
    'velachery', 'porur', 'ambattur',
    'rajarhat', 'new town', 'dum dum',
    'hadapsar', 'hinjewadi', 'baner',
    'noida', 'gurgaon', 'faridabad',
  ],
  suburban: [
    'virar', 'vasai', 'navi mumbai', 'panvel',
    'greater noida', 'ghaziabad', 'indirapuram',
    'sarjapur', 'yelahanka', 'devanahalli',
    'kompally', 'shamshabad',
    'tambaram', 'avadi', 'chrompet',
    'howrah', 'barasat', 'barrackpore',
    'wakad', 'pimpri', 'chinchwad',
  ],
  periurban: [
    'bhiwandi', 'karjat', 'khopoli',
    'sohna', 'manesar', 'bhiwadi',
    'hosur', 'anekal',
    'maheshwaram', 'adibatla',
    'sriperumbudur', 'oragadam',
    'kalyani', 'budge budge',
    'talegaon', 'chakan',
  ],
};

// ── Configuration Fungibility ──────────────────────────────────────────────
// Standard configurations that the market absorbs fastest
const HIGH_FUNGIBILITY_SUBTYPES = ['Apartment', 'Shop', 'Studio', 'Office'];
const LOW_FUNGIBILITY_SUBTYPES  = ['Warehouse', 'Farmhouse', 'Penthouse'];

module.exports = {
  CIRCLE_RATES,
  SUBTYPE_MULTIPLIERS,
  AGE_DEPRECIATION,
  INFRA_WEIGHTS,
  FLOOR_ADJUSTMENTS,
  LIQUIDITY_WEIGHTS,
  LIQUIDATION_BANDS,
  DISTRESS_DISCOUNT,
  ZONE_KEYWORDS,
  HIGH_FUNGIBILITY_SUBTYPES,
  LOW_FUNGIBILITY_SUBTYPES,
};
