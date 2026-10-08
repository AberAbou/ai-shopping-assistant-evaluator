import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { normalizePromptAnalysis } from "./src/services/evaluation/promptAnalysisNormalizer";
import { analyzeUserPromptDeterministically } from "./src/services/evaluation/fallbackPromptAnalyzer";
import { normalizeClaimAnalysis } from "./src/services/evaluation/claimAnalysisNormalizer";
import { analyzeLlmOutputDeterministically } from "./src/services/evaluation/fallbackClaimAnalyzer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * POST /api/analyze-prompt
 * Analyzes ONLY the User Prompt to extract shopper intent and atomic constraints.
 * Uses Gemini structured output with strict schema and deterministic normalization.
 */
app.post("/api/analyze-prompt", async (req, res) => {
  const { userPrompt } = req.body;

  if (!userPrompt || typeof userPrompt !== "string" || !userPrompt.trim()) {
    res.status(400).json({ error: "User Prompt is required" });
    return;
  }

  const promptText = userPrompt.trim();

  // If Gemini client is not initialized, use deterministic analyzer directly
  if (!ai) {
    const fallbackResult = analyzeUserPromptDeterministically(promptText);
    res.json(fallbackResult);
    return;
  }

  try {
    const systemInstruction = `You are a precision AI quality-engineering evaluator analyzing shopping requests.
Given a shopper's User Prompt, automatically extract a structured representation of the shopper's intent and decompose the request into atomic constraints.

CRITICAL EXTRACTION RULES:
1. Extract ONLY what is stated or reasonably implied. DO NOT invent, assume, or hallucinate missing requirements (e.g., if price, brand, size, color, or material are not specified, return null or empty array).
2. Every extracted intent element and every constraint MUST have an exact sourceText substring from the User Prompt for auditability.
3. Classify each constraint as:
   - "hard": Explicit non-negotiable requirements, bounds, or specifications (e.g. "under $25", "size 10", "for summer", "fragrance-free", "no leather", "lightweight", "breathable"). Descriptive adjectives expressing requested product attributes MUST be treated as hard requirements unless the wording explicitly indicates optionality.
   - "soft": Genuine preferences where the shopper indicates flexibility (e.g. "preferably black", "ideally organic", "prefer Nike if possible", "would like something stylish").
4. Represent explicit exclusions directly:
   - polarity MUST be "negative".
   - operator MUST be "prohibited" or "excludes".
   - DO NOT silently convert an exclusion into an unrelated positive attribute.
   - Example: "no leather" -> attribute: "leather", operator: "prohibited", polarity: "negative", sourceText: "no leather", expectedValue: "leather".
   - Example: "fragrance-free" -> attribute: "fragrance", operator: "prohibited", polarity: "negative", sourceText: "fragrance-free", expectedValue: "fragrance".
5. Operators must be one of: "<=", "<", ">=", ">", "==", "!=", "contains", "excludes", "suitable_for", "required", "prohibited".
6. Assign confidence scores (0.0 to 1.0) reflecting certainty.`;

    const generatePromise = ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `Analyze this shopping request: "${promptText}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.OBJECT,
              properties: {
                targetCategory: { type: Type.STRING, description: "Target product category e.g. jacket, running shoes, sunscreen, or null" },
                useCaseOrActivity: { type: Type.STRING, description: "Intended activity e.g. trail running, hiking, or null" },
                intendedUser: { type: Type.STRING, description: "Intended recipient or null" },
                seasonOrClimate: { type: Type.STRING, description: "Season or climate e.g. summer, winter, or null" },
                budget: {
                  type: Type.OBJECT,
                  properties: {
                    maxAmount: { type: Type.NUMBER, description: "Maximum price ceiling" },
                    minAmount: { type: Type.NUMBER, description: "Minimum price floor" },
                    currency: { type: Type.STRING, description: "Currency code" },
                    sourceText: { type: Type.STRING, description: "Source price snippet" },
                  },
                },
                quantity: { type: Type.STRING, description: "Quantity requested or null" },
                size: { type: Type.STRING, description: "Size requirement or null" },
                color: { type: Type.STRING, description: "Color requirement or null" },
                material: { type: Type.STRING, description: "Material requirement or null" },
                desiredAttributes: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of requested product features/attributes without optionality",
                },
                explicitExclusions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of explicit negative exclusions",
                },
                safetyOrSensitivity: { type: Type.STRING, description: "Sensitivity, allergy, or safety requirement or null" },
                otherContext: { type: Type.STRING, description: "Other context or null" },
                evidenceMap: {
                  type: Type.OBJECT,
                  description: "Mapping of extracted keys to source text",
                },
              },
            },
            constraints: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Constraint ID like C1, C2" },
                  attribute: { type: Type.STRING, description: "Attribute name" },
                  operator: { type: Type.STRING, description: "Operator: <=, suitable_for, required, prohibited, etc." },
                  expectedValue: { type: Type.STRING, description: "Expected value or bound" },
                  constraintType: { type: Type.STRING, description: "'hard' or 'soft'" },
                  polarity: { type: Type.STRING, description: "'positive' or 'negative'" },
                  sourceText: { type: Type.STRING, description: "Exact substring from User Prompt" },
                  confidence: { type: Type.NUMBER, description: "Confidence between 0.0 and 1.0" },
                  reasoning: { type: Type.STRING, description: "Brief justification" },
                },
                required: ["id", "attribute", "operator", "expectedValue", "constraintType", "polarity", "sourceText", "confidence"],
              },
            },
          },
          required: ["intent", "constraints"],
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Gemini API call timed out after 5000ms")), 5000);
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Empty response from model");
    }

    const parsed = JSON.parse(textOutput);
    const normalized = normalizePromptAnalysis(parsed, promptText);
    res.json(normalized);
  } catch (error) {
    console.error("Gemini API extraction failed or timed out, using deterministic fallback:", error);
    const fallbackResult = analyzeUserPromptDeterministically(promptText);
    res.json(fallbackResult);
  }
});

/**
 * POST /api/analyze-claims
 * Analyzes ONLY the LLM Output to extract recommended products and atomic claims.
 * Identifies factual vs subjective assertions, links claims strictly to products (P1, P2),
 * and preserves exact source text evidence.
 */
app.post("/api/analyze-claims", async (req, res) => {
  const { llmOutput } = req.body;

  if (!llmOutput || typeof llmOutput !== "string" || !llmOutput.trim()) {
    res.status(400).json({ error: "LLM Output is required" });
    return;
  }

  const outputText = llmOutput.trim();

  // If Gemini client is not initialized, use deterministic analyzer directly
  if (!ai) {
    const fallbackResult = analyzeLlmOutputDeterministically(outputText);
    res.json(fallbackResult);
    return;
  }

  try {
    const systemInstruction = `You are a precision AI quality-engineering evaluator analyzing shopping-assistant responses.
Given an LLM Output generated by a shopping assistant, extract all recommended products and decompose the response into atomic factual and subjective claims.

CRITICAL CLAIM EXTRACTION RULES:
1. Extract ALL recommended products with stable IDs (P1, P2, etc.). For each product, extract name, price, brand, category, materials, colors, attributes, suitability, safety claims, rating, etc. If a property is not stated, return null or empty array (DO NOT invent missing information).
2. Decompose the response into atomic claims (CL1, CL2, etc.). A single sentence may contain multiple claims (e.g. price, materials, waterproof, rating).
3. Product Linking: Every product-specific claim MUST be explicitly linked via productId ("P1", "P2"). In multi-product responses, NEVER mix or cross-assign claims between products.
4. Factual vs Subjective:
   - "factual": Measurable, quantifiable, or specification-based assertions (prices, weights, dimensions, materials, SPF ratings, ingredients, review stars).
   - "subjective": Evaluative, opinion-based, or aesthetic claims ("looks great", "comfortable", "stylish", "excellent choice").
5. DO NOT evaluate whether the claims satisfy the shopper's prompt or whether they are truthful. ONLY extract what the assistant claimed.
6. Every extracted product field and every atomic claim MUST have an exact sourceText substring from the LLM Output for auditability.
7. Assign confidence scores (0.0 to 1.0) reflecting certainty.`;

    const generatePromise = ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `Analyze this shopping assistant response: "${outputText}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            products: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Product ID like P1, P2" },
                  name: { type: Type.STRING, description: "Product name" },
                  brand: { type: Type.STRING, description: "Brand name or null" },
                  category: { type: Type.STRING, description: "Product category or null" },
                  price: {
                    type: Type.OBJECT,
                    properties: {
                      amount: { type: Type.NUMBER, description: "Price amount" },
                      currency: { type: Type.STRING, description: "Currency e.g. USD" },
                      sourceText: { type: Type.STRING, description: "Source snippet" },
                    },
                  },
                  colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                  materials: { type: Type.ARRAY, items: { type: Type.STRING } },
                  attributes: { type: Type.ARRAY, items: { type: Type.STRING } },
                  suitability: { type: Type.ARRAY, items: { type: Type.STRING } },
                  safetyOrSensitivity: { type: Type.ARRAY, items: { type: Type.STRING } },
                  rating: {
                    type: Type.OBJECT,
                    properties: {
                      score: { type: Type.NUMBER },
                      maxScore: { type: Type.NUMBER },
                      reviewCount: { type: Type.NUMBER },
                      sourceText: { type: Type.STRING },
                    },
                  },
                  evidenceMap: { type: Type.OBJECT },
                },
                required: ["id", "name"],
              },
            },
            claims: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Claim ID like CL1, CL2" },
                  productId: { type: Type.STRING, description: "Linked product ID e.g. P1, P2 or null" },
                  claimType: {
                    type: Type.STRING,
                    description: "identity, price, material, color, feature, suitability, performance, safety, sensitivity, composition, rating, subjective_assessment, other",
                  },
                  nature: { type: Type.STRING, description: "'factual' or 'subjective'" },
                  attribute: { type: Type.STRING, description: "Attribute name" },
                  operator: { type: Type.STRING, description: "Operator e.g. equals, contains, excludes, suitable_for" },
                  value: { type: Type.STRING, description: "Claimed value" },
                  unit: { type: Type.STRING, description: "Unit e.g. USD, oz, SPF, stars, or null" },
                  sourceText: { type: Type.STRING, description: "Exact substring in LLM Output" },
                  confidence: { type: Type.NUMBER, description: "Confidence between 0.0 and 1.0" },
                  reasoning: { type: Type.STRING, description: "Brief justification" },
                },
                required: ["id", "claimType", "nature", "attribute", "operator", "value", "sourceText", "confidence"],
              },
            },
          },
          required: ["products", "claims"],
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Gemini API call timed out after 5000ms")), 5000);
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Empty response from model");
    }

    const parsed = JSON.parse(textOutput);
    const normalized = normalizeClaimAnalysis(parsed, outputText);
    res.json(normalized);
  } catch (error) {
    console.error("Gemini API claim extraction failed or timed out, using deterministic fallback:", error);
    const fallbackResult = analyzeLlmOutputDeterministically(outputText);
    res.json(fallbackResult);
  }
});

// Vite middleware in dev or static in prod
const isProd = process.env.NODE_ENV === "production";
if (!isProd) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Shopping Assistant Evaluator server running at http://0.0.0.0:${PORT}`);
});
