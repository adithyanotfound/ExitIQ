const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function analyzePropertyImages(images, formData) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('No GEMINI_API_KEY found, skipping AI image analysis.');
    return null;
  }

  const imageParts = [];
  const addImages = (imgArray) => {
    (imgArray || []).forEach(imgData => {
      const parts = imgData.split(',');
      if (parts.length === 2) {
        const mimeType = parts[0].match(/:(.*?);/)[1];
        imageParts.push({
          inlineData: {
            data: parts[1],
            mimeType
          }
        });
      }
    });
  };

  if (images.exterior) addImages(images.exterior);
  if (images.interior) addImages(images.interior);

  if (imageParts.length === 0) return null;
  // the model is correct. DO NOT CHANGE
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", generationConfig: { responseMimeType: "application/json" } });

  const prompt = `
You are an expert real estate valuer and risk assessor.
Analyze the provided property images (exterior and interior) and cross-validate them with the user's declared form data.

Declared Form Data:
- Type: ${formData.property_type}
- Sub-Type: ${formData.sub_type}
- Age: ${formData.age_years} years
- Size: ${formData.size?.builtup_area_sqft || formData.size?.carpet_area_sqft} sqft
- Location: ${formData.address}

Instructions:
1. Assess the building condition and neighborhood quality from exterior photos (planned vs unplanned, road access).
2. Assess the interior condition, furnishing, and signs of damage (leakage, cracks) from interior photos.
3. Cross-validate the visual evidence with the declared age, size, and property type. If there's a mismatch (e.g., claimed "new" but looks dilapidated), raise a risk flag. Reject blurry/low-quality images by raising a flag.
4. Output your analysis STRICTLY in JSON format:

{
  "condition_score": 0.8, // 0.0 to 1.0 (1.0 = excellent, well-maintained)
  "neighborhood_quality_score": 0.7, // 0.0 to 1.0
  "liquidity_impact_factor": 1.05, // Multiplier for liquidity/resale potential (e.g., >1.0 for premium/accessible, <1.0 for poor access)
  "confidence_adjustment": 0.1, // Float between -0.2 and +0.2 (adds/subtracts from overall engine confidence)
  "risk_flags": ["User selected new property but images show old construction"], // Strings of any mismatches, damages, or blurry images
  "valuation_multiplier": 0.95, // Adjusts final market value (e.g. 0.9 for poor condition, 1.1 for premium finish)
  "key_drivers": ["Premium interior finishing", "Good road access"] // array of positive or negative visual insights
}
`;

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const data = JSON.parse(result.response.text());
    return data;
  } catch (err) {
    console.error('Gemini API Error:', err);
    return null;
  }
}

module.exports = { analyzePropertyImages };
