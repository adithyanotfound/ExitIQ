/**
 * Pipeline Orchestrator
 *
 * INPUT → validate → geocode → feature engineering → valuation → liquidity
 *       → false positive checks → confidence → output JSON
 *
 * Now async because the geo pipeline calls external APIs.
 */

const { validateInput }                            = require('./validation');
const { analyzeLocation }                          = require('./geoPipeline');
const { engineerFeatures }                         = require('./features');
const { computeMarketValue, computeDistressValue } = require('./valuation');
const { computeResaleIndex, computeTimeToLiquidate } = require('./liquidity');
const { runFalsePositiveChecks, computeConfidence }  = require('./falsePositive');
const { buildOutput }                              = require('./output');
const { analyzePropertyImages }                    = require('./gemini');

async function runPipeline(rawInput) {
  // 1. Validate
  const validation = validateInput(rawInput);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  const input = validation.data;

  // 2. Geocode & POI enrichment + AI Vision Analysis (Parallel)
  const [geoData, geminiData] = await Promise.all([
    analyzeLocation(input.address, input.sub_type),
    analyzePropertyImages(input.images, input)
  ]);

  if (geminiData?.risk_flags?.some(f => f.toLowerCase().includes('reject') || f.toLowerCase().includes('blurry'))) {
    return { success: false, errors: ['Image Quality Rejected: Please upload clear, relevant photos of the property.'] };
  }

  // 3. Feature engineering (now receives geo data)
  const features = engineerFeatures(input, geoData);
  features.geminiData = geminiData; // attach AI insights for downstream usage

  // 4. Valuation
  const marketValue   = computeMarketValue(features);
  const distressValue = computeDistressValue(marketValue, features);

  // 5. Liquidity
  const resaleIndex     = computeResaleIndex(features);
  const timeToLiquidate = computeTimeToLiquidate(resaleIndex, features);

  // 6. False positive checks
  const fpResult = runFalsePositiveChecks(input, features);

  // 7. Confidence calibration
  let confidence = computeConfidence(features, fpResult);

  // Legal-risk suppression: cap market value upside, force wider distress
  if (fpResult.legalRisk) {
    marketValue.upper = Math.min(marketValue.upper, marketValue.midValue);
    confidence = Math.min(confidence, 0.65);
  }

  // 8. Output
  const output = buildOutput(
    marketValue, distressValue, resaleIndex,
    timeToLiquidate, confidence, features, fpResult
  );

  return {
    success: true,
    result: output,
    _debug: {
      zone: features.zone,
      circleRate: features.circleRate,
      baseValue: marketValue.baseValue,
      adjustments: marketValue.adjustments,
      discountRange: distressValue.discountRange,
      falsePositiveFlags: fpResult.flags,
      geo: {
        enriched: features.geoEnriched,
        resolved_address: features.geocodedAddress,
        nearest_pois: features.nearestPOIs,
        density: features.geoDensity,
        total_pois: features.geoTotalPOIs,
        scores: features.geoScores,
      },
      gemini_ai: geminiData || null,
      floor: {
        from: features.floorFrom,
        to: features.floorTo,
        span: features.floorSpan,
        level: input._floor_level,
        total_building_floors: features.totalBuildingFloors,
        per_floor_areas: features.floorAreas,
        floor_area_sum: features.floorAreaSum,
      },
    },
  };
}

module.exports = { runPipeline };
