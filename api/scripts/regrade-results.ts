#!/usr/bin/env tsx
/**
 * Re-grade existing benchmark results with fixed extraction patterns
 *
 * BUG FIX (2026-03-03): The original extraction had two bugs:
 * 1. Missing \s* after \*{0,2} (didn't handle "**Answer:** C" format)
 * 2. Matching from start of response (captured echoed options and eliminated choices)
 *
 * This script re-processes existing JSON files with the fixed checkAnswer() logic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Copy the fixed checkAnswer function from benchmark.ts
function checkAnswer(
  modelAnswer: string,
  groundTruth: string,
  datasetType: string,
  testCode?: string,
  question?: string
): { is_correct: boolean; grading_method: string } {
  // Multiple-choice handling (A-Z support)
  if (/^[A-Z]$/i.test(groundTruth.trim())) {
    const targetLetter = groundTruth.trim().toUpperCase();

    const extractPatterns = [
      // 1. Boxed answer (LaTeX)
      /\\boxed\{\\text\{([A-Z])\}\}/i,
      /\\boxed\{([A-Z])\}/i,
      // 2. "the answer is (B)"
      /\banswer\s+is\s*:?\s*\*{0,2}\s*\(?([A-Z])\)?\*{0,2}\b/i,
      // 3. "the correct answer/option/choice is (B)"
      /\bcorrect\s+(?:answer|option|choice)\s+is\s*:?\s*\*{0,2}\s*\(?([A-Z])\)?\*{0,2}\b/i,
      // 4. "Answer: B" or "Answer: (B)"
      /\b(?:answer|choice)\s*:\s*\*{0,2}\s*\(?([A-Z])\)?\*{0,2}/i,
      // 5. Letter in parentheses: (B) or **(B)**
      /\*{0,2}\s*\(([A-Z])\)\*{0,2}/,
      // 6. **B.** format
      /\*{1,2}\s*([A-Z])\s*\.\s*\*{0,2}/,
      // 7. Standalone letter at start of line
      /^\s*\*{0,2}\s*([A-Z])\*{0,2}\s*[\)\.:\-,]/m,
      // 8. Bare letter only
      /^\s*\*{0,2}\s*([A-Z])\*{0,2}\s*$/m,
    ];

    let chosenLetter: string | null = null;

    // BUG FIX: Extract from the LAST ~500 chars of the response
    const answerRegion = modelAnswer.length > 500
      ? modelAnswer.slice(-500)
      : modelAnswer;

    for (const pattern of extractPatterns) {
      const match = answerRegion.match(pattern);
      if (match) {
        chosenLetter = match[1].toUpperCase();
        break;
      }
    }

    // Option-text fallback (if letter extraction failed)
    if (chosenLetter === null && question) {
      const optionRegex = /\(([A-Z])\)\s*([^(]+?)(?=\s*\([A-Z]\)|$)/gi;
      const optionMap: Record<string, string> = {};
      let optMatch;

      while ((optMatch = optionRegex.exec(question)) !== null) {
        const letter = optMatch[1].toUpperCase();
        const text = optMatch[2].trim();
        optionMap[letter] = text;
      }

      if (Object.keys(optionMap).length > 0) {
        const normalizedAnswer = modelAnswer.toLowerCase().trim();
        const matches: Array<{ letter: string; count: number }> = [];

        for (const [letter, optionText] of Object.entries(optionMap)) {
          const normalizedOption = optionText.toLowerCase();

          if (normalizedAnswer.includes(normalizedOption)) {
            matches.push({ letter, count: 10 });
            continue;
          }

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

    const isCorrect = chosenLetter === targetLetter;
    return { is_correct: isCorrect, grading_method: 'multiple_choice' };
  }

  // Fallback: Simple string matching for other types
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isCorrect = normalize(modelAnswer).includes(normalize(groundTruth));
  return { is_correct: isCorrect, grading_method: 'string_match' };
}

// Main re-grading logic
async function regradeResults() {
  const resultsDir = path.join(__dirname, '../../benchmarks/results');
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json') && !f.includes('_regraded'));

  console.log(`\n🔄 Re-grading ${files.length} result files with fixed extraction...\n`);

  for (const file of files) {
    const filePath = path.join(resultsDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    let changed = 0;
    let becameCorrect = 0;
    let becameWrong = 0;

    // Calculate old accuracy BEFORE modifying results
    const total = data.results.length;
    const oldCorrectCount = data.results.filter((r: any) => r.is_correct === true).length;
    const oldAccuracy = (oldCorrectCount / total * 100).toFixed(1);

    for (const result of data.results) {
      if (!result.model_answer_raw) continue; // Skip if no raw answer

      const oldCorrect = result.is_correct;
      const newGrading = checkAnswer(
        result.model_answer_raw,
        result.ground_truth,
        'factual', // Most results are MC, which is treated as factual
        undefined,
        result.question
      );

      result.is_correct = newGrading.is_correct;

      if (oldCorrect !== newGrading.is_correct) {
        changed++;
        if (newGrading.is_correct) becameCorrect++;
        else becameWrong++;
      }
    }

    // Recalculate accuracy AFTER modifying results
    const newCorrectCount = data.results.filter((r: any) => r.is_correct).length;
    const newAccuracy = (newCorrectCount / total * 100).toFixed(1);

    // Update timestamp to indicate re-grading
    data.regraded_at = new Date().toISOString();
    data.regrade_note = 'Re-graded with fixed extraction (whitespace + last-500-chars)';

    // Save re-graded results
    const newFileName = file.replace('.json', '_regraded.json');
    const newFilePath = path.join(resultsDir, newFileName);
    fs.writeFileSync(newFilePath, JSON.stringify(data, null, 2));

    console.log(`✅ ${file}`);
    console.log(`   Changed: ${changed}/${total} (${becameCorrect} became correct, ${becameWrong} became wrong)`);
    console.log(`   Accuracy: ${oldAccuracy}% → ${newAccuracy}% (${(parseFloat(newAccuracy) - parseFloat(oldAccuracy)).toFixed(1)}pp)`);
    console.log(`   Saved to: ${newFileName}\n`);
  }

  console.log(`\n✅ Re-grading complete! Check benchmarks/results/*_regraded.json\n`);
}

regradeResults().catch(console.error);
