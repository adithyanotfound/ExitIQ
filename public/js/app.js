/**
 * TensorX Frontend – Form handling, API calls, result rendering
 */

(function () {
  'use strict';

  const form       = document.getElementById('valuationForm');
  const submitBtn  = document.getElementById('submitBtn');
  const resultsBox = document.getElementById('resultsContent');
  const steps      = document.querySelectorAll('.pipeline-step');

  // ── Pipeline animation ───────────────────────────────────────
  const STEP_NAMES = ['input', 'geocode', 'features', 'valuation', 'liquidity', 'checks', 'output'];

  function setPipelineStep(activeIdx) {
    steps.forEach((el, i) => {
      el.classList.remove('active', 'done');
      if (i < activeIdx)  el.classList.add('done');
      if (i === activeIdx) el.classList.add('active');
    });
  }

  function resetPipeline() {
    steps.forEach(el => el.classList.remove('active', 'done'));
  }

  async function animatePipeline() {
    for (let i = 0; i < STEP_NAMES.length; i++) {
      setPipelineStep(i);
      await sleep(280);
    }
    steps.forEach(el => { el.classList.remove('active'); el.classList.add('done'); });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Form → JSON ─────────────────────────────────────────
  function buildPayload() {
    const floorFrom = num('floor_from');
    const floorTo   = num('floor_to') || floorFrom; // default to same floor

    // Collect per-floor areas if multi-floor
    const floorAreas = getPerFloorAreas();

    return {
      address: val('address'),
      lat_long: {
        lat: num('lat') || null,
        lng: num('lng') || null,
      },
      property_type: val('property_type'),
      sub_type:      val('sub_type'),
      size: {
        carpet_area_sqft:  num('carpet_area'),
        builtup_area_sqft: num('builtup_area'),
        land_parcel_sqft:  num('land_parcel'),
      },
      age_years:              num('age_years'),
      floor_from:             floorFrom,
      floor_to:               floorTo,
      total_building_floors:  num('total_building_floors') || null,
      floor_areas:            floorAreas.length > 0 ? floorAreas : null,
      accessibility: {
        lift:               checked('lift'),
        ground_floor_access: checked('ground_access'),
      },
      occupancy_status: val('occupancy'),
      rent_monthly:     num('rent_monthly'),
      legal_status: {
        freehold:    checked('freehold'),
        clear_title: checked('clear_title'),
        leasehold:   checked('leasehold'),
      },
      images: [],
    };
  }

  function val(id)     { return (document.getElementById(id)?.value || '').trim(); }
  function num(id)     { return parseFloat(document.getElementById(id)?.value) || 0; }
  function checked(id) { return document.getElementById(id)?.checked || false; }

  // ── Submit ───────────────────────────────────────────────────
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    const payload = buildPayload();
    const pipelinePromise = animatePipeline();

    try {
      const res = await fetch('/api/valuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      await pipelinePromise;

      if (!json.success) {
        renderErrors(json.errors);
      } else {
        renderResults(json.data, json._debug);
      }
    } catch (err) {
      await pipelinePromise;
      renderErrors(['Network error — is the server running?']);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  });

  // ── Freehold / Leasehold mutual exclusion ─────────────────
  const freeholdEl  = document.getElementById('freehold');
  const leaseholdEl = document.getElementById('leasehold');

  freeholdEl.addEventListener('change', function () {
    if (this.checked) leaseholdEl.checked = false;
  });
  leaseholdEl.addEventListener('change', function () {
    if (this.checked) freeholdEl.checked = false;
  });

  // ── Auto-sync floor_to from floor_from & per-floor inputs ──
  const floorFromEl        = document.getElementById('floor_from');
  const floorToEl          = document.getElementById('floor_to');
  const perFloorContainer  = document.getElementById('perFloorContainer');

  floorFromEl.addEventListener('input', function () {
    // If floor_to is empty or less than floor_from, sync it
    if (!floorToEl.value || Number(floorToEl.value) < Number(this.value)) {
      floorToEl.value = this.value;
    }
    renderPerFloorInputs();
  });

  floorToEl.addEventListener('input', function () {
    renderPerFloorInputs();
  });

  // ── Per-floor measurement rendering ────────────────────────
  function renderPerFloorInputs() {
    const from = parseInt(floorFromEl.value) || 0;
    const to   = parseInt(floorToEl.value)   || from;
    const span = to - from + 1;

    // Only show per-floor inputs for multi-floor units
    if (span <= 1 || to < from) {
      perFloorContainer.innerHTML = '';
      return;
    }

    // Cap at 10 floors to keep the form manageable
    const actualSpan = Math.min(span, 10);

    let inputsHtml = '';
    for (let f = from; f < from + actualSpan; f++) {
      const label = f === 0 ? 'Ground Floor' : `Floor ${f}`;
      inputsHtml += `
        <div class="form-group">
          <label for="floor_area_${f}">${label} (sqft)</label>
          <input type="number" id="floor_area_${f}" class="per-floor-area"
                 data-floor="${f}" min="0" placeholder="e.g. 800" />
        </div>
      `;
    }

    if (span > 10) {
      inputsHtml += `<div style="font-size:0.72rem;color:var(--warning);grid-column:1/-1;">Showing first 10 floors only</div>`;
    }

    perFloorContainer.innerHTML = `
      <div class="per-floor-section">
        <div class="per-floor-title">📏 Per-Floor Measurements (${span} floors)</div>
        <div class="per-floor-grid">${inputsHtml}</div>
        <div class="per-floor-sum">
          Total area: <span class="sum-value" id="perFloorSum">0 sqft</span>
          <span style="font-size:0.65rem;opacity:0.6;">→ auto-fills carpet area</span>
        </div>
      </div>
    `;

    // Attach input listeners for live sum
    perFloorContainer.querySelectorAll('.per-floor-area').forEach(el => {
      el.addEventListener('input', updatePerFloorSum);
    });
  }

  function updatePerFloorSum() {
    const areas = getPerFloorAreas();
    const total = areas.reduce((s, a) => s + a.area_sqft, 0);
    const sumEl = document.getElementById('perFloorSum');
    if (sumEl) sumEl.textContent = total.toLocaleString('en-IN') + ' sqft';

    // Auto-fill carpet area from sum
    if (total > 0) {
      document.getElementById('carpet_area').value = total;
    }
  }

  function getPerFloorAreas() {
    const inputs = perFloorContainer.querySelectorAll('.per-floor-area');
    const areas = [];
    inputs.forEach(el => {
      const floor = parseInt(el.dataset.floor);
      const area  = parseFloat(el.value) || 0;
      if (area > 0) {
        areas.push({ floor, area_sqft: area });
      }
    });
    return areas;
  }

  // ── Render Errors ────────────────────────────────────────────
  function renderErrors(errors) {
    resultsBox.innerHTML = `
      <div class="error-box">
        <h4>⚠️ Validation Errors</h4>
        <ul>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      </div>
      <div class="results-placeholder">
        <p>Fix the errors above and try again.</p>
      </div>
    `;
  }

  // ── Render Results ───────────────────────────────────────────
  function renderResults(data, debug) {
    const d = data;

    const resaleClass = d.resale_potential_index >= 80 ? 'resale-high'
                      : d.resale_potential_index >= 50 ? 'resale-medium'
                      : 'resale-low';

    const resaleLabel = d.resale_potential_index >= 80 ? 'Highly Liquid'
                      : d.resale_potential_index >= 50 ? 'Moderate Liquidity'
                      : 'Illiquid / Specialised';

    // Build geo banner
    const geo = debug?.geo || {};
    const geoHtml = geo.enriched
      ? `<div class="result-item" style="border-color: var(--border-accent);">
           <div class="result-label">📍 Resolved Location</div>
           <div style="font-size:0.82rem;color:var(--text-primary);font-weight:500;margin-bottom:0.3rem;">${esc(geo.resolved_address || '')}</div>
           ${renderPOIs(geo.nearest_pois)}
           ${renderCompositeScores(geo.scores)}
           <div class="result-sub" style="color:var(--success);">✓ Geocoded via Nominatim + Geoapify Places (${geo.total_pois || 0} POIs scanned)</div>
         </div>`
      : `<div class="result-item">
           <div class="result-label">📍 Location</div>
           <div class="result-sub" style="color:var(--warning);">⚠ Geo enrichment unavailable — using synthetic signals</div>
         </div>`;

    resultsBox.innerHTML = `
      <div class="result-grid">

        <!-- Geo Resolution -->
        ${geoHtml}

        <!-- Market Value -->
        <div class="result-item">
          <div class="result-label">Market Value Range</div>
          <div class="result-value value-market">${fmt(d.market_value_range[0])} — ${fmt(d.market_value_range[1])}</div>
          <div class="result-sub">Circle-rate anchored, adjustment-stack derived</div>
        </div>

        <!-- Distress Value -->
        <div class="result-item">
          <div class="result-label">Distress Sale Value Range</div>
          <div class="result-value value-distress">${fmt(d.distress_value_range[0])} — ${fmt(d.distress_value_range[1])}</div>
          <div class="result-sub">Liquidity discount applied to market value</div>
        </div>

        <!-- Resale Index -->
        <div class="result-item">
          <div class="result-label">Resale Potential Index</div>
          <div class="result-value value-resale">${d.resale_potential_index} <span style="font-size:0.65em;font-weight:500;opacity:0.6">/ 100</span></div>
          <div class="result-sub">${resaleLabel}</div>
          <div class="resale-meter">
            <div class="resale-fill ${resaleClass}" style="width: ${d.resale_potential_index}%"></div>
          </div>
        </div>

        <!-- Time to Sell -->
        <div class="result-item">
          <div class="result-label">Estimated Time to Sell</div>
          <div class="result-value value-time">${d.estimated_time_to_sell_days[0]} — ${d.estimated_time_to_sell_days[1]} <span style="font-size:0.55em;font-weight:500;opacity:0.6">days</span></div>
          <div class="result-sub">Based on resale index, type, and market activity</div>
        </div>

        <!-- Confidence -->
        <div class="result-item">
          <div class="result-label">Confidence Score</div>
          <div class="result-value value-confidence">${(d.confidence_score * 100).toFixed(0)}%</div>
          <div class="result-sub">Higher = more data support and fewer conflicts</div>
          <div class="confidence-bar-container">
            <div class="confidence-bar" style="width: ${d.confidence_score * 100}%"></div>
          </div>
        </div>

        <!-- Key Drivers -->
        <div class="result-item">
          <div class="result-label">Key Drivers</div>
          <div class="tag-list">
            ${d.key_drivers.map(t => `<span class="tag tag-driver">${esc(t)}</span>`).join('')}
          </div>
        </div>

        <!-- Risk Flags -->
        <div class="result-item">
          <div class="result-label">Risk Flags</div>
          <div class="tag-list">
            ${d.risk_flags.length > 0
              ? d.risk_flags.map(t => `<span class="tag tag-risk">${esc(t)}</span>`).join('')
              : '<span style="font-size:0.78rem;color:var(--success)">No significant risks detected</span>'
            }
          </div>
        </div>

      </div>

      <!-- Debug toggle -->
      <div class="debug-toggle">
        <button class="debug-btn" type="button" id="debugToggle">◉ Show Engine Internals</button>
        <div class="debug-content" id="debugContent">
          <pre class="debug-pre">${esc(JSON.stringify(debug, null, 2))}</pre>
        </div>
      </div>
    `;

    // Debug toggle
    document.getElementById('debugToggle')?.addEventListener('click', function () {
      const el = document.getElementById('debugContent');
      el.classList.toggle('open');
      this.textContent = el.classList.contains('open')
        ? '◉ Hide Engine Internals'
        : '◉ Show Engine Internals';
    });
  }

  // ── Render nearest POIs table ────────────────────────────────
  function renderPOIs(pois) {
    if (!pois || Object.keys(pois).length === 0) return '';
    const rows = Object.entries(pois).map(([cat, info]) =>
      `<span class="tag" style="background:var(--info-bg);color:var(--info);border:1px solid rgba(59,130,246,0.15);margin-right:0.3rem;margin-bottom:0.3rem;">
        ${esc(cat)}: ${esc(info.name)} (${info.distance_km} km)
      </span>`
    ).join('');
    return `<div class="tag-list" style="margin-bottom:0.4rem;">${rows}</div>`;
  }

  // ── Render composite geo scores ─────────────────────────────
  function renderCompositeScores(scores) {
    if (!scores) return '';
    const items = [
      { label: 'Infra',      key: 'infra_score',      color: 'var(--accent-light)' },
      { label: 'Commercial', key: 'commercial_score',  color: 'var(--warning)' },
      { label: 'Livability', key: 'livability_score',  color: 'var(--success)' },
      { label: 'Loc Premium',key: 'location_premium',  color: 'var(--info)' },
    ];
    const bars = items.map(({ label, key, color }) => {
      const val = scores[key] != null ? (scores[key] * 100).toFixed(0) : '—';
      const width = scores[key] != null ? Math.round(scores[key] * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
        <span style="font-size:0.65rem;font-weight:600;color:var(--text-muted);min-width:75px;">${label}</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="width:${width}%;height:100%;background:${color};border-radius:3px;transition:width 0.6s ease;"></div>
        </div>
        <span style="font-size:0.65rem;font-family:'JetBrains Mono',monospace;color:${color};min-width:28px;text-align:right;">${val}%</span>
      </div>`;
    }).join('');
    return `<div style="margin:0.5rem 0 0.3rem;">${bars}</div>`;
  }

  // ── Utilities ────────────────────────────────────────────────
  function fmt(num) {
    if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000)   return '₹' + (num / 100000).toFixed(2) + ' L';
    return '₹' + num.toLocaleString('en-IN');
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

})();
