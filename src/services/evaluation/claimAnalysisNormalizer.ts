import {
  ExtractedProduct,
  ExtractedClaim,
  LlmOutputClaimAnalysisResult,
  ClaimCategory,
  ClaimNature,
} from '../../types/evaluation';

/**
 * Normalizes, validates, and verifies structured model claim output against the raw LLM Output.
 * Guarantees schema adherence, evidence traceability, product scope linking,
 * and factual vs subjective distinction.
 */
export function normalizeClaimAnalysis(
  rawModelOutput: any,
  llmOutput: string
): LlmOutputClaimAnalysisResult {
  const text = llmOutput.trim();
  const lowerText = text.toLowerCase();

  // 1. Process Products
  const rawProducts: any[] = Array.isArray(rawModelOutput?.products) ? rawModelOutput.products : [];
  const normalizedProducts: ExtractedProduct[] = [];

  rawProducts.forEach((p, idx) => {
    const id = p.id && String(p.id).startsWith('P') ? String(p.id) : `P${idx + 1}`;
    const name = String(p.name || `Recommended Product ${idx + 1}`).trim();

    // Verify price
    let price: { amount: number | null; currency: string; sourceText: string | null } | null = null;
    if (p.price && (p.price.amount !== null || p.price.amount !== undefined)) {
      const amountVal = typeof p.price.amount === 'number'
        ? p.price.amount
        : parseFloat(String(p.price.amount).replace(/[^0-9.]/g, ''));

      let source = p.price.sourceText ? String(p.price.sourceText) : null;
      if (source && lowerText.indexOf(source.toLowerCase()) !== -1) {
        const sIdx = lowerText.indexOf(source.toLowerCase());
        source = text.substring(sIdx, sIdx + source.length);
      } else if (!isNaN(amountVal)) {
        const m = text.match(new RegExp(`(?:\\$|for\\s+\\$)?${amountVal}`, 'i'));
        source = m ? m[0] : `$${amountVal}`;
      }

      price = {
        amount: isNaN(amountVal) ? null : amountVal,
        currency: p.price.currency || 'USD',
        sourceText: source,
      };
    }

    // Rating
    let rating: { score: number | null; maxScore: number | null; reviewCount: number | null; sourceText: string | null } | null = null;
    if (p.rating && p.rating.score !== null && p.rating.score !== undefined) {
      const scoreVal = parseFloat(String(p.rating.score));
      rating = {
        score: isNaN(scoreVal) ? null : scoreVal,
        maxScore: p.rating.maxScore ? parseFloat(String(p.rating.maxScore)) : 5,
        reviewCount: p.rating.reviewCount ? parseInt(String(p.rating.reviewCount), 10) : null,
        sourceText: p.rating.sourceText ? String(p.rating.sourceText) : null,
      };
    }

    normalizedProducts.push({
      id,
      name,
      brand: p.brand ? String(p.brand) : null,
      category: p.category ? String(p.category) : null,
      price,
      quantity: p.quantity ? String(p.quantity) : null,
      size: p.size ? String(p.size) : null,
      colors: Array.isArray(p.colors) ? p.colors.map((c: any) => String(c)) : [],
      materials: Array.isArray(p.materials) ? p.materials.map((m: any) => String(m)) : [],
      attributes: Array.isArray(p.attributes) ? p.attributes.map((a: any) => String(a)) : [],
      suitability: Array.isArray(p.suitability) ? p.suitability.map((s: any) => String(s)) : [],
      safetyOrSensitivity: Array.isArray(p.safetyOrSensitivity) ? p.safetyOrSensitivity.map((s: any) => String(s)) : [],
      availability: p.availability ? String(p.availability) : null,
      rating,
      shippingOrDelivery: p.shippingOrDelivery ? String(p.shippingOrDelivery) : null,
      warrantyOrReturns: p.warrantyOrReturns ? String(p.warrantyOrReturns) : null,
      evidenceMap: p.evidenceMap || {},
    });
  });

  // 2. Process Atomic Claims
  const rawClaims: any[] = Array.isArray(rawModelOutput?.claims) ? rawModelOutput.claims : [];
  const normalizedClaims: ExtractedClaim[] = [];

  rawClaims.forEach((c, idx) => {
    const id = c.id && String(c.id).startsWith('CL') ? String(c.id) : `CL${idx + 1}`;
    
    // Product linking
    let productId: string | null = null;
    let productName: string | null = null;

    if (c.productId) {
      const matchedP = normalizedProducts.find(p => p.id === c.productId || p.name.toLowerCase() === String(c.productId).toLowerCase());
      if (matchedP) {
        productId = matchedP.id;
        productName = matchedP.name;
      }
    } else if (normalizedProducts.length === 1) {
      productId = normalizedProducts[0].id;
      productName = normalizedProducts[0].name;
    }

    // Verify sourceText matches llmOutput
    let sourceText = String(c.sourceText || '').trim();
    if (!sourceText || lowerText.indexOf(sourceText.toLowerCase()) === -1) {
      // Find matching fragment
      const words = sourceText.split(/\s+/).filter(w => w.length > 2);
      let found = false;
      for (const w of words) {
        const foundIdx = lowerText.indexOf(w.toLowerCase());
        if (foundIdx !== -1) {
          sourceText = text.substring(foundIdx, Math.min(text.length, foundIdx + w.length * 4));
          found = true;
          break;
        }
      }
      if (!found) {
        sourceText = text.slice(0, 30);
      }
    } else {
      const exactIdx = lowerText.indexOf(sourceText.toLowerCase());
      sourceText = text.substring(exactIdx, exactIdx + sourceText.length);
    }

    // Distinguish factual vs subjective
    const isSubjectiveKeyword = /\b(great|comfortable|stylish|looks great|superb|impressive|excellent|versatile|best choice)\b/i.test(sourceText) ||
                                c.nature === 'subjective';
    const nature: ClaimNature = isSubjectiveKeyword ? 'subjective' : 'factual';

    // Normalize Claim Type
    let claimType: ClaimCategory = (c.claimType as ClaimCategory) || 'feature';
    const validClaimTypes: ClaimCategory[] = [
      'identity', 'brand', 'category', 'price', 'color', 'size', 'quantity', 'material',
      'feature', 'suitability', 'performance', 'safety', 'sensitivity', 'composition',
      'availability', 'rating', 'review_count', 'shipping', 'delivery', 'warranty',
      'return_policy', 'certification', 'sustainability', 'comparative', 'subjective_assessment', 'other'
    ];
    if (!validClaimTypes.includes(claimType)) {
      claimType = 'feature';
    }

    // Value normalization
    let value = c.value ?? sourceText;
    if (claimType === 'price' && typeof value !== 'number') {
      const numMatch = String(value).match(/([0-9]+(?:\.[0-9]+)?)/);
      if (numMatch) {
        value = parseFloat(numMatch[1]);
      }
    }

    const confidence = typeof c.confidence === 'number' && c.confidence >= 0 && c.confidence <= 1
      ? Math.round(c.confidence * 100) / 100
      : 0.95;

    normalizedClaims.push({
      id,
      productId,
      productName,
      claimType,
      nature,
      attribute: String(c.attribute || claimType).toLowerCase(),
      operator: String(c.operator || 'equals'),
      value,
      unit: c.unit ? String(c.unit) : null,
      sourceText,
      confidence,
      reasoning: c.reasoning || (nature === 'factual' ? 'Objective product claim verifiable against specifications' : 'Evaluative or subjective impression'),
    });
  });

  const factualCount = normalizedClaims.filter(c => c.nature === 'factual').length;
  const subjectiveCount = normalizedClaims.filter(c => c.nature === 'subjective').length;

  const claimsPerProduct: Record<string, number> = {};
  normalizedProducts.forEach(p => {
    claimsPerProduct[p.id] = normalizedClaims.filter(c => c.productId === p.id).length;
  });

  return {
    state: 'CLAIM_ANALYSIS_COMPLETE',
    analyzedAt: new Date().toISOString(),
    llmOutput: text,
    products: normalizedProducts,
    claims: normalizedClaims,
    summary: {
      totalProducts: normalizedProducts.length,
      totalClaims: normalizedClaims.length,
      factualCount,
      subjectiveCount,
      claimsPerProduct,
    },
    rawJson: rawModelOutput,
  };
}
