import {
  ExtractedIntent,
  AtomicConstraint,
  UserPromptAnalysisResult,
  ConstraintOperator,
  ConstraintType,
  ConstraintPolarity,
} from '../../types/evaluation';

/**
 * Deterministic Semantic Analyzer for User Prompts.
 * Performs rule-based and regex extraction as a robust baseline and fallback
 * to guarantee 100% reliable execution even if network calls or model quotas fluctuate.
 */
export function analyzeUserPromptDeterministically(userPrompt: string): UserPromptAnalysisResult {
  const text = userPrompt.trim();
  const lower = text.toLowerCase();
  const constraints: AtomicConstraint[] = [];
  const evidenceMap: Record<string, string> = {};

  let constraintCounter = 1;
  const nextId = () => `C${constraintCounter++}`;

  // Helper to add constraint
  const addConstraint = (
    attribute: string,
    operator: ConstraintOperator,
    expectedValue: string | number | boolean,
    constraintType: ConstraintType,
    polarity: ConstraintPolarity,
    sourceText: string,
    confidence: number = 0.95,
    reasoning?: string
  ) => {
    // Verify sourceText is in the prompt
    let cleanSource = sourceText.replace(/[,\.;]+$/, '').trim();
    const idx = lower.indexOf(cleanSource.toLowerCase());
    if (idx !== -1) {
      cleanSource = text.substring(idx, idx + cleanSource.length);
    }

    constraints.push({
      id: nextId(),
      attribute,
      operator,
      expectedValue,
      constraintType,
      polarity,
      sourceText: cleanSource,
      confidence,
      reasoning,
    });
  };

  // 1. Target Category Extraction
  let targetCategory: string | null = null;
  const categoryPatterns = [
    { regex: /\b(jackets?|outerwear|coats?)\b/i, category: 'jacket' },
    { regex: /\b(running shoes?|shoes?|sneakers?|boots?|footwear)\b/i, category: 'running shoes' },
    { regex: /\b(sunscreen|sunblock|spf lotion)\b/i, category: 'sunscreen' },
    { regex: /\b(backpacks?|daypack|bags?)\b/i, category: 'backpack' },
    { regex: /\b(headphones?|earbuds?)\b/i, category: 'headphones' },
    { regex: /\b(laptops?|notebooks?)\b/i, category: 'laptop' },
    { regex: /\b(t-shirts?|shirts?|tops?)\b/i, category: 'shirt' },
    { regex: /\b(watches?|smartwatch)\b/i, category: 'watch' },
  ];

  for (const cat of categoryPatterns) {
    const m = text.match(cat.regex);
    if (m) {
      targetCategory = cat.category;
      evidenceMap['targetCategory'] = m[0];
      break;
    }
  }

  // 2. Budget / Price Constraint Extraction
  let budgetConstraint: { maxAmount: number | null; minAmount: number | null; currency: string; sourceText: string } | null = null;
  const budgetMatch = text.match(/\b(?:under|below|less than|max(?:imum)? of|up to)\s*\$?([0-9]+(?:\.[0-9]{2})?)\b/i) ||
                      text.match(/\$([0-9]+(?:\.[0-9]{2})?)\s*(?:or less|budget|max)\b/i);

  if (budgetMatch) {
    const amount = parseFloat(budgetMatch[1]);
    const source = budgetMatch[0];
    budgetConstraint = {
      maxAmount: amount,
      minAmount: null,
      currency: 'USD',
      sourceText: source,
    };
    evidenceMap['budget'] = source;
    addConstraint(
      'price',
      /\b(?:under|below|less than)\b/i.test(source) ? '<' : '<=',
      amount,
      'hard',
      'positive',
      source,
      0.99,
      'Price ceiling explicitly stated as hard upper bound'
    );
  }

  // 3. Negative Constraints / Exclusions (e.g., "without leather", "no leather", "leather-free", "fragrance-free")
  const explicitExclusions: string[] = [];
  
  // Pattern 3a: fragrance-free / leather-free / chemical-free / sulfate-free / gluten-free (also space-separated "leather free")
  const freeMatches = text.matchAll(/\b([a-zA-Z]+)[\s-]free\b/gi);
  for (const match of freeMatches) {
    const item = match[1].toLowerCase();
    if (!explicitExclusions.includes(item)) {
      explicitExclusions.push(item);
      evidenceMap[`exclusion_${item}`] = match[0];
      addConstraint(
        item,
        'prohibited',
        item,
        'hard',
        'negative',
        match[0],
        0.98,
        `Explicit negative constraint: product must be free of ${item}`
      );
    }
  }

  // Pattern 3b: without leather / no leather / with no leather / avoid leather / excluding leather / free of leather
  const noMatches = text.matchAll(
    /\b(?:with\s+no|without(?:\s+any)?|no|avoid|not|excluding|free\s+of)\s+([a-zA-Z0-9\s]+?)(?=[,\.;:!?\(\)\$£€]|\b(?:under|below|less\s+than|for|with|within|around|at|between|priced|costing|budget|max|maximum|min|minimum|that|which|is|are|to|in)\b|\band\s+(?:under|below|for|with|that|which|less)\b|\s*$)/gi
  );
  for (const match of noMatches) {
    const rawVal = match[1].trim();
    // Exclude noise words like "prefer"
    if (rawVal && !rawVal.startsWith('preferably') && !rawVal.startsWith('optional')) {
      const items = rawVal.split(/\s+or\s+|\s+and\s+/);
      for (const singleItem of items) {
        const cleaned = singleItem.trim();
        if (cleaned.length > 1) {
          const attrKey = cleaned.toLowerCase().includes('leather') ? 'leather' : cleaned.toLowerCase();
          if (!explicitExclusions.includes(attrKey)) {
            explicitExclusions.push(attrKey);
            evidenceMap[`exclusion_${attrKey}`] = match[0];
            addConstraint(
              attrKey,
              'prohibited',
              attrKey,
              'hard',
              'negative',
              match[0],
              0.98,
              `Explicit exclusion specified by user`
            );
          }
        }
      }
    }
  }

  // 4. Activity / Use Case Extraction
  let useCaseOrActivity: string | null = null;
  const activityPatterns = [
    { regex: /\b(trail running)\b/i, value: 'trail running' },
    { regex: /\b(running|jogging|marathon)\b/i, value: 'running' },
    { regex: /\b(hiking|trekking)\b/i, value: 'hiking' },
    { regex: /\b(swimming|pool|beach)\b/i, value: 'swimming' },
    { regex: /\b(cycling|biking)\b/i, value: 'cycling' },
    { regex: /\b(gym|crossfit|workout)\b/i, value: 'workout' },
  ];

  for (const act of activityPatterns) {
    const m = text.match(act.regex);
    if (m) {
      useCaseOrActivity = act.value;
      evidenceMap['useCaseOrActivity'] = m[0];
      addConstraint(
        'use_case',
        'suitable_for',
        act.value,
        'hard',
        'positive',
        m[0],
        0.95,
        'Product intended for specified activity'
      );
      break;
    }
  }

  // 5. Season or Climate Extraction
  let seasonOrClimate: string | null = null;
  const seasonMatch = text.match(/\b(summer|winter|spring|autumn|fall|cold weather|rainy|hot weather)\b/i);
  if (seasonMatch) {
    seasonOrClimate = seasonMatch[1].toLowerCase();
    evidenceMap['seasonOrClimate'] = seasonMatch[0];
    addConstraint(
      'season',
      'suitable_for',
      seasonMatch[1].toLowerCase(),
      'hard',
      'positive',
      seasonMatch[0],
      0.95,
      'Seasonal suitability requirement'
    );
  }

  // 6. Explicit Size Extraction (e.g., "size 10", "size 10.5", "size M", "size medium", "men's size 11", "women's size 8", "EU 42", "UK size 9")
  let extractedSize: string | null = null;
  const sizeMatch = text.match(/\b(?:men'?s|women'?s|kids'?)?\s*size\s+([0-9]+(?:\.[0-9]+)?|[a-zA-Z]+)\b/i) ||
                    text.match(/\b(?:EU|UK|US)\s*(?:size\s+)?([0-9]+(?:\.[0-9]+)?)\b/i);
  if (sizeMatch) {
    const rawSize = sizeMatch[1].trim();
    if (rawSize.toLowerCase() !== 'and' && rawSize.toLowerCase() !== 'or') {
      extractedSize = rawSize;
      const sizeExpectedVal = isNaN(Number(rawSize)) ? rawSize.toLowerCase() : Number(rawSize);
      evidenceMap['size'] = sizeMatch[0];
      addConstraint(
        'size',
        'equals',
        sizeExpectedVal,
        'hard',
        'positive',
        sizeMatch[0],
        0.98,
        'Explicit sizing requirement specified by shopper'
      );
    }
  }

  // 7. Safety or Sensitivity Requirements (e.g., "suitable for sensitive skin")
  let safetyOrSensitivity: string | null = null;
  const sensitivityMatch = text.match(/\b(?:suitable for|safe for|for)\s+(sensitive skin|allergies|eczema)\b/i) ||
                           text.match(/\b(sensitive skin|hypoallergenic)\b/i);
  if (sensitivityMatch) {
    safetyOrSensitivity = sensitivityMatch[1].toLowerCase();
    evidenceMap['safetyOrSensitivity'] = sensitivityMatch[0];
    addConstraint(
      'skin_type',
      'suitable_for',
      safetyOrSensitivity,
      'hard',
      'positive',
      sensitivityMatch[0],
      0.98,
      'Explicit skin sensitivity/safety suitability requirement'
    );
  }

  // 7. Soft Preferences vs Hard Attributes (e.g., "preferably black", "prefer blue", "organic", "lightweight", "breathable")
  const desiredAttributes: string[] = [];
  
  // Check for preference keywords first ("preferably black", "prefer X", "ideally Y")
  const prefMatch = text.match(/\b(?:preferably|prefer|ideally|nice to have)\s+([a-zA-Z]+)\b/i);
  if (prefMatch) {
    const prefVal = prefMatch[1].toLowerCase();
    evidenceMap['soft_preference'] = prefMatch[0];
    addConstraint(
      prefVal === 'black' || prefVal === 'blue' || prefVal === 'white' || prefVal === 'red' ? 'color' : prefVal,
      'equals',
      prefVal,
      'soft',
      'positive',
      prefMatch[0],
      0.96,
      `Soft preference: user specified '${prefMatch[0]}' indicating flexibility`
    );
  }

  // Check for descriptive physical product attributes (lightweight, breathable, organic, waterproof, etc.)
  const descriptiveAttributes = [
    { name: 'lightweight', attr: 'weight', val: 'lightweight' },
    { name: 'breathable', attr: 'breathability', val: 'breathable' },
    { name: 'organic', attr: 'formulation', val: 'organic' },
    { name: 'waterproof', attr: 'water_resistance', val: 'waterproof' },
    { name: 'quick-drying', attr: 'drying_speed', val: 'quick-drying' },
    { name: 'insulated', attr: 'insulation', val: 'insulated' },
  ];

  for (const attr of descriptiveAttributes) {
    const rx = new RegExp(`\\b${attr.name}\\b`, 'i');
    const m = text.match(rx);
    if (m && !text.match(new RegExp(`(?:no|without|avoid|not)\\s+${attr.name}`, 'i'))) {
      desiredAttributes.push(attr.name);
      evidenceMap[attr.name] = m[0];
      addConstraint(
        attr.attr,
        'required',
        attr.val,
        'hard',
        'positive',
        m[0],
        0.95,
        `Hard requirement: descriptive attribute '${attr.name}' requested without optionality language`
      );
    }
  }

  // Build the ExtractedIntent object
  const intent: ExtractedIntent = {
    targetCategory,
    useCaseOrActivity,
    intendedUser: null,
    seasonOrClimate,
    budget: budgetConstraint,
    quantity: null,
    size: extractedSize,
    color: prefMatch ? prefMatch[1].toLowerCase() : null,
    material: null,
    brandRequirements: null,
    desiredAttributes,
    explicitExclusions,
    safetyOrSensitivity,
    otherContext: null,
    evidenceMap,
  };

  const hardCount = constraints.filter((c) => c.constraintType === 'hard').length;
  const softCount = constraints.filter((c) => c.constraintType === 'soft').length;
  const negativeCount = constraints.filter((c) => c.polarity === 'negative').length;

  return {
    state: 'PROMPT_ANALYSIS_COMPLETE_FULL_EVALUATION_NOT_YET_RUN',
    analyzedAt: new Date().toISOString(),
    userPrompt: text,
    intent,
    constraints,
    summary: {
      totalConstraints: constraints.length,
      hardCount,
      softCount,
      negativeCount,
      extractedCategories: targetCategory ? [targetCategory] : [],
      confidenceScore: constraints.length > 0 ? 0.96 : 0.5,
    },
    rawJson: {
      intent,
      constraints,
      metadata: {
        extractor: 'deterministic-semantic-v1',
        analyzedChars: text.length,
      },
    },
  };
}
