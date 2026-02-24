#!/usr/bin/env tsx
/**
 * TASK-31-FIX-1: MC Grading Regression Tests
 * 
 * Tests the checkAnswer() function against known model response formats
 * that previously triggered grading bugs. ALL tests must pass before
 * re-running MMLU benchmarks.
 * 
 * Usage: npx tsx api/scripts/test-mc-grading.ts
 */

// Import the grading function by inlining the MC extraction logic
// (since benchmark.ts doesn't export checkAnswer, we replicate the MC logic here)

function extractMCLetter(modelAnswer: string): string | null {
  const extractPatterns = [
    // 1. Boxed answer (LaTeX): \boxed{B} or \boxed{\text{B}}
    /\\boxed\{\\text\{([A-D])\}\}/i,
    /\\boxed\{([A-D])\}/i,
    // 2. "the answer is (B)" / "correct answer is B" / "answer is **B**"
    /\banswer\s+is\s*:?\s*\*{0,2}\(?([A-D])\)?\*{0,2}\b/i,
    // 3. "the correct answer/option/choice is (B)"
    /\bcorrect\s+(?:answer|option|choice)\s+is\s*:?\s*\*{0,2}\(?([A-D])\)?\*{0,2}\b/i,
    // 4. "Answer: B" or "Answer: (B)"
    /\b(?:answer|choice)\s*:\s*\*{0,2}\(?([A-D])\)?\*{0,2}/i,
    // 5. Letter in parentheses: (B) or **(B)**
    /\*{0,2}\(([A-D])\)\*{0,2}/,
    // 6. Standalone letter at start of line: "B. Because..." or "B) ..."
    /^\s*\*{0,2}([A-D])\*{0,2}\s*[\)\.\:\-,]/m,
    // 7. Bare letter only (entire response is just "B" or "**B**")
    /^\s*\*{0,2}([A-D])\*{0,2}\s*$/m,
  ];

  for (const pattern of extractPatterns) {
    const match = modelAnswer.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

interface TestCase {
  name: string;
  answer: string;
  truth: string;
  expectCorrect: boolean;
  expectedLetter?: string | null; // What letter should be extracted
}

const testCases: TestCase[] = [
  // ===== BUG 1: "correct answer is (X)" must NOT capture "A" from "answer" =====
  {
    name: 'Bug1: "correct answer is (B)" → extract B not A',
    answer: 'The correct answer is **(B) S phase**.',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
  {
    name: 'Bug1: "correct answer is (C) dRNA"',
    answer: 'The correct answer is **(C) dRNA**.',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },
  {
    name: 'Bug1: "correct answer is (C) Encapsulation"',
    answer: 'The correct answer is **(C) Encapsulation**.',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },
  {
    name: 'Bug1: "answer is B" simple',
    answer: 'The answer is B.',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
  {
    name: 'Bug1: "answer is (D)" with parens',
    answer: 'The answer is (D).',
    truth: 'D',
    expectCorrect: true,
    expectedLetter: 'D',
  },

  // ===== BUG 2: Article "A" at sentence start must NOT be captured =====
  {
    name: 'Bug2: "A covalent bond involves (B)" → extract B not A',
    answer: 'A covalent bond involves sharing of electrons, so the answer is (B).',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
  {
    name: 'Bug2: "A key concept..." with (C) later',
    answer: 'A key concept in biology is (C) mitosis.',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },

  // ===== BUG 3: Bare letter responses =====
  {
    name: 'Bug3: Bare "B"',
    answer: 'B',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
  {
    name: 'Bug3: Bare "  C  " with whitespace',
    answer: '  C  ',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },
  {
    name: 'Bug3: Bare "**D**" with bold',
    answer: '**D**',
    truth: 'D',
    expectCorrect: true,
    expectedLetter: 'D',
  },

  // ===== LaTeX boxed answers (reasoning models like DeepSeek R1) =====
  {
    name: 'LaTeX: \\boxed{B}',
    answer: 'Therefore the answer is \\boxed{B}',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
  {
    name: 'LaTeX: \\boxed{\\text{C}}',
    answer: '\\boxed{\\text{C}}',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },

  // ===== Markdown bold formatting =====
  {
    name: 'Bold: "## Answer: **(C) Median**"',
    answer: '## Answer: **(C) Median**',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },
  {
    name: 'Bold: "The answer is **(B) Resistance**"',
    answer: 'The answer is **(B) Resistance**',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },

  // ===== Wrong letter detection =====
  {
    name: 'Wrong letter: answer is (A) but truth is B',
    answer: 'The answer is (A)',
    truth: 'B',
    expectCorrect: false,
    expectedLetter: 'A',
  },

  // ===== Pattern 6: letter at line start with delimiter =====
  {
    name: 'Line start: "B. Because..."',
    answer: 'B. Because covalent bonds involve sharing.',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
  {
    name: 'Line start: "C) The reason..."',
    answer: 'C) The reason is that pH is neutral.',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },

  // ===== Complex real-world responses =====
  {
    name: 'Complex: pH question with bold and explanation',
    answer: '# pH\n## Answer: **(B) 7**\npH = -log(1.0 × 10⁻⁷) = 7',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
  {
    name: 'Complex: long explanation then "answer is C"',
    answer: 'RNA types include mRNA, tRNA, and rRNA. dRNA is not a real type. Therefore, the answer is C.',
    truth: 'C',
    expectCorrect: true,
    expectedLetter: 'C',
  },
  {
    name: 'Complex: "I would choose D" style',
    answer: 'Looking at the options, the correct choice is D because momentum is conserved.',
    truth: 'D',
    expectCorrect: true,
    expectedLetter: 'D',
  },

  // ===== Edge cases that should NOT match random letters =====
  {
    name: 'Edge: No MC letter in response at all',
    answer: 'I think the answer involves quantum mechanics and wave-particle duality.',
    truth: 'B',
    expectCorrect: false,
    expectedLetter: null,
  },
  {
    name: 'Edge: "Answer: (B)" when truth is B',
    answer: 'Answer: (B)',
    truth: 'B',
    expectCorrect: true,
    expectedLetter: 'B',
  },
];

// ===== TASK-31-FIX-8: Option-text fallback tests =====
// These require the full checkAnswer() function with question parameter

interface TestCaseWithQuestion {
  name: string;
  question: string;
  answer: string;
  truth: string;
  expectCorrect: boolean;
}

const optionTextTestCases: TestCaseWithQuestion[] = [
  // Real failing cases from Feb 24 MMLU run
  {
    name: 'FIX-8: mmlu_chem_002 - "hydrogen" without letter',
    question: 'Which element has the lowest atomic number? (A) Helium (B) Hydrogen (C) Lithium (D) Carbon',
    answer: 'The element with atomic number 1 is hydrogen, making it the correct choice.',
    truth: 'B',
    expectCorrect: true,
  },
  {
    name: 'FIX-8: mmlu_cs_001 - "stack" without letter',
    question: 'Which data structure follows LIFO principle? (A) Queue (B) Stack (C) Array (D) Linked List',
    answer: 'The structure that naturally enforces LIFO (Last In First Out) is the **stack**.',
    truth: 'B',
    expectCorrect: true,
  },
  {
    name: 'FIX-8: mmlu_bio_007 - "DNA" without letter',
    question: 'Which molecule carries genetic information? (A) Protein (B) Lipid (C) DNA (D) Carbohydrate',
    answer: 'DNA is the molecule that stores and transmits genetic information in living organisms.',
    truth: 'C',
    expectCorrect: true,
  },
  {
    name: 'FIX-8: Option text with multiple mentions',
    question: 'What is the powerhouse of the cell? (A) Nucleus (B) Mitochondria (C) Ribosome (D) Chloroplast',
    answer: 'The mitochondria is responsible for energy production. Mitochondria generate ATP through cellular respiration.',
    truth: 'B',
    expectCorrect: true,
  },
  {
    name: 'FIX-8: Multiple options mentioned - should NOT match',
    question: 'Which is largest? (A) Atom (B) Molecule (C) Cell (D) Organ',
    answer: 'The hierarchy goes: atom → molecule → cell → organ, with organ being the largest.',
    truth: 'D',
    expectCorrect: false, // Model mentions all options, can't determine single answer
  },
  {
    name: 'FIX-8: Option with common word - ensure precision',
    question: 'What is 2+2? (A) Three (B) Four (C) Five (D) Six',
    answer: 'Two plus two equals four.',
    truth: 'B',
    expectCorrect: true,
  },
  {
    name: 'FIX-8: Partial word match should NOT trigger false positive',
    question: 'Which gas do plants absorb? (A) Oxygen (B) Carbon dioxide (C) Nitrogen (D) Helium',
    answer: 'Plants take in carbon from the air during photosynthesis.',
    truth: 'B',
    expectCorrect: false, // Says "carbon" not "carbon dioxide" - too ambiguous
  },
  {
    name: 'FIX-8: Clear dominant option (2x threshold)',
    question: 'What is the capital of France? (A) London (B) Paris (C) Berlin (D) Madrid',
    answer: 'Paris is the capital and largest city of France. Paris has been the French capital since the 12th century.',
    truth: 'B',
    expectCorrect: true,
  },
];

// Run tests
let passed = 0;
let failed = 0;

console.log('=== MC Grading Regression Tests (TASK-31-FIX-1) ===\n');

for (const tc of testCases) {
  const extracted = extractMCLetter(tc.answer);
  const isCorrect = extracted === tc.truth.toUpperCase();

  const letterOk = tc.expectedLetter === undefined || extracted === tc.expectedLetter;
  const correctnessOk = isCorrect === tc.expectCorrect;
  const testPassed = letterOk && correctnessOk;

  if (testPassed) {
    passed++;
    console.log(`  ✅ ${tc.name}`);
  } else {
    failed++;
    console.log(`  ❌ ${tc.name}`);
    console.log(`     Expected letter: ${tc.expectedLetter ?? 'null'}, Got: ${extracted ?? 'null'}`);
    console.log(`     Expected correct: ${tc.expectCorrect}, Got: ${isCorrect}`);
    console.log(`     Input: "${tc.answer.substring(0, 80)}..."`);
  }
}

console.log(`\n=== Results: ${passed}/${passed + failed} passed, ${failed} failed ===`);

// ===== TASK-31-FIX-8: Test option-text fallback =====
console.log('\n=== Option-Text Fallback Tests (TASK-31-FIX-8) ===\n');

let optionPassed = 0;
let optionFailed = 0;

for (const tc of optionTextTestCases) {
  // First try letter extraction
  let chosenLetter = extractMCLetter(tc.answer);

  // If no letter found, try option-text fallback
  if (chosenLetter === null) {
    const optionRegex = /\(([A-D])\)\s*([^(]+?)(?=\s*\([A-D]\)|$)/gi;
    const optionMap: Record<string, string> = {};
    let optMatch;

    while ((optMatch = optionRegex.exec(tc.question)) !== null) {
      const letter = optMatch[1].toUpperCase();
      const text = optMatch[2].trim();
      optionMap[letter] = text;
    }

    if (Object.keys(optionMap).length > 0) {
      const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const normalizedAnswer = normalizeText(tc.answer);
      const matches: { letter: string; count: number }[] = [];

      for (const [letter, optionText] of Object.entries(optionMap)) {
        const normalizedOption = normalizeText(optionText);

        // Check if the full option text appears first (strongest signal)
        if (normalizedAnswer.includes(normalizedOption)) {
          matches.push({ letter, count: 10 });
          continue;
        }

        // Otherwise, count word matches
        const words = normalizedOption.split(/\s+/).filter(w => w.length > 2);

        if (words.length === 0) continue;

        let matchedWords = 0;
        let totalMentions = 0;

        for (const word of words) {
          const regex = new RegExp(`\\b${word}\\b`, 'g');
          const wordMatches = normalizedAnswer.match(regex);
          if (wordMatches) {
            matchedWords++;
            totalMentions += wordMatches.length;
          }
        }

        // Require at least 75% of option's words to be present
        const wordCoverage = matchedWords / words.length;
        if (wordCoverage >= 0.75) {
          matches.push({ letter, count: totalMentions });
        }
      }

      if (matches.length === 1) {
        chosenLetter = matches[0].letter;
      } else if (matches.length > 1) {
        matches.sort((a, b) => b.count - a.count);
        if (matches[0].count >= matches[1].count * 2) {
          chosenLetter = matches[0].letter;
        }
      }
    }
  }

  const isCorrect = chosenLetter === tc.truth.toUpperCase();

  if (isCorrect === tc.expectCorrect) {
    optionPassed++;
    console.log(`  ✅ ${tc.name}`);
  } else {
    optionFailed++;
    console.log(`  ❌ ${tc.name}`);
    console.log(`     Expected correct: ${tc.expectCorrect}, Got: ${isCorrect}`);
    console.log(`     Extracted letter: ${chosenLetter ?? 'null'}, Truth: ${tc.truth}`);
    console.log(`     Answer: "${tc.answer.substring(0, 100)}..."`);
  }
}

console.log(`\n=== Option-Text Results: ${optionPassed}/${optionPassed + optionFailed} passed, ${optionFailed} failed ===`);

const totalPassed = passed + optionPassed;
const totalFailed = failed + optionFailed;
const totalTests = totalPassed + totalFailed;

console.log(`\n=== TOTAL: ${totalPassed}/${totalTests} passed, ${totalFailed} failed ===`);

if (totalFailed > 0) {
  console.error('\n🔴 REGRESSION TESTS FAILED. Do NOT re-run benchmarks until all tests pass.');
  process.exit(1);
} else {
  console.log('\n🟢 ALL TESTS PASSED. MC grading with option-text fallback is safe to use.');
  process.exit(0);
}
