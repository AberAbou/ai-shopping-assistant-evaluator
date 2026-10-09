import type { AtomicConstraint, UserPromptAnalysisResult } from '../../types/evaluation';

/** Negation belongs to a bounded coordinated feature list, not an entire sentence. */
export function featureAssertions(text: string) {
  const assertions: Array<{ attribute: string; value: string; negative: boolean; sourceText: string; index: number }> = [];
  for (const m of text.matchAll(/\b(?:(?:non[- ]|un)(?:waterproof|insulated)|(?:heavily\s+)?(?:waterproof|insulated))\b/gi)) {
    const index = m.index!;
    const prefix = text.slice(0, index);
    const negation = prefix.match(/\b(?:not|never|no|without|avoid|excluding|neither)\s+(?:be\s+)?(?:(?:heavily\s+)?(?:waterproof|insulated)\s*(?:,\s*(?:(?:and|or|nor)\s+)?|(?:and|or|nor)\s+))*$/i);
    const negative = Boolean(negation) || /^(?:non[- ]|un)/i.test(m[0]);
    const value = /waterproof/i.test(m[0]) ? 'waterproof' : 'insulated';
    assertions.push({ attribute: value === 'waterproof' ? 'water_resistance' : 'insulation', value, negative,
      sourceText: (negation?.[0] ?? '') + m[0], index: negation ? index - negation[0].length : index });
  }
  return assertions;
}

export function isCanonicalFeature(attribute: string, value: unknown): boolean {
  return /^(?:(?:must\s+)?not\s+)?(?:be\s+)?(?:waterproof|insulated|insulation)(?:\s+features?)?$/i.test(attribute)
    || /^(?:not\s+)?(?:be\s+)?(?:heavily\s+)?(?:waterproof|insulated)$/i.test(String(value))
    || (attribute === 'water_resistance' && !/water[- ]resistant/i.test(String(value)))
    || attribute === 'insulation';
}

/** Raw shopper evidence overrides truncated or incorrectly polarized API fields. */
export function reconcileFeatureConstraints(result: UserPromptAnalysisResult, text: string): UserPromptAnalysisResult {
  const assertions = featureAssertions(text);
  if (!assertions.length) return result;
  const constraints = result.constraints.filter(c => !isCanonicalFeature(c.attribute, c.expectedValue));
  const features: AtomicConstraint[] = [];
  for (const a of assertions) {
    const before = text.slice(0, a.index);
    const start = Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1;
    const local = text.slice(start, a.index + a.sourceText.length);
    const soft = /\b(?:prefer|preferably|ideally|optional|if possible|nice to have|would like)\b/i.test(local) && !/\b(?:must|required|need)\b/i.test(local);
    // Retain the actual governing clause so repeated feature words on different
    // products cannot resolve to the first occurrence during category attribution.
    const sourceText = local.trim();
    const prior = features.find(c => c.attribute === a.attribute && c.polarity === (a.negative ? 'negative' : 'positive') && c.sourceText === sourceText);
    if (prior) continue;
    features.push({ id: '', attribute: a.attribute, expectedValue: a.value, polarity: a.negative ? 'negative' : 'positive',
      operator: a.negative ? 'prohibited' : 'required', constraintType: soft ? 'soft' : 'hard', sourceText,
      scope: 'product', targetProductCategory: null, confidence: 0.99, reasoning: 'Canonical feature polarity from the shopper’s coordinated requirement.' });
  }
  constraints.push(...features);
  const excluded = assertions.filter(a => a.negative).map(a => a.value);
  const intent = { ...result.intent,
    desiredAttributes: [...new Set([...result.intent.desiredAttributes.filter(v => !isCanonicalFeature(v, v)), ...assertions.filter(a => !a.negative).map(a => a.value)])],
    explicitExclusions: [...new Set([...result.intent.explicitExclusions.filter(v => !isCanonicalFeature(v, v)), ...excluded])],
    evidenceMap: { ...result.intent.evidenceMap, ...Object.fromEntries(assertions.map(a => [`${a.negative ? 'exclusion_' : ''}${a.value}`, a.sourceText])) } };
  return { ...result, constraints, intent };
}
