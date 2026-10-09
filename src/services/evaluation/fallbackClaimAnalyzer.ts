import { reconcileClaimCart, extractQuantity, productCategory } from './shoppingCartSemantics';
import {
  ExtractedProduct,
  ExtractedClaim,
  LlmOutputClaimAnalysisResult,
  ClaimCategory,
  ClaimNature,
} from '../../types/evaluation';

/**
 * Deterministic Semantic Analyzer for LLM Output Claims.
 * Identifies recommended products and decomposes assistant assertions into atomic claims.
 * Retains strict product linking (P1 vs P2), factual vs subjective classification,
 * and exact source text traceability.
 */
export function analyzeLlmOutputDeterministically(llmOutput: string): LlmOutputClaimAnalysisResult {
  const text = llmOutput.trim();
  const lower = text.toLowerCase();

  const products: ExtractedProduct[] = [];
  const claims: ExtractedClaim[] = [];

  let claimCounter = 1;
  const nextClaimId = () => `CL${claimCounter++}`;

  const addClaim = (
    productId: string | null,
    productName: string | null,
    claimType: ClaimCategory,
    nature: ClaimNature,
    attribute: string,
    operator: string,
    value: string | number | boolean,
    sourceText: string,
    unit: string | null = null,
    confidence: number = 0.95,
    reasoning?: string
  ) => {
    // Clean and verify sourceText
    let cleanSource = sourceText.replace(/[,\.;]+$/, '').trim();
    const idx = lower.indexOf(cleanSource.toLowerCase());
    if (idx !== -1) {
      cleanSource = text.substring(idx, idx + cleanSource.length);
    }

    claims.push({
      id: nextClaimId(),
      productId,
      productName,
      claimType,
      nature,
      attribute,
      operator,
      value,
      unit,
      sourceText: cleanSource,
      confidence,
      reasoning,
    });
  };

  // --------------------------------------------------------------------------
  // STEP 1: IDENTIFY DISTINCT PRODUCTS IN LLM OUTPUT
  // --------------------------------------------------------------------------

  interface ProductCandidate {
    name: string;
    startIndex: number;
    endIndex: number;
    rawSnippet: string;
    detectedQuantity?: string | null;
    parsedQuantity?: number | null;
    unitPriceAmount?: number | null;
    unitPriceSource?: string | null;
  }

  const detectedCandidates: ProductCandidate[] = [];

  // Helper to parse quantity string to number
  const parseQuantityNum = (raw: string | null | undefined): number | null => {
    if (!raw) return null;
    const clean = raw.toLowerCase().trim();
    if (clean === 'a' || clean === 'an' || clean === 'one' || clean === '1' || clean.includes('1 pair')) return 1;
    if (clean === 'two' || clean === '2' || clean.includes('2 pair')) return 2;
    if (clean === 'three' || clean === '3') return 3;
    if (clean === 'four' || clean === '4') return 4;
    const numMatch = clean.match(/([0-9]+)/);
    return numMatch ? parseInt(numMatch[1], 10) : null;
  };

  // Check for stated cart total in output
  let statedCartTotalAmount: number | null = null;
  let statedCartTotalSource: string | null = null;
  const cartSummaryMatch = text.match(/(?:(?:for\s+a\s+)?total\s+(?:of|is|comes\s+to)?|totaling|total:\s*|all\s+items\s+for|in\s+total)\s*\$?([0-9]+(?:\.[0-9]{2})?)/i);
  if (cartSummaryMatch) {
    statedCartTotalAmount = parseFloat(cartSummaryMatch[1]);
    statedCartTotalSource = cartSummaryMatch[0];
  }

  // Pattern 1: Numbered or bullet list items (e.g. "1. Salomon Speedcross 6 - $145", "1. Badger Clear Zinc...")
  const listMatches = text.matchAll(/(?:^|\n)\s*(?:[0-9]+[.)]|\*|-)\s+([A-Za-z0-9\s'®™-]+?)(?:\s*[-–:]\s*|\s*\(\$?|\s+for\s+\$|\n|$)/gi);
  for (const m of listMatches) {
    const rawName = m[1].trim();
    if (rawName.length > 2 && !rawName.toLowerCase().startsWith('here') && !rawName.toLowerCase().startsWith('two options') && !rawName.toLowerCase().startsWith('total')) {
      const idx = m.index ?? text.indexOf(m[0]);
      detectedCandidates.push({
        name: rawName,
        startIndex: idx,
        endIndex: idx + m[0].length,
        rawSnippet: m[0],
      });
    }
  }

  // Pattern 2: Prose with parenthetical prices or names (e.g. "TrailAir Shell ($95)... MountainGuard Parka ($140)")
  const parenPriceMatches = text.matchAll(/([A-Z][A-Za-z0-9\s'®™-]+?)\s*\(\$([0-9]+(?:\.[0-9]{2})?)\)/g);
  for (const m of parenPriceMatches) {
    const rawName = m[1].trim().replace(/^(?:Two options:?\s*|Option [0-9]+:?\s*|Try the\s*|Check out\s*)/i, '').trim();
    const idx = m.index ?? text.indexOf(m[0]);
    if (!detectedCandidates.some(c => c.name.toLowerCase() === rawName.toLowerCase())) {
      detectedCandidates.push({
        name: rawName,
        startIndex: idx,
        endIndex: idx + m[0].length,
        rawSnippet: m[0],
      });
    }
  }

  // Pattern 2b: Multi-item prose recommendations with prices (e.g. "2 running shirts at $25 each and 1 pair of running shorts at $40" or "a shirt for $25 and shorts for $40")
  if (detectedCandidates.length === 0) {
    const multiItemProseRegex = /(?:(?:^|and|,|:|\n)\s*)(?:(?:I\s+recommend|recommend|suggest|get|try|check\s+out)\s+)?((?:(?:[0-9]+|\b(?:one|two|three|four|a|an)\b|\b[0-9]+\s+pairs?\s+of\b|\b[0-9]+\s+units?\b)\s+)?(?:[A-Za-z0-9'®™-]+\s+){0,5}[A-Za-z0-9'®™-]+?)\s+(?:at|for|costing|priced\s+at)\s+\$([0-9]+(?:\.[0-9]{2})?)(?:\s+(?:each|apiece))?/gi;
    const proseMatches = Array.from(text.matchAll(multiItemProseRegex));

    // Filter out matches that are actually cart totals (e.g. "all items for $90" or "totaling $65")
    const validProseItems = proseMatches.filter(pm => {
      const itemDesc = pm[1].toLowerCase().trim();
      return !itemDesc.includes('all items') && !itemDesc.includes('total') && !itemDesc.includes('items for');
    });

    if (validProseItems.length >= 2) {
      for (const vm of validProseItems) {
        const rawPhrase = vm[1].trim();
        const priceNum = parseFloat(vm[2]);
        const fullMatchedSnippet = vm[0];
        const idx = vm.index ?? text.indexOf(fullMatchedSnippet);

        // Separate quantity from product name
        const qtyMatch = rawPhrase.match(/^([0-9]+|\b(?:one|two|three|four|a|an)\b|\b[0-9]+\s+pairs?\s+of\b|\b[0-9]+\s+units?\b)\s+(.+)$/i);
        let parsedQty: number | null = null;
        let rawQtyStr: string | null = null;
        let cleanName = rawPhrase;

        if (qtyMatch) {
          rawQtyStr = qtyMatch[1].trim();
          parsedQty = parseQuantityNum(rawQtyStr);
          cleanName = qtyMatch[2].trim();
        } else {
          parsedQty = null;
          rawQtyStr = null;
        }

        // Capitalize name nicely
        const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

        detectedCandidates.push({
          name: formattedName,
          startIndex: idx,
          endIndex: idx + fullMatchedSnippet.length,
          rawSnippet: fullMatchedSnippet,
          detectedQuantity: rawQtyStr,
          parsedQuantity: parsedQty,
          unitPriceAmount: priceNum,
          unitPriceSource: `$${priceNum}${fullMatchedSnippet.toLowerCase().includes('each') ? ' each' : ''}`,
        });
      }
    }
  }

  // Quantified item lists remain extractable when a response omits prices.
  if (detectedCandidates.length === 0) {
    let cursor = 0;
    for (const chunk of text.split(/\band\b|,|\n/i)) {
      const snippet = chunk.trim();
      const idx = text.indexOf(snippet, cursor);
      cursor = Math.max(cursor, idx + snippet.length);
      const quantity = extractQuantity(snippet);
      const item = snippet.match(/^(?:I\s+(?:recommend|suggest)\s+)?(?:-?\d+(?:\.\d+)?|one|two|three|four|five|six|a|an)\s+(?:pair\s+of\s+)?([a-z0-9 '-]*?\b(?:shirts?|shorts?|shoes?|jackets?|socks?|pants?|sunscreen|backpacks?|headphones?|laptops?|watches?))\b/i);
      if (item && productCategory(item[1]) && quantity.raw !== null) detectedCandidates.push({ name: item[1], startIndex: idx, endIndex: idx + item[0].length, rawSnippet: snippet, detectedQuantity: quantity.raw, parsedQuantity: quantity.amount });
    }
  }

  // Pattern 3: Single recommendation intro: "I recommend [Product Name] SPF 50 for $32" or "Try the [Product Name] for $109"
  if (detectedCandidates.length === 0) {
    const introMatch = text.match(/(?:recommend|try the|check out|suggest(?:ing)?|option is)\s+([A-Z][A-Za-z0-9\s'®™-]+?)(?:\s+SPF\b|\s+for\s+\$|\s+at\s+\$|\s*[-–:]|\.|\n)/i);
    if (introMatch) {
      const rawName = introMatch[1].trim().replace(/^(?:the\s+)/i, '');
      const idx = introMatch.index ?? text.indexOf(introMatch[0]);
      detectedCandidates.push({
        name: rawName,
        startIndex: idx,
        endIndex: idx + introMatch[0].length,
        rawSnippet: introMatch[0],
      });
    }
  }

  // Pattern 4: "The [Product Name] is..." or "The [Product Name] costs..."
  if (detectedCandidates.length === 0) {
    const theMatch = text.match(/^(?:The)\s+([A-Z][A-Za-z0-9\s'®™-]+?)\s+(?:is|costs|features|comes|offers|provides)\b/i);
    if (theMatch) {
      const rawName = theMatch[1].trim();
      const idx = theMatch.index ?? text.indexOf(theMatch[0]);
      detectedCandidates.push({
        name: rawName,
        startIndex: idx,
        endIndex: idx + theMatch[0].length,
        rawSnippet: theMatch[0],
      });
    }
  }

  // Sort candidates by position in text
  detectedCandidates.sort((a, b) => a.startIndex - b.startIndex);

  // Divide text into scopes per product so claims belong strictly to the relevant product
  interface ProductSection {
    productName: string;
    sectionText: string;
    startIndex: number;
    candidate?: ProductCandidate;
  }

  const productSections: ProductSection[] = [];

  if (detectedCandidates.length === 0) {
    // Single general response
    productSections.push({
      productName: 'Recommended Item',
      sectionText: text,
      startIndex: 0,
    });
  } else {
    for (let i = 0; i < detectedCandidates.length; i++) {
      const cur = detectedCandidates[i];
      const start = cur.startIndex;
      const end = i + 1 < detectedCandidates.length ? detectedCandidates[i + 1].startIndex : text.length;
      productSections.push({
        productName: cur.name,
        sectionText: text.substring(start, end),
        startIndex: start,
        candidate: cur,
      });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 2: EXTRACT ATTRIBUTES & ATOMIC CLAIMS FOR EACH PRODUCT
  // --------------------------------------------------------------------------

  productSections.forEach((section, pIdx) => {
    const pId = `P${pIdx + 1}`;
    const pName = section.productName;
    const secText = section.sectionText;
    const secLower = secText.toLowerCase();

    const pEvidence: Record<string, string> = {};

    // 1. Identity Claim
    addClaim(
      pId,
      pName,
      'identity',
      'factual',
      'product_name',
      'equals',
      pName,
      pName,
      null,
      0.99,
      'Identified product recommendation'
    );
    pEvidence['name'] = pName;

    // 2. Price Claim
    let extractedPrice: { amount: number | null; currency: string; sourceText: string | null } | null = null;
    const priceMatch = secText.match(/(?:for\s+)?\$([0-9]+(?:\.[0-9]{2})?)/i) ||
                       secText.match(/\(\$([0-9]+(?:\.[0-9]{2})?)\)/i) ||
                       secText.match(/([0-9]+(?:\.[0-9]{2})?)\s*(?:USD|dollars)/i);

    if (priceMatch) {
      const amount = parseFloat(priceMatch[1]);
      const source = priceMatch[0];
      extractedPrice = {
        amount,
        currency: 'USD',
        sourceText: source,
      };
      pEvidence['price'] = source;
      addClaim(
        pId,
        pName,
        'price',
        'factual',
        'price',
        'equals',
        amount,
        source,
        'USD',
        0.99,
        'Stated retail purchase price'
      );
    }

    // 3. SPF / Sun Protection Claims
    const spfMatch = secText.match(/\bSPF\s*([0-9]+)\b/i);
    if (spfMatch) {
      const spfVal = parseInt(spfMatch[1], 10);
      pEvidence['spf'] = spfMatch[0];
      addClaim(
        pId,
        pName,
        'feature',
        'factual',
        'spf_rating',
        'equals',
        spfVal,
        spfMatch[0],
        'SPF',
        0.99,
        'Sun protection factor rating'
      );
    }

    // 4. Composition / Ingredients (e.g., "contains lavender essential oil", "zinc oxide")
    const ingredientMatches = [
      { regex: /contains\s+([a-zA-Z\s]+essential oil)/i, attr: 'ingredient', type: 'composition' },
      { regex: /([a-zA-Z\s]+essential oil)/i, attr: 'ingredient', type: 'composition' },
      { regex: /(non-nano zinc oxide|zinc oxide)/i, attr: 'active_ingredient', type: 'composition' },
    ];

    for (const ing of ingredientMatches) {
      const m = secText.match(ing.regex);
      if (m) {
        pEvidence['ingredient'] = m[0];
        addClaim(
          pId,
          pName,
          'composition',
          'factual',
          'ingredient',
          'contains',
          m[1].trim(),
          m[0],
          null,
          0.98,
          'Ingredient composition claim'
        );
        break;
      }
    }

    // 5. Safety / Sensitivity Claims (e.g., "100% hypoallergenic", "suitable for sensitive skin")
    const sensitivityMatches = [
      { regex: /(?:100%\s+)?hypoallergenic/i, val: 'hypoallergenic', attr: 'hypoallergenic' },
      { regex: /fragrance-free/i, val: 'fragrance-free', attr: 'fragrance_status' },
      { regex: /certified organic/i, val: 'certified organic', attr: 'certification' },
      { regex: /dermatologist-tested/i, val: 'dermatologist-tested', attr: 'safety_testing' },
    ];

    for (const sens of sensitivityMatches) {
      const m = secText.match(sens.regex);
      if (m) {
        pEvidence[sens.attr] = m[0];
        addClaim(
          pId,
          pName,
          'sensitivity',
          'factual',
          sens.attr,
          'equals',
          sens.val,
          m[0],
          null,
          0.98,
          'Dermatological sensitivity claim'
        );
      }
    }

    // 6. Colors (e.g., "comes in black and blue", "colorway: black")
    const extractedColors: string[] = [];
    const colorBlockMatch = secText.match(/(?:comes in|available in|color(?:way)?s?:?)\s+([a-zA-Z\s,and]+?)(?:\.|\;|\band\b\s+weighs|\band\b\s+uses|\n|$)/i);
    if (colorBlockMatch) {
      const colorWords = ['black', 'blue', 'white', 'red', 'green', 'grey', 'gray', 'yellow', 'ebony'];
      for (const cw of colorWords) {
        if (new RegExp(`\\b${cw}\\b`, 'i').test(colorBlockMatch[1])) {
          extractedColors.push(cw);
          addClaim(
            pId,
            pName,
            'color',
            'factual',
            'color',
            'contains',
            cw,
            colorBlockMatch[0].trim(),
            null,
            0.96,
            'Available product colorway'
          );
        }
      }
      pEvidence['colors'] = colorBlockMatch[0];
    }

    // 7. Materials (e.g., "synthetic mesh upper", "recycled nylon", "leather", "cotton")
    const extractedMaterials: string[] = [];
    const materialMatches = [
      { regex: /\b(100%\s+leather-free|leather-free|100%\s+vegan)\b/i, val: '100% leather-free' },
      { regex: /(synthetic mesh(?:\s+upper)?)/i, val: 'synthetic mesh upper' },
      { regex: /(recycled nylon)/i, val: 'recycled nylon' },
      { regex: /(?<!(?:no|non|synthetic)[\s-])\b(leather upper|animal leather|genuine leather|leather)\b(?![\s-]free)/i, val: 'leather' },
      { regex: /(synthetic upper|synthetic)/i, val: 'synthetic' },
    ];

    for (const mat of materialMatches) {
      const m = secText.match(mat.regex);
      if (m && !extractedMaterials.includes(mat.val)) {
        extractedMaterials.push(mat.val);
        pEvidence['material'] = m[0];
        addClaim(
          pId,
          pName,
          'material',
          'factual',
          'material',
          'equals',
          mat.val,
          m[0],
          null,
          0.97,
          'Construction material specification'
        );
      }
    }

    // 8. Performance / Weight Claims (e.g., "weighs 8.4 oz")
    const weightMatch = secText.match(/weighs?\s*([0-9]+(?:\.[0-9]+)?)\s*(oz|ounces|g|grams)\b/i);
    if (weightMatch) {
      const wtVal = parseFloat(weightMatch[1]);
      const wtUnit = weightMatch[2].toLowerCase();
      pEvidence['weight'] = weightMatch[0];
      addClaim(
        pId,
        pName,
        'performance',
        'factual',
        'weight',
        'equals',
        wtVal,
        weightMatch[0],
        wtUnit,
        0.98,
        'Physical product weight specification'
      );
    }

    // 9. Ratings / Review Count (e.g., "Customers rate it 4.6 out of 5", "4.8 stars")
    let extractedRating: { score: number | null; maxScore: number | null; reviewCount: number | null; sourceText: string | null } | null = null;
    const ratingMatch = secText.match(/(?:rate it|rated|rating of)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:out of|\/)\s*([0-9]+)/i) ||
                        secText.match(/([0-9]+(?:\.[0-9]+)?)[-\s]*stars?/i);

    if (ratingMatch) {
      const score = parseFloat(ratingMatch[1]);
      const maxScore = ratingMatch[2] ? parseFloat(ratingMatch[2]) : 5;
      extractedRating = {
        score,
        maxScore,
        reviewCount: null,
        sourceText: ratingMatch[0],
      };
      pEvidence['rating'] = ratingMatch[0];
      addClaim(
        pId,
        pName,
        'rating',
        'factual',
        'customer_rating',
        'equals',
        score,
        ratingMatch[0],
        'stars',
        0.98,
        'Aggregated customer review rating'
      );
    }

    // 10. Functional Features (e.g. "lightweight", "breathable", "waterproof", "heavily insulated")
    const featureKeywords = [
      { name: 'lightweight', type: 'feature', nature: 'factual' as ClaimNature, attr: 'weight_class', val: 'lightweight' },
      { name: 'highly breathable', type: 'feature', nature: 'factual' as ClaimNature, attr: 'breathability', val: 'highly breathable' },
      { name: 'breathable', type: 'feature', nature: 'factual' as ClaimNature, attr: 'breathability', val: 'breathable' },
      { name: 'waterproof', type: 'feature', nature: 'factual' as ClaimNature, attr: 'water_resistance', val: 'waterproof' },
      { name: 'water-resistant', type: 'feature', nature: 'factual' as ClaimNature, attr: 'water_resistance', val: 'water-resistant' },
      { name: 'heavily insulated', type: 'feature', nature: 'factual' as ClaimNature, attr: 'insulation', val: 'heavily insulated' },
      { name: 'insulated', type: 'feature', nature: 'factual' as ClaimNature, attr: 'insulation', val: 'insulated' },
      { name: 'quicklace', type: 'feature', nature: 'factual' as ClaimNature, attr: 'lacing_system', val: 'quicklace' },
    ];

    for (const fk of featureKeywords) {
      const rx = new RegExp(`\\b${fk.name}\\b`, 'i');
      const m = secText.match(rx);
      if (m && !claims.some(c => c.productId === pId && c.attribute === fk.attr)) {
        addClaim(
          pId,
          pName,
          fk.type as ClaimCategory,
          fk.nature,
          fk.attr,
          'equals',
          fk.val,
          m[0],
          null,
          0.96,
          'Functional product specification claim'
        );
      }

      // Check for explicit negation of feature (e.g. "not waterproof", "outer fabric is not waterproof")
      const negRx = new RegExp(`(?:is\\s+not|not|outer fabric is not|never)\\s+${fk.name}`, 'i');
      const negM = secText.match(negRx);
      if (negM) {
        addClaim(
          pId,
          pName,
          fk.type as ClaimCategory,
          fk.nature,
          `${fk.attr}_negated`,
          'not_equals',
          `not ${fk.val}`,
          negM[0],
          null,
          0.96,
          `Negated feature claim: ${negM[0]}`
        );
      }
    }

    // 11. Suitability / Intended Condition (e.g. "specifically designed for running", "designed for freezing conditions", "built for trails")
    const suitabilityMatches = [
      { regex: /(?:specifically\s+)?(?:designed|built|engineered|crafted|made|intended|suitable|ideal|perfect|great)\s+for\s+([a-zA-Z\s]*?\b(?:running|trail running|jogging|hiking|marathons?|cycling|walking|workouts?|training|gym|racing)\b)/i, attr: 'use_case' },
      { regex: /(?:specifically\s+)?designed for\s+([a-zA-Z\s]+conditions)/i, attr: 'climate_suitability' },
      { regex: /(?:specifically\s+)?designed for\s+([a-zA-Z\s]+terrain)/i, attr: 'terrain_suitability' },
      { regex: /(?:built|designed|engineered)\s+for\s+([a-zA-Z\s]+trails)/i, attr: 'use_case' },
    ];

    for (const sm of suitabilityMatches) {
      const m = secText.match(sm.regex);
      if (m) {
        addClaim(
          pId,
          pName,
          'suitability',
          'factual',
          sm.attr,
          'suitable_for',
          m[1].trim(),
          m[0],
          null,
          0.95,
          'Environmental suitability claim'
        );
      }
    }

    // 12. Warranty / Return Policy Claims (e.g. "includes a lifetime warranty", "1-year warranty")
    const warrantyMatch = secText.match(/\b((?:lifetime|limited|full|manufacturer|1-year|2-year|5-year)\s+warranty)\b/i);
    if (warrantyMatch) {
      addClaim(
        pId,
        pName,
        'warranty',
        'factual',
        'warranty',
        'includes',
        warrantyMatch[1].toLowerCase(),
        warrantyMatch[0],
        null,
        0.98,
        'Product warranty protection specification'
      );
    }

    // 13. Subjective / Evaluative Assessment Claims (e.g., "excellent choice", "looks stylish", "feels extremely comfortable", "looks fantastic")
    const subjectivePatterns = [
      { regex: /\b(excellent choice|great choice|top pick)\b/i, attr: 'recommendation_strength' },
      { regex: /\b(looks stylish|stylish)\b/i, attr: 'aesthetic_assessment' },
      { regex: /\b(looks fantastic|looks great)\b/i, attr: 'visual_assessment' },
      { regex: /\b(feels extremely comfortable|extremely comfortable|very comfortable|comfortable)\b/i, attr: 'comfort_assessment' },
      { regex: /\b(exceptional|superb|impressive)\b/i, attr: 'quality_assessment' },
      { regex: /\b(versatile)\b/i, attr: 'versatility' },
    ];

    for (const sub of subjectivePatterns) {
      const m = secText.match(sub.regex);
      if (m && !claims.some(c => c.productId === pId && c.sourceText === m[0])) {
        addClaim(
          pId,
          pName,
          'subjective_assessment',
          'subjective',
          sub.attr,
          'asserts',
          m[0].toLowerCase(),
          m[0],
          null,
          0.90,
          'Subjective evaluative claim made by assistant'
        );
      }
    }

    // Assemble Product Record
    const rawQty = section.candidate?.detectedQuantity || null;
    const parsedQty = section.candidate?.parsedQuantity ?? parseQuantityNum(rawQty);

    if (parsedQty !== null) {
      addClaim(
        pId,
        pName,
        'quantity',
        'factual',
        'quantity',
        'equals',
        parsedQty,
        rawQty || String(parsedQty),
        'units',
        0.98,
        'Stated recommendation item quantity'
      );
      pEvidence['quantity'] = rawQty || String(parsedQty);
    }

    let lineTotal: { amount: number | null; currency: string } | null = null;
    if (extractedPrice && extractedPrice.amount !== null && parsedQty !== null) {
      const lineAmt = parsedQty * extractedPrice.amount;
      lineTotal = {
        amount: lineAmt,
        currency: 'USD',
      };
      addClaim(
        pId,
        pName,
        'price',
        'factual',
        'line_total',
        'equals',
        lineAmt,
        `$${lineAmt}`,
        'USD',
        0.99,
        'Calculated item line total (quantity × unit price)'
      );
    }

    let detectedCategory: string | null = null;
    const combinedPText = `${pName} ${secText}`.toLowerCase();
    if (/\b(t-shirts?|shirts?|running shirts?|tops?)\b/i.test(combinedPText)) detectedCategory = 'shirt';
    else if (/\b(running shorts?|shorts?)\b/i.test(combinedPText)) detectedCategory = 'shorts';
    else if (/\b(jackets?|outerwear|coats?)\b/i.test(combinedPText)) detectedCategory = 'jacket';
    else if (/\b(running shoes?|shoes?|sneakers?|boots?)\b/i.test(combinedPText)) detectedCategory = 'running shoes';
    else if (/\b(sunscreen|sunblock)\b/i.test(combinedPText)) detectedCategory = 'sunscreen';

    products.push({
      id: pId,
      name: pName,
      brand: null,
      category: detectedCategory,
      price: extractedPrice,
      quantity: rawQty,
      parsedQuantity: parsedQty,
      unitPrice: extractedPrice,
      lineTotal,
      size: null,
      colors: extractedColors,
      materials: extractedMaterials,
      attributes: claims.filter(c => c.productId === pId && c.claimType === 'feature').map(c => String(c.value)),
      suitability: claims.filter(c => c.productId === pId && c.claimType === 'suitability').map(c => String(c.value)),
      safetyOrSensitivity: claims.filter(c => c.productId === pId && c.claimType === 'sensitivity').map(c => String(c.value)),
      availability: null,
      rating: extractedRating,
      shippingOrDelivery: null,
      warrantyOrReturns: null,
      evidenceMap: pEvidence,
    });
  });

  // Response-Level Cart Claims (if cart total was stated)
  if (statedCartTotalAmount !== null) {
    addClaim(
      null,
      null,
      'price',
      'factual',
      'cart_total_price',
      'equals',
      statedCartTotalAmount,
      statedCartTotalSource || `$${statedCartTotalAmount}`,
      'USD',
      0.99,
      'Stated combined cart total across all recommended items'
    );
  }

  const factualCount = claims.filter(c => c.nature === 'factual').length;
  const subjectiveCount = claims.filter(c => c.nature === 'subjective').length;

  const claimsPerProduct: Record<string, number> = {};
  products.forEach(p => {
    claimsPerProduct[p.id] = claims.filter(c => c.productId === p.id).length;
  });

  return reconcileClaimCart({
    state: 'CLAIM_ANALYSIS_COMPLETE',
    analyzedAt: new Date().toISOString(),
    llmOutput: text,
    products,
    claims,
    summary: {
      totalProducts: products.length,
      totalClaims: claims.length,
      factualCount,
      subjectiveCount,
      claimsPerProduct,
    },
    rawJson: {
      products,
      claims,
      metadata: {
        extractor: 'deterministic-claim-analyzer-v1',
        analyzedLength: text.length,
      },
    },
  }, text);
}
