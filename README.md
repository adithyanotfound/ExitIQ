# ExitIQ: Real Estate Valuation & Liquidity Engine

ExitIQ is a deterministic, AI-enhanced real estate valuation and collateral intelligence platform. It replaces black-box ML models with an explainable, multi-stage rules engine that calculates accurate market values, distress pricing, and property liquidity metrics, cross-validated by computer vision.

## 🚀 Features

- **Multi-Modal AI Vision:** Leverages a custom trained image model to visually inspect property condition and cross-validate declared form data to flag structural risk or over-estimations.
- **Explainable Valuation:** Outputs specific adjustment modifiers (e.g., floor premium, location demand, depreciation) instead of opaque point estimates.
- **Liquidity & Resale Metrics:** Generates a Resale Potential Index (0–100) and predicts the Estimated Time to Liquidate (in days).
- **Automated Geocoding & POI Enrichment:** Uses Nominatim and Geoapify to fetch proximity to metros, schools, hospitals, and commercial hubs, deriving granular infrastructure and livability scores.
- **Fraud & False Positive Detection:** Flags unrealistic configurations, extreme size variations, and zoning mismatches (e.g., claiming a "Warehouse" in a "Prime" zone).

---

## 🧠 The Valuation Pipeline Explained

The backend orchestrates the valuation through a strict, deterministic sequence in `src/engine/pipeline.js`:

### 1. Input Validation (`validation.js`)
Normalizes the raw input payload into a canonical shape. 
- Handles `NaN` propagation using robust guards.
- Differentiates between **Apartments** (valued purely on built-up/carpet area) and **Independent Houses** (valued on plot footprint + floor structure multipliers).
- Sanitizes floor configurations and derives mutual exclusivity (e.g., Freehold vs Leasehold).

### 2. Geo Intelligence (`geoPipeline.js`)
*Runs concurrently with AI Vision Analysis.*
- **Geocoding:** Resolves address strings to lat/long using Nominatim, with an automatic Geoapify fallback.
- **POI Density Search:** Scans multiple radii (up to 5km) for public transit, social infrastructure, parks, and commercial proxies (banks, brokers).
- **Composite Scoring:** Reduces spatial data into continuous signals: `infra_score`, `commercial_score`, `market_activity`, and `livability_score`.
- **Fault Tolerance:** If external APIs fail, it automatically degrades into a stable, synthetic zone-based fallback to prevent calculation breakage.

### 3. AI Computer Vision
- Feeds user-uploaded interior and exterior photos into a **custom trained image model**.
- The AI inspects physical condition, checks for damage (leakage, cracks), assesses neighborhood planning, and explicitly verifies if the visual evidence aligns with the user's declared "Age" and "Property Type".
- Returns an adjusted Valuation Multiplier, a Liquidity Impact Factor, and specific string-based Key Drivers / Risk Flags.

### 4. Feature Engineering (`features.js`)
Takes the raw input, Geo scores, and AI modifiers to compute base valuation parameters.
- Translates statutory **Circle Rates** into realistic market rates using a dynamic `MARKET_RATE_FACTOR` tied to the property's zone (Prime, Urban, Suburban, etc.).
- Computes **Age Depreciation** via a piecewise-linear curve (clamped safely at 65% retained value).
- Derives **Location Premiums**, Sub-type multipliers, and Fungibility scoring.

### 5. Valuation Engine (`valuation.js`)
- **Market Value:** Establishes an anchor `baseValue = adjusted_rate * effective_area`. It then applies all feature adjustments (location, subtype, size scaling, age, infrastructure, floor level, rental yield, legal clarity, and AI condition) to generate a final `midValue`.
- **Distress Value:** Calculates a markdown based on the property's overall liquidity profile (highly liquid properties suffer a smaller distress markdown than illiquid assets).

### 6. Liquidity Engine (`liquidity.js`)
- **Resale Index (0-100):** A weighted matrix evaluating location demand, configuration attractiveness, legal clarity, age, and market activity. Clamped and multiplied by the custom AI's liquidity insights.
- **Time To Sell (Days):** Projects the liquidation timeline based on the Resale Index, applying penalties for niche properties (Farmhouses) or legal complexities.

### 7. False Positive Engine (`falsePositive.js`)
- Runs a battery of sanity checks:
  - Is the area unusually small/large for the declared type?
  - Does the built-up area exceed physical loading factor limits?
  - Do high-quality images conflict with a declared age of >30 years?
- Derives a final **Confidence Score** (0.15 to 0.98), penalizing the engine's confidence if anomalies are detected or if legal risk (e.g., unclear title) exists.

### 8. Output Module (`output.js`)
Extracts the highest-impact positive and negative modifiers from the entire pipeline to generate human-readable **Key Drivers** and **Risk Flags** (e.g., "Strong Infrastructure Access", "Old property, no visual verification"). 

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Recharts
- **AI Integration:** Custom Trained Image Model API
- **External Services:** Geoapify (Places API), Nominatim (OpenStreetMap)

## 💻 Running Locally

### Prerequisites
- Node.js (v18+ recommended)
- A Geoapify API Key
- A Custom Vision API Key

### Setup

1. **Clone the repository**
2. **Install dependencies**
   \`\`\`bash
   # Install backend deps
   npm install

   # Install frontend deps
   cd client
   npm install
   \`\`\`
3. **Environment Variables**
   Create a \`.env\` file in the root directory:
   \`\`\`env
   PORT=5000
   GEOAPIFY_API_KEY=your_geoapify_key
   VISION_API_KEY=your_vision_model_key
   \`\`\`
4. **Start the Development Servers**
   \`\`\`bash
   # From the root directory, start the backend
   npm run dev

   # From the /client directory, start the frontend
   npm run dev
   \`\`\`

## 🛡 Disclaimer
*This system generates deterministic automated valuation models (AVM) for guidance and analytical purposes. It is not a replacement for a certified physical appraisal.*
