/**
 * Canonical Regression Test Fixtures (Scenarios A–F)
 *
 * Single source of truth for:
 * 1. UI Test Presets (App.tsx / Header.tsx)
 * 2. Automated Regression Test Suite (scripts/run_regression_tests.ts)
 * 3. In-App QA Regression Runner
 *
 * Strictly adheres to the Evaluator Contract: Exactly TWO human inputs (User Prompt & LLM Output).
 */

export interface RegressionScenarioExpected {
  overallVerdict: 'PASS' | 'FAIL' | 'INDETERMINATE';
  hardGateState: 'HARD_GATE_PASS' | 'HARD_GATE_FAIL' | 'HARD_GATE_INDETERMINATE';
  minConfirmedFailures?: number;
  maxConfirmedFailures?: number;
  expectedConfirmedFailures?: number;
  expectedUnresolvedUnknown?: number;
  expectedSeverity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedEvidenceScore?: number | null;
  expectedHardSatisfactionPercent?: number;
  expectedHardFailurePercent?: number;
  expectedUnknownPercent?: number;
  expectedEvidenceCoverage?: number;
  expectedPrimaryRootCause?: string;
  expectedContributingRootCauses?: string[];
  productCount?: number;
  productVerdicts?: {
    productId?: string;
    productNameSnippet?: string;
    verdict?: 'PASS' | 'FAIL' | 'INDETERMINATE';
    hardGateState?: 'HARD_GATE_PASS' | 'HARD_GATE_FAIL' | 'HARD_GATE_INDETERMINATE';
    maxConfirmedFailures?: number;
  }[];
  notes?: string;
}

export interface RegressionScenario {
  id: 'scenario-a' | 'scenario-b' | 'scenario-c' | 'scenario-d' | 'scenario-e' | 'scenario-f';
  key: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  name: string;
  shortLabel: string;
  badge: string;
  userPrompt: string;
  llmOutput: string;
  statusMessage: string;
  summary: string;
  expected: RegressionScenarioExpected;
}

export const REGRESSION_SCENARIOS: RegressionScenario[] = [
  {
    id: 'scenario-a',
    key: 'A',
    name: 'Scenario A: Hard Failure (Price Ceiling Violation)',
    shortLabel: 'Test A (Hard Fail)',
    badge: 'Hard Fail',
    userPrompt: 'fragrance-free organic sunscreen suitable for sensitive skin under $25',
    llmOutput: 'I recommend Luxury Botanical Sunscreen SPF 50 for $32. It contains lavender essential oil and is 100% hypoallergenic.',
    statusMessage: 'Test A loaded (Hard Failure): Price $32 exceeds $25 ceiling (HC-01 primary, DAT-01/SAF-01 contributing).',
    summary: 'Price exceeds $25 ceiling ($32); missing evidence remains UNKNOWN (not failed); score cannot override hard fail.',
    expected: {
      overallVerdict: 'FAIL',
      hardGateState: 'HARD_GATE_FAIL',
      expectedConfirmedFailures: 1,
      expectedUnresolvedUnknown: 3,
      expectedSeverity: 'HIGH',
      expectedPrimaryRootCause: 'HC-01',
      notes: 'Price $32 violates $25 constraint. 3 other mandatory requirements remain UNKNOWN. Unverified claims not assumed false.',
    },
  },
  {
    id: 'scenario-b',
    key: 'B',
    name: 'Scenario B: Missing Evidence & Unresolved Unknowns',
    shortLabel: 'Test B (Missing)',
    badge: 'Missing Evid.',
    userPrompt: 'waterproof hiking boots size 10 under $150',
    llmOutput: 'I recommend Summit Trek Boots for $129.',
    statusMessage: 'Test B loaded (Missing Evidence): Price passes, multiple attributes missing (RET-01 primary, DAT-01 contributing).',
    summary: 'Price passes ($129 <= $150); hiking, size 10, waterproof are UNKNOWN (not failed); verdict INDETERMINATE; evidence coverage 25%.',
    expected: {
      overallVerdict: 'INDETERMINATE',
      hardGateState: 'HARD_GATE_INDETERMINATE',
      expectedConfirmedFailures: 0,
      expectedUnresolvedUnknown: 3,
      expectedEvidenceScore: 25,
      expectedHardSatisfactionPercent: 25,
      expectedHardFailurePercent: 0,
      expectedUnknownPercent: 75,
      expectedEvidenceCoverage: 25,
      expectedPrimaryRootCause: 'RET-01',
      expectedContributingRootCauses: ['DAT-01'],
      notes: '1 PASS, 0 FAIL, 3 UNKNOWN. UNKNOWN is not FAIL. Score reflects coverage (25/100). RET-01 & DAT-01 represented.',
    },
  },
  {
    id: 'scenario-c',
    key: 'C',
    name: 'Scenario C: Multi-Product Isolation & Intent Mismatch',
    shortLabel: 'Test C (Intent)',
    badge: 'Multi-Product',
    userPrompt: 'lightweight breathable jackets for summer trail running',
    llmOutput: 'Two options: TrailAir Shell ($95) is lightweight and highly breathable. MountainGuard Parka ($140) is waterproof, heavily insulated, and designed for freezing conditions.',
    statusMessage: 'Test C loaded (Intent Mismatch): MountainGuard Parka freezing gear contradicts summer (INT-01 primary).',
    summary: 'TrailAir Shell (P1) clean / MountainGuard Parka (P2) fails summer intent. Isolated per product; overall FAIL.',
    expected: {
      overallVerdict: 'FAIL',
      hardGateState: 'HARD_GATE_FAIL',
      productCount: 2,
      expectedPrimaryRootCause: 'INT-01',
      productVerdicts: [
        {
          productId: 'P1',
          productNameSnippet: 'TrailAir',
          maxConfirmedFailures: 0,
        },
        {
          productId: 'P2',
          productNameSnippet: 'MountainGuard',
          verdict: 'FAIL',
          hardGateState: 'HARD_GATE_FAIL',
        },
      ],
      notes: 'P1 must not inherit P2 failure. P2 fails summer intent. Overall verdict FAIL because P2 failed.',
    },
  },
  {
    id: 'scenario-d',
    key: 'D',
    name: 'Scenario D: Internal Contradiction',
    shortLabel: 'Test D (Contradiction)',
    badge: 'Contradiction',
    userPrompt: 'waterproof jacket',
    llmOutput: 'The StormShell Jacket is waterproof. However, its outer fabric is not waterproof.',
    statusMessage: 'Test D loaded (Contradiction): Conflicting waterproof claims (FAC-01 primary, hard gate indeterminate).',
    summary: 'Conflicting claims (waterproof vs not waterproof) within assistant output. Neither resolved as true/false.',
    expected: {
      overallVerdict: 'INDETERMINATE',
      hardGateState: 'HARD_GATE_INDETERMINATE',
      expectedConfirmedFailures: 0,
      expectedPrimaryRootCause: 'FAC-01',
      notes: 'Internal factual contradiction on waterproof. Neither statement assumed true/false. Overall INDETERMINATE.',
    },
  },
  {
    id: 'scenario-e',
    key: 'E',
    name: 'Scenario E: Clean Requirement Satisfaction',
    shortLabel: 'Test E (No Fail)',
    badge: 'Clean Pass',
    userPrompt: 'waterproof jacket under $100',
    llmOutput: 'I recommend the RainShield Jacket for $89. It is waterproof.',
    statusMessage: 'Test E loaded (No Observed Failure): All requirements satisfied (NO_OBSERVED_FAILURE).',
    summary: 'Both constraints (price <= $100, waterproof) satisfied. 100% evidence score. Severity NONE. Verdict PASS.',
    expected: {
      overallVerdict: 'PASS',
      hardGateState: 'HARD_GATE_PASS',
      expectedConfirmedFailures: 0,
      expectedUnresolvedUnknown: 0,
      expectedSeverity: 'NONE',
      expectedEvidenceScore: 100,
      expectedHardSatisfactionPercent: 100,
      expectedHardFailurePercent: 0,
      expectedUnknownPercent: 0,
      notes: '100% evidence coverage, 0 failures, overall PASS, severity NONE.',
    },
  },
  {
    id: 'scenario-f',
    key: 'F',
    name: 'Scenario F: Negative Exclusion Violation',
    shortLabel: 'Test F (Exclusion)',
    badge: 'Exclusion Fail',
    userPrompt: 'running shoes under $120, no leather',
    llmOutput: 'I recommend the RoadMaster 5 for $99. It has a genuine leather upper.',
    statusMessage: 'Test F loaded (Negative Constraint): Explicit leather exclusion violated (NC-01 primary).',
    summary: 'Negative constraint ("no leather") violated by stated "genuine leather". Confirmed failure. Verdict FAIL.',
    expected: {
      overallVerdict: 'FAIL',
      hardGateState: 'HARD_GATE_FAIL',
      minConfirmedFailures: 1,
      expectedPrimaryRootCause: 'NC-01',
      notes: 'Explicit negative exclusion violated. Overall FAIL. Hard gate fail. NC-01 root cause represented.',
    },
  },
];
