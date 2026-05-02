/**
 * Input Validation & Sanitization Layer
 *
 * Validates mandatory fields, applies defaults for optional ones,
 * and normalises the input into a canonical shape for downstream processing.
 */

const VALID_PROPERTY_TYPES = ['Residential', 'Commercial', 'Industrial'];
const VALID_SUBTYPES = [
  'Apartment', 'Villa', 'Plot', 'Shop', 'Warehouse',
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
    images:           Array.isArray(raw.images) ? raw.images.filter(Boolean) : [],
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

  // Derived: effective area (best available)
  data._effective_area =
    data.size.carpet_area_sqft ||
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
