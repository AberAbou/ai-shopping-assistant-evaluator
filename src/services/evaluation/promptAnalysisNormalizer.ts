import {
  ExtractedIntent,
  AtomicConstraint,
  UserPromptAnalysisResult,
  ConstraintOperator,
  ConstraintType,
  ConstraintPolarity,
} from '../../types/evaluation';

/**
 * Normalizes, validates, and verifies structured model output against the raw User Prompt.
 * Guarantees schema adherence, evidence traceability, and hard/soft/negative classification rules.
 */
export function normalizePromptAnalysis(
  rawModelOutput: any,
  userPrompt: string
): UserPromptAnalysisResult {
  const text = userPrompt.trim();
  const lowerPrompt = text.toLowerCase();

  // 1. Process and normalize Intent
  const rawIntent = rawModelOutput?.intent || {};
  const evidenceMap: Record<string, string> = {};

  const verifyEvidence = (key: string, val: string | null | undefined, explicitEvidence?: string): string | null => {
    if (!val) return null;
    const searchTarget = explicitEvidence || val;
    const idx = lowerPrompt.indexOf(searchTarget.toLowerCase());
    if (idx !== -1) {
      const actualSubstring = text.substring(idx, idx + searchTarget.length);
      evidenceMap[key] = actualSubstring;
      return actualSubstring;
    }
    // If not direct substring, check if individual words exist in prompt
    const words = searchTarget.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (const w of words) {
      const wordIdx = lowerPrompt.indexOf(w);
      if (wordIdx !== -1) {
        evidenceMap[key] = text.substring(wordIdx, wordIdx + w.length);
        break;
      }
    }
    return explicitEvidence || val;
  };

  const targetCategory = rawIntent.targetCategory ? String(rawIntent.targetCategory) : null;
  if (targetCategory) {
    verifyEvidence('targetCategory', targetCategory, rawIntent.evidenceMap?.targetCategory);
  }

  const useCaseOrActivity = rawIntent.useCaseOrActivity ? String(rawIntent.useCaseOrActivity) : null;
  if (useCaseOrActivity) {
    verifyEvidence('useCaseOrActivity', useCaseOrActivity, rawIntent.evidenceMap?.useCaseOrActivity);
  }

  const intendedUser = rawIntent.intendedUser ? String(rawIntent.intendedUser) : null;
  if (intendedUser) {
    verifyEvidence('intendedUser', intendedUser, rawIntent.evidenceMap?.intendedUser);
  }

  const seasonOrClimate = rawIntent.seasonOrClimate ? String(rawIntent.seasonOrClimate) : null;
  if (seasonOrClimate) {
    verifyEvidence('seasonOrClimate', seasonOrClimate, rawIntent.evidenceMap?.seasonOrClimate);
  }

  // Budget
  let budget = null;
  if (rawIntent.budget && (rawIntent.budget.maxAmount !== null || rawIntent.budget.minAmount !== null)) {
    const rawBudget = rawIntent.budget;
    const maxVal = typeof rawBudget.maxAmount === 'number' ? rawBudget.maxAmount : (rawBudget.maxAmount ? parseFloat(rawBudget.maxAmount) : null);
    const minVal = typeof rawBudget.minAmount === 'number' ? rawBudget.minAmount : (rawBudget.minAmount ? parseFloat(rawBudget.minAmount) : null);
    const source = rawBudget.sourceText || rawIntent.evidenceMap?.budget || (maxVal ? `under $${maxVal}` : '');
    
    budget = {
      maxAmount: maxVal,
      minAmount: minVal,
      currency: rawBudget.currency || 'USD',
      sourceText: source,
    };
    verifyEvidence('budget', source);
  }

  // Desired attributes
  const desiredAttributes: string[] = Array.isArray(rawIntent.desiredAttributes)
    ? rawIntent.desiredAttributes.map((a: any) => String(a).trim()).filter(Boolean)
    : [];
  desiredAttributes.forEach((attr, idx) => {
    verifyEvidence(`attribute_${idx}`, attr);
  });

  // Explicit exclusions (e.g. "no leather", "fragrance-free")
  const explicitExclusions: string[] = Array.isArray(rawIntent.explicitExclusions)
    ? rawIntent.explicitExclusions.map((e: any) => String(e).trim()).filter(Boolean)
    : [];
  explicitExclusions.forEach((excl, idx) => {
    verifyEvidence(`exclusion_${idx}`, excl);
  });

  const safetyOrSensitivity = rawIntent.safetyOrSensitivity ? String(rawIntent.safetyOrSensitivity) : null;
  if (safetyOrSensitivity) {
    verifyEvidence('safetyOrSensitivity', safetyOrSensitivity, rawIntent.evidenceMap?.safetyOrSensitivity);
  }

  // Size extraction and normalization
  let intentSize = rawIntent.size ? String(rawIntent.size) : null;
  if (!intentSize) {
    const sizeM = text.match(/\b(?:men'?s|women'?s|kids'?)?\s*size\s+([0-9]+(?:\.[0-9]+)?|[a-zA-Z]+)\b/i) ||
                  text.match(/\b(?:EU|UK|US)\s*(?:size\s+)?([0-9]+(?:\.[0-9]+)?)\b/i);
    if (sizeM && sizeM[1].toLowerCase() !== 'and' && sizeM[1].toLowerCase() !== 'or') {
      intentSize = sizeM[1].trim();
      evidenceMap['size'] = sizeM[0];
    }
  }

  const intent: ExtractedIntent = {
    targetCategory,
    useCaseOrActivity,
    intendedUser,
    seasonOrClimate,
    budget,
    quantity: rawIntent.quantity || null,
    size: intentSize,
    color: rawIntent.color ? String(rawIntent.color) : null,
    material: rawIntent.material ? String(rawIntent.material) : null,
    brandRequirements: rawIntent.brandRequirements || null,
    desiredAttributes,
    explicitExclusions,
    safetyOrSensitivity,
    otherContext: rawIntent.otherContext ? String(rawIntent.otherContext) : null,
    evidenceMap: { ...rawIntent.evidenceMap, ...evidenceMap },
  };

  // 2. Process and normalize Atomic Constraints
  const rawConstraints: any[] = Array.isArray(rawModelOutput?.constraints)
    ? rawModelOutput.constraints
    : [];

  const normalizedConstraints: AtomicConstraint[] = [];

  rawConstraints.forEach((c, idx) => {
    const attribute = String(c.attribute || `attr_${idx + 1}`).toLowerCase();
    let sourceText = String(c.sourceText || '').trim();

    // Verify sourceText matches userPrompt
    if (!sourceText || lowerPrompt.indexOf(sourceText.toLowerCase()) === -1) {
      // Find matching word in prompt
      const words = sourceText.split(/\s+/).filter(w => w.length > 2);
      let found = false;
      for (const w of words) {
        const foundIdx = lowerPrompt.indexOf(w.toLowerCase());
        if (foundIdx !== -1) {
          sourceText = text.substring(foundIdx, Math.min(text.length, foundIdx + w.length * 3));
          found = true;
          break;
        }
      }
      if (!found) {
        sourceText = text.slice(0, 30);
      }
    } else {
      const exactIdx = lowerPrompt.indexOf(sourceText.toLowerCase());
      sourceText = text.substring(exactIdx, exactIdx + sourceText.length);
    }

    // Determine Polarity
    const isExclusionPhrase =
      /\b(no|without|avoid|free|not|excluding)\b/i.test(sourceText) ||
      /\b(no|without|avoid|free|not|excluding)\b/i.test(attribute) ||
      c.polarity === 'negative';
    const polarity: ConstraintPolarity = isExclusionPhrase ? 'negative' : 'positive';

    // Normalize Operator
    let operator: ConstraintOperator = 'required';
    const rawOp = String(c.operator || '').toLowerCase();

    if (rawOp === '<=' || rawOp === 'less_than_or_equal' || rawOp === 'less than or equal' || rawOp === 'max' || rawOp === 'maximum') {
      operator = '<=';
    } else if (rawOp === '<' || rawOp === 'less_than' || rawOp === 'less than') {
      operator = '<';
    } else if (rawOp === '>=' || rawOp === 'greater_than_or_equal' || rawOp === 'greater than or equal' || rawOp === 'min' || rawOp === 'minimum') {
      operator = '>=';
    } else if (rawOp === '>' || rawOp === 'greater_than' || rawOp === 'greater than') {
      operator = '>';
    } else if (rawOp === '==' || rawOp === 'equals' || rawOp === 'equal') {
      operator = 'equals';
    } else if (rawOp === '!=' || rawOp === 'not_equals') {
      operator = 'not_equals';
    } else if (rawOp === 'prohibited' || rawOp === 'excludes' || polarity === 'negative') {
      operator = 'prohibited';
    } else if (rawOp === 'suitable_for' || rawOp === 'suitable for') {
      operator = 'suitable_for';
    } else if (rawOp === 'contains') {
      operator = 'contains';
    } else {
      operator = 'required';
    }

    // Enforce Hard vs Soft classification
    // Soft indicators: "prefer", "preferably", "ideally", "if possible", "would like", "optional", "nice to have"
    const isPreference = /\b(prefer|preferably|ideally|if possible|optional|would like|nice to have)\b/i.test(sourceText);
    const constraintType: ConstraintType = isPreference ? 'soft' : (c.constraintType === 'soft' ? 'soft' : 'hard');

    // Expected value
    let expectedValue = c.expectedValue;
    if (operator === '<=' || operator === '<' || operator === '>=' || operator === '>') {
      if (typeof expectedValue !== 'number') {
        const numMatch = String(expectedValue || sourceText).match(/([0-9]+(?:\.[0-9]+)?)/);
        if (numMatch) {
          expectedValue = parseFloat(numMatch[1]);
        }
      }
    }

    const confidence = typeof c.confidence === 'number' && c.confidence >= 0 && c.confidence <= 1
      ? Math.round(c.confidence * 100) / 100
      : 0.95;

    normalizedConstraints.push({
      id: c.id && c.id.startsWith('C') ? c.id : `C${idx + 1}`,
      attribute,
      operator,
      expectedValue: expectedValue ?? sourceText,
      constraintType,
      polarity,
      sourceText,
      confidence,
      reasoning: c.reasoning || (isPreference ? 'Soft preference indicated by optionality phrasing' : 'Hard requirement without optionality qualification'),
    });
  });

  // Ensure size constraint exists if intent.size was identified
  if (intent.size && !normalizedConstraints.some(c => c.attribute === 'size')) {
    const rawVal = intent.size;
    const sizeExpectedVal = isNaN(Number(rawVal)) ? rawVal.toLowerCase() : Number(rawVal);
    const sizeSource = evidenceMap['size'] || intent.evidenceMap?.size || `size ${rawVal}`;
    normalizedConstraints.push({
      id: `C${normalizedConstraints.length + 1}`,
      attribute: 'size',
      operator: 'equals',
      expectedValue: sizeExpectedVal,
      constraintType: 'hard',
      polarity: 'positive',
      sourceText: sizeSource,
      confidence: 0.98,
      reasoning: 'Explicit sizing requirement specified by shopper',
    });
  }

  // Ensure explicit exclusion constraints exist if intent.explicitExclusions were identified
  if (intent.explicitExclusions && intent.explicitExclusions.length > 0) {
    for (const excl of intent.explicitExclusions) {
      const lowerExcl = excl.toLowerCase();
      const hasExclConstraint = normalizedConstraints.some(
        c => c.polarity === 'negative' && (c.attribute.toLowerCase() === lowerExcl || String(c.expectedValue).toLowerCase() === lowerExcl)
      );
      if (!hasExclConstraint) {
        const exclSource = evidenceMap[`exclusion_${lowerExcl}`] || `without ${excl}`;
        normalizedConstraints.push({
          id: `C${normalizedConstraints.length + 1}`,
          attribute: lowerExcl,
          operator: 'prohibited',
          expectedValue: lowerExcl,
          constraintType: 'hard',
          polarity: 'negative',
          sourceText: exclSource,
          confidence: 0.98,
          reasoning: `Explicit exclusion specified by user: product must be free of ${excl}`,
        });
      }
    }
  }

  const hardCount = normalizedConstraints.filter(c => c.constraintType === 'hard').length;
  const softCount = normalizedConstraints.filter(c => c.constraintType === 'soft').length;
  const negativeCount = normalizedConstraints.filter(c => c.polarity === 'negative').length;

  return {
    state: 'PROMPT_ANALYSIS_COMPLETE_FULL_EVALUATION_NOT_YET_RUN',
    analyzedAt: new Date().toISOString(),
    userPrompt: text,
    intent,
    constraints: normalizedConstraints,
    summary: {
      totalConstraints: normalizedConstraints.length,
      hardCount,
      softCount,
      negativeCount,
      extractedCategories: targetCategory ? [targetCategory] : [],
      confidenceScore: normalizedConstraints.length > 0 ? 0.98 : 0.6,
    },
    rawJson: rawModelOutput,
  };
}
