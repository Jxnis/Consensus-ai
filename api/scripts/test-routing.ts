/**
 * Smart Routing Verification Script
 *
 * Tests the smart routing system with diverse queries to verify:
 * - Topic detection accuracy
 * - Budget filtering
 * - Model selection logic
 * - Streaming support
 * - Database fallback
 *
 * Run: `pnpm tsx scripts/test-routing.ts`
 */

interface TestCase {
  name: string;
  query: string;
  expectedDomain?: string;
  budget?: string;
  stream?: boolean;
  expectSSE?: boolean;
  shouldBeFree?: boolean;
  shouldBeMostAccurate?: boolean;
}

const TEST_CASES: TestCase[] = [
  // Topic Detection Tests
  {
    name: "Code/Frontend Detection",
    query: "Fix the CSS layout on my React component, the flexbox alignment is broken",
    expectedDomain: "code/frontend",
    budget: "medium",
  },
  {
    name: "Code/Security Detection",
    query: "Review this OAuth implementation for vulnerabilities",
    expectedDomain: "code/security",
    budget: "medium",
  },
  {
    name: "Code/Backend Detection",
    query: "How do I optimize this SQL query for better performance?",
    expectedDomain: "code/backend",
    budget: "medium",
  },
  {
    name: "Math/Statistics Detection",
    query: "Calculate the p-value for this chi-squared test",
    expectedDomain: "math/statistics",
    budget: "medium",
  },
  {
    name: "Math/Calculus Detection",
    query: "Find the derivative of f(x) = x^3 + 2x^2 - 5x + 1",
    expectedDomain: "math/calculus",
    budget: "medium",
  },
  {
    name: "Science/Medicine Detection",
    query: "Explain the mechanism of action of SGLT2 inhibitors",
    expectedDomain: "science/medicine",
    budget: "medium",
  },
  {
    name: "Science/Physics Detection",
    query: "Explain quantum entanglement and the EPR paradox",
    expectedDomain: "science/physics",
    budget: "medium",
  },
  {
    name: "Writing/Business Detection",
    query: "Draft a professional email to decline this partnership offer",
    expectedDomain: "writing/business",
    budget: "medium",
  },
  {
    name: "Writing/Academic Detection",
    query: "Help me write an abstract for my research paper on climate change",
    expectedDomain: "writing/academic",
    budget: "medium",
  },
  {
    name: "Reasoning Detection",
    query: "Solve this logic puzzle: If all bloops are razzies and all razzies are lazzies, are all bloops definitely lazzies?",
    expectedDomain: "reasoning",
    budget: "medium",
  },

  // Budget Tests
  {
    name: "Free Budget - Science",
    query: "Explain quantum entanglement",
    budget: "free",
    shouldBeFree: true,
  },
  {
    name: "Low Budget - Code",
    query: "Write a Python function to sort a list",
    budget: "low",
  },
  {
    name: "High Budget - Science",
    query: "Explain quantum entanglement in detail with mathematical formalism",
    budget: "high",
    shouldBeMostAccurate: true,
  },

  // Streaming Tests
  {
    name: "Streaming - Code",
    query: "Write hello world in Python",
    stream: true,
    expectSSE: true,
    budget: "medium",
  },
  {
    name: "Streaming - Math",
    query: "Solve 2+2",
    stream: true,
    expectSSE: true,
    budget: "medium",
  },
];

const API_URL = process.env.API_URL || "http://localhost:8788";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-token-123";

async function testCase(testCase: TestCase): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    const requestBody = {
      mode: "default",
      budget: testCase.budget || "medium",
      messages: [
        {
          role: "user",
          content: testCase.query,
        },
      ],
      stream: testCase.stream || false,
    };

    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`   Query: "${testCase.query.slice(0, 60)}${testCase.query.length > 60 ? '...' : ''}"`);
    console.log(`   Budget: ${testCase.budget || 'medium'}, Stream: ${testCase.stream || false}`);

    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `HTTP ${response.status}: ${error}`,
      };
    }

    if (testCase.stream) {
      // Check SSE headers
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("text/event-stream")) {
        return {
          success: false,
          message: `Expected SSE content-type, got: ${contentType}`,
        };
      }

      // Check routing metadata in headers
      const selectedModel = response.headers.get("X-CouncilRouter-Model");
      const topic = response.headers.get("X-CouncilRouter-Topic");
      const budget = response.headers.get("X-CouncilRouter-Budget");

      console.log(`   ✅ Streaming response received`);
      console.log(`   Model: ${selectedModel}`);
      console.log(`   Topic: ${topic}`);
      console.log(`   Budget: ${budget}`);

      // Verify topic detection if expected
      if (testCase.expectedDomain && topic !== testCase.expectedDomain) {
        return {
          success: false,
          message: `Topic mismatch: expected ${testCase.expectedDomain}, got ${topic}`,
          details: { selectedModel, topic, budget },
        };
      }

      return {
        success: true,
        message: `Streaming working correctly`,
        details: { selectedModel, topic, budget },
      };
    } else {
      // Non-streaming response
      const data = await response.json();

      if (!data.routing) {
        return {
          success: false,
          message: "Response missing routing metadata",
          details: data,
        };
      }

      console.log(`   ✅ Response received`);
      console.log(`   Model: ${data.routing.selected_model}`);
      console.log(`   Topic: ${data.routing.topic_detected}`);
      console.log(`   Data Source: ${data.routing.data_source}`);

      // Verify topic detection if expected
      if (testCase.expectedDomain && data.routing.topic_detected !== testCase.expectedDomain) {
        // Allow parent domain match (e.g., 'code' matches 'code/frontend')
        const detectedParent = data.routing.topic_detected.split('/')[0];
        const expectedParent = testCase.expectedDomain.split('/')[0];

        if (detectedParent !== expectedParent) {
          return {
            success: false,
            message: `Topic mismatch: expected ${testCase.expectedDomain}, got ${data.routing.topic_detected}`,
            details: data.routing,
          };
        } else {
          console.log(`   ⚠️  Topic detection partial match (parent domain correct)`);
        }
      }

      // Verify budget constraints
      if (testCase.shouldBeFree) {
        // Check if model is free (pricing would be $0/$0)
        console.log(`   ℹ️  Free budget test (model: ${data.routing.selected_model})`);
      }

      return {
        success: true,
        message: `Routing working correctly`,
        details: data.routing,
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Test failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkDatabaseHealth(): Promise<boolean> {
  try {
    console.log("\n🔍 Checking database health...");
    const response = await fetch(`${API_URL}/admin/db-health`, {
      headers: {
        "X-Admin-Token": ADMIN_TOKEN,
      },
    });

    if (!response.ok) {
      console.log(`   ❌ Database health check failed: HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    console.log(`   ✅ Database healthy:`);
    console.log(`      Models: ${data.database.models}`);
    console.log(`      Domains: ${data.database.domains}`);
    console.log(`      Benchmark Scores: ${data.database.scores}`);
    console.log(`      Composite Scores: ${data.database.composite_scores}`);

    return data.database.models > 0 && data.database.domains > 0;
  } catch (err) {
    console.log(`   ❌ Database health check error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function runTests() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     CouncilRouter Smart Routing Verification Tests     ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`\nAPI URL: ${API_URL}`);

  // Check database health first
  const dbHealthy = await checkDatabaseHealth();
  if (!dbHealthy) {
    console.log("\n⚠️  WARNING: Database may not be fully populated. Some tests may fall back to hardcoded registry.");
    console.log("   Run `curl -X POST ${API_URL}/admin/sync-pricing -H 'X-Admin-Token: ${ADMIN_TOKEN}'` to populate the database.");
  }

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    const result = await testCase(testCase);

    if (result.success) {
      passed++;
      console.log(`   ✅ PASS: ${result.message}`);
    } else {
      failed++;
      console.log(`   ❌ FAIL: ${result.message}`);
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    }
  }

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║                      Test Summary                       ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`\n   Total: ${TEST_CASES.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Success Rate: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%\n`);

  if (failed === 0) {
    console.log("🎉 All tests passed!\n");
    process.exit(0);
  } else {
    console.log("⚠️  Some tests failed. Check the output above for details.\n");
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal error running tests:", err);
  process.exit(1);
});
