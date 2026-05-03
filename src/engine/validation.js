/**
 * Input Validation & Sanitization Layer
 *
 * Validates mandatory fields, applies defaults for optional ones,
 * and normalises the input into a canonical shape for downstream processing.
 */

const VALID_PROPERTY_TYPES = ['Residential', 'Commercial', 'Industrial'];
const VALID_SUBTYPES = [
  'Apartment', 'Detached House', 'Plot', 'Shop', 'Warehouse',
  'Office', 'Penthouse', 'Studio', 'Duplex', 'Farmhouse',
];
const VALID_OCCUPANCY = ['self_occupied', 'rented', 'vacant'];

/**
 * Validate and normalise raw input.
 * Returns { valid: true, data: normalised } or { valid: false, errors: [] }
 */
function validateInput(raw) {
  const errors = [];

  // ── Mandatory fields ───────────────────────────────────────────────────
  if (!raw.address && !(raw.lat_long && raw.lat_long.lat && raw.lat_long.lng)) {
    errors.push('Either "address" or "lat_long" (with lat & lng) is required.');
  }

  if (!raw.property_type || !VALID_PROPERTY_TYPES.includes(raw.property_type)) {
    errors.push(`"property_type" must be one of: ${VALID_PROPERTY_TYPES.join(', ')}.`);
  }

  if (!raw.sub_type || !VALID_SUBTYPES.includes(raw.sub_type)) {
    errors.push(`"sub_type" must be one of: ${VALID_SUBTYPES.join(', ')}.`);
  }

  // At least one size dimension
  const size = raw.size || {};
  const hasCarpet  = size.carpet_area_sqft  > 0;
  const hasBuiltup = size.builtup_area_sqft > 0;
  const hasLand    = size.land_parcel_sqft  > 0;
  if (!hasCarpet && !hasBuiltup && !hasLand) {
    errors.push('At least one size field (carpet_area_sqft, builtup_area_sqft, or land_parcel_sqft) must be > 0.');
  }

  if (raw.age_years === undefined || raw.age_years === null || raw.age_years < 0) {
    errors.push('"age_years" is required and must be >= 0.');
  }

  if (errors.length > 0) return { valid: false, errors };

  // ── Normalisation ──────────────────────────────────────────────────────
  const data = {
    address:          (raw.address || '').trim().toLowerCase(),
    lat_long:         raw.lat_long || null,
    property_type:    raw.property_type,
    sub_type:         raw.sub_type,
    size: {
      carpet_area_sqft:  Math.max(0, Number(size.carpet_area_sqft)  || 0),
      builtup_area_sqft: Math.max(0, Number(size.builtup_area_sqft) || 0),
      land_parcel_sqft:  Math.max(0, Number(size.land_parcel_sqft)  || 0),
    },
    age_years:        Math.max(0, Number(raw.age_years) || 0),

    // Floor fields — numeric
    floor_from:              Math.max(0, Math.floor(Number(raw.floor_from) || 0)),
    floor_to:                Math.max(0, Math.floor(Number(raw.floor_to)   || Number(raw.floor_from) || 0)),
    total_building_floors:   raw.total_building_floors ? Math.max(1, Math.floor(Number(raw.total_building_floors))) : null,

    accessibility: {
      lift:               Boolean(raw.accessibility?.lift),
      ground_floor_access: Boolean(raw.accessibility?.ground_floor_access),
    },
    occupancy_status: VALID_OCCUPANCY.includes(raw.occupancy_status)
                        ? raw.occupancy_status
                        : 'vacant',
    rent_monthly:     Math.max(0, Number(raw.rent_monthly) || 0),
    legal_status: {
      // Enforce mutual exclusion: if both are true, prefer freehold
      freehold:    raw.legal_status?.freehold    !== false,
      clear_title: raw.legal_status?.clear_title !== false,
      leasehold:   Boolean(raw.legal_status?.leasehold),
    },
    images: {
      exterior: Array.isArray(raw.images?.exterior) ? raw.images.exterior.filter(Boolean) : [],
      interior: Array.isArray(raw.images?.interior) ? raw.images.interior.filter(Boolean) : []
    },
  };

  // Enforce freehold / leasehold mutual exclusion server-side
  if (data.legal_status.freehold && data.legal_status.leasehold) {
    data.legal_status.leasehold = false; // freehold wins if both sent
  }

  // Ensure floor_to >= floor_from
  if (data.floor_to < data.floor_from) {
    data.floor_to = data.floor_from;
  }

  // Ensure floors don't exceed total building floors
  if (data.total_building_floors !== null) {
    data.floor_from = Math.min(data.floor_from, data.total_building_floors);
    data.floor_to   = Math.min(data.floor_to,   data.total_building_floors);
  }

  // Derived: floor span (how many floors the unit occupies)
  data._floor_span = data.floor_to - data.floor_from + 1;

  // Derived: floor category (for backward compat with adjustment logic)
  if (data.floor_from === 0)                           data._floor_level = 'ground';
  else if (data.floor_to <= 3)                         data._floor_level = 'low';
  else if (data.floor_to <= 8)                         data._floor_level = 'mid';
  else if (data.total_building_floors !== null &&
           data.floor_to >= data.total_building_floors) data._floor_level = 'penthouse';
  else                                                  data._floor_level = 'high';

  // Backward compat: keep floor_level for downstream
  data.floor_level = data._floor_level;

  // ── Per-floor areas ────────────────────────────────────────────────────
  if (Array.isArray(raw.floor_areas) && raw.floor_areas.length > 0 && data._floor_span > 1) {
    data.floor_areas = raw.floor_areas
      .filter(fa => fa && typeof fa === 'object')
      .map(fa => ({
        floor:     Math.floor(Number(fa.floor) || 0),
        area_sqft: Math.max(0, Number(fa.area_sqft) || 0),
      }))
      .filter(fa => fa.area_sqft > 0 && fa.floor >= data.floor_from && fa.floor <= data.floor_to);

    // Sum of per-floor areas
    data._floor_area_sum = data.floor_areas.reduce((s, fa) => s + fa.area_sqft, 0);

    // If carpet area wasn't provided or is zero, use the per-floor sum
    if (data.size.carpet_area_sqft === 0 && data._floor_area_sum > 0) {
      data.size.carpet_area_sqft = data._floor_area_sum;
    }
  } else {
    data.floor_areas = null;
    data._floor_area_sum = null;
  }

  // ── Plot footprint vs total built area ─────────────────────────────────
  // For multi-floor properties (detached house, duplex, etc.), the plot size
  // is the ground floor area — NOT the sum of all floors. Circle rates apply
  // to the plot footprint. Additional floors add built-up premium on top.
  const totalCarpet = data.size.carpet_area_sqft;

  if (data._floor_span > 1 && totalCarpet > 0) {
    // Ground floor area from per-floor data if available
    const groundFloorEntry = data.floor_areas?.find(fa => fa.floor === data.floor_from);

    if (data.size.land_parcel_sqft > 0) {
      // Explicit land parcel provided — use it directly as footprint
      data._plot_footprint = data.size.land_parcel_sqft;
    } else if (groundFloorEntry) {
      // Ground floor area is the best proxy for plot footprint
      data._plot_footprint = groundFloorEntry.area_sqft;
    } else {
      // No per-floor data: assume equal distribution across floors
      data._plot_footprint = Math.round(totalCarpet / data._floor_span);
    }

    data._total_built_area = totalCarpet;
    // Built-up multiplier: additional floors above ground contribute partial value
    // Each additional floor adds ~65% of ground floor value (structure, not land)
    data._builtup_floor_multiplier = 1 + (data._floor_span - 1) * 0.65;
  } else {
    // Single floor or no carpet: footprint = carpet area
    data._plot_footprint = totalCarpet;
    data._total_built_area = totalCarpet;
    data._builtup_floor_multiplier = 1.0;
  }

  // Derived: effective area — uses plot footprint as the base for valuation
  // (total built area is used separately for the floor multiplier)
  data._effective_area =
    data._plot_footprint ||
    data.size.builtup_area_sqft ||
    data.size.land_parcel_sqft;

  // Derived: built-up to carpet ratio
  if (data.size.carpet_area_sqft > 0 && data.size.builtup_area_sqft > 0) {
    data._builtup_carpet_ratio = data.size.builtup_area_sqft / data.size.carpet_area_sqft;
  } else {
    data._builtup_carpet_ratio = null;
  }

  return { valid: true, data };
}

module.exports = { validateInput };
