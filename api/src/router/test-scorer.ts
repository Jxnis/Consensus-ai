import { scorePrompt } from "./scorer";

const testPrompts = [
  { p: "Hi there!", expected: "SIMPLE" },
  { p: "What time is it?", expected: "SIMPLE" },
  { p: "Can you explain how a jet engine works in detail?", expected: "MEDIUM" },
  { p: "Compare the pros and cons of using Hono vs Express for an edge API.", expected: "MEDIUM" },
  { p: "Write a complete implementation of a red-black tree in TypeScript including a delete function and detailed comments.", expected: "COMPLEX" },
  { p: "Analyze the following JSON structure and refactor it into a more efficient schema: " + "{ 'id': 1, 'data': [...] }", expected: "COMPLEX" }
];

console.log("=== Testing LocalScorer ===");

testPrompts.forEach(({ p, expected }) => {
  const result = scorePrompt(p);
  const pass = result.tier === expected;
  console.log(`[${pass ? "PASS" : "FAIL"}] Tier: ${result.tier} (Score: ${result.score})`);
  if (!pass) console.log(`   Expected: ${expected}\n   Prompt: ${p}`);
});
